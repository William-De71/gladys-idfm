// Shapes of the PRIM answers (as documented by IDFM and seen in real answers),
// and a stand-in for the SDK external ids.

import { toNavitiaDate } from '../../src/time.js';

// Monday 12 October 2026, 07:00 in Paris.
export const NOW = Date.parse('2026-10-12T05:00:00Z');
export const MINUTE = 60000;

export const fakeGladys = {
  externalIds: (type, id) => {
    const device = `ext:idfm:${type}:${id}`;
    return { device, feature: (key) => `${device}:${key}` };
  },
  externalId: (suffix) => `ext:idfm:${suffix}`,
};

export const RER_B = { id: 'C01743', name: 'RER B', short: 'B', mode: 'rail', color: '5091cb' };
export const METRO_13 = { id: 'C01383', name: 'Métro 13', short: '13', mode: 'metro', color: '' };

export const FOLLOWED = {
  slot: 1,
  key: 'sp58774_c01743_paris',
  name: 'Massy - Palaiseau (RER B → Paris)',
  stop: { kind: 'area', id: '58774', name: 'Massy - Palaiseau', town: 'Massy' },
  line: RER_B,
  direction: 'Paris',
  hours: null,
  days: [1, 2, 3, 4, 5, 6, 7],
};

/**
 * @description A `MonitoredStopVisit` of a stop-monitoring answer.
 * @param {object} options - Options.
 * @returns {object} The raw item.
 */
export function rawVisit({
  line = 'C01743',
  destination = 'Aéroport Charles de Gaulle 2 TGV',
  mission = 'KASE',
  number = 'KASE12',
  aimed = NOW + 10 * MINUTE,
  delay = 0,
  timetabled = true,
  status = undefined,
  platform = '2',
  vehicle = undefined,
  terminus = false,
} = {}) {
  const iso = (ms) =>
    new Date(ms)
      .toISOString()
      .replace(/Z$/, '')
      .replace(/\.\d+$/, '.000Z');
  const expected = aimed + delay * MINUTE;
  const call = {
    StopPointName: [{ value: 'Massy - Palaiseau' }],
    VehicleAtStop: false,
    DestinationDisplay: [{ value: destination }],
    ExpectedArrivalTime: iso(expected - 30000),
    ArrivalPlatformName: { value: platform },
  };
  if (!terminus) {
    call.ExpectedDepartureTime = iso(expected);
    call.DeparturePlatformName = { value: platform };
    call.DepartureStatus = status ?? (delay > 0 ? 'delayed' : 'onTime');
    if (timetabled) {
      call.AimedDepartureTime = iso(aimed);
    }
  }
  return {
    RecordedAtTime: iso(NOW - 20000),
    ItemIdentifier: `SNCF_MAGENTA_PRD:Item::58774-${number}:`,
    MonitoringRef: { value: 'STIF:StopArea:SP:58774:' },
    MonitoredVehicleJourney: {
      LineRef: { value: `STIF:Line::${line}:` },
      OperatorRef: {},
      FramedVehicleJourneyRef: {
        DataFrameRef: { value: 'any' },
        DatedVehicleJourneyRef: vehicle ?? `SNCF_MAGENTA_PRD:VehicleJourney::${number}:LOC`,
      },
      DirectionName: [],
      DestinationRef: { value: 'STIF:StopArea:SP:43094:' },
      DestinationName: [{ value: destination }],
      VehicleJourneyName: [{ value: number }],
      JourneyNote: mission ? [{ value: mission }] : [],
      MonitoredCall: call,
      TrainNumbers: { TrainNumberRef: [{ value: number }] },
      DirectionRef: { value: 'Aller' },
    },
  };
}

/**
 * @description A stop-monitoring answer.
 * @param {object[]} visits - The raw items.
 * @returns {object} The answer.
 */
export function stopMonitoringAnswer(visits) {
  return {
    Siri: {
      ServiceDelivery: {
        ResponseTimestamp: new Date(NOW).toISOString(),
        ProducerRef: 'IVTR_HET',
        StopMonitoringDelivery: [
          {
            ResponseTimestamp: new Date(NOW).toISOString(),
            Version: '2.0',
            Status: 'true',
            MonitoredStopVisit: visits,
          },
        ],
      },
    },
  };
}

/**
 * @description A disruption of a disruptions_bulk answer.
 * @param {object} options - Options.
 * @returns {object} The raw disruption.
 */
export function rawDisruption({
  id = 'd1',
  severity = 'PERTURBEE',
  cause = 'PERTURBATION',
  title = 'RER B : trafic perturbé',
  message = '<p>Trafic perturbé entre Massy &amp; Paris en raison d&#39;un incident.</p>',
  begin = NOW - 30 * MINUTE,
  end = NOW + 90 * MINUTE,
} = {}) {
  return {
    id,
    applicationPeriods: [{ begin: toNavitiaDate(begin), end: toNavitiaDate(end) }],
    lastUpdate: toNavitiaDate(begin),
    cause,
    severity,
    title,
    message,
  };
}

/**
 * @description A disruptions_bulk answer.
 * @param {object[]} disruptions - The raw disruptions.
 * @param {object} links - `{ C01743: ['d1'] }`: the disruptions of each line.
 * @returns {object} The answer.
 */
export function bulkAnswer(disruptions, links) {
  return {
    disruptions,
    lines: Object.entries(links).map(([line, ids]) => ({
      id: `line:IDFM:${line}`,
      name: line,
      impactedObjects: [{ type: 'line', id: `line:IDFM:${line}`, disruptionIds: ids }],
    })),
  };
}

/**
 * @description A departure as parseVisit makes it.
 * @param {object} [overrides] - Fields to change.
 * @returns {object} The departure.
 */
export function departure(overrides = {}) {
  const baseDeparture = overrides.baseDeparture ?? NOW + 10 * MINUTE;
  const delay = overrides.delay ?? 0;
  return {
    id: 'v1',
    lineId: 'C01743',
    line: RER_B,
    destination: 'Aéroport Charles de Gaulle 2 TGV',
    mission: 'KASE',
    number: '',
    baseDeparture,
    departure: baseDeparture + delay * MINUTE,
    delay,
    timetabled: true,
    cancelled: false,
    platform: '2',
    atStop: false,
    ...overrides,
  };
}
