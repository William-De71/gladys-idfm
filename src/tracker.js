// -----------------------------------------------------------------------------
// What happened to the followed departures, for the scene triggers.
//
//   - `departure_delayed`    a train becomes late by at least the delay
//                            threshold, or moves up a delay level (minor: up
//                            to 14 min, major: 15 to 29, severe: 30 and
//                            more). Only for departures with a timetable
//                            (RER, Transilien, some buses): metro and most
//                            buses give no aimed time, hence no delay;
//   - `departure_cancelled`  a departure is cancelled;
//   - `departure_soon`       the next departures leave in N minutes (2, 5,
//                            10, 15, 20 or 30), counted on the REAL-TIME
//                            departure. Checked every 30 seconds on the last
//                            read, fired close to the mark (never late after
//                            a restart).
//
// Delays and cancellations fire once per departure (its id). The reminders
// fire once per departure too, but are matched by line, destination and time
// (± 2 min): a metro has no stable id from one read to the next.
// What was fired is kept in /data for a day: a restart never repeats a scene.
// -----------------------------------------------------------------------------

const SCENE_TRIGGERS = {
  DEPARTURE_DELAYED: 'departure_delayed',
  DEPARTURE_CANCELLED: 'departure_cancelled',
  DEPARTURE_SOON: 'departure_soon',
};

const DELAY_LEVELS = ['minor', 'major', 'severe'];
const REMINDER_MINUTES = [2, 5, 10, 15, 20, 30];
const REMINDER_MATCH_MS = 2 * 60 * 1000;
const KEEP_MS = 24 * 3600 * 1000;

/**
 * @description The delay level of a departure.
 * @param {number} delay - The delay (minutes).
 * @param {number} threshold - The delay threshold (minutes).
 * @returns {string|null} 'minor', 'major', 'severe', null under the threshold.
 * @example
 * delayLevel(20, 5); // -> 'major'
 */
function delayLevel(delay, threshold) {
  if (!(delay >= threshold)) {
    return null;
  }
  if (delay < 15) {
    return 'minor';
  }
  return delay < 30 ? 'major' : 'severe';
}

/**
 * @description How close to a mark a reminder may fire.
 * @param {number} minutes - The mark.
 * @returns {number} The tolerance (minutes): 1.5 for the short marks, 3 otherwise.
 */
function tolerance(minutes) {
  return minutes <= 5 ? 1.5 : 3;
}

/**
 * @description Create the tracker.
 * @param {object} [options] - Options.
 * @param {object} [options.store] - Where the fired events survive a restart.
 * @returns {object} The tracker.
 * @example
 * const tracker = createTracker({ store: createStore('fired.json') });
 */
function createTracker({ store = null } = {}) {
  // departures: `<stop key>|<id>` -> { level, cancelled, at }
  // reminders: `<stop key>` -> [{ minutes, line, destination, departure }]
  let fired = { departures: {}, reminders: {} };
  let dirty = false;

  const entry = (stopKey, departure) => {
    const key = `${stopKey}|${departure.id}`;
    if (!fired.departures[key]) {
      fired.departures[key] = { level: null, cancelled: false, at: departure.baseDeparture };
    }
    return fired.departures[key];
  };

  return {
    /** @returns {Promise<void>} Read what was fired before a restart. */
    async load() {
      const saved = store ? await store.load(null) : null;
      if (saved && typeof saved === 'object' && saved.departures && saved.reminders) {
        fired = saved;
      }
    },

    /**
     * @description Compare a fresh read of a stop with what was fired.
     * @param {string} stopKey - The stop.
     * @param {object[]} departures - Its followed departures.
     * @param {number} threshold - The delay threshold (minutes).
     * @returns {Array<{ key: string, departure: object, level?: string }>} The events.
     */
    diff(stopKey, departures, threshold) {
      const events = [];
      departures.forEach((departure) => {
        const memory = entry(stopKey, departure);
        if (departure.cancelled) {
          if (!memory.cancelled) {
            memory.cancelled = true;
            dirty = true;
            events.push({ key: SCENE_TRIGGERS.DEPARTURE_CANCELLED, departure });
          }
          return;
        }
        const level = departure.timetabled ? delayLevel(departure.delay, threshold) : null;
        if (level && DELAY_LEVELS.indexOf(level) > DELAY_LEVELS.indexOf(memory.level)) {
          memory.level = level;
          dirty = true;
          events.push({ key: SCENE_TRIGGERS.DEPARTURE_DELAYED, departure, level });
        }
      });
      return events;
    },

    /**
     * @description The departure reminders due now.
     * @param {string} stopKey - The stop.
     * @param {object[]} departures - Its followed departures.
     * @param {number} now - Now (ms).
     * @returns {Array<{ key: string, departure: object, minutes: number }>} The events.
     */
    reminders(stopKey, departures, now) {
      const events = [];
      const done = fired.reminders[stopKey] ?? [];
      departures.forEach((departure) => {
        if (departure.cancelled) {
          return;
        }
        const left = (departure.departure - now) / 60000;
        if (left <= 0) {
          return;
        }
        const same = done.filter(
          (memory) =>
            memory.line === departure.lineId &&
            memory.destination === departure.destination &&
            Math.abs(memory.departure - departure.departure) <= REMINDER_MATCH_MS,
        );
        // The closest mark only: a train first seen 8 minutes before leaving
        // fires "10", never "10", "15", "20"… at once.
        const due = REMINDER_MINUTES.filter(
          (minutes) =>
            left <= minutes &&
            left > minutes - tolerance(minutes) &&
            !same.some((memory) => memory.minutes <= minutes),
        );
        if (due.length > 0) {
          const minutes = due[0];
          done.push({
            minutes,
            line: departure.lineId,
            destination: departure.destination,
            departure: departure.departure,
          });
          dirty = true;
          events.push({ key: SCENE_TRIGGERS.DEPARTURE_SOON, departure, minutes });
        }
      });
      fired.reminders[stopKey] = done;
      return events;
    },

    /**
     * @description Forget the departures of yesterday, and save.
     * @param {number} now - Now (ms).
     * @returns {Promise<void>}
     */
    async persist(now) {
      Object.keys(fired.departures).forEach((key) => {
        if (fired.departures[key].at < now - KEEP_MS) {
          delete fired.departures[key];
          dirty = true;
        }
      });
      Object.keys(fired.reminders).forEach((key) => {
        const kept = fired.reminders[key].filter((memory) => memory.departure > now - 3600000);
        if (kept.length !== fired.reminders[key].length) {
          fired.reminders[key] = kept;
          dirty = true;
        }
      });
      if (dirty && store) {
        dirty = false;
        await store.save(fired);
      }
    },
  };
}

export { SCENE_TRIGGERS, DELAY_LEVELS, REMINDER_MINUTES, delayLevel, createTracker };
