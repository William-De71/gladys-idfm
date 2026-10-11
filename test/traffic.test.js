import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  plainText,
  parseDisruption,
  readTraffic,
  createTrafficTracker,
  TRAFFIC_TRIGGERS,
} from '../src/traffic.js';
import { NOW, MINUTE, rawDisruption, bulkAnswer } from './helpers/fixtures.js';

test('turns the HTML messages into text', () => {
  assert.equal(
    plainText('<p>Trafic interrompu entre A&amp;B&nbsp;!</p><p>Reprise&#160;estimée</p>'),
    'Trafic interrompu entre A&B ! Reprise estimée',
  );
});

test('reads a disruption: severity, cause, periods in Paris time', () => {
  const disruption = parseDisruption(rawDisruption({ severity: 'BLOQUANTE', cause: 'TRAVAUX' }));
  assert.equal(disruption.severity, 'blocking');
  assert.equal(disruption.cause, 'works');
  assert.equal(disruption.periods[0].begin, NOW - 30 * MINUTE);
  assert.equal(disruption.message, "Trafic perturbé entre Massy & Paris en raison d'un incident.");
  assert.equal(parseDisruption({}), null);
});

test('works out the state of each line from what applies now', () => {
  const answer = bulkAnswer(
    [
      rawDisruption({ id: 'd1' }),
      rawDisruption({ id: 'd2', severity: 'BLOQUANTE', title: 'Métro 13 : trafic interrompu' }),
      rawDisruption({ id: 'd3', severity: 'INFORMATION', title: 'Ascenseur en panne' }),
      rawDisruption({
        id: 'd4',
        begin: NOW + 4 * 60 * MINUTE,
        end: NOW + 8 * 60 * MINUTE,
        title: 'Travaux ce soir',
      }),
      rawDisruption({ id: 'd5', begin: NOW - 300 * MINUTE, end: NOW - 60 * MINUTE, title: 'Fini' }),
      rawDisruption({ id: 'd6' }), // same title as d1: one message per stop
    ],
    { C01743: ['d1', 'd3', 'd4', 'd5', 'd6'], C01383: ['d2'], C01727: ['d3'] },
  );
  const traffic = readTraffic(answer, ['C01743', 'C01383', 'C01727', 'C01742'], NOW);
  const rerB = traffic.get('C01743');
  assert.equal(rerB.state, 'disrupted');
  assert.deepEqual(
    rerB.active.map((d) => d.id),
    ['d1', 'd3'],
  );
  assert.deepEqual(
    rerB.upcoming.map((d) => d.id),
    ['d4'],
  );
  assert.equal(traffic.get('C01383').state, 'blocked');
  assert.equal(traffic.get('C01727').state, 'normal');
  assert.deepEqual(traffic.get('C01742'), { state: 'normal', active: [], upcoming: [] });
});

test('fires a disruption once, and the return to normal after two calm reads', async () => {
  let saved = null;
  const store = {
    load: async () => saved,
    save: async (value) => (saved = structuredClone(value)),
  };
  const tracker = createTrafficTracker({ store });
  await tracker.load();
  const disrupted = readTraffic(
    bulkAnswer([rawDisruption({ id: 'd1' })], { C01743: ['d1'] }),
    ['C01743'],
    NOW,
  );
  const calm = readTraffic(bulkAnswer([], {}), ['C01743'], NOW);
  // First read: what is going on is the baseline.
  assert.deepEqual(tracker.diff(disrupted, NOW), []);
  assert.deepEqual(tracker.diff(calm, NOW), []);
  assert.deepEqual(
    tracker.diff(calm, NOW).map((e) => e.key),
    [TRAFFIC_TRIGGERS.LINE_RESTORED],
  );
  assert.deepEqual(tracker.diff(calm, NOW), []);
  const again = readTraffic(
    bulkAnswer([rawDisruption({ id: 'd2' })], { C01743: ['d2'] }),
    ['C01743'],
    NOW,
  );
  const events = tracker.diff(again, NOW);
  assert.deepEqual(
    events.map((e) => [e.key, e.disruption.id]),
    [[TRAFFIC_TRIGGERS.LINE_DISRUPTED, 'd2']],
  );
  await tracker.persist(NOW, ['C01743']);
  // A restart does not fire it again.
  const restarted = createTrafficTracker({ store });
  await restarted.load();
  assert.deepEqual(restarted.diff(again, NOW + MINUTE), []);
  // Forgotten after two days.
  await restarted.persist(NOW + 49 * 60 * MINUTE, []);
  assert.deepEqual(saved, { fired: {}, lines: {} });
});
