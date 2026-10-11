// -----------------------------------------------------------------------------
// The stops of the departures.
//
// The real-time departures are asked for a stop area (ZdA: one mode, every
// line and direction, `STIF:StopArea:SP:58774:`) or a quay (ArR: one side of
// the street or one platform, `STIF:StopPoint:Q:22087:`). Since March 2025
// the SNCF trains (RER, Transilien) are only given per stop area: the
// integration always asks a stop area, unless the user gives a quay id.
//
// The form takes:
//   - a name, "Massy - Palaiseau": with the line of the stop, searched among
//     the stops of that line (exact); without, among every stop area, train
//     stations first;
//   - a stop area id: "58774", "IDFM:monomodalStopPlace:58774",
//     "STIF:StopArea:SP:58774:";
//   - a quay id: "STIF:StopPoint:Q:22087:", "IDFM:22087".
// Everything comes from the open data portal (no PRIM quota) and is
// remembered in /data.
// -----------------------------------------------------------------------------

import { fold } from './lines.js';

const AREA_REGEX = /(?:StopArea:SP:|monomodalStopPlace:)(\d+)/i;
const QUAY_REGEX = /(?:StopPoint:Q:|^IDFM:)(\d+)/i;
const MAX_CACHE_ENTRIES = 50;
const TYPE_RANK = { railStation: 0, metroStation: 1, onstreetTram: 2, onstreetBus: 3 };

/**
 * @description The SIRI reference of a stop.
 * @param {{ kind: string, id: string }} stop - The stop.
 * @returns {string} "STIF:StopArea:SP:58774:" or "STIF:StopPoint:Q:22087:".
 * @example
 * monitoringRef({ kind: 'area', id: '58774' }); // -> 'STIF:StopArea:SP:58774:'
 */
function monitoringRef(stop) {
  return stop.kind === 'quay' ? `STIF:StopPoint:Q:${stop.id}:` : `STIF:StopArea:SP:${stop.id}:`;
}

/**
 * @description How well a name matches the words typed.
 * @param {string} name - A stop name.
 * @param {string} query - The words typed.
 * @returns {number} 0 equal, 1 starts with, 2 contains, 3 otherwise.
 */
function nameScore(name, query) {
  const a = fold(name)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  const b = fold(query)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  if (a === b) {
    return 0;
  }
  if (a.startsWith(b)) {
    return 1;
  }
  return a.includes(b) ? 2 : 3;
}

/**
 * @description Create the stop resolver.
 * @param {object} options - Options.
 * @param {object} options.opendata - The open data client.
 * @param {object} [options.store] - Where the resolved stops are remembered.
 * @returns {object} The resolver.
 * @example
 * const stops = createStops({ opendata, store: createStore('stops.json') });
 * await stops.resolve('Massy - Palaiseau', line); // -> { kind: 'area', id: '58774', name: 'Massy - Palaiseau' }
 */
function createStops({ opendata, store = null }) {
  let cache = {};
  let loaded = false;

  const load = async () => {
    if (!loaded) {
      const saved = store ? await store.load({}) : {};
      cache = saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
      loaded = true;
    }
  };

  const keyOf = (input, line) => `${fold(input)}|${line?.id ?? ''}`;

  const remember = (key, stop) => {
    cache[key] = stop;
    const keys = Object.keys(cache);
    if (keys.length > MAX_CACHE_ENTRIES) {
      keys.slice(0, keys.length - MAX_CACHE_ENTRIES).forEach((old) => delete cache[old]);
    }
    store?.save(cache);
  };

  /**
   * @description A stop area by id, or a quay by id.
   * @param {string} kind - 'area' or 'quay'.
   * @param {string} id - The id.
   * @returns {Promise<object|null>} The stop.
   */
  async function byId(kind, id) {
    if (kind === 'area') {
      const area = await opendata.getArea(id);
      return area ? { kind, id, name: area.name, town: area.town } : null;
    }
    const [quay] = await opendata.getQuays([id]);
    return quay ? { kind, id, name: quay.name, town: quay.town } : null;
  }

  /**
   * @description A stop by name, among the stops of a line.
   * @param {string} query - The name.
   * @param {object} line - The resolved line.
   * @returns {Promise<object|null>} The stop area.
   */
  async function onLine(query, line) {
    const found = await opendata.searchLineStops(line.id, query);
    found.sort((a, b) => nameScore(a.name, query) - nameScore(b.name, query));
    const best = found[0];
    if (!best) {
      return null;
    }
    const area = AREA_REGEX.exec(best.stopId);
    if (area) {
      return { kind: 'area', id: area[1], name: best.name, town: best.town };
    }
    const quay = QUAY_REGEX.exec(best.stopId);
    if (!quay) {
      return null;
    }
    // A quay of a metro, tram or bus line: its stop area has both directions.
    const [record] = await opendata.getQuays([quay[1]]);
    return record?.area
      ? { kind: 'area', id: record.area, name: best.name, town: best.town }
      : { kind: 'quay', id: quay[1], name: best.name, town: best.town };
  }

  /**
   * @description Stop areas by name, train stations first.
   * @param {string} query - The name.
   * @param {number} [limit] - How many.
   * @returns {Promise<object[]>} The stop areas.
   */
  async function search(query, limit = 20) {
    const found = await opendata.searchAreas(query, limit);
    return found
      .map((area, index) => ({ ...area, index }))
      .sort(
        (a, b) =>
          nameScore(a.name, query) - nameScore(b.name, query) ||
          (TYPE_RANK[a.type] ?? 4) - (TYPE_RANK[b.type] ?? 4) ||
          a.index - b.index,
      )
      .map(({ id, name, type, town }) => ({ kind: 'area', id, name, type, town }));
  }

  return {
    search,

    /**
     * @description Resolve what the user typed.
     * @param {string} input - A name, a stop area id or a quay id.
     * @param {object|null} [line] - The resolved line of the stop, when set.
     * @returns {Promise<{ kind: string, id: string, name: string }|null>} The stop, null when none matches.
     * @throws {OpenDataError} When the portal fails.
     */
    async resolve(input, line = null) {
      await load();
      const text = String(input ?? '').trim();
      if (!text) {
        return null;
      }
      const key = keyOf(text, line);
      if (cache[key]?.id) {
        return cache[key];
      }
      let stop;
      const area = AREA_REGEX.exec(text) ?? /^(\d{4,7})$/.exec(text);
      const quay = QUAY_REGEX.exec(text);
      if (area) {
        stop = await byId('area', area[1]);
        if (!stop && /^\d+$/.test(text)) {
          // A bare number may as well be a quay.
          stop = await byId('quay', text);
        }
      } else if (quay) {
        stop = await byId('quay', quay[1]);
      } else if (line) {
        stop = await onLine(text, line);
      } else {
        [stop = null] = await search(text, 20);
      }
      if (!stop) {
        return null;
      }
      const entry = { kind: stop.kind, id: stop.id, name: stop.name, town: stop.town ?? '' };
      remember(key, entry);
      return entry;
    },

    /**
     * @description The stop already resolved for an input, without any request.
     * @param {string} input - What the user typed.
     * @param {object|null} [line] - The resolved line.
     * @returns {object|null} The stop.
     */
    peek(input, line = null) {
      return cache[keyOf(input, line)] ?? null;
    },
  };
}

export { monitoringRef, nameScore, createStops };
