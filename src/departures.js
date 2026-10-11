// -----------------------------------------------------------------------------
// Departures, read from the SIRI stop-monitoring answers.
//
// Every value of SIRI Lite is wrapped (`{ value }`), names are arrays of
// them, times are ISO UTC ("2026-04-27T12:29:37.000Z"). Per item:
//   - the line: `LineRef` "STIF:Line::C01743:";
//   - the destination: `DestinationName` (the SNCF leaves `DirectionName`
//     empty, the buses put "Aller" there: never used);
//   - the mission of a RER / Transilien train: `JourneyNote`, four capital
//     letters ("NATO", "PICI"); its number: `TrainNumbers` /
//     `VehicleJourneyName`;
//   - `AimedDepartureTime` (the timetable, trains mostly) and
//     `ExpectedDepartureTime` (real time). The delay is their difference:
//     without an aimed time (metro, most buses) there is none;
//   - `DepartureStatus`: onTime, early, delayed, cancelled, missed,
//     departed, notExpected, noReport.
//
// The answer covers about 30 minutes ago to 2 hours ahead, every line and
// direction of the stop: the departures gone are dropped, the line and the
// direction of the user are filtered here. A train ending at the stop has no
// departure time: dropped too.
// -----------------------------------------------------------------------------

import { lineIdOf, fold } from './lines.js';

const CANCELLED_STATUSES = new Set(['cancelled', 'missed', 'notExpected']);
const MISSION_REGEX = /^[A-Z]{4}$/;

/**
 * @description The first `value` of a SIRI field (a `{ value }` or an array of them).
 * @param {unknown} field - The field.
 * @returns {string} The value, '' when absent.
 * @example
 * siriValue([{ value: 'Robinson' }]); // -> 'Robinson'
 */
function siriValue(field) {
  const item = Array.isArray(field) ? field[0] : field;
  if (item && typeof item === 'object') {
    return String(item.value ?? '').trim();
  }
  return typeof item === 'string' ? item.trim() : '';
}

/**
 * @description Parse an ISO time.
 * @param {unknown} value - "2026-04-27T12:29:37.000Z".
 * @returns {number|null} The instant (ms).
 */
function parseTime(value) {
  if (typeof value !== 'string' || !value) {
    return null;
  }
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * @description Turn one `MonitoredStopVisit` into a departure.
 * @param {object} visit - The raw item.
 * @returns {object|null} The departure, null without a departure time.
 * @example
 * parseVisit(visit); // -> { id, lineId: 'C01742', destination: 'Boissy-Saint-Léger', … }
 */
function parseVisit(visit) {
  const journey = visit?.MonitoredVehicleJourney ?? {};
  const call = journey.MonitoredCall ?? {};
  const aimed = parseTime(call.AimedDepartureTime);
  const expected = parseTime(call.ExpectedDepartureTime);
  if (aimed === null && expected === null) {
    return null;
  }
  const status = String(call.DepartureStatus ?? '');
  const cancelled = CANCELLED_STATUSES.has(status);
  const departure = expected ?? aimed;
  const baseDeparture = aimed ?? expected;
  const delay =
    aimed !== null && expected !== null ? Math.max(0, Math.round((expected - aimed) / 60000)) : 0;
  const note = siriValue(journey.JourneyNote);
  const number =
    siriValue(journey.TrainNumbers?.TrainNumberRef) || siriValue(journey.VehicleJourneyName);
  const lineId = lineIdOf(siriValue(journey.LineRef));
  const destination =
    siriValue(journey.DestinationName) || siriValue(call.DestinationDisplay) || '';
  const vehicle = String(journey.FramedVehicleJourneyRef?.DatedVehicleJourneyRef ?? '');
  return {
    // The vehicle journey when given; otherwise what identifies a departure
    // to a rider: the line, the destination and the timetable.
    id: vehicle || `${lineId}|${fold(destination)}|${baseDeparture}`,
    lineId,
    destination,
    mission: MISSION_REGEX.test(note) ? note : '',
    number: number && number !== note ? number : '',
    baseDeparture,
    departure,
    delay,
    // An aimed time makes the delay meaningful (trains); metro and buses
    // only give the expected one.
    timetabled: aimed !== null,
    cancelled,
    platform: siriValue(call.DeparturePlatformName) || siriValue(call.ArrivalPlatformName),
    atStop: call.VehicleAtStop === true,
  };
}

/**
 * @description Whether a departure goes towards the words of a direction.
 * @param {object} departure - The departure.
 * @param {string} direction - Words of the destination, '' for any.
 * @returns {boolean} True when it matches.
 * @example
 * matchesDirection({ destination: 'Saint-Rémy-lès-Chevreuse' }, 'saint remy'); // -> true
 */
function matchesDirection(departure, direction) {
  if (!direction) {
    return true;
  }
  const words = (value) =>
    fold(value)
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  const destination = ` ${words(departure.destination)} `;
  return fold(direction)
    .split(/\s*[|/]\s*|\s+ou\s+|\s+or\s+/)
    .map(words)
    .filter(Boolean)
    .some((wanted) => destination.includes(` ${wanted}`));
}

/**
 * @description The departures of a stop, filtered for the user.
 * @param {object[]} visits - The raw `MonitoredStopVisit` items.
 * @param {object} [filter] - Filter.
 * @param {string} [filter.lineId] - Keep this line only ('' for every line).
 * @param {string} [filter.direction] - Keep this direction only.
 * @param {number} [filter.now] - Drop what left before (ms).
 * @returns {object[]} The departures, by real-time departure, without duplicates.
 * @example
 * parseDepartures(visits, { lineId: 'C01743', direction: 'Robinson', now: Date.now() });
 */
function parseDepartures(visits, { lineId = '', direction = '', now = 0 } = {}) {
  const seen = new Set();
  return (Array.isArray(visits) ? visits : [])
    .map(parseVisit)
    .filter(Boolean)
    .filter((departure) => !lineId || departure.lineId === lineId)
    .filter((departure) => matchesDirection(departure, direction))
    .filter(
      (departure) =>
        (departure.cancelled ? departure.baseDeparture : departure.departure) > now - 30000,
    )
    .filter((departure) => {
      if (seen.has(departure.id)) {
        return false;
      }
      seen.add(departure.id);
      return true;
    })
    .sort((a, b) => a.departure - b.departure);
}

/**
 * @description The state of a departure for the user.
 * @param {object} departure - The departure.
 * @param {number} threshold - The delay threshold (minutes).
 * @returns {'cancelled'|'delayed'|'on_time'} The state.
 * @example
 * departureStatus({ cancelled: false, delay: 7 }, 5); // -> 'delayed'
 */
function departureStatus(departure, threshold) {
  if (departure.cancelled) {
    return 'cancelled';
  }
  return departure.delay >= threshold ? 'delayed' : 'on_time';
}

export {
  siriValue,
  parseVisit,
  matchesDirection,
  parseDepartures,
  departureStatus,
  CANCELLED_STATUSES,
};
