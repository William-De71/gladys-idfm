import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { SCENE_TRIGGERS, DELAY_LEVELS, REMINDER_MINUTES } from '../src/tracker.js';
import { TRAFFIC_TRIGGERS, SEVERITY_LEVELS, CAUSE_VALUES, readTraffic } from '../src/traffic.js';
import {
  SCENE_ACTIONS,
  buildNextDeparturesOutputs,
  buildLineTrafficOutputs,
} from '../src/scene-actions.js';
import { WIDGETS, BOARD_COUNT } from '../src/widgets.js';
import {
  MAX_STOPS,
  DAYS,
  DEPARTURE_COUNT,
  DELAY_THRESHOLD,
  POLL_INTERVAL,
  TRAFFIC_INTERVAL,
  DEPARTURES_QUOTA,
} from '../src/config.js';
import { buildDepartureEvent, buildTrafficEvent } from '../src/events.js';
import { parseDisruption } from '../src/traffic.js';
import {
  NOW,
  FOLLOWED,
  RER_B,
  fakeGladys,
  departure,
  rawDisruption,
  bulkAnswer,
} from './helpers/fixtures.js';

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const manifest = read('../gladys-assistant-integration.json');
const pkg = read('../package.json');

const byKey = (list) => new Map(list.map((entry) => [entry.key, entry]));
const values = (field) => field.options.map((option) => option.value);

test('is a device integration, in lockstep with package.json', () => {
  assert.equal(manifest.type, 'device');
  assert.equal(manifest.version, pkg.version);
  assert.ok(manifest.docker_image.endsWith(`:${pkg.version}`));
});

test('declares exactly the scene triggers, actions and widgets the code handles', () => {
  assert.deepEqual(
    manifest.scene_triggers.map((trigger) => trigger.key).sort(),
    [...Object.values(SCENE_TRIGGERS), ...Object.values(TRAFFIC_TRIGGERS)].sort(),
  );
  assert.deepEqual(
    manifest.scene_actions.map((action) => action.key).sort(),
    Object.values(SCENE_ACTIONS).sort(),
  );
  assert.deepEqual(
    manifest.widgets.map((widget) => widget.key).sort(),
    Object.values(WIDGETS).sort(),
  );
  assert.deepEqual(manifest.actions.map((action) => action.key).sort(), [
    'search_line',
    'search_stop',
    'test_connection',
  ]);
});

test('every event carries its filters and exactly its declared variables', () => {
  const disruption = { ...parseDisruption(rawDisruption()), begin: NOW, end: NOW + 3600000 };
  const events = [
    buildDepartureEvent(
      fakeGladys,
      FOLLOWED,
      { key: SCENE_TRIGGERS.DEPARTURE_DELAYED, departure: departure({ delay: 5 }), level: 'minor' },
      'fr',
    ),
    buildDepartureEvent(
      fakeGladys,
      FOLLOWED,
      { key: SCENE_TRIGGERS.DEPARTURE_CANCELLED, departure: departure({ cancelled: true }) },
      'fr',
    ),
    buildDepartureEvent(
      fakeGladys,
      FOLLOWED,
      { key: SCENE_TRIGGERS.DEPARTURE_SOON, departure: departure(), minutes: 5 },
      'fr',
    ),
    buildTrafficEvent(
      fakeGladys,
      RER_B,
      { key: TRAFFIC_TRIGGERS.LINE_DISRUPTED, lineId: 'C01743', disruption },
      'fr',
    ),
    buildTrafficEvent(
      fakeGladys,
      RER_B,
      { key: TRAFFIC_TRIGGERS.LINE_RESTORED, lineId: 'C01743' },
      'fr',
    ),
  ];
  const triggers = byKey(manifest.scene_triggers);
  events.forEach(({ key, data }) => {
    const trigger = triggers.get(key);
    trigger.fields.forEach((field) => assert.ok(field.key in data, `${key}.${field.key}`));
    const declared = new Set([
      ...trigger.fields.map((field) => field.key),
      ...trigger.variables.map((variable) => variable.key),
    ]);
    Object.keys(data).forEach((name) => assert.ok(declared.has(name), `${key}: ${name}`));
    trigger.variables.forEach((variable) => {
      assert.ok(variable.key in data, `${key} variable ${variable.key}`);
      assert.equal(typeof data[variable.key], variable.type, `${key}.${variable.key}`);
    });
    trigger.fields
      .filter((field) => field.options)
      .forEach((field) =>
        assert.ok(values(field).includes(data[field.key]), `${key}.${field.key}`),
      );
  });
  assert.equal(events[0].data.stop, 'ext:idfm:stop:sp58774_c01743_paris');
  assert.equal(events[3].data.line, 'ext:idfm:line:c01743');
  assert.equal(events[3].data.summary, 'RER B : Perturbé. RER B : trafic perturbé.');
  assert.equal(
    events[2].data.summary,
    'Massy - Palaiseau : le RER B KASE → Aéroport Charles de Gaulle 2 TGV part dans 5 min, à 07:10.',
  );
});

