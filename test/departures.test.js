import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  siriValue,
  parseVisit,
  parseDepartures,
  matchesDirection,
  departureStatus,
} from '../src/departures.js';
import { NOW, MINUTE, rawVisit } from './helpers/fixtures.js';

test('unwraps the SIRI values', () => {
  assert.equal(siriValue([{ value: ' Robinson ' }]), 'Robinson');
  assert.equal(siriValue({ value: '2' }), '2');
  assert.equal(siriValue([]), '');
  assert.equal(siriValue({}), '');
  assert.equal(siriValue(undefined), '');
});

test('reads a train: line, mission, number, times, delay, platform', () => {
  const departure = parseVisit(rawVisit({ delay: 4 }));
  assert.equal(departure.lineId, 'C01743');
  assert.equal(departure.destination, 'Aéroport Charles de Gaulle 2 TGV');
  assert.equal(departure.mission, 'KASE');
  assert.equal(departure.number, 'KASE12');
  assert.equal(departure.baseDeparture, NOW + 10 * MINUTE);
  assert.equal(departure.departure, NOW + 14 * MINUTE);
  assert.equal(departure.delay, 4);
  assert.equal(departure.timetabled, true);
  assert.equal(departure.cancelled, false);
  assert.equal(departure.platform, '2');
  assert.equal(departure.id, 'SNCF_MAGENTA_PRD:VehicleJourney::KASE12:LOC');
});

test('a metro has no timetable, hence no delay; a bus note is not a mission', () => {
  const metro = parseVisit(
    rawVisit({ line: 'C01383', mission: 'L4404P3', timetabled: false, delay: 3, number: '' }),
  );
  assert.equal(metro.timetabled, false);
  assert.equal(metro.delay, 0);
  assert.equal(metro.mission, '');
  assert.equal(metro.departure, NOW + 13 * MINUTE);
  assert.equal(metro.baseDeparture, NOW + 13 * MINUTE);
});

test('reads cancellations, and drops the trains ending at the stop', () => {
  assert.equal(parseVisit(rawVisit({ status: 'cancelled' })).cancelled, true);
  assert.equal(parseVisit(rawVisit({ status: 'missed' })).cancelled, true);
  assert.equal(parseVisit(rawVisit({ status: '' })).cancelled, false);
  assert.equal(parseVisit(rawVisit({ terminus: true })), null);
  assert.equal(parseVisit({}), null);
});

test('an early train is not late', () => {
  assert.equal(parseVisit(rawVisit({ delay: -2 })).delay, 0);
});

test('filters the line and the direction, drops the gone ones, sorts and dedupes', () => {
  const visits = [
    rawVisit({ number: 'A1', aimed: NOW + 20 * MINUTE }),
    rawVisit({ number: 'A2', aimed: NOW + 5 * MINUTE, destination: 'Robinson' }),
    rawVisit({ number: 'A3', aimed: NOW - 5 * MINUTE }), // gone
    rawVisit({ number: 'A4', aimed: NOW - 5 * MINUTE, delay: 8 }), // late, not gone
    rawVisit({ number: 'A1', aimed: NOW + 20 * MINUTE }), // duplicate
    rawVisit({ number: 'T1', line: 'C01727', aimed: NOW + 2 * MINUTE }), // RER C
    rawVisit({ number: 'A5', aimed: NOW + 30 * MINUTE, terminus: true }),
  ];
  const all = parseDepartures(visits, { now: NOW });
  assert.deepEqual(
    all.map((d) => d.number),
    ['T1', 'A4', 'A2', 'A1'],
  );
  const rerB = parseDepartures(visits, {
    lineId: 'C01743',
    direction: 'charles de gaulle',
    now: NOW,
  });
  assert.deepEqual(
    rerB.map((d) => d.number),
    ['A4', 'A1'],
  );
});

test('matches a direction on words, accents and case ignored, alternatives with |', () => {
  const to = (destination) => ({ destination });
  assert.equal(matchesDirection(to('Saint-Rémy-lès-Chevreuse'), 'saint remy'), true);
  assert.equal(matchesDirection(to('Robinson'), 'Saint-Rémy | Robinson'), true);
  assert.equal(matchesDirection(to('Mitry - Claye'), 'Robinson'), false);
  assert.equal(matchesDirection(to('Paris Nord'), 'Paris'), true);
  // A word, not a piece of a word.
  assert.equal(matchesDirection(to('Aéroport CDG'), 'port'), false);
  assert.equal(matchesDirection(to('Anything'), ''), true);
});

test('gives the status of a departure', () => {
  assert.equal(departureStatus({ cancelled: true, delay: 0 }, 3), 'cancelled');
  assert.equal(departureStatus({ cancelled: false, delay: 3 }, 3), 'delayed');
  assert.equal(departureStatus({ cancelled: false, delay: 2 }, 3), 'on_time');
});
