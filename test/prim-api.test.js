import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createPrimClient, siriError, PrimError } from '../src/prim-api.js';
import { rawVisit, stopMonitoringAnswer } from './helpers/fixtures.js';

/**
 * @description A fake fetch answering from a script.
 * @param {Array<object|Error>} answers - `{ status, body, headers }` or an error.
 * @returns {Function} The fetch, with `calls`.
 */
function fakeFetch(answers) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, headers: options.headers });
    const next = answers.shift();
    if (next instanceof Error) {
      throw next;
    }
    return {
      ok: next.status >= 200 && next.status < 300,
      status: next.status,
      headers: new Headers(next.headers ?? {}),
      json: async () => {
        if (typeof next.body === 'string') {
          throw new SyntaxError('not JSON');
        }
        return next.body;
      },
    };
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

const client = (fetchImpl, counted = []) =>
  createPrimClient({
    getApiKey: () => 'k'.repeat(32),
    getUserAgent: () => 'gladys-idfm/test',
    onRequest: (api) => counted.push(api),
    fetchImpl,
    retryDelayMs: 0,
  });

test('asks the departures of a stop with the key in the apikey header', async () => {
  const fetchImpl = fakeFetch([{ status: 200, body: stopMonitoringAnswer([rawVisit()]) }]);
  const counted = [];
  const visits = await client(fetchImpl, counted).stopMonitoring('STIF:StopArea:SP:58774:');
  assert.equal(visits.length, 1);
  assert.equal(
    fetchImpl.calls[0].url,
    'https://prim.iledefrance-mobilites.fr/marketplace/stop-monitoring?MonitoringRef=STIF%3AStopArea%3ASP%3A58774%3A',
  );
  assert.equal(fetchImpl.calls[0].headers.apikey, 'k'.repeat(32));
  assert.deepEqual(counted, ['departures']);
});

test('a refused key is an auth error, never retried', async () => {
  const fetchImpl = fakeFetch([{ status: 401, body: { message: 'Unauthorized' } }]);
  const err = await client(fetchImpl)
    .stopMonitoring('x')
    .catch((e) => e);
  assert.ok(err instanceof PrimError);
  assert.equal(err.isAuth, true);
  assert.match(err.message, /Unauthorized/);
  assert.equal(fetchImpl.calls.length, 1);
});

test('a 429 carries its Retry-After, an hour by default', async () => {
  const withHeader = await client(
    fakeFetch([
      {
        status: 429,
        body: { message: 'API rate limit exceeded' },
        headers: { 'retry-after': '120' },
      },
    ]),
  )
    .disruptions()
    .catch((e) => e);
  assert.equal(withHeader.isQuota, true);
  assert.equal(withHeader.retryAfter, 120);
  const without = await client(fakeFetch([{ status: 429, body: {} }]))
    .disruptions()
    .catch((e) => e);
  assert.equal(without.retryAfter, 3600);
});

test('a network failure or a 5xx is retried once, and counted twice', async () => {
  const fetchImpl = fakeFetch([
    new Error('ECONNRESET'),
    { status: 200, body: { disruptions: [{ id: 'd' }], lines: [] } },
  ]);
  const counted = [];
  const answer = await client(fetchImpl, counted).disruptions();
  assert.equal(answer.disruptions.length, 1);
  assert.deepEqual(counted, ['traffic', 'traffic']);
  const failing = fakeFetch([
    { status: 503, body: 'down' },
    { status: 502, body: 'down' },
  ]);
  const err = await client(failing)
    .disruptions()
    .catch((e) => e);
  assert.equal(err.status, 502);
});

test('a SIRI error inside the delivery is an error, whatever the status', async () => {
  const delivery = {
    Status: 'false',
    ErrorCondition: {
      ErrorInformation: { ErrorText: 'La requête contient des identifiants qui sont inconnus' },
    },
  };
  assert.match(siriError(delivery), /inconnus/);
  assert.equal(siriError({ Status: 'true' }), '');
  const body = { Siri: { ServiceDelivery: { StopMonitoringDelivery: [delivery] } } };
  for (const status of [200, 400]) {
    const err = await client(fakeFetch([{ status, body }]))
      .stopMonitoring('x')
      .catch((e) => e);
    assert.match(err.message, /inconnus/);
    assert.equal(err.isAuth, false);
  }
});

test('no key, no request', async () => {
  const fetchImpl = fakeFetch([]);
  const prim = createPrimClient({ getApiKey: () => '', getUserAgent: () => 'x', fetchImpl });
  const err = await prim.disruptions().catch((e) => e);
  assert.equal(err.isAuth, true);
  assert.equal(fetchImpl.calls.length, 0);
});
