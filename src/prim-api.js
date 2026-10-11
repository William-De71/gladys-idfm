// -----------------------------------------------------------------------------
// Client of PRIM, the open data platform of Île-de-France Mobilités
// (https://prim.iledefrance-mobilites.fr).
//
// Two APIs, both GET with the key in an `apikey` header:
//   - `stop-monitoring` ("Prochains passages", SIRI Lite): the departures of
//     a stop area (`STIF:StopArea:SP:<id>:`) or a quay
//     (`STIF:StopPoint:Q:<id>:`), from ~30 minutes ago to ~2 hours ahead,
//     every line and direction, in real time;
//   - `disruptions_bulk` ("Messages Info Trafic, requête globale"): every
//     current and planned disruption of the network, in one answer.
//
// What the gateway answers, and what the client makes of it:
//   - 401              `{ message }`, no key or an unknown one: a
//                      configuration error, never retried;
//   - 429              the daily quota of the API is exhausted (1 000
//                      requests a day per API on a new account): blocked
//                      until `Retry-After`, an hour when absent;
//   - SIRI error       `ErrorCondition` inside the delivery (an unknown
//                      stop): a 400-like error, never retried;
//   - 5xx / network    retried once after a short pause.
//
// Every request leaving the container is counted against the quota of its
// API (see quota.js), failed ones included: they count on the PRIM side too.
// -----------------------------------------------------------------------------

// IDFM_PRIM_URL: development only (a fake API for the end-to-end test).
const API_URL = process.env.IDFM_PRIM_URL || 'https://prim.iledefrance-mobilites.fr/marketplace/';
const REQUEST_TIMEOUT_MS = 20000;
const RETRY_DELAY_MS = 2000;
const DEFAULT_RETRY_AFTER_S = 3600;
const APIS = {
  DEPARTURES: 'departures',
  TRAFFIC: 'traffic',
};

/**
 * @description Error of a PRIM call.
 */
class PrimError extends Error {
  /**
   * @param {string} message - The message.
   * @param {object} [details] - Details.
   * @param {number} [details.status] - The HTTP status (0 for a network failure).
   * @param {number} [details.retryAfter] - Seconds to wait, on a 429.
   */
  constructor(message, { status = 0, retryAfter = 0 } = {}) {
    super(message);
    this.name = 'PrimError';
    this.status = status;
    this.retryAfter = retryAfter;
  }

  /** @returns {boolean} The key is refused. */
  get isAuth() {
    return this.status === 401;
  }

  /** @returns {boolean} The quota is exhausted. */
  get isQuota() {
    return this.status === 429;
  }
}

/**
 * @description Build the User-Agent: the product and its URL.
 * @param {object} options - Options.
 * @param {string} options.name - The package name.
 * @param {string} options.version - The integration version.
 * @param {string} [options.homepage] - The project URL.
 * @returns {string} The User-Agent header.
 * @example
 * buildUserAgent({ name: 'gladys-idfm', version: '0.1.0' }); // -> 'gladys-idfm/0.1.0'
 */
function buildUserAgent({ name, version, homepage = '' }) {
  return homepage ? `${name}/${version} (+${homepage})` : `${name}/${version}`;
}

/**
 * @description Read the Retry-After header.
 * @param {string|null} header - The header.
 * @returns {number} Seconds, the default when absent or unreadable.
 */
function readRetryAfter(header) {
  const seconds = Number(header);
  if (header && Number.isFinite(seconds) && seconds > 0) {
    return Math.min(seconds, 86400);
  }
  const date = Date.parse(header ?? '');
  if (Number.isFinite(date)) {
    return Math.max(60, Math.min(86400, Math.round((date - Date.now()) / 1000)));
  }
  return DEFAULT_RETRY_AFTER_S;
}

/**
 * @description The error text a SIRI delivery carries, if any.
 * @param {object} delivery - A `StopMonitoringDelivery` entry.
 * @returns {string} The text, '' when the delivery is fine.
 * @example
 * siriError({ Status: 'false', ErrorCondition: { ErrorInformation: { ErrorText: 'x' } } }); // -> 'x'
 */
function siriError(delivery) {
  const condition = delivery?.ErrorCondition;
  if (!condition && String(delivery?.Status ?? 'true') !== 'false') {
    return '';
  }
  const info = condition?.ErrorInformation ?? {};
  return String(
    info.ErrorText || info.ErrorDescription || condition?.Description || 'unknown SIRI error',
  );
}

