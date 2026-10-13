// -----------------------------------------------------------------------------
// Entry point of the Île-de-France Mobilités external integration.
//
// Follows the public transport of the Paris region — RER, Transilien, metro,
// tram, bus — in real time, through PRIM, the open data platform of
// Île-de-France Mobilités (a free key):
//   - the next departures of up to three stops, filtered by line and
//     direction: a device per stop (Discovery screen), scene triggers (a
//     train delayed, a departure cancelled, the next departure leaving in N
//     minutes), a scene action and a dashboard widget (see watcher.js,
//     tracker.js, widgets.js);
//   - the traffic of up to six lines: a device per line, scene triggers (a
//     line disrupted, back to normal), a scene action and a widget (see
//     traffic.js).
//
// PRIM has no push: each stop is read on its own timer around its travel
// window (schedule.js), the traffic of the whole network in one request every
// few minutes. Each API has a daily quota (1 000 requests on a new account),
// counted here (quota.js). Lines and stops are looked up in the open data of
// IDFM, which needs no key and spends no quota (opendata.js).
//
// Environment variables provided by the Gladys supervisor:
//   GLADYS_HOST_API_URL / GLADYS_INTEGRATION_TOKEN / GLADYS_INTEGRATION_SELECTOR
// The SDK reads them automatically: `new GladysIntegration()` is enough.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import {
  normalizeConfig,
  readLanguage,
  parseLines,
  INTERNAL_KEYS,
  AUTO_LANGUAGE,
} from './src/config.js';
import { createPrimClient, buildUserAgent, APIS } from './src/prim-api.js';
import { createOpenDataClient } from './src/opendata.js';
import { createStore } from './src/store.js';
import { createQuota } from './src/quota.js';
import { createLines } from './src/lines.js';
import { createStops, monitoringRef } from './src/stops.js';
import { createWatcher } from './src/watcher.js';
import { createTracker } from './src/tracker.js';
import { readTraffic, createTrafficTracker } from './src/traffic.js';
import { parseDepartures } from './src/departures.js';
import {
  DEVICE_TYPES,
  stopKey,
  followedName,
  idsOf,
  parseExternalId,
  buildStopDevice,
  buildStopStates,
  buildLineDevice,
  buildLineStates,
} from './src/device.js';
import { buildDepartureEvent, buildTrafficEvent } from './src/events.js';
import { transportOf } from './src/transport.js';
import { isBusy, plannedPollInterval } from './src/schedule.js';
import { formatTime } from './src/time.js';
import { t, all, lineStateText, LANGUAGES } from './src/i18n.js';
import {
  SCENE_ACTIONS,
  buildNextDeparturesOutputs,
  buildLineTrafficOutputs,
} from './src/scene-actions.js';
import {
  WIDGETS,
  BOARD_COUNT,
  messageContent,
  readCount,
  buildDeparturesWidget,
  buildTrafficWidget,
} from './src/widgets.js';

const { name, version, homepage } = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
);

const ACTIONS = {
  TEST_CONNECTION: 'test_connection',
  SEARCH_STOP: 'search_stop',
  SEARCH_LINE: 'search_line',
};
// A widget or a scene action reuses the last read of a stop while it is this fresh.
const SNAPSHOT_MAX_AGE_MS = 2 * 60 * 1000;
const BOARD_MAX_AGE_MS = 90 * 1000;
const REMINDER_TICK_MS = 30 * 1000;
const TRAFFIC_DAILY_LIMIT = 1000;
// Share of the departures budget left to the regular reads; the rest is for
// the widgets of typed stops, the scene actions and the configuration screen.
const READS_SHARE = 0.85;
// Names that failed for a network reason are resolved again this often.
const RESOLVE_RETRY_MS = 5 * 60 * 1000;

const gladys = new GladysIntegration();

let config = normalizeConfig();
// Language of the last widget request: the fallback of the texts Gladys does
// not ask for in a language, when the `language` setting is `auto`.
let language = 'fr';
// Device external ids the user created (states are only published for them).
let createdDevices = new Set();
// Last connection status sent, to send it again only when it changes.
let lastStatus = null;
// device external id -> error of its last read (null when it worked), and the
// transport badge last sent per device external id.
const outcomes = new Map();
const transports = new Map();
// The configured stops and lines, resolved.
let stops = [];
let lines = [];
// What the user typed and IDFM does not know.
let notFound = [];
let pollInterval = config.pollInterval;
let resolveTimer = null;
let reminderTimer = null;
let trafficTimer = null;
// The last traffic read: { answer, readAt, error }.
let traffic = { answer: null, readAt: 0, error: null };
let trafficPending = null;
// typed stop -> { at, departures }
const boards = new Map();

