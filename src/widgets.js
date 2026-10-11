// -----------------------------------------------------------------------------
// Dashboard widgets of the Île-de-France Mobilités integration.
//
//   - `departures`  the next departures of a stop, like the screens of the
//                   stations: line, destination, time, and a badge — in N
//                   min, +N min late, cancelled. A followed stop (chosen
//                   among the devices), or any stop typed in the widget
//                   settings (with an optional line);
//   - `traffic`     the state of lines — normal, disrupted, interrupted —
//                   then their disruptions; a tap opens the full message.
//                   The followed lines, or the ones typed in the settings.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { t, departureLabel, lineStateText } from './i18n.js';
import { formatTime, parisDate } from './time.js';
import { serious } from './traffic.js';

const WIDGETS = {
  DEPARTURES: 'departures',
  TRAFFIC: 'traffic',
};

const TTL_SECONDS = {
  departures: 60,
  idle: 300,
  traffic: 180,
  message: 300,
};

const BOARD_COUNT = { min: 1, max: 8, default: 6 };
const MAX_LIST_ITEMS = 8;
const MAX_STATUS_ITEMS = 10;
const MAX_LEFT_MINUTES = 180;

/**
 * @description Truncate a text to a bound, with an ellipsis.
 * @param {string} value - The text.
 * @param {number} max - The bound.
 * @returns {string} The text.
 * @example
 * clip('Saint-Rémy-lès-Chevreuse', 12); // -> 'Saint-Rémy-…'
 */
