import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';

import { LANGUAGES, TEXTS, all, t } from '../src/i18n.js';
import { buildDeparturesWidget, buildTrafficWidget, messageContent } from '../src/widgets.js';
import { buildNextDeparturesOutputs, buildLineTrafficOutputs } from '../src/scene-actions.js';
import { buildDepartureEvent } from '../src/events.js';
import { buildStopDevice, buildLineDevice } from '../src/device.js';
import { readTraffic } from '../src/traffic.js';
import {
  NOW,
  MINUTE,
  FOLLOWED,
  RER_B,
  METRO_13,
  fakeGladys,
  departure,
  rawDisruption,
  bulkAnswer,
} from './helpers/fixtures.js';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const manifest = JSON.parse(read('../gladys-assistant-integration.json'));

const DEPARTURES = [
  departure({ id: 'a', cancelled: true, baseDeparture: NOW + 3 * MINUTE }),
  departure({ id: 'b', delay: 6, baseDeparture: NOW + 5 * MINUTE }),
  departure({ id: 'c', baseDeparture: NOW + 20 * MINUTE }),
  departure({ id: 'e', atStop: true, baseDeparture: NOW }),
];

const TRAFFIC = readTraffic(
  bulkAnswer(
    [
      rawDisruption({ id: 'd1', severity: 'BLOQUANTE', title: 'Trafic interrompu' }),
      rawDisruption({
        id: 'd2',
        cause: 'TRAVAUX',
        begin: NOW + 6 * 60 * MINUTE,
        end: NOW + 26 * 60 * MINUTE,
        title: 'Travaux de nuit',
      }),
    ],
    { C01743: ['d1'], C01383: ['d2'] },
  ),
  ['C01743', 'C01383'],
  NOW,
);

/**
 * @description Every multi-language object of the manifest, with its path.
 * @param {unknown} node - A manifest node.
 * @param {string} path - Its path.
 * @returns {Array<[string, object]>} The texts.
 */
function texts(node, path = '') {
  if (Array.isArray(node)) {
    return node.flatMap((child, i) => texts(child, `${path}[${i}]`));
  }
  if (node && typeof node === 'object') {
    if (typeof node.en === 'string') {
      return [[path, node]];
    }
    return Object.entries(node).flatMap(([key, child]) => texts(child, `${path}.${key}`));
  }
  return [];
}

test('every manifest text exists in English, French, German and Spanish', () => {
  const found = texts(manifest);
  assert.ok(found.length > 50);
  for (const [path, text] of found) {
    for (const language of LANGUAGES) {
      assert.ok(text[language]?.trim(), `${path}.${language} is missing`);
    }
  }
});

test('catalog description: 10 to 100 characters per language', () => {
  for (const language of LANGUAGES) {
    const { length } = manifest.description[language];
    assert.ok(length >= 10 && length <= 100, `description.${language}: ${length}`);
  }
});

test('widget labels: 3 to 30 characters per language', () => {
  for (const widget of manifest.widgets) {
    for (const language of LANGUAGES) {
      const { length } = widget.label[language];
      assert.ok(length >= 3 && length <= 30, `${widget.key}.label.${language}: ${length}`);
    }
  }
});

test('every runtime text exists in the four languages, with the same placeholders', () => {
  const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
  for (const [key, entry] of Object.entries(TEXTS)) {
    for (const language of LANGUAGES) {
      assert.ok(entry[language], `${key}.${language} is missing`);
      assert.deepEqual(placeholders(entry[language]), placeholders(entry.en), `${key}.${language}`);
    }
  }
  assert.deepEqual(Object.keys(all('statusNothing')), LANGUAGES);
});

test('connection status messages stay within 200 characters per language', () => {
  const values = { time: '23:59', used: 99999, stops: 3, lines: 6, names: 'x'.repeat(60) };
  for (const key of Object.keys(TEXTS).filter((name) => name.startsWith('status'))) {
    for (const [language, text] of Object.entries(all(key, values))) {
      assert.ok(text.length <= 200, `${key}.${language}: ${text.length}`);
    }
  }
});

