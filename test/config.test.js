import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeConfig,
  parseHours,
  parseDays,
  parseLines,
  readLanguage,
  MAX_LINES,
  AUTO_LANGUAGE,
} from '../src/config.js';

test('reads the stops, their line, direction, window and days', () => {
  const config = normalizeConfig({
    api_key: 'abcdefghijklmnopqrstuvwxyz012345',
    stop_1: '  Massy -  Palaiseau ',
    stop_1_line: 'RER B',
    stop_1_direction: 'Paris',
    stop_1_hours: '7h-9h30',
    stop_1_days: ['mon', 'fri'],
    stop_2_line: 'Métro 13',
    stop_3: 'Châtelet',
  });
  assert.equal(config.apiKey, 'abcdefghijklmnopqrstuvwxyz012345');
  assert.deepEqual(config.stops, [
    {
      slot: 1,
      stop: 'Massy - Palaiseau',
      line: 'RER B',
      direction: 'Paris',
      hours: { start: 420, end: 570 },
      days: [1, 5],
    },
    {
      slot: 3,
      stop: 'Châtelet',
      line: '',
      direction: '',
      hours: null,
      days: [1, 2, 3, 4, 5, 6, 7],
    },
  ]);
});

test('falls back to the defaults and bounds the numbers', () => {
  const config = normalizeConfig({
    api_key: 'short',
    poll_interval: '0',
    departure_count: 'x',
    departures_quota: '20000',
  });
  assert.equal(config.apiKey, '');
  assert.equal(config.pollInterval, 1);
  assert.equal(config.departureCount, 4);
  assert.equal(config.delayThreshold, 3);
  assert.equal(config.trafficInterval, 5);
  assert.equal(config.departuresQuota, 20000);
  assert.deepEqual(normalizeConfig(null).stops, []);
});

test('parses windows and days', () => {
  assert.deepEqual(parseHours('06:45 à 08:00'), { start: 405, end: 480 });
  assert.deepEqual(parseHours('22:00-01:00'), { start: 1320, end: 1440 });
  assert.equal(parseHours('25:00-26:00'), null);
  assert.equal(parseHours('soon'), null);
  assert.deepEqual(parseDays('["sat","sun"]'), [6, 7]);
  assert.deepEqual(parseDays('mon, tue'), [1, 2]);
  assert.deepEqual(parseDays([]), [1, 2, 3, 4, 5, 6, 7]);
});

test('splits the followed lines, without duplicates', () => {
  assert.deepEqual(parseLines('RER B, P; rer b\n13'), ['RER B', 'P', '13']);
  assert.equal(parseLines('1,2,3,4,5,6,7,8').length, MAX_LINES);
  assert.deepEqual(parseLines(undefined), []);
});

test('reads the stored language', () => {
  assert.equal(readLanguage({ last_language: 'en' }, 'fr'), 'en');
  assert.equal(readLanguage({ last_language: 'english' }, 'fr'), 'fr');
});

test('reads the language setting, automatic unless a known language', () => {
  for (const language of ['en', 'fr', 'de', 'es']) {
    assert.equal(normalizeConfig({ language }).language, language);
  }
  assert.equal(normalizeConfig({ language: 'auto' }).language, AUTO_LANGUAGE);
  assert.equal(normalizeConfig({ language: 'it' }).language, AUTO_LANGUAGE);
  assert.equal(normalizeConfig({}).language, AUTO_LANGUAGE);
});
