// -----------------------------------------------------------------------------
// The traffic of the followed lines.
//
// One `disruptions_bulk` answer lists every disruption of the network
// (`disruptions[]`) and, per line, the ids of the ones touching it — the line
// itself or one of its stops (`lines[].impactedObjects[].disruptionIds`).
// A disruption has:
//   - `severity`             BLOQUANTE (the line or a part of it stops),
//                            PERTURBEE (it runs, badly), INFORMATION;
//   - `cause`                PERTURBATION (an incident) or TRAVAUX (works);
//   - `applicationPeriods`   when it applies, Paris time "YYYYMMDDTHHMMSS";
//   - `title`, `message`     the message (HTML), `shortMessage`.
//
// The state of a line counts only what applies NOW and is not mere
// information: `blocked`, `disrupted` or `normal`. The disruptions planned in
// the next 24 hours are listed too (widget), without changing the state.
//
// Scene events: `line_disrupted` once per disruption (kept for 2 days in
// /data, no repeat after a restart), `line_restored` when a line that was
// not normal is normal on two reads in a row (one empty read is not enough:
// a message is sometimes withdrawn and published again).
// -----------------------------------------------------------------------------

import { parseNavitiaDate } from './time.js';
import { lineIdOf } from './lines.js';

const SEVERITIES = {
  BLOQUANTE: 'blocking',
  PERTURBEE: 'disrupted',
  INFORMATION: 'information',
};
const CAUSES = {
  PERTURBATION: 'incident',
  TRAVAUX: 'works',
};
const SCENE_TRIGGERS = {
  LINE_DISRUPTED: 'line_disrupted',
  LINE_RESTORED: 'line_restored',
};
const LINE_STATES = ['normal', 'disrupted', 'blocked'];
const SEVERITY_LEVELS = ['blocking', 'disrupted'];
const CAUSE_VALUES = ['incident', 'works'];
const UPCOMING_MS = 24 * 3600 * 1000;
const KEEP_MS = 48 * 3600 * 1000;
const RESTORED_READS = 2;
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };

/**
 * @description Turn a message (it may carry HTML) into plain text.
 * @param {unknown} value - The text.
 * @returns {string} The plain text.
 * @example
 * plainText('<p>Trafic interrompu&nbsp;!</p>'); // -> 'Trafic interrompu !'
 */