function clip(value, max) {
  const text = String(value ?? '');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * @description Read a bounded integer setting.
 * @param {unknown} raw - The raw setting.
 * @param {{ min: number, max: number, default: number }} bounds - The bounds.
 * @returns {number} The value.
 */
function readCount(raw, bounds) {
  const value = Number(raw);
  if (raw === undefined || raw === null || raw === '' || !Number.isFinite(value)) {
    return bounds.default;
  }
  return Math.min(bounds.max, Math.max(bounds.min, Math.round(value)));
}

/**
 * @description A widget content made of one message.
 * @param {string} message - The message.
 * @param {number} [ttl] - Its freshness.
 * @returns {object} The content.
 */
function messageContent(message, ttl = TTL_SECONDS.message) {
  return { ttl_seconds: ttl, components: [{ type: 'text', variant: 'body', text: message }] };
}

/**
 * @description The badge of a departure.
 * @param {object} departure - The departure.
 * @param {number} threshold - The delay threshold (minutes).
 * @param {string} language - The language.
 * @param {number} now - Now (ms).
 * @returns {{ text: string, color: string }} The badge.
 */
function badgeOf(departure, threshold, language, now) {
  if (departure.cancelled) {
    return { text: t('badgeCancelled', language), color: WIDGET_COLORS.DANGER };
  }
  if (departure.delay > 0) {
    let color = WIDGET_COLORS.NEUTRAL;
    if (departure.delay >= 30) {
      color = WIDGET_COLORS.DANGER;
    } else if (departure.delay >= threshold) {
      color = WIDGET_COLORS.WARNING;
    }
    return { text: t('late', language, { n: departure.delay }), color };
  }
  if (departure.atStop) {
    return { text: t('badgeAtStop', language), color: WIDGET_COLORS.PRIMARY };
  }
  const left = Math.max(0, Math.round((departure.departure - now) / 60000));
  if (left < 60) {
    return { text: t('inMinutes', language, { n: left }), color: WIDGET_COLORS.SUCCESS };
  }
  return { text: t('badgeOnTime', language), color: WIDGET_COLORS.SUCCESS };
}

/**
 * @description The "departures" widget.
 * @param {object} options - Options.
 * @param {string} options.title - The name of the stop.
 * @param {object} options.snapshot - `{ departures, span, readAt }`.
 * @param {object|null} [options.window] - The travel window of a followed stop (`hours`).
 * @param {number} options.count - How many departures to show.
 * @param {number} options.threshold - The delay threshold (minutes).
 * @param {string} options.language - The user language.
 * @param {number} options.now - Now (ms).
 * @param {boolean} [options.idle] - The stop is outside its window (refreshed slowly).
 * @returns {object} The content.
 */
function buildDeparturesWidget({
  title,
  snapshot,
  window = null,
  count,
  threshold,
  language,
  now,
  idle = false,
}) {
  const ttl = idle ? TTL_SECONDS.idle : TTL_SECONDS.departures;
  const heading = { type: 'text', variant: 'heading', text: clip(title, 40) };
  const departures = snapshot.departures.filter(
    (d) => (d.cancelled ? d.baseDeparture : d.departure) > now - 30000,
  );
  if (departures.length === 0) {
    let text = t('noDeparture', language);
    if (window?.hours && idle) {
      const hm = (minutes) =>
        `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
      text = t('windowNotStarted', language, {
        hours: `${hm(window.hours.start)}-${hm(window.hours.end)}`,
        time: hm(Math.max(0, window.hours.start - 60)),
      });
    }
    return { ttl_seconds: ttl, components: [heading, { type: 'text', variant: 'body', text }] };
  }
  const components = [
    heading,
    {
      type: 'text',
      variant: 'caption',
      text: t('updatedAt', language, { time: formatTime(snapshot.readAt) }),
    },
  ];
  const next = departures.find((d) => !d.cancelled);
  if (next) {
    const left = Math.round((next.departure - now) / 60000);
    if (left >= 0 && left < MAX_LEFT_MINUTES) {
      components.push({
        type: 'value',
        value: left,
        unit: t('minutesShort', language),
        label: t('departsIn', language),
        icon: 'clock',
        color: next.delay >= threshold ? WIDGET_COLORS.WARNING : WIDGET_COLORS.SUCCESS,
      });
    }
  }
  components.push({
    type: 'card-list',
    display: 'list',
    items: departures.slice(0, Math.min(count, MAX_LIST_ITEMS)).map((departure) => {
      const late = !departure.cancelled && departure.delay > 0;
      const times = late
        ? `${formatTime(departure.departure)} (${formatTime(departure.baseDeparture)})`
        : formatTime(departure.departure);
      return {
        title: clip(
          `${departureLabel(departure)} → ${departure.destination || '?'}`.replace(/ → \?$/, ''),
          60,
        ),
        subtitle: clip(
          [times, departure.platform && t('platform', language, { platform: departure.platform })]
            .filter(Boolean)
            .join(' · '),
          60,
        ),
        badge: badgeOf(departure, threshold, language, now),
      };
    }),
  });
  return { ttl_seconds: ttl, components };
}

/**
 * @description The color of a line state.
 * @param {string} state - 'normal', 'disrupted' or 'blocked'.
 * @returns {string} The color.
 */
function stateColor(state) {
  if (state === 'blocked') {
    return WIDGET_COLORS.DANGER;
  }
  return state === 'disrupted' ? WIDGET_COLORS.WARNING : WIDGET_COLORS.SUCCESS;
}

/**
 * @description "12/10 07:00 → 13/10 12:00", or "from 07:00".
 * @param {object} disruption - The disruption (`begin`, `end`).
 * @param {string} language - The language.
 * @param {number} now - Now (ms).
 * @returns {string} The period.
 */
function periodText(disruption, language, now) {
  const at = (ms) => {
    if (parisDate(ms) === parisDate(now)) {
      return formatTime(ms);
    }
    const [, month, day] = parisDate(ms).split('-');
    return `${day}/${month} ${formatTime(ms)}`;
  };
  if (!Number.isFinite(disruption.end)) {
    return t('periodFrom', language, { begin: at(disruption.begin) });
  }
  return t('periodFromTo', language, { begin: at(disruption.begin), end: at(disruption.end) });
}

/**
 * @description The "traffic" widget.
 * @param {object} options - Options.
 * @param {Array<{ line: object, traffic: object }>} options.lines - The lines and their traffic.
 * @param {number|null} options.readAt - When the traffic was read.
 * @param {string} options.language - The user language.
 * @param {number} options.now - Now (ms).
 * @returns {object} The content.
 */
function buildTrafficWidget({ lines, readAt, language, now }) {
  const components = [{ type: 'text', variant: 'heading', text: t('trafficTitle', language) }];
  if (readAt) {
    components.push({
      type: 'text',
      variant: 'caption',
      text: t('updatedAt', language, { time: formatTime(readAt) }),
    });
  }
  components.push({
    type: 'status',
    items: lines.slice(0, MAX_STATUS_ITEMS).map(({ line, traffic }) => ({
      label: clip(line.name, 40),
      value: clip(lineStateText(traffic.state, language), 40),
      color: stateColor(traffic.state),
    })),
  });
  const severityText = {
    blocking: t('severityBlocking', language),
    disrupted: t('severityDisrupted', language),
    information: t('severityInformation', language),
  };
  const items = [];
  lines.forEach(({ line, traffic }) => {
    serious(traffic).forEach((disruption) => items.push({ line, disruption, planned: false }));
  });
  lines.forEach(({ line, traffic }) => {
    traffic.upcoming
      .filter((disruption) => disruption.severity !== 'information')
      .forEach((disruption) => items.push({ line, disruption, planned: true }));
  });
  if (items.length > 0) {
    components.push({
      type: 'card-list',
      display: 'list',
      items: items.slice(0, MAX_LIST_ITEMS).map(({ line, disruption, planned }) => {
        let color = WIDGET_COLORS.WARNING;
        if (planned) {
          color = WIDGET_COLORS.INFO;
        } else if (disruption.severity === 'blocking') {
          color = WIDGET_COLORS.DANGER;
        }
        const item = {
          title: clip(disruption.title || line.name, 60),
          subtitle: clip(`${line.name} · ${periodText(disruption, language, now)}`, 60),
          badge: {
            text: clip(
              planned ? t('severityPlanned', language) : severityText[disruption.severity],
              16,
            ),
            color,
          },
        };
        if (disruption.message) {
          item.description = clip(disruption.message, 2000);
        }
        return item;
      }),
    });
  }
  return { ttl_seconds: TTL_SECONDS.traffic, components };
}

export {
  WIDGETS,
  TTL_SECONDS,
  BOARD_COUNT,
  clip,
  messageContent,
  readCount,
  badgeOf,
  buildDeparturesWidget,
  buildTrafficWidget,
};
