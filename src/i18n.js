// -----------------------------------------------------------------------------
// Texts of the integration, in English and French (English fallback).
//
// The manifest carries its own labels; these are the texts the code writes at
// runtime: device and feature names, widget contents, scene summaries,
// messages of the Configuration screen.
// -----------------------------------------------------------------------------

import { formatTime } from './time.js';

const TEXTS = {
  // devices
  stopDeviceName: { en: 'IDFM – {stop}', fr: 'IDFM – {stop}' },
  lineDeviceName: { en: 'IDFM – {line} traffic', fr: 'IDFM – Trafic {line}' },
  featureNext: { en: 'Next departure', fr: 'Prochain départ' },
  featureWait: { en: 'Leaves in', fr: 'Départ dans' },
  featureDelay: { en: 'Delay of the next departure', fr: 'Retard du prochain départ' },
  featureDisrupted: { en: 'Disrupted departures', fr: 'Départs perturbés' },
  featureStatus: { en: 'Traffic', fr: 'Trafic' },
  featureDisruptions: { en: 'Current disruptions', fr: 'Perturbations en cours' },

  // departure states
  onTime: { en: 'on time', fr: 'à l’heure' },
  late: { en: '+{n} min', fr: '+{n} min' },
  cancelled: { en: 'cancelled', fr: 'supprimé' },
  badgeOnTime: { en: 'On time', fr: 'À l’heure' },
  badgeCancelled: { en: 'Cancelled', fr: 'Supprimé' },
  badgeAtStop: { en: 'At the stop', fr: 'À quai' },
  inMinutes: { en: '{n} min', fr: '{n} min' },
  nextLine: { en: '{time} · {departure} · {state}', fr: '{time} · {departure} · {state}' },
  noDepartureShort: { en: 'No departure', fr: 'Aucun départ' },
  platform: { en: 'platform {platform}', fr: 'voie {platform}' },

  // traffic
  stateNormal: { en: 'Normal traffic', fr: 'Trafic normal' },
  stateDisrupted: { en: 'Disrupted', fr: 'Perturbé' },
  stateBlocked: { en: 'Interrupted', fr: 'Interrompu' },
  stateLine: { en: '{state}: {title}', fr: '{state} : {title}' },
  severityBlocking: { en: 'Interrupted', fr: 'Interrompu' },
  severityDisrupted: { en: 'Disrupted', fr: 'Perturbé' },
  severityInformation: { en: 'Info', fr: 'Info' },
  severityPlanned: { en: 'Planned', fr: 'Prévu' },
  causeIncident: { en: 'incident', fr: 'incident' },
  causeWorks: { en: 'works', fr: 'travaux' },
  periodFromTo: { en: '{begin} → {end}', fr: '{begin} → {end}' },
  periodFrom: { en: 'from {begin}', fr: 'à partir de {begin}' },

  // scene summaries
  summaryFirst: {
    en: '{stop}: the next {departure} leaves at {time}, in {minutes} min.',
    fr: '{stop} : le prochain {departure} part à {time}, dans {minutes} min.',
  },
  summaryFirstLate: {
    en: '{stop}: the {departure} of {time} is {n} min late, leaving at {expected}.',
    fr: '{stop} : le {departure} de {time} a {n} min de retard, départ à {expected}.',
  },
  summaryFirstCancelled: {
    en: '{stop}: the {departure} of {time} is cancelled.',
    fr: '{stop} : le {departure} de {time} est supprimé.',
  },
  summaryNext: { en: ' Then: {list}.', fr: ' Ensuite : {list}.' },
  summaryNone: {
    en: '{stop}: no departure in the followed period.',
    fr: '{stop} : aucun départ sur la période suivie.',
  },
  summaryReminder: {
    en: '{stop}: the {departure} leaves in {minutes} min, at {expected}{late}.',
    fr: '{stop} : le {departure} part dans {minutes} min, à {expected}{late}.',
  },
  reminderLate: { en: ' ({n} min late)', fr: ' ({n} min de retard)' },
  summaryDelayed: {
    en: '{stop}: the {departure} of {time} is {n} min late, leaving at {expected}.',
    fr: '{stop} : le {departure} de {time} a {n} min de retard, départ à {expected}.',
  },
  summaryCancelled: {
    en: '{stop}: the {departure} of {time} is cancelled.',
    fr: '{stop} : le {departure} de {time} est supprimé.',
  },
  summaryLineDisrupted: {
    en: '{line}: {state}. {title}',
    fr: '{line} : {state}. {title}',
  },
  summaryLineRestored: {
    en: '{line}: traffic is back to normal.',
    fr: '{line} : le trafic est revenu à la normale.',
  },
  summaryLineNormal: { en: '{line}: normal traffic.', fr: '{line} : trafic normal.' },
  summaryLineOthers: {
    en: ' And {n} other disruption(s).',
    fr: ' Et {n} autre(s) perturbation(s).',
  },

  // widgets
  departsIn: { en: 'Leaves in', fr: 'Départ dans' },
  nextDeparture: { en: 'Next departure', fr: 'Prochain départ' },
  minutesShort: { en: 'min', fr: 'min' },
  towards: { en: 'to {direction}', fr: 'vers {direction}' },
  updatedAt: { en: 'Updated at {time}', fr: 'Mis à jour à {time}' },
  windowNotStarted: {
    en: 'Departures of {hours} shown from {time}.',
    fr: 'Départs de {hours} affichés à partir de {time}.',
  },
  trafficTitle: { en: 'Traffic', fr: 'Trafic' },
  noDeparture: {
    en: 'No departure in the next two hours.',
    fr: 'Aucun départ dans les deux prochaines heures.',
  },
  noStop: {
    en: 'No stop is configured: add one in the integration settings.',
    fr: 'Aucun arrêt n’est configuré : ajoutez-en un dans les réglages de l’intégration.',
  },
  noLine: {
    en: 'No line is followed: add some in the integration settings.',
    fr: 'Aucune ligne n’est suivie : ajoutez-en dans les réglages de l’intégration.',
  },
  noApiKey: {
    en: 'Enter your PRIM API key in the integration settings.',
    fr: 'Renseignez votre clé d’API PRIM dans les réglages de l’intégration.',
  },
  unknownStop: {
    en: 'Stop "{name}" not found: use the "Find a stop" button of the integration.',
    fr: 'Arrêt « {name} » introuvable : utilisez le bouton « Chercher un arrêt » de l’intégration.',
  },
  unknownLine: {
    en: 'Line "{name}" not found: use the "Find a line" button of the integration.',
    fr: 'Ligne « {name} » introuvable : utilisez le bouton « Chercher une ligne » de l’intégration.',
  },
  unavailable: {
    en: 'The Île-de-France Mobilités API is unavailable for now.',
    fr: 'L’API d’Île-de-France Mobilités est indisponible pour le moment.',
  },

  // connection status
  statusOk: {
    en: 'Connected · {stops} stop(s), {lines} line(s) · {used} departure requests in 24 h',
    fr: 'Connecté · {stops} arrêt(s), {lines} ligne(s) · {used} requêtes de départs en 24 h',
  },
  statusNothing: {
    en: 'API key entered. No stop or line configured yet.',
    fr: 'Clé d’API saisie. Aucun arrêt ni ligne configuré pour l’instant.',
  },
  statusInvalidKey: {
    en: 'The PRIM API key is refused: check it.',
    fr: 'La clé d’API PRIM est refusée : vérifiez-la.',
  },
  statusQuota: {
    en: 'Daily quota of the PRIM API reached: paused until {time}.',
    fr: 'Quota quotidien de l’API PRIM atteint : en pause jusqu’à {time}.',
  },
  statusBudget: {
    en: 'Close to the daily quota ({used} requests in 24 h): reads paused for a while.',
    fr: 'Proche du quota quotidien ({used} requêtes en 24 h) : lectures en pause un moment.',
  },
  statusUnreachable: {
    en: 'The Île-de-France Mobilités API cannot be reached; retrying.',
    fr: 'L’API d’Île-de-France Mobilités est injoignable ; nouvel essai en cours.',
  },
  statusNotFound: {
    en: 'Not found: {names}. Use the "Find a stop" and "Find a line" buttons.',
    fr: 'Introuvable : {names}. Utilisez les boutons « Chercher un arrêt » et « Chercher une ligne ».',
  },
};