const userAgent = () => buildUserAgent({ name, version, homepage });
const quotas = {
  [APIS.DEPARTURES]: createQuota({
    store: createStore('quota-departures.json', { logger }),
    limit: () => config.departuresQuota,
  }),
  [APIS.TRAFFIC]: createQuota({
    store: createStore('quota-traffic.json', { logger }),
    limit: () => TRAFFIC_DAILY_LIMIT,
  }),
};
const departuresQuota = quotas[APIS.DEPARTURES];
const trafficQuota = quotas[APIS.TRAFFIC];
const prim = createPrimClient({
  getApiKey: () => config.apiKey,
  getUserAgent: userAgent,
  onRequest: (api) => quotas[api]?.record(),
});
const opendata = createOpenDataClient({ getUserAgent: userAgent });
const lineResolver = createLines({ opendata, store: createStore('lines.json', { logger }) });
const stopResolver = createStops({ opendata, store: createStore('stops.json', { logger }) });
const tracker = createTracker({ store: createStore('fired.json', { logger }) });
const trafficTracker = createTrafficTracker({ store: createStore('traffic.json', { logger }) });

/**
 * @description Remember the language of a request, and store it when it changed.
 * @param {string} next - The language.
 */
function rememberLanguage(next) {
  if (typeof next !== 'string' || !/^[a-z]{2}$/.test(next) || next === language) {
    return;
  }
  language = next;
  gladys
    .setConfig({ [INTERNAL_KEYS.language]: next })
    .catch((err) => logger.warn(`Unable to store the language: ${err.message}`));
}

/**
 * @description Language of the texts Gladys does not ask for in a language
 * (device names and states, scene summaries and outputs): the `language`
 * setting, or the language of the last widget request when it is `auto`.
 * @returns {string} The language.
 */
function textLanguage() {
  return config.language === AUTO_LANGUAGE ? language : config.language;
}

/**
 * @description Report the connection status, only when it changed.
 * @param {boolean} connected - Connected or not.
 * @param {object} message - The multi-language message.
 * @returns {Promise<void>}
 */
async function reportStatus(connected, message) {
  const signature = JSON.stringify([connected, message]);
  if (signature === lastStatus) {
    return;
  }
  lastStatus = signature;
  try {
    await gladys.setConnectionStatus(connected, message);
  } catch (err) {
    lastStatus = null;
    logger.error('Unable to report the connection status', err);
  }
}

/**
 * @description Work out the connection status from the last reads.
 * @returns {Promise<void>}
 */
async function refreshStatus() {
  if (!config.apiKey) {
    await reportStatus(false, all('noApiKey'));
    return;
  }
  const blockedUntil = Math.max(departuresQuota.blockedUntil(), trafficQuota.blockedUntil());
  if (blockedUntil) {
    await reportStatus(false, all('statusQuota', { time: formatTime(blockedUntil) }));
    return;
  }
  const stopErrors = watcher
    .errors()
    .map((entry) => entry.error)
    .filter(Boolean);
  const errors = stopErrors.concat(lines.length > 0 && traffic.error ? [traffic.error] : []);
  if (errors.some((err) => err.isAuth)) {
    await reportStatus(false, all('statusInvalidKey'));
    return;
  }
  if (notFound.length > 0) {
    await reportStatus(false, all('statusNotFound', { names: notFound.join(', ') }));
    return;
  }
  const sources = stops.length + (lines.length > 0 ? 1 : 0);
  if (errors.length > 0 && errors.length >= sources) {
    if (errors.every((err) => err.budget)) {
      await reportStatus(true, all('statusBudget', { used: departuresQuota.used() }));
      return;
    }
    await reportStatus(false, all('statusUnreachable'));
    return;
  }
  if (sources === 0) {
    await reportStatus(true, all('statusNothing'));
    return;
  }
  await reportStatus(
    true,
    all('statusOk', { stops: stops.length, lines: lines.length, used: departuresQuota.used() }),
  );
}

