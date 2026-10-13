// Builds the widget contents of the illustrations with the integration's own
// code: node gen.mjs <repo> <out.json> (run by render.sh)
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const [repo, out] = process.argv.slice(2);
const load = (path) => import(pathToFileURL(`${repo}/${path}`).href);
const { buildDeparturesWidget, buildTrafficWidget } = await load('src/widgets.js');
const { readTraffic } = await load('src/traffic.js');
const { toNavitiaDate } = await load('src/time.js');
const { LANGUAGES } = await load('src/i18n.js');
const manifest = JSON.parse(readFileSync(`${repo}/gladys-assistant-integration.json`, 'utf8'));

// A weekday morning in Paris: Tuesday 13 October 2026, 07:32.
const NOW = Date.parse('2026-10-13T05:32:00Z');
const MINUTE = 60000;

const RER_B = { id: 'C01743', name: 'RER B', short: 'B', mode: 'rail', color: '5091cb' };
const RER_A = { id: 'C01742', name: 'RER A', short: 'A', mode: 'rail', color: 'eb2132' };
const METRO_13 = { id: 'C01383', name: 'Métro 13', short: '13', mode: 'metro', color: '98d4e2' };

// The next RER B at Massy - Palaiseau towards Paris, the way the watcher
// keeps them: one cancelled, one late, the others on time.
const departure = (id, mission, destination, inMinutes, { delay = 0, ...rest } = {}) => ({
  id,
  lineId: RER_B.id,
  line: RER_B,
  destination,
  mission,
  number: '',
  baseDeparture: NOW + inMinutes * MINUTE,
  departure: NOW + (inMinutes + delay) * MINUTE,
  delay,
  timetabled: true,
  cancelled: false,
  platform: '2',
  atStop: false,
  ...rest,
});
const DEPARTURES = [
  departure('v1', 'KASE', 'Aéroport Charles de Gaulle 2 TGV', 3, { delay: 4 }),
  departure('v2', 'KOCQ', 'Aéroport Charles de Gaulle 2 TGV', 9, { cancelled: true }),
  departure('v3', 'EKOU', 'Mitry - Claye', 15, { platform: '1' }),
  departure('v4', 'KASE', 'Aéroport Charles de Gaulle 2 TGV', 24),
  departure('v5', 'EKOU', 'Mitry - Claye', 33, { platform: '1' }),
];

// The traffic of three lines: the RER B interrupted by an incident, works
// planned tonight on line 13, the RER A normal. The texts come from IDFM, in
// French, as the integration shows them.
const raw = (id, severity, cause, title, message, begin, end) => ({
  id,
  applicationPeriods: [{ begin: toNavitiaDate(begin), end: toNavitiaDate(end) }],
  lastUpdate: toNavitiaDate(begin),
  cause,
  severity,
  title,
  message,
});
const answer = {
  disruptions: [
    raw(
      'd1',
      'BLOQUANTE',
      'PERTURBATION',
      'RER B : trafic interrompu entre Massy - Palaiseau et Denfert-Rochereau',
      '<p>En raison d&#39;un incident technique, le trafic est interrompu entre Massy - Palaiseau et Denfert-Rochereau. Reprise estimée à 08:30.</p>',
      NOW - 25 * MINUTE,
      NOW + 60 * MINUTE,
    ),
    raw(
      'd2',
      'PERTURBEE',
      'TRAVAUX',
      'Métro 13 : travaux de modernisation, fin de service anticipée',
      '<p>En raison de travaux, le service se termine à 22:00 entre Saint-Lazare et Châtillon - Montrouge.</p>',
      NOW + 14 * 60 * MINUTE,
      NOW + 20 * 60 * MINUTE,
    ),
  ],
  lines: [
    [RER_B, ['d1']],
    [METRO_13, ['d2']],
    [RER_A, []],
  ].map(([line, ids]) => ({
    id: `line:IDFM:${line.id}`,
    name: line.id,
    impactedObjects: [{ type: 'line', id: `line:IDFM:${line.id}`, disruptionIds: ids }],
  })),
};
const LINES = [RER_B, METRO_13, RER_A];
const traffic = readTraffic(
  answer,
  LINES.map((line) => line.id),
  NOW,
);

const widgets = Object.fromEntries(manifest.widgets.map((w) => [w.key, w]));
const contents = {};
for (const language of LANGUAGES) {
  contents[language] = {
    departures: buildDeparturesWidget({
      title: 'Massy - Palaiseau (RER B → Paris)',
      snapshot: { departures: DEPARTURES, readAt: NOW },
      count: 5,
      threshold: 3,
      language,
      now: NOW,
    }),
    traffic: buildTrafficWidget({
      lines: LINES.map((line) => ({ line, traffic: traffic.get(line.id) })),
      readAt: NOW,
      language,
      now: NOW,
    }),
  };
}
const cards = Object.fromEntries(
  Object.keys(contents.en).map((key) => [
    key,
    { icon: widgets[key].icon, label: widgets[key].label },
  ]),
);
writeFileSync(out, JSON.stringify({ now: NOW, cards, contents }, null, 1));
console.log('ok', Object.keys(contents.en).join(', '));
