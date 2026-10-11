import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';

import {
  buildDeparturesWidget,
  buildTrafficWidget,
  messageContent,
  readCount,
  BOARD_COUNT,
} from '../src/widgets.js';
import { readTraffic } from '../src/traffic.js';
import {
  NOW,
  MINUTE,
  FOLLOWED,
  RER_B,
  METRO_13,
  departure,
  rawDisruption,
  bulkAnswer,
} from './helpers/fixtures.js';

const snapshot = (departures) => ({ departures, readAt: NOW });

test('the departures widget shows the wait, then each departure with its badge', () => {
  const content = buildDeparturesWidget({
    title: FOLLOWED.name,
    snapshot: snapshot([
      departure({ id: 'a', cancelled: true, baseDeparture: NOW + 3 * MINUTE }),
      departure({ id: 'b', delay: 6, baseDeparture: NOW + 5 * MINUTE }),
      departure({ id: 'c', baseDeparture: NOW + 20 * MINUTE }),
      departure({ id: 'd', baseDeparture: NOW + 90 * MINUTE }),
      departure({ id: 'e', atStop: true, baseDeparture: NOW }),
    ]),
    count: 6,
    threshold: 3,
    language: 'fr',
    now: NOW,
  });
  assert.deepEqual(validateWidgetContent(content), []);
  const tile = content.components.find((c) => c.type === 'value');
  assert.equal(tile.value, 11);
  const list = content.components.find((c) => c.type === 'card-list');
  assert.deepEqual(
    list.items.map((item) => item.badge.text),
    ['Supprimé', '+6 min', '20 min', 'À l’heure', 'À quai'],
  );
  assert.equal(list.items[1].subtitle, '07:11 (07:05) · voie 2');
  assert.equal(list.items[0].title, 'RER B KASE → Aéroport Charles de Gaulle 2 TGV');
});

test('the departures widget explains an empty board, and a window not started', () => {
  const empty = buildDeparturesWidget({
    title: 'Châtelet',
    snapshot: snapshot([]),
    count: 6,
    threshold: 3,
    language: 'en',
    now: NOW,
  });
  assert.deepEqual(validateWidgetContent(empty), []);
  assert.equal(empty.components[1].text, 'No departure in the next two hours.');
  const waiting = buildDeparturesWidget({
    title: 'Châtelet',
    snapshot: snapshot([]),
    window: { hours: { start: 1020, end: 1140 } },
    count: 6,
    threshold: 3,
    language: 'fr',
    now: NOW,
    idle: true,
  });
  assert.equal(waiting.components[1].text, 'Départs de 17:00-19:00 affichés à partir de 16:00.');
  assert.equal(waiting.ttl_seconds, 300);
});

test('the traffic widget lists the lines, then the disruptions', () => {
  const answer = bulkAnswer(
    [
      rawDisruption({
        id: 'd1',
        severity: 'BLOQUANTE',
        title: 'Trafic interrompu entre Massy et Paris',
      }),
      rawDisruption({
        id: 'd2',
        cause: 'TRAVAUX',
        begin: NOW + 6 * 60 * MINUTE,
        end: NOW + 26 * 60 * MINUTE,
        title: 'Travaux de nuit',
      }),
    ],
    { C01743: ['d1'], C01383: ['d2'] },
  );
  const traffic = readTraffic(answer, ['C01743', 'C01383'], NOW);
  const content = buildTrafficWidget({
    lines: [
      { line: RER_B, traffic: traffic.get('C01743') },
      { line: METRO_13, traffic: traffic.get('C01383') },
    ],
    readAt: NOW,
    language: 'fr',
    now: NOW,
  });
  assert.deepEqual(validateWidgetContent(content), []);
  const status = content.components.find((c) => c.type === 'status');
  assert.deepEqual(
    status.items.map((item) => `${item.label}: ${item.value}`),
    ['RER B: Interrompu', 'Métro 13: Trafic normal'],
  );
  const list = content.components.find((c) => c.type === 'card-list');
  assert.deepEqual(
    list.items.map((item) => [item.badge.text, item.subtitle]),
    [
      ['Interrompu', 'RER B · 06:30 → 08:30'],
      ['Prévu', 'Métro 13 · 13:00 → 13/10 09:00'],
    ],
  );
  assert.ok(list.items[0].description.startsWith('Trafic perturbé'));
});

test('small helpers', () => {
  assert.deepEqual(validateWidgetContent(messageContent('x')), []);
  assert.equal(readCount('12', BOARD_COUNT), 8);
  assert.equal(readCount(undefined, BOARD_COUNT), 6);
});
