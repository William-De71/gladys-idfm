// -----------------------------------------------------------------------------
// The data of the scene events.
//
// `data` is flat: the core matches the trigger filters on the keys named like
// the declared `fields` (`stop` / `line`: the device external id,
// `delay_level`, `minutes`, `severity`, `cause`), and exposes the declared
// `variables` to the scene ({{triggerEvent.data.summary}}). Every other key
// would be dropped: each trigger gets exactly its declared keys (see the
// manifest test).
// -----------------------------------------------------------------------------

import { DEVICE_TYPES, idsOf } from './device.js';
import { SCENE_TRIGGERS } from './tracker.js';
import { TRAFFIC_TRIGGERS } from './traffic.js';
import { t, departureLabel, lineStateText, sentence } from './i18n.js';
import { formatTime, parisDate } from './time.js';

/**
 * @description "2026-10-12 07:42", Paris time.
 * @param {number|null} ms - The instant.
 * @returns {string} The date and time, '' when none.
 */
function dateTime(ms) {
  return Number.isFinite(ms) ? `${parisDate(ms)} ${formatTime(ms)}` : '';
}

/**
 * @description Build the scene event of something that happened to a departure.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {object} followed - The followed stop.
 * @param {{ key: string, departure: object, level?: string, minutes?: number }} event - The event.
 * @param {string} language - Language of the summary.
 * @returns {{ key: string, data: object }} The trigger key and its data.
 */
function buildDepartureEvent(gladys, followed, event, language) {
  const { departure } = event;
  const base = {
    stop: idsOf(gladys, DEVICE_TYPES.STOP, followed.key).device,
    stop_name: followed.name,
    line: departure.line?.name || departure.lineId,
    destination: departure.destination,
    mission: departure.mission,
    scheduled_departure: formatTime(departure.baseDeparture),
    expected_departure: formatTime(departure.departure),
    platform: departure.platform,
  };
  const values = {
    stop: followed.stop.name,
    departure: departure.destination
      ? `${departureLabel(departure)} → ${departure.destination}`
      : departureLabel(departure),
    time: base.scheduled_departure,
    expected: base.expected_departure,
    n: departure.delay,
  };
  if (event.key === SCENE_TRIGGERS.DEPARTURE_CANCELLED) {
    return { key: event.key, data: { ...base, summary: t('summaryCancelled', language, values) } };
  }
  if (event.key === SCENE_TRIGGERS.DEPARTURE_DELAYED) {
    return {
      key: event.key,
      data: {
        ...base,
        delay_level: event.level,
        delay_minutes: departure.delay,
        summary: t('summaryDelayed', language, values),
      },
    };
  }
  return {
    key: SCENE_TRIGGERS.DEPARTURE_SOON,
    data: {
      ...base,
      minutes: String(event.minutes),
      delay_minutes: departure.delay,
      summary: t('summaryReminder', language, {
        ...values,
        minutes: event.minutes,
        late: departure.delay > 0 ? t('reminderLate', language, { n: departure.delay }) : '',
      }),
    },
  };
}

/**
 * @description Build the scene event of a change of the traffic of a line.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {{ id: string, name: string }} line - The resolved line.
 * @param {{ key: string, disruption?: object }} event - The event.
 * @param {string} language - Language of the summary.
 * @returns {{ key: string, data: object }} The trigger key and its data.
 */
function buildTrafficEvent(gladys, line, event, language) {
  const base = { line: idsOf(gladys, DEVICE_TYPES.LINE, line.id).device, line_name: line.name };
  if (event.key === TRAFFIC_TRIGGERS.LINE_RESTORED) {
    return {
      key: event.key,
      data: { ...base, summary: t('summaryLineRestored', language, { line: line.name }) },
    };
  }
  const { disruption } = event;
  const state = lineStateText(
    disruption.severity === 'blocking' ? 'blocked' : 'disrupted',
    language,
  );
  return {
    key: TRAFFIC_TRIGGERS.LINE_DISRUPTED,
    data: {
      ...base,
      severity: disruption.severity,
      cause: disruption.cause,
      title: disruption.title,
      message: disruption.message.slice(0, 1000),
      begin: dateTime(disruption.begin),
      end: dateTime(disruption.end),
      summary: t('summaryLineDisrupted', language, {
        line: line.name,
        state,
        title: sentence(disruption.title.slice(0, 300)),
      }).trim(),
    },
  };
}

export { buildDepartureEvent, buildTrafficEvent };
