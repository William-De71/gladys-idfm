// -----------------------------------------------------------------------------
// Configuration of the Île-de-France Mobilités integration.
//
// Fields of the config_schema:
//   - `api_key`                 the PRIM API key (free, prim.iledefrance-mobilites.fr);
//   - `stop_<n>`                the stop of departures n (1 to 3): a name
//                               ("Massy - Palaiseau", "Châtelet"), a stop
//                               area id ("58774", "IDFM:monomodalStopPlace:58774",
//                               "STIF:StopArea:SP:58774:") or a quay id
//                               ("STIF:StopPoint:Q:22087:");
//   - `stop_<n>_line`           optional line: "RER B", "Transilien P",
//                               "Métro 13", "T2", "Bus 91" or its id "C01743";
//   - `stop_<n>_direction`      optional words of the destination ("Robinson");
//   - `stop_<n>_hours`          optional travel window, "07:00-09:30";
//   - `stop_<n>_days`           optional travel days (empty = every day);
//   - `lines`                   the lines whose traffic is followed, comma
//                               separated ("RER B, P, 13");
//   - `departure_count`         how many departures are followed per stop;
//   - `delay_threshold`         from how many minutes a train is "delayed";
//   - `poll_interval`           minutes between two reads of a stop (around
//                               its window, or all day without one);
//   - `traffic_interval`        minutes between two reads of the traffic;
//   - `departures_quota`        the daily quota of the departures API of the
//                               account (1 000 on a new one, can be raised);
//   - `language`                language of the texts Gladys does not ask for
//                               in a language (device names, scene summaries):
//                               `auto` follows the last widget request.
//
// Internal keys, outside the config_schema (never shown in the UI):
//   - `last_language`   language of the last widget request, for the device
//                       names and the scene texts after a restart.
// -----------------------------------------------------------------------------

import { isLanguage } from './i18n.js';

const MAX_STOPS = 3;
const MAX_LINES = 6;
const DEPARTURE_COUNT = { min: 1, max: 8, default: 4 };
const DELAY_THRESHOLD = { min: 1, max: 30, default: 3 };
const POLL_INTERVAL = { min: 1, max: 30, default: 2 };
const TRAFFIC_INTERVAL = { min: 2, max: 60, default: 5 };
const DEPARTURES_QUOTA = { min: 100, max: 1000000, default: 1000 };
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const AUTO_LANGUAGE = 'auto';
// PRIM keys are long random tokens; anything this short cannot be one.
const API_KEY_REGEX = /^[A-Za-z0-9_-]{16,128}$/;
const HOURS_REGEX = /^(\d{1,2})[:hH](\d{2})?\s*[-–à>]+\s*(\d{1,2})[:hH](\d{2})?$/;

const INTERNAL_KEYS = {
  language: 'last_language',
};

/**
 * @description Read a bounded number field, falling back to its default.
 * @param {unknown} raw - The raw value (the form can send numbers as strings).
 * @param {{ min: number, max: number, default: number }} bounds - The bounds.
 * @returns {number} The value.
 * @example
 * readNumber('10', POLL_INTERVAL); // -> 10
 */
function readNumber(raw, bounds) {
  const value = Number(raw ?? bounds.default);
  if (raw === '' || raw === null || !Number.isFinite(value)) {
    return bounds.default;
  }
  return Math.min(bounds.max, Math.max(bounds.min, Math.round(value)));
}

/**
 * @description Read a trimmed string.
 * @param {unknown} raw - The raw value.
 * @returns {string} The string, '' when absent.
 * @example
 * readString(' Châtelet '); // -> 'Châtelet'
 */
function readString(raw) {
  return typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : '';
}

/**
 * @description Parse a travel window.
 * @param {unknown} raw - "07:00-09:30", "7h-9h30", "06:45 à 08:00".
 * @returns {{ start: number, end: number }|null} Minutes since midnight
 * (end after start, a window crossing midnight ends at 24:00), null when
 * absent or invalid.
 * @example
 * parseHours('7h-9h30'); // -> { start: 420, end: 570 }
 */
function parseHours(raw) {
  const match = HOURS_REGEX.exec(readString(raw));
  if (!match) {
    return null;
  }
  const [startHour, startMinute, endHour, endMinute] = match.slice(1).map((v) => Number(v ?? 0));
  if (startHour > 23 || endHour > 24 || startMinute > 59 || endMinute > 59) {
    return null;
  }
  const start = startHour * 60 + startMinute;
  let end = Math.min(24 * 60, endHour * 60 + endMinute);
  if (end <= start) {
    end = 24 * 60;
  }
  return { start, end };
}

