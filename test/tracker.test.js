import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createTracker, delayLevel, SCENE_TRIGGERS } from '../src/tracker.js';
import { NOW, MINUTE, departure } from './helpers/fixtures.js';

const KEY = 'sp58774_c01743';

test('levels the delays', () => {
  assert.equal(delayLevel(2, 3), null);
  assert.equal(delayLevel(3, 3), 'minor');
  assert.equal(delayLevel(15, 3), 'major');
  assert.equal(delayLevel(30, 3), 'severe');
});

test('fires a delay once per level, a cancellation once, never a metro delay', () => {
  const tracker = createTracker();
  const keys = (events) => events.map((e) => [e.key, e.level].filter(Boolean).join(':'));
  assert.deepEqual(keys(tracker.diff(KEY, [departure({ delay: 2 })], 3)), []);
  assert.deepEqual(keys(tracker.diff(KEY, [departure({ delay: 5 })], 3)), [
    'departure_delayed:minor',
  ]);
  assert.deepEqual(keys(tracker.diff(KEY, [departure({ delay: 9 })], 3)), []);
  assert.deepEqual(keys(tracker.diff(KEY, [departure({ delay: 16 })], 3)), [
    'departure_delayed:major',
  ]);
  assert.deepEqual(keys(tracker.diff(KEY, [departure({ delay: 16, cancelled: true })], 3)), [
    'departure_cancelled',
  ]);
  assert.deepEqual(keys(tracker.diff(KEY, [departure({ cancelled: true })], 3)), []);
  assert.deepEqual(
    keys(tracker.diff(KEY, [departure({ id: 'metro', delay: 9, timetabled: false })], 3)),
    [],
  );
});

test('reminds the closest mark once, even when the metro id changes', () => {
  const tracker = createTracker();
  // The same metro, leaving at NOW + 8 min, read with a new id every time.
  const metro = (id, at = 8) =>
    departure({ id, timetabled: false, lineId: 'C01383', baseDeparture: NOW + at * MINUTE });
  const fire = (dep, after) =>
    tracker.reminders(KEY, [dep], NOW + after * MINUTE).map((e) => e.minutes);
  assert.deepEqual(fire(metro('a'), 0), [10]);
  assert.deepEqual(fire(metro('b'), 0.2), []);
  assert.deepEqual(fire(metro('c'), 3.5), [5]);
  assert.deepEqual(fire(metro('d'), 4), []);
  assert.deepEqual(fire(metro('e'), 6.2), [2]);
  assert.deepEqual(fire(metro('f'), 7.5), []);
  // The next metro, five minutes later, is another departure.
  assert.deepEqual(fire(metro('g', 13), 3.5), [10]);
  // Gone or cancelled: nothing.
  assert.deepEqual(fire(departure({ id: 'x', baseDeparture: NOW - MINUTE }), 0), []);
  assert.deepEqual(
    fire(departure({ id: 'y', cancelled: true, baseDeparture: NOW + 2 * MINUTE }), 0),
    [],
  );
});

test('keeps what was fired across a restart, and forgets it after a day', async () => {
  let saved = null;
  const store = {
    load: async () => saved,
    save: async (value) => (saved = structuredClone(value)),
  };
  const tracker = createTracker({ store });
  await tracker.load();
  assert.equal(
    tracker.diff(KEY, [departure({ cancelled: true })], 3)[0].key,
    SCENE_TRIGGERS.DEPARTURE_CANCELLED,
  );
  tracker.reminders(KEY, [departure({ baseDeparture: NOW + 9 * MINUTE })], NOW);
  await tracker.persist(NOW);
  const restarted = createTracker({ store });
  await restarted.load();
  assert.deepEqual(restarted.diff(KEY, [departure({ cancelled: true })], 3), []);
  assert.deepEqual(
    restarted.reminders(KEY, [departure({ baseDeparture: NOW + 9 * MINUTE })], NOW),
    [],
  );
  await restarted.persist(NOW + 25 * 60 * MINUTE);
  assert.deepEqual(saved, { departures: {}, reminders: { [KEY]: [] } });
});