/**
 * @description Refresh the list of the devices the user created.
 * @returns {Promise<void>}
 */
async function refreshCreatedDevices() {
  try {
    const devices = await gladys.getDevices();
    createdDevices = new Set(devices.map((device) => device.external_id));
  } catch (err) {
    logger.warn(`Unable to read the devices: ${err.message}`);
  }
}

/**
 * @description Publish the states of a stop, when its device exists.
 * @param {object} followed - The followed stop.
 * @param {object} snapshot - Its last read.
 * @returns {Promise<void>}
 */
async function publishStopStates(followed, snapshot) {
  if (!createdDevices.has(idsOf(gladys, DEVICE_TYPES.STOP, followed.key).device)) {
    return;
  }
  await gladys.publishStates(
    buildStopStates(gladys, followed, snapshot.departures, {
      threshold: config.delayThreshold,
      language: textLanguage(),
      now: Date.now(),
    }),
  );
}

/**
 * @description Publish the transport badge of a device, when it exists and
 * the badge changed.
 * @param {string} externalId - The device external id.
 * @returns {Promise<void>}
 */
async function publishTransport(externalId) {
  if (!createdDevices.has(externalId) || !outcomes.has(externalId)) {
    return;
  }
  const entry = transportOf(externalId, outcomes.get(externalId));
  const signature = JSON.stringify(entry);
  if (transports.get(externalId) === signature) {
    return;
  }
  try {
    await gladys.publishTransports([entry]);
    transports.set(externalId, signature);
  } catch (err) {
    logger.warn(`Unable to publish the transport of ${externalId}: ${err.message}`);
  }
}

/**
 * @description Record the outcome of a read for a stop, and update its badge.
 * @param {object} followed - The followed stop.
 * @param {Error|null} error - The error of the read, null when it worked.
 * @returns {Promise<void>}
 */
async function stopOutcome(followed, error) {
  const externalId = idsOf(gladys, DEVICE_TYPES.STOP, followed.key).device;
  outcomes.set(externalId, error);
  await publishTransport(externalId);
}

/**
 * @description Record the outcome of a traffic read for every followed line,
 * and update their badges.
 * @param {Error|null} error - The error of the read, null when it worked.
 * @returns {Promise<void>}
 */
async function trafficOutcome(error) {
  for (const line of lines) {
    const externalId = idsOf(gladys, DEVICE_TYPES.LINE, line.id).device;
    outcomes.set(externalId, error);
    await publishTransport(externalId);
  }
}

/**
 * @description Publish scene events, one by one.
 * @param {Array<{ key: string, data: object }>} events - The built events.
 * @returns {Promise<void>}
 */
async function publishEvents(events) {
  for (const { key, data } of events) {
    logger.info(`${data.stop_name || data.line_name}: ${key}`);
    try {
      await gladys.publishSceneEvent(key, data);
    } catch (err) {
      logger.warn(`Unable to publish the scene event ${key}: ${err.message}`);
    }
  }
}

/**
 * @description Publish the departure events of a stop.
 * @param {object} followed - The followed stop.
 * @param {object[]} events - The tracker events.
 * @returns {Promise<void>}
 */
async function publishDepartureEvents(followed, events) {
  await publishEvents(
    events.map((event) => buildDepartureEvent(gladys, followed, event, textLanguage())),
  );
}

// --- The reads of the stops --------------------------------------------------------
const watcher = createWatcher({
  prim,
  lines: lineResolver,
  quota: departuresQuota,
  getStops: () => (config.apiKey ? stops : []),
  getSettings: () => ({ departureCount: config.departureCount, pollInterval }),
  onRead: async (followed, snapshot, { changed }) => {
    await stopOutcome(followed, null);
    const now = Date.now();
    await publishDepartureEvents(
      followed,
      tracker.diff(followed.key, snapshot.departures, config.delayThreshold),
    );
    await publishDepartureEvents(
      followed,
      tracker.reminders(followed.key, snapshot.departures, now),
    );
    await tracker.persist(now);
    // The wait changes on every read: the states always go.
    await publishStopStates(followed, snapshot).catch((err) =>
      logger.warn(`Unable to publish the states of ${followed.name}: ${err.message}`),
    );
    if (changed) {
      gladys.requestWidgetRefresh(WIDGETS.DEPARTURES);
    }
    await refreshStatus();
  },
  onError: async (followed, err) => {
    await stopOutcome(followed, err);
    await refreshStatus();
  },
  logger,
});