/**
 * @description Parse the travel days.
 * @param {unknown} raw - The multi_select value (an array, or a comma list).
 * @returns {number[]} ISO weekdays (1 = Monday), every day when empty.
 * @example
 * parseDays(['mon', 'fri']); // -> [1, 5]
 */
function parseDays(raw) {
  let list = [];
  if (Array.isArray(raw)) {
    list = raw;
  } else if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      list = Array.isArray(parsed) ? parsed : [];
    } catch {
      list = raw.split(/[\s,;]+/);
    }
  }
  const days = [...new Set(list.map((day) => DAYS.indexOf(String(day)) + 1).filter((d) => d > 0))];
  return days.length === 0 ? [1, 2, 3, 4, 5, 6, 7] : days.sort((a, b) => a - b);
}

/**
 * @description Split the list of the followed lines.
 * @param {unknown} raw - "RER B, P ; 13".
 * @returns {string[]} The lines as typed, without duplicates, MAX_LINES at most.
 * @example
 * parseLines('RER B, P; 13'); // -> ['RER B', 'P', '13']
 */
function parseLines(raw) {
  const seen = new Set();
  return (typeof raw === 'string' ? raw : '')
    .split(/[,;\n]+/)
    .map((line) => line.trim().replace(/\s+/g, ' '))
    .filter((line) => {
      const key = line.toLowerCase();
      if (!line || seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .slice(0, MAX_LINES);
}

/**
 * @description Read the stops of the form: a stop needs a name or an id.
 * @param {object} config - The raw config.
 * @returns {Array<{ slot: number, stop: string, line: string, direction: string,
 * hours: object|null, days: number[] }>} The stops.
 */
function readStops(config) {
  const stops = [];
  for (let slot = 1; slot <= MAX_STOPS; slot += 1) {
    const stop = readString(config[`stop_${slot}`]);
    if (stop) {
      stops.push({
        slot,
        stop,
        line: readString(config[`stop_${slot}_line`]),
        direction: readString(config[`stop_${slot}_direction`]),
        hours: parseHours(config[`stop_${slot}_hours`]),
        days: parseDays(config[`stop_${slot}_days`]),
      });
    }
  }
  return stops;
}

/**
 * @description Normalize the raw config object from the host API.
 * @param {object} [rawConfig] - The raw config values.
 * @returns {{ apiKey: string, stops: Array, lines: string[], departureCount: number,
 * delayThreshold: number, pollInterval: number, trafficInterval: number,
 * departuresQuota: number, language: string }} The config (intervals in
 * minutes, language 'auto' or a language code).
 * @example
 * normalizeConfig({ api_key: '…', stop_1: 'Massy - Palaiseau', stop_1_line: 'RER B' });
 */
function normalizeConfig(rawConfig = {}) {
  const config = rawConfig ?? {};
  const apiKey = readString(config.api_key);
  return {
    apiKey: API_KEY_REGEX.test(apiKey) ? apiKey : '',
    stops: readStops(config),
    lines: parseLines(config.lines),
    departureCount: readNumber(config.departure_count, DEPARTURE_COUNT),
    delayThreshold: readNumber(config.delay_threshold, DELAY_THRESHOLD),
    pollInterval: readNumber(config.poll_interval, POLL_INTERVAL),
    trafficInterval: readNumber(config.traffic_interval, TRAFFIC_INTERVAL),
    departuresQuota: readNumber(config.departures_quota, DEPARTURES_QUOTA),
    language: isLanguage(config.language) ? config.language : AUTO_LANGUAGE,
  };
}

/**
 * @description Read the stored language of the last request.
 * @param {object} [rawConfig] - The raw config values.
 * @param {string} fallback - The language to keep when nothing valid is stored.
 * @returns {string} The language.
 * @example
 * readLanguage({ last_language: 'fr' }, 'en'); // -> 'fr'
 */
function readLanguage(rawConfig, fallback) {
  const language = (rawConfig ?? {})[INTERNAL_KEYS.language];
  return typeof language === 'string' && /^[a-z]{2}$/.test(language) ? language : fallback;
}

export {
  MAX_STOPS,
  MAX_LINES,
  DEPARTURE_COUNT,
  DELAY_THRESHOLD,
  POLL_INTERVAL,
  TRAFFIC_INTERVAL,
  DEPARTURES_QUOTA,
  AUTO_LANGUAGE,
  DAYS,
  INTERNAL_KEYS,
  normalizeConfig,
  parseHours,
  parseDays,
  parseLines,
  readLanguage,
};
