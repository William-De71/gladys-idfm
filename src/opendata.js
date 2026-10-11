// -----------------------------------------------------------------------------
// Client of the open data portal of Île-de-France Mobilités
// (https://data.iledefrance-mobilites.fr, an Opendatasoft instance).
//
// The reference data — lines, stop areas, quays — are open: no key, and no
// PRIM quota spent. The integration reads them to turn what the user typed
// ("RER B", "Massy - Palaiseau") into the ids of the real-time APIs, and to
// name the lines of the departures (the SIRI answers only carry ids).
//
// Datasets read:
//   - `referentiel-des-lignes`  a line: id ("C01743"), short name ("B"),
//                               mode, network, color;
//   - `zones-d-arrets`          a stop area (ZdA, one mode): id, name, type;
//   - `arrets`                  a quay (ArR) and its stop area;
//   - `arrets-lignes`           the stops of each line.
// Requests are ODSQL `where` clauses; user text only enters them as a
// sanitized string literal.
// -----------------------------------------------------------------------------

// IDFM_OPENDATA_URL: development only (a fake portal for the end-to-end test).
const OPENDATA_URL =
  process.env.IDFM_OPENDATA_URL ||
  'https://data.iledefrance-mobilites.fr/api/explore/v2.1/catalog/datasets/';
const REQUEST_TIMEOUT_MS = 15000;
const LINE_FIELDS = [
  'id_line',
  'name_line',
  'shortname_line',
  'transportmode',
  'networkname',
  'shortname_groupoflines',
  'colourweb_hexa',
  'status',
  'type',
];

/**
 * @description Error of an open data call.
 */
class OpenDataError extends Error {
  /**
   * @param {string} message - The message.
   * @param {number} [status] - The HTTP status (0 for a network failure).
   */
  constructor(message, status = 0) {
    super(message);
    this.name = 'OpenDataError';
    this.status = status;
  }
}

/**
 * @description An ODSQL string literal of user text.
 * @param {unknown} value - The text.
 * @returns {string} The quoted literal, without quotes or backslashes inside.
 * @example
 * literal('Massy "Palaiseau"'); // -> '"Massy Palaiseau"'
 */
function literal(value) {
  return `"${String(value ?? '')
    .replace(/["\\]/g, '')
    .slice(0, 80)}"`;
}

/**
 * @description An ODSQL list of literals.
 * @param {string[]} values - The values.
 * @returns {string} "(\"a\",\"b\")".
 */
function list(values) {
  return `(${values.map(literal).join(',')})`;
}

/**
 * @description A line of the reference data.
 * @param {object} record - The raw record.
 * @returns {object} The line.
 */
function toLine(record) {
  return {
    id: String(record.id_line ?? ''),
    name: String(record.name_line ?? ''),
    short: String(record.shortname_line ?? ''),
    mode: String(record.transportmode ?? ''),
    network: String(record.networkname ?? ''),
    group: String(record.shortname_groupoflines ?? ''),
    color: /^[0-9a-f]{6}$/i.test(record.colourweb_hexa ?? '') ? record.colourweb_hexa : '',
    active: record.status === 'active',
    replacement: /REPLACEMENT/i.test(String(record.type ?? '')),
  };
}

/**
 * @description Create the open data client.
 * @param {object} [options] - Options.
 * @param {Function} [options.getUserAgent] - `() => string`.
 * @param {Function} [options.fetchImpl] - fetch, for the tests.
 * @returns {object} The client.
 * @example
 * const opendata = createOpenDataClient({ getUserAgent: () => 'gladys-idfm/0.1.0' });
 */