/**
 * @description Check the departure reminders on the last reads.
 * @returns {Promise<void>}
 */
async function checkReminders() {
  // Disconnected, the event would be lost while marked as fired.
  if (!gladys.connected) {
    return;
  }
  const now = Date.now();
  for (const followed of stops) {
    const snapshot = watcher.peek(followed.key);
    if (snapshot) {
      await publishDepartureEvents(
        followed,
        tracker.reminders(followed.key, snapshot.departures, now),
      );
    }
  }
  await tracker.persist(now);
}

// --- The traffic -------------------------------------------------------------------

/**
 * @description Read the traffic of the network now (one read at a time).
 * @returns {Promise<object>} `{ answer, readAt }`.
 */
function readTrafficNow() {
  if (!trafficPending) {
    trafficPending = (async () => {
      try {
        const answer = await prim.disruptions();
        traffic = { answer, readAt: Date.now(), error: null };
        await trafficOutcome(null);
        await onTrafficRead();
        return traffic;
      } catch (err) {
        traffic = { ...traffic, error: err };
        if (err.isQuota) {
          trafficQuota.block(err.retryAfter);
        }
        await trafficOutcome(err);
        throw err;
      } finally {
        trafficPending = null;
      }
    })();
  }
  return trafficPending;
}

/**
 * @description The traffic, read again when older than `maxAgeMs`.
 * @param {number} maxAgeMs - The freshness wanted.
 * @returns {Promise<object>} `{ answer, readAt }`.
 */
async function getTraffic(maxAgeMs) {
  if (traffic.answer && Date.now() - traffic.readAt <= maxAgeMs) {
    return traffic;
  }
  if (traffic.answer && !trafficQuota.canRequest()) {
    return traffic;
  }
  return readTrafficNow();
}

/**
 * @description Publish what a traffic read changed for the followed lines.
 * @returns {Promise<void>}
 */
async function onTrafficRead() {
  const now = Date.now();
  const ids = lines.map((line) => line.id);
  const byLine = readTraffic(traffic.answer, ids, now);
  if (gladys.connected) {
    const events = trafficTracker.diff(byLine, now);
    await publishEvents(
      events.map((event) =>
        buildTrafficEvent(
          gladys,
          lines.find((line) => line.id === event.lineId),
          event,
          textLanguage(),
        ),
      ),
    );
  }
  await trafficTracker.persist(now, ids);
  const states = lines
    .filter((line) => createdDevices.has(idsOf(gladys, DEVICE_TYPES.LINE, line.id).device))
    .flatMap((line) => buildLineStates(gladys, line, byLine.get(line.id), textLanguage()));
  if (states.length > 0) {
    await gladys
      .publishStates(states)
      .catch((err) => logger.warn(`Unable to publish the traffic states: ${err.message}`));
  }
  gladys.requestWidgetRefresh(WIDGETS.TRAFFIC);
}

/**
 * @description The regular read of the traffic, when lines are followed.
 * @returns {Promise<void>}
 */
async function trafficTick() {
  if (!config.apiKey || lines.length === 0) {
    return;
  }
  if (!trafficQuota.canPoll()) {
    traffic = { ...traffic, error: Object.assign(new Error('quota'), { budget: true }) };
    await trafficOutcome(traffic.error);
  } else {
    await readTrafficNow().catch((err) => logger.warn(`Traffic: ${err.message}`));
  }
  await refreshStatus();
}

/**
 * @description (Re)arm the regular read of the traffic.
 * @param {boolean} [now] - Read once right away.
 */
function scheduleTraffic(now = false) {
  clearInterval(trafficTimer);
  trafficTimer = setInterval(() => {
    trafficTick().catch(() => {});
  }, config.trafficInterval * 60000);
  trafficTimer.unref?.();
  if (now) {
    trafficTick().catch(() => {});
  }
}

// --- Stops and lines ---------------------------------------------------------------

/**
 * @description Resolve the configured stops and lines.
 * @returns {Promise<void>}
 */