/**
 * @description Pick a text in a language (English fallback), with `{name}`
 * substitutions.
 * @param {string} key - The TEXTS key.
 * @param {string} language - The language.
 * @param {object} [values] - The substitutions.
 * @returns {string} The text.
 * @example
 * t('late', 'fr', { n: 5 }); // -> '+5 min'
 */
function t(key, language, values = {}) {
  const entry = TEXTS[key];
  if (!entry) {
    return key;
  }
  const template = entry[language] ?? entry.en;
  return template.replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? ''));
}

/**
 * @description The text in every language, for a multi-language message.
 * @param {string} key - The TEXTS key.
 * @param {object} [values] - The substitutions, or `(language) => values`.
 * @returns {{ en: string, fr: string }} The message.
 * @example
 * all('statusQuota', { time: '14:00' });
 */
function all(key, values = {}) {
  const of = (language) => (typeof values === 'function' ? values(language) : values);
  return { en: t(key, 'en', of('en')), fr: t(key, 'fr', of('fr')) };
}

/**
 * @description "RER B NATO" / "Métro 13": the line and the mission of a departure.
 * @param {object} departure - The departure (`line`: its resolved line, when known).
 * @returns {string} The label.
 * @example
 * departureLabel({ line: { name: 'RER B' }, mission: 'KASE' }); // -> 'RER B KASE'
 */
