import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseLineInput, lineIdOf, lineName, createLines } from '../src/lines.js';
import { createStops, monitoringRef, nameScore } from '../src/stops.js';
import { literal } from '../src/opendata.js';

const LINES = [
  {
    id: 'C01743',
    short: 'B',
    mode: 'rail',
    network: 'RER',
    group: 'RER B',
    active: true,
    replacement: false,
  },
  {
    id: 'C01850',
    short: 'B',
    mode: 'bus',
    network: 'RER',
    group: 'RER B',
    active: true,
    replacement: true,
  },
  {
    id: 'C01831',
    short: 'B',
    mode: 'bus',
    network: 'Paris-Saclay Mobilités',
    group: 'ABCDE',
    active: true,
    replacement: false,
  },
  {
    id: 'C01383',
    short: '13',
    mode: 'metro',
    network: '',
    group: '13',
    active: true,
    replacement: false,
  },
  {
    id: 'C00013',
    short: '13',
    mode: 'bus',
    network: 'Seine Orly',
    group: '13',
    active: true,
    replacement: false,
  },
  {
    id: 'C01730',
    short: 'P',
    mode: 'rail',
    network: 'Transilien',
    group: 'Transilien P',
    active: true,
    replacement: false,
  },
  {
    id: 'C01391',
    short: 'T3a',
    mode: 'tram',
    network: '',
    group: 'T3a',
    active: true,
    replacement: false,
  },
  {
    id: 'C01386',
    short: '3B',
    mode: 'metro',
    network: '',
    group: '3 Bis',
    active: true,
    replacement: false,
  },
  {
    id: 'C09999',
    short: '13',
    mode: 'metro',
    network: '',
    group: '13',
    active: false,
    replacement: false,
  },
];

/**
 * @description A fake open data client over a few records.
 * @returns {object} The client, with `calls`.
 */
function fakeOpenData() {
  const calls = [];
  return {
    calls,
    linesById: async (ids) => {
      calls.push(['id', ids]);
      return LINES.filter((line) => ids.includes(line.id));
    },
    linesByShortName: async (names) => {
      calls.push(['short', names]);
      return LINES.filter((line) => names.includes(line.short));
    },
    searchAreas: async (query) => {
      calls.push(['areas', query]);
      return [
        { id: '53762', name: 'Châtelet', type: 'onstreetBus', town: 'Chatou' },
        { id: '45102', name: 'Châtelet - Les Halles', type: 'railStation', town: 'Paris 1er' },
        { id: '42587', name: 'Châtelet', type: 'metroStation', town: 'Paris 1er' },
      ].filter(() => /ch[aâ]telet/i.test(query));
    },
    getArea: async (id) =>
      id === '58774' ? { id, name: 'Massy - Palaiseau', type: 'railStation', town: 'Massy' } : null,
    getQuays: async (ids) =>
      ids.includes('22087')
        ? [{ id: '22087', name: 'Châtelet', area: '42587', town: 'Paris' }]
        : [],
    searchLineStops: async (lineId, query) => {
      calls.push(['lineStops', lineId, query]);
      if (lineId === 'C01743') {
        return [
          { stopId: 'IDFM:monomodalStopPlace:43082', name: 'Massy - Verrières', town: 'Massy' },
          { stopId: 'IDFM:monomodalStopPlace:58774', name: 'Massy - Palaiseau', town: 'Massy' },
        ];
      }
      return [{ stopId: 'IDFM:22087', name: 'Châtelet', town: 'Paris' }];
    },
  };
}

test('understands the lines as riders type them', () => {
  assert.deepEqual(parseLineInput('RER B'), { mode: 'rail', network: 'RER', names: ['B', 'b'] });
  assert.deepEqual(parseLineInput('Ligne P').mode, 'rail');
  assert.deepEqual(parseLineInput('Ligne 13'), { mode: null, network: null, names: ['13'] });
  assert.deepEqual(parseLineInput('M13').mode, 'metro');
  assert.deepEqual(parseLineInput('Métro 3 bis').names, ['3B', '3b']);
  assert.deepEqual(parseLineInput('Tram 3a'), {
    mode: 'tram',
    network: null,
    names: ['T3A', 't3a', 'T3a'],
  });
  assert.deepEqual(parseLineInput('T2').mode, 'tram');
  assert.deepEqual(parseLineInput('Bus 91').mode, 'bus');
  assert.deepEqual(parseLineInput('line:IDFM:C01742'), { id: 'C01742' });
  assert.equal(parseLineInput('  '), null);
  assert.equal(lineIdOf('STIF:Line::C01743:'), 'C01743');
  assert.equal(lineIdOf('Bus 91'), '');
});