async function resolveConfig() {
  clearTimeout(resolveTimer);
  const resolvedStops = [];
  const resolvedLines = [];
  const unknown = [];
  let retry = false;
  for (const entry of config.stops) {
    try {
      const line = entry.line ? await lineResolver.resolve(entry.line) : null;
      if (entry.line && !line) {
        unknown.push(entry.line);
        continue;
      }
      const stop = await stopResolver.resolve(entry.stop, line);
      if (!stop) {
        unknown.push(entry.stop);
        continue;
      }
      const key = stopKey(stop, line, entry.direction);
      if (!resolvedStops.some((followed) => followed.key === key)) {
        const followed = { ...entry, stop, line, key };
        resolvedStops.push({ ...followed, name: followedName(followed) });
      }
    } catch (err) {
      logger.warn(`Unable to resolve stop ${entry.slot}: ${err.message}`);
      retry = true;
      // Keep the stop when it was resolved before.
      const line = entry.line ? lineResolver.peekTyped(entry.line) : null;
      const stop = stopResolver.peek(entry.stop, line);
      if (stop && (!entry.line || line)) {
        const followed = { ...entry, stop, line, key: stopKey(stop, line, entry.direction) };
        resolvedStops.push({ ...followed, name: followedName(followed) });
      }
    }
  }
  for (const typed of config.lines) {
    try {
      const line = await lineResolver.resolve(typed);
      if (!line) {
        unknown.push(typed);
      } else if (!resolvedLines.some((known) => known.id === line.id)) {
        resolvedLines.push(line);
      }
    } catch (err) {
      logger.warn(`Unable to resolve line "${typed}": ${err.message}`);
      retry = true;
      const line = lineResolver.peekTyped(typed);
      if (line && !resolvedLines.some((known) => known.id === line.id)) {
        resolvedLines.push(line);
      }
    }
  }
  stops = resolvedStops;
  lines = resolvedLines;
  notFound = unknown;
  pollInterval = plannedPollInterval(
    stops,
    config.pollInterval,
    departuresQuota.budget() * READS_SHARE,
  );
  if (retry) {
    resolveTimer = setTimeout(() => {
      resolveConfig()
        .then(() => watcher.reschedule())
        .catch(() => {});
    }, RESOLVE_RETRY_MS);
    resolveTimer.unref?.();
  }
}

/**
 * @description What a widget or scene action targets, by device external id.
 * @param {unknown} externalId - The `source: "devices"` value.
 * @param {string} type - DEVICE_TYPES.
 * @returns {object|null} The followed stop or line, the first one by default.
 */
function pick(externalId, type) {
  const parsed = parseExternalId(externalId);
  if (type === DEVICE_TYPES.STOP) {
    const found =
      parsed?.type === type ? stops.find((followed) => followed.key === parsed.key) : null;
    return found ?? stops[0] ?? null;
  }
  const found =
    parsed?.type === type ? lines.find((line) => line.id.toLowerCase() === parsed.key) : null;
  return found ?? lines[0] ?? null;
}

/**
 * @description Offer a device per stop and per line on the Discovery screen.
 * @returns {Promise<number>} How many devices were offered.
 */
async function publishDiscoveredDevices() {
  const devices = [
    ...stops.map((followed) => buildStopDevice(gladys, followed, textLanguage())),
    ...lines.map((line) => buildLineDevice(gladys, line, textLanguage())),
  ];
  await gladys.publishDiscoveredDevices(devices);
  return devices.length;
}

// --- Dashboard widgets -------------------------------------------------------------

/**
 * @description The message of a failed read, for a widget.
 * @param {Error} err - The error.
 * @param {string} lang - The language.
 * @returns {string} The message.
 */
function readErrorMessage(err, lang) {
  if (err.isAuth) {
    return t('statusInvalidKey', lang);
  }
  if (err.isQuota) {
    const until = Math.max(departuresQuota.blockedUntil(), trafficQuota.blockedUntil());
    return t('statusQuota', lang, { time: formatTime(until || Date.now()) });
  }
  return t('unavailable', lang);
}

/**
 * @description The departures of a stop typed in a widget.
 * @param {string} typed - The stop.
 * @param {string} typedLine - Its optional line.
 * @param {string} lang - The language.
 * @returns {Promise<{ title: string, snapshot: object }|{ message: string }>} The board.
 */