function departureLabel(departure) {
  const line = departure.line?.name || departure.lineId || '';
  return [line, departure.mission].filter(Boolean).join(' ') || '?';
}

/**
 * @description The state of a departure, in words: "on time", "+5 min", "cancelled".
 * @param {object} departure - The departure.
 * @param {string} language - The language.
 * @returns {string} The state.
 */
function stateText(departure, language) {
  if (departure.cancelled) {
    return t('cancelled', language);
  }
  return departure.delay > 0 ? t('late', language, { n: departure.delay }) : t('onTime', language);
}

/**
 * @description One line for a departure: "07:42 · RER B KASE → Robinson · +5 min".
 * @param {object|undefined} departure - The departure.
 * @param {string} language - The language.
 * @returns {string} The line.
 * @example
 * nextLine(departure, 'fr');
 */
function nextLine(departure, language) {
  if (!departure) {
    return t('noDepartureShort', language);
  }
  const label = departure.destination
    ? `${departureLabel(departure)} → ${departure.destination}`
    : departureLabel(departure);
  return t('nextLine', language, {
    time: formatTime(departure.departure),
    departure: label,
    state: stateText(departure, language),
  });
}

/**
 * @description The word of a line state.
 * @param {string} state - 'normal', 'disrupted' or 'blocked'.
 * @param {string} language - The language.
 * @returns {string} The word.
 */
function lineStateText(state, language) {
  if (state === 'blocked') {
    return t('stateBlocked', language);
  }
  return state === 'disrupted' ? t('stateDisrupted', language) : t('stateNormal', language);
}

/**
 * @description End a text as a sentence.
 * @param {string} text - The text.
 * @returns {string} The text with a final period, '' when empty.
 * @example
 * sentence('Trafic interrompu'); // -> 'Trafic interrompu.'
 */
function sentence(text) {
  const trimmed = String(text ?? '').trim();
  return !trimmed || /[.!?…]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

export { TEXTS, t, all, sentence, departureLabel, stateText, nextLine, lineStateText };
