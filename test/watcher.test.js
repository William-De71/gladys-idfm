import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readStop, createWatcher } from '../src/watcher.js';
import { createQuota } from '../src/quota.js';
import { atParisTime } from '../src/schedule.js';
import { NOW, MINUTE, FOLLOWED, RER_B, rawVisit } from './helpers/fixtures.js';

const fakeLines = {
  learned: [],
  learn: async (ids) => fakeLines.learned.push(...ids),
  peek: (id) => (id === 'C01743' ? RER_B : null),
};

test('reads a stop: its line, its direction, its window, named lines', async () => {
  const prim = {
    stopMonitoring: async (ref) => {
      assert.equal(ref, 'STIF:StopArea:SP:58774:');
      return [
        rawVisit({ number: 'A', destination: 'Paris Nord', aimed: NOW + 5 * MINUTE }),
        rawVisit({ number: 'B', destination: 'Robinson', aimed: NOW + 6 * MINUTE }),
        rawVisit({ number: 'C', destination: 'Paris Nord', aimed: NOW + 50 * MINUTE }),
        rawVisit({
          number: 'D',
          line: 'C01727',
          destination: 'Paris Austerlitz',
          aimed: NOW + 7 * MINUTE,
        }),
      ];
    },
  };
  const snapshot = await readStop(prim, fakeLines, FOLLOWED, 4, NOW);
  assert.deepEqual(
    snapshot.departures.map((d) => [d.number, d.line.name]),
    [
      ['A', 'RER B'],
      ['C', 'RER B'],
    ],
  );
  assert.equal(snapshot.readAt, NOW);
  // A window 07:30-08:00: only the departures scheduled in it.
  const windowed = await readStop(
    prim,
    fakeLines,
    { ...FOLLOWED, hours: { start: 450, end: 480 }, days: [1] },
    4,
    NOW,
  );
  assert.deepEqual(
    windowed.departures.map((d) => d.number),
    ['C'],
  );
  assert.equal(windowed.span.from, atParisTime('2026-10-12', 450));
});

test('reuses a fresh snapshot, reads again a stale one, and blocks on a 429', async () => {
  const ANY_DIRECTION = { ...FOLLOWED, direction: '' };
  let now = NOW;
  let calls = 0;
  let fail = null;
  const prim = {
    stopMonitoring: async () => {
      calls += 1;
      if (fail) {
        throw fail;
      }
      return [rawVisit()];
    },
  };
  const quota = createQuota({ now: () => now });
  const reads = [];
  const watcher = createWatcher({
    prim,
    lines: fakeLines,
    quota,
    getStops: () => [ANY_DIRECTION],
    getSettings: () => ({ departureCount: 4, pollInterval: 2 }),
    onRead: async (followed, snapshot, { changed }) => reads.push(changed),
    now: () => now,
  });
  await watcher.get(ANY_DIRECTION, 120000);
  await watcher.get(ANY_DIRECTION, 120000);
  assert.equal(calls, 1);
  now += 3 * MINUTE;
  await watcher.get(ANY_DIRECTION, 120000);
  assert.equal(calls, 2);
  assert.deepEqual(reads, [true, false]);
  now += 3 * MINUTE;
  fail = Object.assign(new Error('quota'), { isQuota: true, retryAfter: 600 });
  await assert.rejects(watcher.get(ANY_DIRECTION, 0));
  assert.equal(quota.blockedUntil(), now + 600000);
  assert.equal(watcher.errors()[0].error, fail);
  // Blocked: the last snapshot is better than nothing.
  assert.equal((await watcher.get(ANY_DIRECTION, 0)).departures.length, 1);
  assert.equal(calls, 3);
});