async function typedBoard(typed, typedLine, lang) {
  const line = typedLine ? await lineResolver.resolve(typedLine) : null;
  if (typedLine && !line) {
    return { message: t('unknownLine', lang, { name: typedLine.slice(0, 60) }) };
  }
  const stop = await stopResolver.resolve(typed, line);
  if (!stop) {
    return { message: t('unknownStop', lang, { name: typed.slice(0, 60) }) };
  }
  const key = `${monitoringRef(stop)}|${line?.id ?? ''}`;
  let board = boards.get(key);
  const stale = !board || Date.now() - board.at > BOARD_MAX_AGE_MS;
  // Out of quota, an old board is better than nothing.
  if (stale && (departuresQuota.canRequest() || !board)) {
    const now = Date.now();
    const departures = parseDepartures(await prim.stopMonitoring(monitoringRef(stop)), {
      lineId: line?.id ?? '',
      now,
    });
    await lineResolver.learn(departures.map((d) => d.lineId));
    board = {
      at: now,
      departures: departures.map((d) => ({ ...d, line: lineResolver.peek(d.lineId) })),
    };
    boards.set(key, board);
  }
  const title = line ? `${stop.name} · ${line.name}` : stop.name;
  return { title, snapshot: { departures: board.departures, readAt: board.at } };
}

gladys.onWidgetGet(WIDGETS.DEPARTURES, async ({ settings = {}, language: lang }) => {
  rememberLanguage(lang);
  if (!config.apiKey) {
    return messageContent(t('noApiKey', lang));
  }
  const count = readCount(settings.count, BOARD_COUNT);
  const typed = typeof settings.stop_name === 'string' ? settings.stop_name.trim() : '';
  const typedLine = typeof settings.line === 'string' ? settings.line.trim() : '';
  const now = Date.now();
  try {
    if (typed) {
      const board = await typedBoard(typed, typedLine, lang);
      if (board.message) {
        return messageContent(board.message);
      }
      return buildDeparturesWidget({
        ...board,
        count,
        threshold: config.delayThreshold,
        language: lang,
        now: Date.now(),
      });
    }
    const followed = pick(settings.stop, DEVICE_TYPES.STOP);
    if (!followed) {
      return messageContent(t('noStop', lang));
    }
    const busy = !followed.hours || isBusy(followed, now);
    const snapshot = busy
      ? await watcher.get(followed, SNAPSHOT_MAX_AGE_MS)
      : (watcher.peek(followed.key) ?? { departures: [], readAt: now });
    return buildDeparturesWidget({
      title: followed.name,
      snapshot,
      window: followed,
      count,
      threshold: config.delayThreshold,
      language: lang,
      now: Date.now(),
      idle: !busy,
    });
  } catch (err) {
    if (err.isQuota) {
      departuresQuota.block(err.retryAfter);
    }
    logger.warn(`Widget: unable to read the departures: ${err.message}`);
    return messageContent(readErrorMessage(err, lang), 60);
  }
});

gladys.onWidgetGet(WIDGETS.TRAFFIC, async ({ settings = {}, language: lang }) => {
  rememberLanguage(lang);
  if (!config.apiKey) {
    return messageContent(t('noApiKey', lang));
  }
  try {
    let wanted = lines;
    const typed = parseLines(settings.lines);
    if (typed.length > 0) {
      wanted = [];
      for (const entry of typed) {
        const line = await lineResolver.resolve(entry);
        if (!line) {
          return messageContent(t('unknownLine', lang, { name: entry.slice(0, 60) }));
        }
        wanted.push(line);
      }
    }
    if (wanted.length === 0) {
      return messageContent(t('noLine', lang));
    }
    const current = await getTraffic(config.trafficInterval * 60000);
    const now = Date.now();
    const byLine = readTraffic(
      current.answer,
      wanted.map((line) => line.id),
      now,
    );
    return buildTrafficWidget({
      lines: wanted.map((line) => ({ line, traffic: byLine.get(line.id) })),
      readAt: current.readAt,
      language: lang,
      now,
    });
  } catch (err) {
    logger.warn(`Widget: unable to read the traffic: ${err.message}`);
    return messageContent(readErrorMessage(err, lang), 60);
  }
});

// --- Scene actions -----------------------------------------------------------------
gladys.onSceneAction(SCENE_ACTIONS.GET_NEXT_DEPARTURES, async (fields) => {
  const followed = pick(fields.stop, DEVICE_TYPES.STOP);
  if (!followed) {
    throw new Error('No Île-de-France Mobilités stop is configured');
  }
  const snapshot = await watcher.get(followed, SNAPSHOT_MAX_AGE_MS);
  return buildNextDeparturesOutputs({
    followed,
    departures: snapshot.departures,
    threshold: config.delayThreshold,
    now: Date.now(),
    language: textLanguage(),
  });
});