test('names the lines', () => {
  assert.equal(lineName({ mode: 'rail', network: 'RER', short: 'B' }), 'RER B');
  assert.equal(lineName({ mode: 'rail', network: 'Transilien', short: 'P' }), 'Transilien P');
  assert.equal(
    lineName({ mode: 'rail', network: '', short: 'ORLYVAL', group: 'ORLYVAL' }),
    'ORLYVAL',
  );
  assert.equal(lineName({ mode: 'metro', short: '3B' }), 'Métro 3bis');
  assert.equal(lineName({ mode: 'tram', short: 'T3a' }), 'T3a');
  assert.equal(lineName({ mode: 'bus', short: '91' }), 'Bus 91');
});

test('picks the line: trains first, the mode typed, never a replacement bus', async () => {
  const opendata = fakeOpenData();
  let saved = null;
  const store = {
    load: async () => saved,
    save: async (value) => (saved = structuredClone(value)),
  };
  const lines = createLines({ opendata, store });
  assert.equal((await lines.resolve('B')).id, 'C01743');
  assert.equal((await lines.resolve('RER B')).name, 'RER B');
  assert.equal((await lines.resolve('13')).id, 'C01383');
  assert.equal((await lines.resolve('Bus 13')).id, 'C00013');
  assert.equal((await lines.resolve('Métro 3bis')).name, 'Métro 3bis');
  assert.equal((await lines.resolve('C01730')).name, 'Transilien P');
  assert.equal(await lines.resolve('Z'), null);
  // Known names cost no request, even after a restart.
  const count = opendata.calls.length;
  const again = createLines({ opendata, store });
  assert.equal((await again.resolve('rer b')).id, 'C01743');
  assert.equal(again.peekTyped('B').id, 'C01743');
  assert.equal(opendata.calls.length, count);
  // The lines met in departures are learned once.
  await again.learn(['C01391', 'C01391', 'C01743']);
  assert.equal(again.peek('C01391').name, 'T3a');
  assert.deepEqual(opendata.calls.at(-1), ['id', ['C01391']]);
  assert.deepEqual(
    (await again.search('13')).map((line) => line.label),
    ['Métro 13', 'Bus 13'],
  );
});

test('resolves stops by name on a line, by name alone, and by id', async () => {
  const opendata = fakeOpenData();
  const stops = createStops({ opendata });
  const rerB = { id: 'C01743' };
  const massy = await stops.resolve('massy palaiseau', rerB);
  assert.deepEqual(massy, { kind: 'area', id: '58774', name: 'Massy - Palaiseau', town: 'Massy' });
  assert.equal(monitoringRef(massy), 'STIF:StopArea:SP:58774:');
  // A metro quay becomes its stop area: both directions.
  assert.equal((await stops.resolve('Châtelet', { id: 'C01371' })).id, '42587');
  // Without a line: the exact name, the train station before the metro.
  assert.equal((await stops.resolve('Châtelet')).id, '42587');
  assert.equal((await stops.resolve('STIF:StopArea:SP:58774:')).name, 'Massy - Palaiseau');
  assert.equal((await stops.resolve('IDFM:monomodalStopPlace:58774')).id, '58774');
  assert.equal((await stops.resolve('58774')).kind, 'area');
  const quay = await stops.resolve('STIF:StopPoint:Q:22087:');
  assert.equal(monitoringRef(quay), 'STIF:StopPoint:Q:22087:');
  assert.equal((await stops.resolve('22087')).kind, 'quay');
  assert.equal(await stops.resolve('Atlantis'), null);
  assert.equal(stops.peek('Massy Palaiseau', rerB).id, '58774');
  assert.equal(nameScore('Massy - Palaiseau', 'massy palaiseau'), 0);
});

test('keeps user text out of the ODSQL syntax', () => {
  assert.equal(literal('Massy "x") or (1=1'), '"Massy x) or (1=1"');
  assert.equal(literal('a\\b'), '"ab"');
});
