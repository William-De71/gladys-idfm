// -----------------------------------------------------------------------------
// The devices of the integration, offered on the Discovery screen.
//
// "IDFM – <stop> (<line> → <direction>)": one per configured stop.
// Read-only features:
//   - `next`        text: the next departure, "07:42 · RER B KASE → Robinson · +5 min";
//   - `wait`        duration (minutes): how long until it leaves (real time);
//   - `delay`       duration (minutes): its delay, 0 on time (trains with a
//                   timetable; always 0 for the metro);
//   - `disrupted`   counter: the followed departures delayed (from the delay
//                   threshold) or cancelled.
//
// "IDFM – <line> traffic": one per followed line. Read-only features:
//   - `status`       text: "Normal traffic", "Disrupted: <title>";
//   - `disruptions`  counter: the disruptions applying now (information
//                    messages left out).
//
// External ids: the stop area (or quay), the line and the direction of a
// stop ("ext:idfm:stop:sp58774_c01743_robinson"); the id of a line
// ("ext:idfm:line:c01743"). Retyping a name differently keeps the device.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';
import { t, nextLine, lineStateText } from './i18n.js';
import { departureStatus } from './departures.js';
import { fold } from './lines.js';
import { serious } from './traffic.js';

const DEVICE_TYPES = { STOP: 'stop', LINE: 'line' };
const FEATURE_KEYS = {
  NEXT: 'next',
  WAIT: 'wait',
  DELAY: 'delay',
  DISRUPTED: 'disrupted',
  STATUS: 'status',
  DISRUPTIONS: 'disruptions',
};
const MAX_WAIT = 180;
const MAX_DELAY = 1440;
const MAX_COUNT = 20;

/**
 * @description The identifier of a followed stop.
 * @param {{ kind: string, id: string }} stop - The resolved stop.
 * @param {{ id: string }|null} line - The resolved line, when set.
 * @param {string} direction - The direction typed, '' when none.
 * @returns {string} "sp58774_c01743_robinson".
 * @example
 * stopKey({ kind: 'area', id: '58774' }, { id: 'C01743' }, 'Robinson'); // -> 'sp58774_c01743_robinson'
 */
function stopKey(stop, line, direction) {
  const parts = [`${stop.kind === 'quay' ? 'q' : 'sp'}${stop.id}`];
  if (line) {
    parts.push(line.id.toLowerCase());
  }
  const slug = fold(direction)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 24);
  if (slug) {
    parts.push(slug);
  }
  return parts.join('_');
}

/**
 * @description The name of a followed stop: "Massy - Palaiseau (RER B → Robinson)".
 * @param {object} followed - `{ stop, line, direction }`.
 * @returns {string} The name.
 */
function followedName({ stop, line, direction }) {
  const detail = [line?.name, direction && `→ ${direction}`].filter(Boolean).join(' ');
  return detail ? `${stop.name} (${detail})` : stop.name;
}

/**
 * @description The external ids of a followed stop or line.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {string} type - DEVICE_TYPES.
 * @param {string} key - The stop key, or the line id.
 * @returns {{ device: string, feature: Function }} The ids.
 */
function idsOf(gladys, type, key) {
  return gladys.externalIds(type, key.toLowerCase());
}

/**
 * @description What a device external id stands for.
 * @param {unknown} externalId - A device (or feature) external id.
 * @returns {{ type: string, key: string }|null} The type and key.
 * @example
 * parseExternalId('ext:idfm:line:c01743'); // -> { type: 'line', key: 'c01743' }
 */
function parseExternalId(externalId) {
  const match = /:(stop|line):([a-z0-9_-]+)(?::[a-z_]+)?$/.exec(String(externalId ?? ''));
  return match ? { type: match[1], key: match[2] } : null;
}

/**
 * @description A read-only feature.
 * @param {object} feature - Its fields.
 * @returns {object} The feature.
 */
function sensor(feature) {
  return { read_only: true, has_feedback: false, keep_history: true, ...feature };
}

/**
 * @description Build the device of a followed stop.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {object} followed - The followed stop (`key`, `name`, `stop`, `line`).
 * @param {string} [language] - Language of the names.
 * @returns {object} The discovered device.
 */
function buildStopDevice(gladys, followed, language = 'en') {
  const ids = idsOf(gladys, DEVICE_TYPES.STOP, followed.key);
  const params = [{ name: 'IDFM_STOP', value: `${followed.stop.kind}:${followed.stop.id}` }];
  if (followed.line) {
    params.push({ name: 'IDFM_LINE', value: followed.line.id });
  }
  return {
    name: t('stopDeviceName', language, { stop: followed.name }),
    external_id: ids.device,
    should_poll: false,
    params,
    features: [
      sensor({
        name: t('featureNext', language),
        external_id: ids.feature(FEATURE_KEYS.NEXT),
        category: DEVICE_FEATURE_CATEGORIES.TEXT,
        type: DEVICE_FEATURE_TYPES.TEXT.TEXT,
        keep_history: false,
        min: 0,
        max: 0,
      }),
      sensor({
        name: t('featureWait', language),
        external_id: ids.feature(FEATURE_KEYS.WAIT),
        category: DEVICE_FEATURE_CATEGORIES.DURATION,
        type: DEVICE_FEATURE_TYPES.DURATION.INTEGER,
        unit: DEVICE_FEATURE_UNITS.MINUTES,
        keep_history: false,
        min: 0,
        max: MAX_WAIT,
      }),
      sensor({
        name: t('featureDelay', language),
        external_id: ids.feature(FEATURE_KEYS.DELAY),
        category: DEVICE_FEATURE_CATEGORIES.DURATION,
        type: DEVICE_FEATURE_TYPES.DURATION.INTEGER,
        unit: DEVICE_FEATURE_UNITS.MINUTES,
        min: 0,
        max: MAX_DELAY,
      }),
      sensor({
        name: t('featureDisrupted', language),
        external_id: ids.feature(FEATURE_KEYS.DISRUPTED),
        category: DEVICE_FEATURE_CATEGORIES.COUNTER_SENSOR,
        type: DEVICE_FEATURE_TYPES.SENSOR.INTEGER,
        min: 0,
        max: MAX_COUNT,
      }),
    ],
  };
}

