import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEVICE_TRANSPORTS } from '@gladysassistant/integration-sdk';

import { transportOf } from '../src/transport.js';
import { LANGUAGES } from '../src/i18n.js';

const ID = 'ext:idfm:stop:sp58774_c01743_paris';

test('a stop read without error is reached through the cloud', () => {
  assert.deepEqual(transportOf(ID, null), { external_id: ID, transport: DEVICE_TRANSPORTS.CLOUD });
});

test('a failed read makes the device unreachable', () => {
  const entry = transportOf(ID, Object.assign(new Error('HTTP 503'), { status: 503 }));
  assert.deepEqual(entry, { external_id: ID, transport: DEVICE_TRANSPORTS.UNREACHABLE });
  assert.equal(transportOf(ID, { isAuth: true }).transport, DEVICE_TRANSPORTS.UNREACHABLE);
});

test('a pause for the quota stays cloud, degraded, with a short message in four languages', () => {
  for (const error of [{ isQuota: true }, { budget: true }]) {
    const entry = transportOf(ID, error);
    assert.equal(entry.transport, DEVICE_TRANSPORTS.CLOUD);
    assert.equal(entry.degraded, true);
    assert.deepEqual(Object.keys(entry.message), LANGUAGES);
    for (const text of Object.values(entry.message)) {
      assert.ok(text.length > 0 && text.length <= 200, text);
    }
  }
  assert.notDeepEqual(transportOf(ID, { isQuota: true }), transportOf(ID, { budget: true }));
});
