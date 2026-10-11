// -----------------------------------------------------------------------------
// When the departures of a stop are read, and which ones are followed.
//
// The real-time API only looks about 2 hours ahead. So a stop with a travel
// window ("07:00-09:30") and travel days is read only from an hour before the
// window to its end, on the travel days: every `poll_interval` minutes then,
// never the rest of the time — there would be nothing to see. Its followed
// departures are the ones of the window.
// Without a window: the next departures, read every `poll_interval` minutes,
// except at night (01:30-05:00) where a read every 30 minutes is enough.
//
// A new PRIM account allows 1 000 requests a day on the departures API. The
// interval is stretched when the stops configured would need more than the
// daily budget (plannedPollInterval), rather than running dry at noon.
//
// Every time is the time of Paris.
// -----------------------------------------------------------------------------

import { isoWeekday, minutesOfDay, parisDate, parseNavitiaDate } from './time.js';

const LEAD_MINUTES = 60;
const NIGHT = { start: 90, end: 300 };
const NIGHT_INTERVAL_MIN = 30;
// An idle stop still wakes up this often, to follow the clock changes.
const MAX_SLEEP_MS = 6 * 3600 * 1000;
const DAY_MS = 24 * 3600 * 1000;

/**
 * @description The instant of a time of a Paris day.
 * @param {string} date - "YYYY-MM-DD".
 * @param {number} minutes - Minutes since midnight (1440 = the next midnight).
 * @returns {number} The instant (ms).
 * @example
 * atParisTime('2026-10-12', 420); // -> Date.parse('2026-10-12T05:00:00Z')
 */
function atParisTime(date, minutes) {
  const day = Math.floor(minutes / 1440);
  const rest = minutes - day * 1440;
  const base = parseNavitiaDate(
    `${date.replace(/-/g, '')}T${String(Math.floor(rest / 60)).padStart(2, '0')}${String(rest % 60).padStart(2, '0')}00`,
  );
  return base + day * DAY_MS;
}

/**
 * @description Whether it is night (no metro, few trains).
 * @param {number} now - Now (ms).
 * @returns {boolean} True between 01:30 and 05:00.
 */
function isNight(now) {
  const minute = minutesOfDay(now);
  return minute >= NIGHT.start && minute < NIGHT.end;
}

/**
 * @description Whether a stop is in its busy period (read often).
 * @param {object} stop - The stop (`hours`, `days`).
 * @param {number} now - Now (ms).
 * @returns {boolean} True around the travel window (out of the night without one).
 * @example
 * isBusy({ hours: { start: 420, end: 570 }, days: [1, 2, 3, 4, 5] }, now);
 */
function isBusy(stop, now) {
  if (!stop.hours) {
    return !isNight(now);
  }
  if (!stop.days.includes(isoWeekday(now))) {
    return false;
  }
  const minute = minutesOfDay(now);
  return minute >= stop.hours.start - LEAD_MINUTES && minute < stop.hours.end;
}

/**
 * @description The span of departures to follow.
 * @param {object} stop - The stop (`hours`, `days`).
 * @param {number} now - Now (ms).
 * @returns {{ from: number|null, until: number|null }} Keep the departures
 * scheduled in [from, until) (null: no bound).
 * @example
 * followedSpan(stop, Date.now());
 */
function followedSpan(stop, now) {
  if (!stop.hours || !stop.days.includes(isoWeekday(now))) {
    return { from: null, until: null };
  }
  const date = parisDate(now);
  const end = atParisTime(date, stop.hours.end);
  if (now >= end) {
    return { from: null, until: null };
  }
  return { from: atParisTime(date, stop.hours.start), until: end };
}

/**
 * @description Keep the departures of the span.
 * @param {object[]} departures - The departures (already without the gone ones).
 * @param {object} span - The followed span.
 * @param {number} count - How many to keep.
 * @returns {object[]} The departures.
 * @example
 * upcoming(departures, followedSpan(stop, Date.now()), 4);
 */
function upcoming(departures, span, count) {
  return departures
    .filter((d) => span.from === null || d.baseDeparture >= span.from)
    .filter((d) => span.until === null || d.baseDeparture < span.until)
    .slice(0, count);
}

/**
 * @description The minutes a stop is read often, on an average day.
 * @param {object} stop - The stop.
 * @returns {number} The minutes.
 */
function busyMinutesPerDay(stop) {
  if (!stop.hours) {
    return 1440 - (NIGHT.end - NIGHT.start);
  }
  return ((stop.hours.end - stop.hours.start + LEAD_MINUTES) * stop.days.length) / 7;
}

/**
 * @description The poll interval that keeps the reads within the daily budget.
 * @param {object[]} stops - The configured stops.
 * @param {number} pollInterval - The interval asked (minutes).
 * @param {number} budget - The requests a day the stops may spend.
 * @returns {number} The interval to use (minutes), never under the one asked.
 * @example
 * plannedPollInterval([{ hours: null, days }], 2, 900); // -> 2 (615 + 7 a day)
 */
function plannedPollInterval(stops, pollInterval, budget) {
  const busy = stops.reduce((sum, stop) => sum + busyMinutesPerDay(stop), 0);
  const nights = stops.filter((stop) => !stop.hours).length;
  const nightReads = (nights * (NIGHT.end - NIGHT.start)) / NIGHT_INTERVAL_MIN;
  if (busy === 0) {
    return pollInterval;
  }
  const available = Math.max(1, budget - nightReads);
  return Math.max(pollInterval, Math.ceil(busy / available));
}

/**
 * @description Milliseconds until the next read of a stop.
 * @param {object} stop - The stop.
 * @param {number} now - Now (ms).
 * @param {number} pollInterval - The interval around the window (minutes).
 * @returns {number} The delay (ms): never past the start of the busy period.
 * @example
 * nextDelay(stop, Date.now(), 2);
 */
function nextDelay(stop, now, pollInterval) {
  const busy = pollInterval * 60000;
  if (isBusy(stop, now)) {
    return busy;
  }
  if (!stop.hours) {
    return NIGHT_INTERVAL_MIN * 60000;
  }
  // Idle: sleep until the busy period starts.
  for (let step = busy; step < MAX_SLEEP_MS; step += busy) {
    if (isBusy(stop, now + step)) {
      return step;
    }
  }
  return MAX_SLEEP_MS;
}

export {
  LEAD_MINUTES,
  NIGHT_INTERVAL_MIN,
  atParisTime,
  isNight,
  isBusy,
  followedSpan,
  upcoming,
  busyMinutesPerDay,
  plannedPollInterval,
  nextDelay,
};
