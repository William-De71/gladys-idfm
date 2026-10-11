import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createQuota } from '../src/quota.js';
import { createStore } from '../src/store.js';
import { NOW, MINUTE } from './helpers/fixtures.js';

test('the store writes and reads JSON, and survives a missing file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gladys-idfm-'));
  try {
    const store = createStore('x.json', { dir });
    assert.deepEqual(await store.load({ empty: true }), { empty: true });
    await store.save({ a: 1 });
    assert.deepEqual(await store.load(null), { a: 1 });
    assert.equal(await readFile(join(dir, 'x.json'), 'utf8'), '{"a":1}');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('the quota counts over a sliding day and stops the reads at 90 % of the limit', () => {
  let now = NOW;
  let limit = 1000;
  const quota = createQuota({ now: () => now, limit: () => limit });
  assert.equal(quota.budget(), 900);
  for (let i = 0; i < 899; i += 1) {
    quota.record();
  }
  assert.equal(quota.canPoll(), true);
  quota.record();
  assert.equal(quota.canPoll(), false);
  assert.equal(quota.canRequest(), true);
  // A raised quota applies at once.
  limit = 20000;
  assert.equal(quota.canPoll(), true);
  now += 24 * 60 * MINUTE + 1;
  assert.equal(quota.used(), 0);
});

test('a 429 blocks every request until its end, even after a restart', async () => {
  let saved = null;
  const store = { load: async () => saved, save: async (value) => (saved = value) };
  let now = NOW;
  const quota = createQuota({ store, now: () => now });
  quota.record();
  quota.block(600);
  assert.equal(quota.canRequest(), false);
  assert.equal(quota.blockedUntil(), NOW + 600000);
  await quota.flush();
  const restarted = createQuota({ store, now: () => now });
  await restarted.load();
  assert.equal(restarted.used(), 1);
  assert.equal(restarted.canPoll(), false);
  now += 601000;
  assert.equal(restarted.canPoll(), true);
});