test('the widgets are valid in every language', () => {
  for (const language of LANGUAGES) {
    for (const content of [
      buildDeparturesWidget({
        title: FOLLOWED.name,
        snapshot: { departures: DEPARTURES, readAt: NOW },
        count: 6,
        threshold: 3,
        language,
        now: NOW,
      }),
      buildDeparturesWidget({
        title: 'Châtelet',
        snapshot: { departures: [], readAt: NOW },
        window: { hours: { start: 1020, end: 1140 } },
        count: 6,
        threshold: 3,
        language,
        now: NOW,
        idle: true,
      }),
      buildTrafficWidget({
        lines: [
          { line: RER_B, traffic: TRAFFIC.get('C01743') },
          { line: METRO_13, traffic: TRAFFIC.get('C01383') },
        ],
        readAt: NOW,
        language,
        now: NOW,
      }),
      messageContent(t('noApiKey', language)),
    ]) {
      assert.deepEqual(validateWidgetContent(content), [], language);
    }
  }
});

test('device names, widgets and scene texts follow the language', () => {
  assert.equal(buildStopDevice(fakeGladys, FOLLOWED, 'de').features[0].name, 'Nächste Abfahrt');
  assert.equal(buildStopDevice(fakeGladys, FOLLOWED, 'es').features[0].name, 'Próxima salida');
  assert.equal(buildLineDevice(fakeGladys, RER_B, 'de').name, 'IDFM – Verkehr RER B');
  assert.equal(buildLineDevice(fakeGladys, RER_B, 'es').name, 'IDFM – Tráfico RER B');
  const badges = (language) =>
    buildDeparturesWidget({
      title: FOLLOWED.name,
      snapshot: { departures: DEPARTURES, readAt: NOW },
      count: 6,
      threshold: 3,
      language,
      now: NOW,
    })
      .components.find((c) => c.type === 'card-list')
      .items.map((item) => item.badge.text);
  assert.deepEqual(badges('de'), ['Fällt aus', '+6 min', '20 min', 'Am Bahnsteig']);
  assert.deepEqual(badges('es'), ['Cancelado', '+6 min', '20 min', 'En andén']);
  const outputs = buildNextDeparturesOutputs({
    followed: FOLLOWED,
    departures: DEPARTURES.slice(1, 3),
    threshold: 3,
    now: NOW,
    language: 'de',
  });
  assert.match(outputs.summary, /hat 6 min Verspätung/);
  const traffic = buildLineTrafficOutputs({
    line: RER_B,
    traffic: TRAFFIC.get('C01743'),
    language: 'es',
  });
  assert.match(traffic.summary, /^RER B: Interrumpido\./);
  const { data } = buildDepartureEvent(
    fakeGladys,
    FOLLOWED,
    { key: 'departure_cancelled', departure: DEPARTURES[0] },
    'es',
  );
  assert.match(data.summary, /está cancelado/);
  // Unknown language: English.
  assert.equal(t('featureNext', 'it'), 'Next departure');
});

test('docs: English and French mandatory, the four languages with the same structure', () => {
  const headings = (text) => text.split('\n').filter((line) => /^#{1,3} /.test(line)).length;
  const tables = (text) => text.split('\n').filter((line) => /^\|\s*-/.test(line)).length;
  const docs = Object.fromEntries(
    LANGUAGES.map((language) => {
      const path = new URL(`../docs/${language}.md`, import.meta.url);
      assert.ok(existsSync(path), `docs/${language}.md is missing`);
      return [language, readFileSync(path, 'utf8')];
    }),
  );
  for (const language of LANGUAGES) {
    assert.ok(docs[language].length > 300, `docs/${language}.md is too short`);
    assert.equal(headings(docs[language]), headings(docs.en), `docs/${language}.md headings`);
    assert.equal(tables(docs[language]), tables(docs.en), `docs/${language}.md tables`);
  }
});

test('README: one per language, each linking to the three others', () => {
  const files = { en: 'README.md', fr: 'README.fr.md', de: 'README.de.md', es: 'README.es.md' };
  for (const file of Object.values(files)) {
    const path = new URL(`../${file}`, import.meta.url);
    assert.ok(existsSync(path), `${file} is missing`);
    const text = readFileSync(path, 'utf8');
    for (const other of Object.values(files).filter((name) => name !== file)) {
      assert.ok(text.includes(`](${other})`), `${file} does not link to ${other}`);
    }
  }
});