/**
 * @description The states of a followed stop. Without any departure (a gap,
 * the night), the wait and the delay are left untouched: a 0 would fake a
 * departure now.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {object} followed - The followed stop.
 * @param {object[]} departures - Its followed departures.
 * @param {object} options - Options.
 * @param {number} options.threshold - The delay threshold (minutes).
 * @param {string} options.language - Language of the text.
 * @param {number} options.now - Now (ms).
 * @returns {Array<object>} The states.
 */
function buildStopStates(gladys, followed, departures, { threshold, language, now }) {
  const ids = idsOf(gladys, DEVICE_TYPES.STOP, followed.key);
  const running = departures.find((departure) => !departure.cancelled);
  const states = [
    {
      device_feature_external_id: ids.feature(FEATURE_KEYS.NEXT),
      text: nextLine(departures[0], language),
    },
    {
      device_feature_external_id: ids.feature(FEATURE_KEYS.DISRUPTED),
      state: Math.min(
        MAX_COUNT,
        departures.filter((departure) => departureStatus(departure, threshold) !== 'on_time')
          .length,
      ),
    },
  ];
  if (running) {
    states.push(
      {
        device_feature_external_id: ids.feature(FEATURE_KEYS.WAIT),
        state: Math.min(MAX_WAIT, Math.max(0, Math.round((running.departure - now) / 60000))),
      },
      {
        device_feature_external_id: ids.feature(FEATURE_KEYS.DELAY),
        state: Math.min(MAX_DELAY, running.delay),
      },
    );
  }
  return states;
}

/**
 * @description Build the device of a followed line.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {{ id: string, name: string }} line - The resolved line.
 * @param {string} [language] - Language of the names.
 * @returns {object} The discovered device.
 */
function buildLineDevice(gladys, line, language = 'en') {
  const ids = idsOf(gladys, DEVICE_TYPES.LINE, line.id);
  return {
    name: t('lineDeviceName', language, { line: line.name }),
    external_id: ids.device,
    should_poll: false,
    params: [{ name: 'IDFM_LINE', value: line.id }],
    features: [
      sensor({
        name: t('featureStatus', language),
        external_id: ids.feature(FEATURE_KEYS.STATUS),
        category: DEVICE_FEATURE_CATEGORIES.TEXT,
        type: DEVICE_FEATURE_TYPES.TEXT.TEXT,
        keep_history: false,
        min: 0,
        max: 0,
      }),
      sensor({
        name: t('featureDisruptions', language),
        external_id: ids.feature(FEATURE_KEYS.DISRUPTIONS),
        category: DEVICE_FEATURE_CATEGORIES.COUNTER_SENSOR,
        type: DEVICE_FEATURE_TYPES.SENSOR.INTEGER,
        min: 0,
        max: MAX_COUNT,
      }),
    ],
  };
}

/**
 * @description The one-line status of a line: "Disrupted: <title>".
 * @param {object} traffic - The traffic of the line (readTraffic).
 * @param {string} language - The language.
 * @returns {string} The status.
 */
function lineStatusText(traffic, language) {
  const [first] = serious(traffic);
  const state = lineStateText(traffic.state, language);
  return first?.title ? t('stateLine', language, { state, title: first.title }) : state;
}

/**
 * @description The states of a followed line.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {{ id: string }} line - The resolved line.
 * @param {object} traffic - Its traffic (readTraffic).
 * @param {string} language - Language of the text.
 * @returns {Array<object>} The states.
 */
function buildLineStates(gladys, line, traffic, language) {
  const ids = idsOf(gladys, DEVICE_TYPES.LINE, line.id);
  return [
    {
      device_feature_external_id: ids.feature(FEATURE_KEYS.STATUS),
      text: lineStatusText(traffic, language).slice(0, 250),
    },
    {
      device_feature_external_id: ids.feature(FEATURE_KEYS.DISRUPTIONS),
      state: Math.min(MAX_COUNT, serious(traffic).length),
    },
  ];
}

export {
  DEVICE_TYPES,
  FEATURE_KEYS,
  stopKey,
  followedName,
  idsOf,
  parseExternalId,
  buildStopDevice,
  buildStopStates,
  buildLineDevice,
  lineStatusText,
  buildLineStates,
};
