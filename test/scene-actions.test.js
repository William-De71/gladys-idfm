import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildNextDeparturesOutputs, buildLineTrafficOutputs } from '../src/scene-actions.js';
import { readTraffic } from '../src/traffic.js';
import {
  NOW,
  MINUTE,
  FOLLOWED,
  RER_B,
  departure,
  rawDisruption,
  bulkAnswer,
} from './helpers/fixtures.js';

test('describes the next departures of a stop', () => {
  const outputs = buildNextDeparturesOutputs({
    followed: FOLLOWED,
    departures: [
      departure({ id: 'a', delay: 4 }),
      departure({ id: 'b', baseDeparture: NOW + 25 * MINUTE }),
      departure({ id: 'c', cancelled: true, baseDeparture: NOW + 40 * MINUTE }),
    ],
    threshold: 3,
    now: NOW,
    language: 'fr',
  });
  assert.equal(outputs.found, true);
  assert.equal(outputs.line, 'RER B');
  assert.equal(outputs.minutes_until_departure, 14);
  assert.equal(outputs.status, 'delayed');
  assert.equal(outputs.disrupted_count, 2);
  assert.equal(
    outputs.summary,
    'Massy - Palaiseau : le RER B KASE → Aéroport Charles de Gaulle 2 TGV de 07:10 a 4 min de retard, départ à 07:14. Ensuite : 07:25 à l’heure, 07:40 supprimé.',
  );
  const metro = buildNextDeparturesOutputs({
    followed: FOLLOWED,
    departures: [departure({ timetabled: false, mission: '', destination: 'Châtillon' })],
    threshold: 3,
    now: NOW,
    language: 'en',
  });
  assert.equal(
    metro.summary,
    'Massy - Palaiseau: the next RER B → Châtillon leaves at 07:10, in 10 min.',
  );
  const none = buildNextDeparturesOutputs({
    followed: FOLLOWED,
    departures: [],
    threshold: 3,
    now: NOW,
    language: 'en',
  });
  assert.equal(none.found, false);
  assert.equal(
    none.summary,
    'Massy - Palaiseau (RER B → Paris): no departure in the followed period.',
  );
});

test('describes the traffic of a line', () => {
  const answer = bulkAnswer(
    [
      rawDisruption({ id: 'd1', severity: 'BLOQUANTE', title: 'Trafic interrompu' }),
      rawDisruption({ id: 'd2', title: 'Ralentissements' }),
    ],
    { C01743: ['d1', 'd2'] },
  );
  const outputs = buildLineTrafficOutputs({
    line: RER_B,
    traffic: readTraffic(answer, ['C01743'], NOW).get('C01743'),
    language: 'fr',
  });
  assert.equal(outputs.state, 'blocked');
  assert.equal(outputs.disrupted, true);
  assert.equal(outputs.disruption_count, 2);
  assert.equal(
    outputs.summary,
    'RER B : Interrompu. Trafic interrompu. Et 1 autre(s) perturbation(s).',
  );
});
