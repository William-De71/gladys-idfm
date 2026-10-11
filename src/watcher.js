// -----------------------------------------------------------------------------
// The loop reading the followed stops.
//
// Each stop has its own chain of timers (schedule.js): every poll interval
// around its window, not at all outside it, every 30 minutes at night. A
// read costs one request on the departures API.
//
// The last read of each stop is kept (`snapshot`): the widgets and the scene
// actions reuse it while it is fresh instead of spending the quota.
//
// When the quota is close (quota.js) or the API blocks the key (429), the
// reads pause and retry later; a failing API backs off up to 30 minutes.
// -----------------------------------------------------------------------------

import { parseDepartures } from './departures.js';
import { followedSpan, upcoming, nextDelay, isBusy } from './schedule.js';
import { monitoringRef } from './stops.js';

const QUOTA_RETRY_MS = 15 * 60 * 1000;
const MAX_BACKOFF_MS = 30 * 60 * 1000;

/**
 * @description What changes in a list of departures for the user.
 * @param {object[]} departures - The departures.
 * @returns {string} The signature.
 */
function signature(departures) {
  return JSON.stringify(departures.map((d) => [d.id, d.departure, d.cancelled, d.delay]));
}

/**
 * @description Read the departures of a stop, once.
 * @param {object} prim - The PRIM client.
 * @param {object} lines - The line resolver (names of the lines met).
 * @param {object} followed - The followed stop (`stop`, `line`, `direction`, `hours`, `days`).
 * @param {number} count - How many departures to follow.
 * @param {number} now - Now (ms).
 * @returns {Promise<{ departures: object[], span: object, readAt: number }>} The snapshot.
 */
async function readStop(prim, lines, followed, count, now) {
  const visits = await prim.stopMonitoring(monitoringRef(followed.stop));
  const all = parseDepartures(visits, {
    lineId: followed.line?.id ?? '',
    direction: followed.direction,
    now,
  });
  await lines.learn(all.map((departure) => departure.lineId));
  const span = followedSpan(followed, now);
  const departures = upcoming(all, span, count).map((departure) => ({
    ...departure,
    line: lines.peek(departure.lineId),
  }));
  return { departures, span, readAt: now };
}

/**
 * @description Create the watcher.
 * @param {object} options - Options.
 * @param {object} options.prim - The PRIM client.
 * @param {object} options.lines - The line resolver.
 * @param {object} options.quota - The quota counter of the departures API.
 * @param {Function} options.getStops - `() => followed stops`.
 * @param {Function} options.getSettings - `() => ({ departureCount, pollInterval })`.
 * @param {Function} options.onRead - `(followed, snapshot, { changed }) => Promise`.
 * @param {Function} [options.onError] - `(followed, err) => Promise`.
 * @param {object} [options.logger] - The logger.
 * @param {Function} [options.now] - The clock.
 * @returns {object} The watcher.
 */