gladys.onSceneAction(SCENE_ACTIONS.GET_LINE_TRAFFIC, async (fields) => {
  const line = pick(fields.line, DEVICE_TYPES.LINE);
  if (!line) {
    throw new Error('No Île-de-France Mobilités line is followed');
  }
  const current = await getTraffic(SNAPSHOT_MAX_AGE_MS);
  const byLine = readTraffic(current.answer, [line.id], Date.now());
  return buildLineTrafficOutputs({ line, traffic: byLine.get(line.id), language: textLanguage() });
});

// --- Configuration screen actions --------------------------------------------------
gladys.onAction(ACTIONS.TEST_CONNECTION, async () => {
  if (!config.apiKey) {
    return all('noApiKey');
  }
  await resolveConfig();
  const messages = [];
  for (const followed of stops) {
    try {
      const snapshot = await watcher.get(followed, 0);
      const first = snapshot.departures[0];
      const next = first ? formatTime(first.departure) : '–';
      messages.push(
        all('stopOk', { stop: followed.name, count: snapshot.departures.length, next }),
      );
    } catch (err) {
      messages.push(
        all('stopError', (lang) => ({ stop: followed.name, error: readErrorMessage(err, lang) })),
      );
    }
  }
  if (lines.length > 0 || stops.length === 0) {
    try {
      const current = await readTrafficNow();
      const byLine = readTraffic(
        current.answer,
        lines.map((line) => line.id),
        Date.now(),
      );
      lines.forEach((line) => {
        const { state } = byLine.get(line.id);
        messages.push(
          all('lineState', (lang) => ({ line: line.name, state: lineStateText(state, lang) })),
        );
      });
      if (lines.length === 0) {
        messages.push(all('trafficApiOk'));
      }
    } catch (err) {
      messages.push(all('trafficError', (lang) => ({ error: readErrorMessage(err, lang) })));
    }
  }
  notFound.forEach((entry) => messages.push(all('entryNotFound', { name: entry })));
  messages.push(
    all('requestsCount', {
      used: departuresQuota.used(),
      quota: config.departuresQuota,
      interval: pollInterval,
    }),
  );
  await refreshStatus();
  return Object.fromEntries(
    LANGUAGES.map((lang) => [lang, messages.map((entry) => entry[lang]).join(' · ')]),
  );
});

gladys.onAction(ACTIONS.SEARCH_STOP, async (fields) => {
  const query = typeof fields.query === 'string' ? fields.query.trim() : '';
  if (query.length < 2) {
    return all('searchStopTooShort');
  }
  const found = (await stopResolver.search(query, 30)).slice(0, 8);
  if (found.length === 0) {
    return all('searchStopNone', { query });
  }
  const kinds = {
    railStation: 'kindTrain',
    metroStation: 'kindMetro',
    onstreetTram: 'kindTram',
    onstreetBus: 'kindBus',
  };
  const list = (lang) =>
    found
      .map((stop) => {
        const kind = kinds[stop.type] ? t(kinds[stop.type], lang) : stop.type;
        return `${stop.name} (${[kind, stop.town].filter(Boolean).join(', ')}) = ${stop.id}`;
      })
      .join(' · ');
  return all('searchStopFound', (lang) => ({ list: list(lang) }));
});

gladys.onAction(ACTIONS.SEARCH_LINE, async (fields) => {
  const query = typeof fields.query === 'string' ? fields.query.trim() : '';
  if (!query) {
    return all('searchLineEmpty');
  }
  const found = (await lineResolver.search(query)).slice(0, 8);
  if (found.length === 0) {
    return all('searchLineNone', { query });
  }
  const list = found
    .map((line) => `${line.label}${line.network ? ` (${line.network})` : ''} = ${line.id}`)
    .join(' · ');
  return all('searchLineFound', { list });
});

// --- Devices -----------------------------------------------------------------------
gladys.onScanRequest(async () => {
  const count = await publishDiscoveredDevices();
  logger.info(`Scan: ${count} device(s) offered`);
});

