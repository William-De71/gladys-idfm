import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  stopKey,
  followedName,
  parseExternalId,
  buildStopDevice,
  buildStopStates,
  buildLineDevice,
  buildLineStates,
  lineStatusText,
} from '../src/device.js';
import { readTraffic } from '../src/traffic.js';
import {
  NOW,
  MINUTE,
  FOLLOWED,
  RER_B,
  fakeGladys,
  departure,
  rawDisruption,
  bulkAnswer,
} from './helpers/fixtures.js';

test('keys a stop on its area, line and direction', () => {
  assert.equal(
    stopKey({ kind: 'area', id: '58774' }, RER_B, 'Saint-Rémy | Robinson'),
    'sp58774_c01743_saint-remy-robinson',
  );
  assert.equal(stopKey({ kind: 'quay', id: '22087' }, null, ''), 'q22087');
  assert.equal(followedName({ stop: { name: 'Châtelet' }, line: null, direction: '' }), 'Châtelet');
  assert.equal(followedName(FOLLOWED), 'Massy - Palaiseau (RER B → Paris)');
  assert.deepEqual(parseExternalId('ext:idfm:stop:sp58774_c01743_paris'), {
    type: 'stop',
    key: 'sp58774_c01743_paris',
  });
  assert.deepEqual(parseExternalId('ext:idfm:line:c01743:status'), { type: 'line', key: 'c01743' });
  assert.equal(parseExternalId('ext:other:thing'), null);
});

test('builds a stop device and its states', () => {
  const device = buildStopDevice(fakeGladys, FOLLOWED, 'fr');
  assert.equal(device.name, 'IDFM – Massy - Palaiseau (RER B → Paris)');
  assert.equal(device.external_id, 'ext:idfm:stop:sp58774_c01743_paris');
  assert.deepEqual(
    device.features.map((f) => f.external_id.split(':').pop()),
    ['next', 'wait', 'delay', 'disrupted'],
  );
  assert.ok(device.features.every((f) => f.read_only));
  const states = buildStopStates(
    fakeGladys,
    FOLLOWED,
    [
      departure({ id: 'a', cancelled: true }),
      departure({ id: 'b', delay: 4, baseDeparture: NOW + 12 * MINUTE }),
    ],
    { threshold: 3, language: 'fr', now: NOW },
  );
  const byKey = Object.fromEntries(
    states.map((s) => [s.device_feature_external_id.split(':').pop(), s]),
  );
  assert.equal(byKey.next.text, '07:10 · RER B KASE → Aéroport Charles de Gaulle 2 TGV · supprimé');
  assert.equal(byKey.wait.state, 16);
  assert.equal(byKey.delay.state, 4);
  assert.equal(byKey.disrupted.state, 2);
  // Without a departure, the wait and the delay are left untouched.
  const empty = buildStopStates(fakeGladys, FOLLOWED, [], {
    threshold: 3,
    language: 'en',
    now: NOW,
  });
  assert.deepEqual(
    empty.map((s) => s.device_feature_external_id.split(':').pop()),
    ['next', 'disrupted'],
  );
  assert.equal(empty[0].text, 'No departure');
});

test('builds a line device and its states', () => {
  const device = buildLineDevice(fakeGladys, RER_B, 'fr');
  assert.equal(device.name, 'IDFM – Trafic RER B');
  assert.equal(device.external_id, 'ext:idfm:line:c01743');
  const traffic = readTraffic(
    bulkAnswer([rawDisruption({ severity: 'BLOQUANTE', title: 'Trafic interrompu' })], {
      C01743: ['d1'],
    }),
    ['C01743'],
    NOW,
  ).get('C01743');
  assert.equal(lineStatusText(traffic, 'fr'), 'Interrompu : Trafic interrompu');
  const states = buildLineStates(fakeGladys, RER_B, traffic, 'fr');
  assert.equal(states[1].state, 1);
  const calm = readTraffic(bulkAnswer([], {}), ['C01743'], NOW).get('C01743');
  assert.deepEqual(
    buildLineStates(fakeGladys, RER_B, calm, 'fr').map((s) => s.text ?? s.state),
    ['Trafic normal', 0],
  );
});