function createWatcher({
  prim,
  lines,
  quota,
  getStops,
  getSettings,
  onRead,
  onError = async () => {},
  logger = null,
  now = Date.now,
}) {
  // stop key -> { snapshot, signature, timer, pending, failures, error }
  const states = new Map();
  let running = false;

  const stateOf = (key) => {
    if (!states.has(key)) {
      states.set(key, {
        snapshot: null,
        signature: null,
        timer: null,
        pending: null,
        failures: 0,
        error: null,
      });
    }
    return states.get(key);
  };

  /**
   * @description Read a stop now (one read at a time per stop).
   * @param {object} followed - The followed stop.
   * @returns {Promise<object>} The snapshot.
   */
  function read(followed) {
    const state = stateOf(followed.key);
    if (!state.pending) {
      state.pending = (async () => {
        try {
          const snapshot = await readStop(
            prim,
            lines,
            followed,
            getSettings().departureCount,
            now(),
          );
          const sig = signature(snapshot.departures);
          const changed = sig !== state.signature;
          state.snapshot = snapshot;
          state.signature = sig;
          state.failures = 0;
          state.error = null;
          await onRead(followed, snapshot, { changed });
          return snapshot;
        } catch (err) {
          state.failures += 1;
          state.error = err;
          if (err.isQuota) {
            quota.block(err.retryAfter);
          }
          await onError(followed, err);
          throw err;
        } finally {
          state.pending = null;
        }
      })();
    }
    return state.pending;
  }

  /**
   * @description Arm the next read of a stop.
   * @param {object} followed - The followed stop.
   */
  function schedule(followed) {
    const state = stateOf(followed.key);
    clearTimeout(state.timer);
    if (!running) {
      return;
    }
    const { pollInterval } = getSettings();
    let delay = nextDelay(followed, now(), pollInterval);
    if (state.failures > 0) {
      delay = Math.min(MAX_BACKOFF_MS, pollInterval * 60000 * 2 ** state.failures);
    }
    const blockedUntil = quota.blockedUntil();
    if (blockedUntil) {
      delay = Math.max(delay, blockedUntil - now() + 1000);
    }
    state.timer = setTimeout(() => tick(followed.key), delay);
    state.timer.unref?.();
  }

  /**
   * @description A timer fired: read the stop if it is still configured.
   * @param {string} key - The stop key.
   * @param {boolean} [first] - The first read after a configuration: done
   * even outside the busy period, so the devices and widgets have data.
   * @returns {Promise<void>}
   */
  async function tick(key, first = false) {
    const followed = getStops().find((candidate) => candidate.key === key);
    if (!followed || !running) {
      return;
    }
    if (!quota.canPoll()) {
      const state = stateOf(key);
      clearTimeout(state.timer);
      state.timer = setTimeout(
        () => tick(key),
        Math.max(QUOTA_RETRY_MS, quota.blockedUntil() - now()),
      );
      state.timer.unref?.();
      await onError(followed, Object.assign(new Error('quota'), { budget: true }));
      return;
    }
    // Outside its window a stop is not read: there is nothing to see yet.
    if (first || !followed.hours || isBusy(followed, now())) {
      try {
        await read(followed);
      } catch (err) {
        logger?.warn(`${followed.name}: ${err.message}`);
      }
    }
    schedule(followed);
  }

  return {
    /** @description Allow the reads; `reschedule` arms them (config applied). */
    start() {
      running = true;
    },

    /** @description Stop every timer. */
    stop() {
      running = false;
      states.forEach((state) => clearTimeout(state.timer));
    },

    /**
     * @description Forget the stops removed from the configuration, and read
     * every configured stop now (a change of configuration, a reconnection).
     */
    reschedule() {
      const keys = new Set(getStops().map((followed) => followed.key));
      [...states.keys()].forEach((key) => {
        if (!keys.has(key)) {
          clearTimeout(states.get(key).timer);
          states.delete(key);
        }
      });
      if (!running) {
        return;
      }
      getStops().forEach((followed) => {
        const state = stateOf(followed.key);
        state.signature = null;
        state.failures = 0;
        clearTimeout(state.timer);
        state.timer = setTimeout(() => tick(followed.key, true), 0);
        state.timer.unref?.();
      });
    },

    /**
     * @description The snapshot of a stop, read again when older than `maxAgeMs`.
     * @param {object} followed - The followed stop.
     * @param {number} maxAgeMs - The freshness wanted.
     * @returns {Promise<object>} The snapshot.
     */
    async get(followed, maxAgeMs) {
      const state = stateOf(followed.key);
      if (state.snapshot && now() - state.snapshot.readAt <= maxAgeMs) {
        return state.snapshot;
      }
      if (!quota.canRequest() && state.snapshot) {
        return state.snapshot;
      }
      return read(followed);
    },

    /**
     * @description The last snapshot of a stop, without any request.
     * @param {string} key - The stop key.
     * @returns {object|null} The snapshot.
     */
    peek(key) {
      return states.get(key)?.snapshot ?? null;
    },

    /**
     * @description The last error of each stop (null when the last read worked).
     * @returns {Array<{ key: string, error: Error|null }>} The errors.
     */
    errors() {
      return getStops().map((followed) => ({
        key: followed.key,
        error: states.get(followed.key)?.error ?? null,
      }));
    },
  };
}

export { readStop, createWatcher };
