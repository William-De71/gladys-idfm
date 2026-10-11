import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  atParisTime,
  isBusy,
  isNight,
  followedSpan,
  upcoming,
  nextDelay,
  plannedPollInterval,
} from '../src/schedule.js';
import { NOW, MINUTE } from './helpers/fixtures.js';

// NOW is Monday 12 October 2026, 07:00 in Paris.
const WEEKDAYS = [1, 2, 3, 4, 5];
const morning = { hours: { start: 450, end: 570 }, days: WEEKDAYS }; // 07:30-09:30
const evening = { hours: { start: 1020, end: 1140 }, days: WEEKDAYS }; // 17:00-19:00
const allDay = { hours: null, days: [1, 2, 3, 4, 5, 6, 7] };

test('builds Paris instants', () => {
  assert.equal(atParisTime('2026-10-12', 420), NOW);
  assert.equal(atParisTime('2026-10-12', 1440), Date.parse('2026-10-12T22:00:00Z'));
});

test('is busy from an hour before the window to its end, on the travel days', () => {
  assert.equal(isBusy(morning, NOW), true); // 30 min before 07:30
  assert.equal(isBusy(morning, NOW - 31 * MINUTE), false);
  assert.equal(isBusy(morning, NOW + 150 * MINUTE), false); // 09:30
  assert.equal(isBusy(evening, NOW), false);
  // Saturday 17 October, 08:00.
  assert.equal(isBusy(morning, NOW + 5 * 24 * 60 * MINUTE + 60 * MINUTE), false);
  assert.equal(isBusy(allDay, NOW), true);
  assert.equal(isBusy(allDay, atParisTime('2026-10-12', 120)), false); // 02:00
  assert.equal(isNight(atParisTime('2026-10-12', 120)), true);
  assert.equal(isNight(atParisTime('2026-10-12', 300)), false);
});

test('follows the departures of the window of the day', () => {
  assert.deepEqual(followedSpan(morning, NOW), {
    from: atParisTime('2026-10-12', 450),
    until: atParisTime('2026-10-12', 570),
  });
  // Over, or not a travel day: no bound (nothing is read then anyway).
  assert.deepEqual(followedSpan(morning, NOW + 180 * MINUTE), { from: null, until: null });
  assert.deepEqual(followedSpan(allDay, NOW), { from: null, until: null });
});

test('keeps the departures of the span', () => {
  const at = (offset) => ({ baseDeparture: NOW + offset * MINUTE });
  const span = { from: NOW + 30 * MINUTE, until: NOW + 150 * MINUTE };
  const kept = upcoming([at(10), at(30), at(60), at(149), at(150)], span, 8);
  assert.deepEqual(
    kept.map((d) => (d.baseDeparture - NOW) / MINUTE),
    [30, 60, 149],
  );
  assert.equal(upcoming([at(10), at(30)], { from: null, until: null }, 1).length, 1);
});

test('reads often in the window, sleeps until it otherwise', () => {
  assert.equal(nextDelay(morning, NOW, 2), 2 * MINUTE);
  // 15:50: the busy period of the evening starts at 16:00.
  const delay = nextDelay(evening, atParisTime('2026-10-12', 950), 2);
  assert.ok(delay >= 10 * MINUTE && delay <= 12 * MINUTE, `${delay / MINUTE} min`);
  // Far from the window: at most 6 hours of sleep.
  assert.equal(nextDelay(evening, atParisTime('2026-10-12', 560), 2), 6 * 60 * MINUTE);
  // No window, at night: every 30 minutes.
  assert.equal(nextDelay(allDay, atParisTime('2026-10-12', 120), 2), 30 * MINUTE);
});

test('stretches the interval to fit the daily budget', () => {
  // One stop all day at 2 min: 615 + 7 requests a day, fits in 765.
  assert.equal(plannedPollInterval([allDay], 2, 765), 2);
  // Three of them do not: 3 690 busy minutes for 744 requests -> 5 min.
  assert.equal(plannedPollInterval([allDay, allDay, allDay], 2, 765), 5);
  // A 2-hour window on weekdays: (120 + 60) * 5 / 7 = 129 minutes, ~64 requests.
  assert.equal(plannedPollInterval([morning], 2, 765), 2);
  assert.equal(plannedPollInterval([], 2, 765), 2);
});