function plainText(value) {
  return String(value ?? '')
    .replace(/<br\s*\/?>|<\/p>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&([a-z]+|#39);/gi, (entity, name) => ENTITIES[name.toLowerCase()] ?? entity)
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * @description Read one disruption.
 * @param {object} raw - The raw disruption.
 * @returns {object|null} The disruption, null without an id.
 */
function parseDisruption(raw) {
  if (!raw?.id) {
    return null;
  }
  const periods = (Array.isArray(raw.applicationPeriods) ? raw.applicationPeriods : [])
    .map((period) => ({
      begin: parseNavitiaDate(period?.begin),
      end: parseNavitiaDate(period?.end),
    }))
    .filter((period) => period.begin !== null)
    .sort((a, b) => a.begin - b.begin);
  const title = plainText(raw.title);
  return {
    id: String(raw.id),
    severity: SEVERITIES[String(raw.severity ?? '').toUpperCase()] ?? 'information',
    cause: CAUSES[String(raw.cause ?? '').toUpperCase()] ?? 'incident',
    title: title || plainText(raw.shortMessage),
    message: plainText(raw.message),
    periods,
  };
}

/**
 * @description The period of a disruption that applies at an instant, or the next one.
 * @param {object} disruption - The disruption.
 * @param {number} now - Now (ms).
 * @returns {{ begin: number, end: number|null, active: boolean }|null} The period, null when over.
 */
function periodAt(disruption, now) {
  for (const period of disruption.periods) {
    const end = period.end ?? Infinity;
    if (period.begin <= now && now < end) {
      return { ...period, active: true };
    }
    if (period.begin > now) {
      return { ...period, active: false };
    }
  }
  return null;
}

/**
 * @description The traffic of lines, from a `disruptions_bulk` answer.
 * @param {{ disruptions: object[], lines: object[] }} answer - The answer.
 * @param {string[]} lineIds - The lines wanted ("C01743").
 * @param {number} now - Now (ms).
 * @returns {Map<string, { state: string, active: object[], upcoming: object[] }>} Per line.
 * @example
 * readTraffic(answer, ['C01743'], Date.now()).get('C01743').state; // -> 'disrupted'
 */
function readTraffic(answer, lineIds, now) {
  const byId = new Map();
  (answer?.disruptions ?? []).forEach((raw) => {
    const disruption = parseDisruption(raw);
    if (disruption) {
      byId.set(disruption.id, disruption);
    }
  });
  const idsOfLine = new Map();
  (answer?.lines ?? []).forEach((line) => {
    const id = lineIdOf(line?.id);
    if (!id) {
      return;
    }
    const ids = idsOfLine.get(id) ?? new Set();
    (line.impactedObjects ?? []).forEach((object) =>
      (object?.disruptionIds ?? []).forEach((disruptionId) => ids.add(String(disruptionId))),
    );
    idsOfLine.set(id, ids);
  });
  const result = new Map();
  lineIds.forEach((lineId) => {
    const active = [];
    const upcoming = [];
    const seenTitles = new Set();
    [...(idsOfLine.get(lineId) ?? [])].forEach((disruptionId) => {
      const disruption = byId.get(disruptionId);
      if (!disruption) {
        return;
      }
      const period = periodAt(disruption, now);
      if (!period) {
        return;
      }
      // The same message is often published several times (one per stop).
      const titleKey = `${disruption.severity}|${disruption.title}`;
      if (seenTitles.has(titleKey)) {
        return;
      }
      seenTitles.add(titleKey);
      const entry = { ...disruption, begin: period.begin, end: period.end };
      if (period.active) {
        active.push(entry);
      } else if (period.begin - now <= UPCOMING_MS) {
        upcoming.push(entry);
      }
    });
    const rank = { blocking: 0, disrupted: 1, information: 2 };
    active.sort((a, b) => rank[a.severity] - rank[b.severity] || a.begin - b.begin);
    upcoming.sort((a, b) => a.begin - b.begin);
    let state = 'normal';
    if (active.some((d) => d.severity === 'blocking')) {
      state = 'blocked';
    } else if (active.some((d) => d.severity === 'disrupted')) {
      state = 'disrupted';
    }
    result.set(lineId, { state, active, upcoming });
  });
  return result;
}

/**
 * @description The disruptions that make a line not normal.
 * @param {{ active: object[] }} traffic - The traffic of a line.
 * @returns {object[]} The blocking and disrupting ones.
 */
function serious(traffic) {
  return (traffic?.active ?? []).filter((d) => SEVERITY_LEVELS.includes(d.severity));
}

/**
 * @description Create the tracker of the traffic events.
 * @param {object} [options] - Options.
 * @param {object} [options.store] - Where the memory survives a restart.
 * @returns {object} The tracker.
 * @example
 * const tracker = createTrafficTracker({ store: createStore('traffic.json') });
 */
function createTrafficTracker({ store = null } = {}) {
  // fired: { <line>|<disruption id>: at }, lines: { <line>: { state, normalReads } }
  let memory = { fired: {}, lines: {} };
  let dirty = false;

  return {
    /** @returns {Promise<void>} Read the memory saved before a restart. */
    async load() {
      const saved = store ? await store.load(null) : null;
      if (saved && typeof saved === 'object' && saved.fired && saved.lines) {
        memory = saved;
      }
    },

    /**
     * @description Compare a fresh read with the memory.
     * @param {Map<string, object>} traffic - readTraffic.
     * @param {number} now - Now (ms).
     * @returns {Array<{ key: string, lineId: string, disruption?: object }>} The events.
     */
    diff(traffic, now) {
      const events = [];
      traffic.forEach((entry, lineId) => {
        const known = memory.lines[lineId];
        const disruptions = serious(entry);
        disruptions.forEach((disruption) => {
          const key = `${lineId}|${disruption.id}`;
          if (!memory.fired[key]) {
            memory.fired[key] = now;
            dirty = true;
            // A line seen for the first time: what is already going on is
            // the baseline, not news.
            if (known) {
              events.push({ key: SCENE_TRIGGERS.LINE_DISRUPTED, lineId, disruption });
            }
          }
        });
        const line = known ?? { state: entry.state, normalReads: 0 };
        if (entry.state === 'normal') {
          line.normalReads = (line.normalReads ?? 0) + 1;
          if (line.state !== 'normal' && line.normalReads >= RESTORED_READS) {
            events.push({ key: SCENE_TRIGGERS.LINE_RESTORED, lineId });
            line.state = 'normal';
          }
        } else {
          line.state = entry.state;
          line.normalReads = 0;
        }
        memory.lines[lineId] = line;
        dirty = true;
      });
      return events;
    },

    /**
     * @description Forget the old disruptions and the lines no longer followed, and save.
     * @param {number} now - Now (ms).
     * @param {string[]} lineIds - The followed lines.
     * @returns {Promise<void>}
     */
    async persist(now, lineIds) {
      Object.keys(memory.fired).forEach((key) => {
        if (memory.fired[key] < now - KEEP_MS) {
          delete memory.fired[key];
          dirty = true;
        }
      });
      Object.keys(memory.lines).forEach((lineId) => {
        if (!lineIds.includes(lineId)) {
          delete memory.lines[lineId];
          dirty = true;
        }
      });
      if (dirty && store) {
        dirty = false;
        await store.save(memory);
      }
    },
  };
}

export {
  SEVERITIES,
  CAUSES,
  SCENE_TRIGGERS as TRAFFIC_TRIGGERS,
  LINE_STATES,
  SEVERITY_LEVELS,
  CAUSE_VALUES,
  plainText,
  parseDisruption,
  periodAt,
  readTraffic,
  serious,
  createTrafficTracker,
};