gladys.onDeviceCreated(async (device) => {
  await refreshCreatedDevices();
  transports.delete(device.external_id);
  await publishTransport(device.external_id);
  const parsed = parseExternalId(device.external_id);
  if (parsed?.type === DEVICE_TYPES.STOP) {
    const followed = stops.find((candidate) => candidate.key === parsed.key);
    const snapshot = followed ? watcher.peek(followed.key) : null;
    if (snapshot) {
      // States sent before the device existed were dropped by Gladys: send
      // them again now, and refresh the widgets that pick this stop.
      await publishStopStates(followed, snapshot).catch((err) =>
        logger.warn(`Unable to publish the states of ${followed.name}: ${err.message}`),
      );
      gladys.requestWidgetRefresh(WIDGETS.DEPARTURES);
    }
  } else if (parsed?.type === DEVICE_TYPES.LINE && traffic.answer) {
    const line = lines.find((candidate) => candidate.id.toLowerCase() === parsed.key);
    if (line) {
      const byLine = readTraffic(traffic.answer, [line.id], Date.now());
      await gladys
        .publishStates(buildLineStates(gladys, line, byLine.get(line.id), textLanguage()))
        .catch((err) =>
          logger.warn(`Unable to publish the traffic of ${line.name}: ${err.message}`),
        );
      gladys.requestWidgetRefresh(WIDGETS.TRAFFIC);
    }
  }
});

gladys.onDeviceDeleted(refreshCreatedDevices);

// --- Configuration -----------------------------------------------------------------

/**
 * @description Reload the whole config (internal keys included).
 * @param {object} [fallback] - Raw values to use when the read fails.
 * @returns {Promise<void>}
 */
async function loadConfig(fallback) {
  try {
    const raw = await gladys.getConfig();
    config = normalizeConfig(raw);
    language = readLanguage(raw, language);
  } catch (err) {
    if (fallback) {
      config = normalizeConfig(fallback);
    }
    logger.error('Unable to read the configuration', err);
  }
}

/**
 * @description Apply the configuration: names, devices, reads, status.
 * @returns {Promise<void>}
 */
async function applyConfig() {
  await resolveConfig();
  logger.info(
    `${stops.length} stop(s): ${stops.map((followed) => followed.name).join(', ') || 'none'}; ` +
      `${lines.length} line(s): ${lines.map((line) => line.name).join(', ') || 'none'}; ` +
      `departures read every ${pollInterval} min, ${departuresQuota.used()} requests in 24 h`,
  );
  if (pollInterval > config.pollInterval) {
    logger.warn(
      `Poll interval stretched from ${config.pollInterval} to ${pollInterval} min to fit the daily quota of ${config.departuresQuota} requests`,
    );
  }
  await publishDiscoveredDevices().catch((err) =>
    logger.warn(`Unable to offer the devices: ${err.message}`),
  );
  watcher.reschedule();
  scheduleTraffic(true);
  await refreshStatus();
}

gladys.onConfigUpdated(async (rawConfig) => {
  await loadConfig(rawConfig);
  boards.clear();
  await applyConfig();
});

// --- Connection lifecycle ----------------------------------------------------------
// Each step on its own: a failing one must not keep the watcher from starting.
gladys.on('connected', async () => {
  await loadConfig();
  await refreshCreatedDevices();
  lastStatus = null;
  transports.clear();
  watcher.start();
  await applyConfig();
});

// --- Graceful shutdown -------------------------------------------------------------
gladys.handleShutdown(async (signal) => {
  logger.info(`Received ${signal} -> graceful shutdown`);
  watcher.stop();
  clearTimeout(resolveTimer);
  clearInterval(reminderTimer);
  clearInterval(trafficTimer);
  await departuresQuota.flush();
  await trafficQuota.flush();
  await tracker.persist(Date.now());
  await trafficTracker.persist(
    Date.now(),
    lines.map((line) => line.id),
  );
});

// --- Startup -----------------------------------------------------------------------
logger.info(`Starting the Île-de-France Mobilités integration ${version}...`);
await departuresQuota.load();
await trafficQuota.load();
await tracker.load();
await trafficTracker.load();
reminderTimer = setInterval(() => {
  checkReminders().catch((err) => logger.warn(`Reminders: ${err.message}`));
}, REMINDER_TICK_MS);
reminderTimer.unref?.();
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
