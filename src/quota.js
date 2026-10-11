// -----------------------------------------------------------------------------
// The request quotas of PRIM.
//
// Each PRIM API has its own daily quota: 1 000 requests a day on a new
// account, raised for free on request (up to 1 000 000 a day for the
// departures). Past it, PRIM refuses the key until the next day. So the
// integration counts its own requests per API over a sliding 24 hours, and
// stops its regular reads a little before the limit (90 %), keeping a margin
// for the widgets, the scene actions and the configuration screen.
//
// A 429 from the API blocks every request of that API until its Retry-After
// (an hour when absent): hammering a blocked key only spams the logs.
// -----------------------------------------------------------------------------

const DAY_MS = 24 * 3600 * 1000;
// The regular reads stop at this share of the limit; the rest is kept for the user.
const BUDGET_RATIO = 0.9;
const SAVE_DELAY_MS = 30000;

/**
 * @description Create the quota counter.
 * @param {object} [options] - Options.
 * @param {object} [options.store] - Where the counts survive a restart.
 * @param {Function} [options.limit] - `() => number`, the daily limit (read on every check).
 * @param {Function} [options.now] - The clock.
 * @returns {object} The counter.
 * @example
 * const quota = createQuota({ store: createStore('quota-traffic.json'), limit: () => 1000 });
 */
function createQuota({ store = null, limit = () => 1000, now = Date.now } = {}) {
  let stamps = [];
  let blockedUntil = 0;
  let saveTimer = null;

  const prune = () => {
    const since = now() - DAY_MS;
    if (stamps.length > 0 && stamps[0] <= since) {
      stamps = stamps.filter((stamp) => stamp > since);
    }
  };

  const scheduleSave = () => {
    if (!store || saveTimer) {
      return;
    }
    saveTimer = setTimeout(() => {
      saveTimer = null;
      store.save({ stamps, blocked_until: blockedUntil });
    }, SAVE_DELAY_MS);
    saveTimer.unref?.();
  };

  return {
    /**
     * @description Read the counts saved before a restart.
     * @returns {Promise<void>}
     */
    async load() {
      const saved = store ? await store.load(null) : null;
      if (saved && Array.isArray(saved.stamps)) {
        stamps = saved.stamps.filter(Number.isFinite).sort((a, b) => a - b);
        blockedUntil = Number.isFinite(saved.blocked_until) ? saved.blocked_until : 0;
        prune();
      }
    },

    /** @description Count one request sent. */
    record() {
      stamps.push(now());
      prune();
      scheduleSave();
    },

    /**
     * @description Block every request after a 429.
     * @param {number} seconds - The Retry-After.
     */
    block(seconds) {
      blockedUntil = Math.max(blockedUntil, now() + seconds * 1000);
      scheduleSave();
    },

    /** @returns {number} The requests of the last 24 hours. */
    used() {
      prune();
      return stamps.length;
    },

    /** @returns {number} When the 429 block ends (ms), 0 when not blocked. */
    blockedUntil() {
      return blockedUntil > now() ? blockedUntil : 0;
    },

    /** @returns {number} The requests a day the regular reads may spend. */
    budget() {
      return Math.floor(limit() * BUDGET_RATIO);
    },

    /** @returns {boolean} Whether the regular reads may run. */
    canPoll() {
      return this.blockedUntil() === 0 && this.used() < this.budget();
    },

    /** @returns {boolean} Whether any request may be sent. */
    canRequest() {
      return this.blockedUntil() === 0 && this.used() < limit();
    },

    /** @description Write the pending counts now (shutdown). */
    async flush() {
      if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
      }
      if (store) {
        await store.save({ stamps, blocked_until: blockedUntil });
      }
    },
  };
}

export { BUDGET_RATIO, createQuota };
