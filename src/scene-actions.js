// -----------------------------------------------------------------------------
// Scene actions of the Île-de-France Mobilités integration.
//
//   - `get_next_departures`  the next departure of a followed stop — line,
//                            destination, times, delay, status — and a
//                            sentence ready to send or speak ("Massy -
//                            Palaiseau: the next RER B KASE → Robinson leaves
//                            at 07:42, in 6 min. Then: 07:49 on time.");
//   - `get_line_traffic`     the traffic of a followed line: its state, the
//                            main disruption, a sentence.
// A read of the last 2 minutes is reused, an older one is read again.
// -----------------------------------------------------------------------------

import { t, departureLabel, stateText, lineStateText, sentence } from './i18n.js';
import { departureStatus } from './departures.js';
import { serious } from './traffic.js';
import { formatTime } from './time.js';

const SCENE_ACTIONS = {
  GET_NEXT_DEPARTURES: 'get_next_departures',
  GET_LINE_TRAFFIC: 'get_line_traffic',
};

/**
 * @description The sentence describing the next departures of a stop.
 * @param {object} followed - The followed stop.
 * @param {object[]} departures - The followed departures.
 * @param {number} now - Now (ms).
 * @param {string} language - The language.
 * @returns {string} The sentence.
 */
function stopSummary(followed, departures, now, language) {
  const [first, ...others] = departures;
  if (!first) {
    return t('summaryNone', language, { stop: followed.name });
  }
  const values = {
    stop: followed.stop.name,
    departure: first.destination
      ? `${departureLabel(first)} → ${first.destination}`
      : departureLabel(first),
    time: formatTime(first.baseDeparture),
    expected: formatTime(first.departure),
    n: first.delay,
    minutes: Math.max(0, Math.round((first.departure - now) / 60000)),
  };
  let key = 'summaryFirst';
  if (first.cancelled) {
    key = 'summaryFirstCancelled';
  } else if (first.delay > 0) {
    key = 'summaryFirstLate';
  }
  let text = t(key, language, values);
  if (others.length > 0) {
    const list = others
      .slice(0, 3)
      .map((d) => `${formatTime(d.departure)} ${stateText(d, language)}`)
      .join(', ');
    text += t('summaryNext', language, { list });
  }
  return text;
}

/**
 * @description The outputs of `get_next_departures`.
 * @param {object} options - Options.
 * @param {object} options.followed - The followed stop.
 * @param {object[]} options.departures - Its followed departures.
 * @param {number} options.threshold - The delay threshold (minutes).
 * @param {number} options.now - Now (ms).
 * @param {string} options.language - Language of the summary.
 * @returns {object} The outputs.
 */
function buildNextDeparturesOutputs({ followed, departures, threshold, now, language }) {
  const first = departures[0];
  const disrupted = departures.filter((d) => departureStatus(d, threshold) !== 'on_time').length;
  const summary = stopSummary(followed, departures, now, language);
  if (!first) {
    return {
      stop_name: followed.name,
      found: false,
      line: '',
      destination: '',
      mission: '',
      scheduled_departure: '',
      expected_departure: '',
      minutes_until_departure: 0,
      delay_minutes: 0,
      status: '',
      cancelled: false,
      platform: '',
      disrupted_count: 0,
      summary,
    };
  }
  return {
    stop_name: followed.name,
    found: true,
    line: first.line?.name || first.lineId,
    destination: first.destination,
    mission: first.mission,
    scheduled_departure: formatTime(first.baseDeparture),
    expected_departure: formatTime(first.departure),
    minutes_until_departure: Math.max(0, Math.round((first.departure - now) / 60000)),
    delay_minutes: first.delay,
    status: departureStatus(first, threshold),
    cancelled: first.cancelled,
    platform: first.platform,
    disrupted_count: disrupted,
    summary,
  };
}

/**
 * @description The outputs of `get_line_traffic`.
 * @param {object} options - Options.
 * @param {{ name: string }} options.line - The resolved line.
 * @param {object} options.traffic - Its traffic (readTraffic).
 * @param {string} options.language - Language of the summary.
 * @returns {object} The outputs.
 */
function buildLineTrafficOutputs({ line, traffic, language }) {
  const disruptions = serious(traffic);
  const [first] = disruptions;
  let summary = t('summaryLineNormal', language, { line: line.name });
  if (first) {
    summary = t('summaryLineDisrupted', language, {
      line: line.name,
      state: lineStateText(traffic.state, language),
      title: sentence(first.title.slice(0, 300)),
    }).trim();
    if (disruptions.length > 1) {
      summary += t('summaryLineOthers', language, { n: disruptions.length - 1 });
    }
  }
  return {
    line_name: line.name,
    state: traffic.state,
    disrupted: traffic.state !== 'normal',
    disruption_count: disruptions.length,
    title: first?.title ?? '',
    message: (first?.message ?? '').slice(0, 1000),
    summary,
  };
}

export { SCENE_ACTIONS, stopSummary, buildNextDeparturesOutputs, buildLineTrafficOutputs };