test('the actions resolve exactly their declared outputs, with their types', () => {
  const actions = byKey(manifest.scene_actions);
  const check = (key, outputs) => {
    const action = actions.get(key);
    assert.deepEqual(Object.keys(outputs).sort(), action.outputs.map((o) => o.key).sort(), key);
    action.outputs.forEach((output) =>
      assert.equal(typeof outputs[output.key], output.type, `${key}.${output.key}`),
    );
  };
  [[departure()], []].forEach((departures) =>
    check(
      SCENE_ACTIONS.GET_NEXT_DEPARTURES,
      buildNextDeparturesOutputs({
        followed: FOLLOWED,
        departures,
        threshold: 3,
        now: NOW,
        language: 'fr',
      }),
    ),
  );
  [bulkAnswer([rawDisruption()], { C01743: ['d1'] }), bulkAnswer([], {})].forEach((answer) =>
    check(
      SCENE_ACTIONS.GET_LINE_TRAFFIC,
      buildLineTrafficOutputs({
        line: RER_B,
        traffic: readTraffic(answer, ['C01743'], NOW).get('C01743'),
        language: 'fr',
      }),
    ),
  );
});

test('mirrors the bounds and values of the code', () => {
  const config = byKey(manifest.config_schema);
  [
    ['departure_count', DEPARTURE_COUNT],
    ['delay_threshold', DELAY_THRESHOLD],
    ['poll_interval', POLL_INTERVAL],
    ['traffic_interval', TRAFFIC_INTERVAL],
    ['departures_quota', DEPARTURES_QUOTA],
  ].forEach(([key, bounds]) => {
    ['min', 'max', 'default'].forEach((bound) =>
      assert.equal(config.get(key)[bound], bounds[bound], key),
    );
  });
  for (let slot = 1; slot <= MAX_STOPS; slot += 1) {
    ['', '_line', '_direction', '_hours'].forEach((part) =>
      assert.ok(config.has(`stop_${slot}${part}`)),
    );
    assert.deepEqual(values(config.get(`stop_${slot}_days`)), DAYS);
  }
  assert.ok(!config.has(`stop_${MAX_STOPS + 1}`));
  assert.ok(config.has('lines'));
  const triggers = byKey(manifest.scene_triggers);
  const delayed = byKey(triggers.get(SCENE_TRIGGERS.DEPARTURE_DELAYED).fields);
  assert.deepEqual(values(delayed.get('delay_level')), DELAY_LEVELS);
  const soon = byKey(triggers.get(SCENE_TRIGGERS.DEPARTURE_SOON).fields);
  assert.deepEqual(values(soon.get('minutes')), REMINDER_MINUTES.map(String));
  const disrupted = byKey(triggers.get(TRAFFIC_TRIGGERS.LINE_DISRUPTED).fields);
  assert.deepEqual(values(disrupted.get('severity')), SEVERITY_LEVELS);
  assert.deepEqual(values(disrupted.get('cause')), CAUSE_VALUES);
  const board = byKey(byKey(manifest.widgets).get(WIDGETS.DEPARTURES).settings);
  ['min', 'max', 'default'].forEach((bound) =>
    assert.equal(board.get('count')[bound], BOARD_COUNT[bound]),
  );
});