/**
 * @description Create the PRIM client.
 * @param {object} options - Options.
 * @param {Function} options.getApiKey - `() => string`, read on every call.
 * @param {Function} options.getUserAgent - `() => string`.
 * @param {Function} [options.onRequest] - `(api) => void`, once per request sent (quota).
 * @param {Function} [options.fetchImpl] - fetch, for the tests.
 * @param {number} [options.retryDelayMs] - Pause before the retry.
 * @returns {object} The client.
 * @example
 * const prim = createPrimClient({ getApiKey: () => key, getUserAgent: () => 'gladys-idfm/0.1.0' });
 */
function createPrimClient({
  getApiKey,
  getUserAgent,
  onRequest = () => {},
  fetchImpl = globalThis.fetch,
  retryDelayMs = RETRY_DELAY_MS,
}) {
  /**
   * @description One attempt of a GET.
   * @param {string} api - The API, for the quota.
   * @param {string} url - The full URL.
   * @param {string} apiKey - The key.
   * @returns {Promise<object>} The JSON answer.
   */
  async function attempt(api, url, apiKey) {
    onRequest(api);
    let response;
    try {
      response = await fetchImpl(url, {
        headers: {
          apikey: apiKey,
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'User-Agent': getUserAgent(),
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      throw new PrimError(`PRIM unreachable: ${err.message}`);
    }
    let body;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    if (response.ok) {
      if (body === null || typeof body !== 'object') {
        throw new PrimError('PRIM: unreadable answer', { status: response.status });
      }
      return body;
    }
    const delivery = body?.Siri?.ServiceDelivery?.StopMonitoringDelivery?.[0];
    const message = (delivery && siriError(delivery)) || body?.message || `HTTP ${response.status}`;
    throw new PrimError(`PRIM: ${message}`, {
      status: response.status,
      retryAfter: response.status === 429 ? readRetryAfter(response.headers.get('retry-after')) : 0,
    });
  }

  /**
   * @description GET a path, retried once on a transient failure.
   * @param {string} api - The API, for the quota.
   * @param {string} path - The path, under the marketplace.
   * @param {object} [params] - The query parameters.
   * @returns {Promise<object>} The JSON answer.
   * @throws {PrimError} On failure.
   */
  async function get(api, path, params = {}) {
    const apiKey = getApiKey();
    if (!apiKey) {
      throw new PrimError('No PRIM API key', { status: 401 });
    }
    const query = new URLSearchParams(params).toString();
    const url = `${API_URL}${path}${query ? `?${query}` : ''}`;
    try {
      return await attempt(api, url, apiKey);
    } catch (err) {
      const transient = err.status === 0 || err.status >= 500;
      if (!transient) {
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      return attempt(api, url, apiKey);
    }
  }

  return {
    /**
     * @description The departures of a stop (SIRI stop-monitoring).
     * @param {string} monitoringRef - "STIF:StopArea:SP:58774:" or "STIF:StopPoint:Q:22087:".
     * @returns {Promise<object[]>} The raw `MonitoredStopVisit` items.
     * @throws {PrimError} On failure, a SIRI error included (status 400).
     */
    async stopMonitoring(monitoringRef) {
      const answer = await get(APIS.DEPARTURES, 'stop-monitoring', {
        MonitoringRef: monitoringRef,
      });
      const deliveries = answer?.Siri?.ServiceDelivery?.StopMonitoringDelivery;
      if (!Array.isArray(deliveries)) {
        throw new PrimError('PRIM: no stop-monitoring delivery', { status: 502 });
      }
      const visits = [];
      for (const delivery of deliveries) {
        const error = siriError(delivery);
        if (error) {
          throw new PrimError(`PRIM: ${error}`, { status: 400 });
        }
        if (Array.isArray(delivery?.MonitoredStopVisit)) {
          visits.push(...delivery.MonitoredStopVisit);
        }
      }
      return visits;
    },

    /**
     * @description Every disruption of the network.
     * @returns {Promise<{ disruptions: object[], lines: object[] }>} The raw answer.
     */
    async disruptions() {
      const answer = await get(APIS.TRAFFIC, 'disruptions_bulk/disruptions/v2');
      return {
        disruptions: Array.isArray(answer.disruptions) ? answer.disruptions : [],
        lines: Array.isArray(answer.lines) ? answer.lines : [],
      };
    },
  };
}

export { API_URL, APIS, PrimError, buildUserAgent, siriError, createPrimClient };