function createOpenDataClient({
  getUserAgent = () => 'gladys-idfm',
  fetchImpl = globalThis.fetch,
} = {}) {
  /**
   * @description Read records of a dataset.
   * @param {string} dataset - The dataset.
   * @param {object} params - `where`, `select`, `limit`…
   * @returns {Promise<object[]>} The records.
   * @throws {OpenDataError} On failure.
   */
  async function records(dataset, params) {
    const url = `${OPENDATA_URL}${dataset}/records?${new URLSearchParams(params)}`;
    let response;
    try {
      response = await fetchImpl(url, {
        headers: { Accept: 'application/json', 'User-Agent': getUserAgent() },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      throw new OpenDataError(`IDFM open data unreachable: ${err.message}`);
    }
    let body;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    if (!response.ok || !Array.isArray(body?.results)) {
      throw new OpenDataError(
        `IDFM open data: ${body?.message || `HTTP ${response.status}`}`,
        response.status,
      );
    }
    return body.results;
  }

  return {
    records,

    /**
     * @description Lines by id.
     * @param {string[]} ids - "C01743"…
     * @returns {Promise<object[]>} The lines found.
     */
    async linesById(ids) {
      if (ids.length === 0) {
        return [];
      }
      const found = await records('referentiel-des-lignes', {
        where: `id_line in ${list(ids)}`,
        select: LINE_FIELDS.join(','),
        limit: Math.min(100, ids.length),
      });
      return found.map(toLine);
    },

    /**
     * @description Lines by short name.
     * @param {string[]} names - Spellings of the short name ("B", "T3a", "3B").
     * @returns {Promise<object[]>} The lines found, active or not.
     */
    async linesByShortName(names) {
      const found = await records('referentiel-des-lignes', {
        where: `shortname_line in ${list(names)}`,
        select: LINE_FIELDS.join(','),
        limit: 100,
      });
      return found.map(toLine);
    },

    /**
     * @description Stop areas whose name matches words.
     * @param {string} query - The words.
     * @param {number} [limit] - How many.
     * @returns {Promise<Array<{ id: string, name: string, type: string, town: string }>>} The areas.
     */
    async searchAreas(query, limit = 20) {
      const found = await records('zones-d-arrets', {
        where: `search(zdaname, ${literal(query)})`,
        select: 'zdaid,zdaname,zdatype,zdatown',
        limit,
      });
      return found.map((record) => ({
        id: String(record.zdaid),
        name: String(record.zdaname ?? ''),
        type: String(record.zdatype ?? ''),
        town: String(record.zdatown ?? ''),
      }));
    },

    /**
     * @description A stop area by id.
     * @param {string} id - The ZdA id.
     * @returns {Promise<{ id: string, name: string, type: string, town: string }|null>} The area.
     */
    async getArea(id) {
      const [record] = await records('zones-d-arrets', {
        where: `zdaid=${literal(id)}`,
        select: 'zdaid,zdaname,zdatype,zdatown',
        limit: 1,
      });
      return record
        ? {
            id: String(record.zdaid),
            name: String(record.zdaname ?? ''),
            type: String(record.zdatype ?? ''),
            town: String(record.zdatown ?? ''),
          }
        : null;
    },

    /**
     * @description Quays by id.
     * @param {string[]} ids - The ArR ids.
     * @returns {Promise<Array<{ id: string, name: string, area: string, town: string }>>} The quays.
     */
    async getQuays(ids) {
      if (ids.length === 0) {
        return [];
      }
      const found = await records('arrets', {
        where: `arrid in ${list(ids)}`,
        select: 'arrid,arrname,zdaid,arrtown',
        limit: Math.min(100, ids.length),
      });
      return found.map((record) => ({
        id: String(record.arrid),
        name: String(record.arrname ?? ''),
        area: String(record.zdaid ?? ''),
        town: String(record.arrtown ?? ''),
      }));
    },

    /**
     * @description The stops of a line whose name matches words.
     * @param {string} lineId - "C01743".
     * @param {string} query - The words.
     * @returns {Promise<Array<{ stopId: string, name: string, town: string }>>} The stops.
     */
    async searchLineStops(lineId, query) {
      const found = await records('arrets-lignes', {
        where: `id=${literal(`IDFM:${lineId}`)} and search(stop_name, ${literal(query)})`,
        select: 'stop_id,stop_name,nom_commune',
        limit: 20,
      });
      return found.map((record) => ({
        stopId: String(record.stop_id ?? ''),
        name: String(record.stop_name ?? ''),
        town: String(record.nom_commune ?? ''),
      }));
    },
  };
}

export { OPENDATA_URL, OpenDataError, literal, toLine, createOpenDataClient };
