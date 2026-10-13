// -----------------------------------------------------------------------------
// Texts of the integration, in English, French, German and Spanish (English
// fallback).
//
// The manifest carries its own labels; these are the texts the code writes at
// runtime: device and feature names, widget contents, scene summaries,
// messages of the Configuration screen.
// -----------------------------------------------------------------------------

import { formatTime } from './time.js';

const LANGUAGES = ['en', 'fr', 'de', 'es'];

const TEXTS = {
  // devices
  stopDeviceName: {
    en: 'IDFM – {stop}',
    fr: 'IDFM – {stop}',
    de: 'IDFM – {stop}',
    es: 'IDFM – {stop}',
  },
  lineDeviceName: {
    en: 'IDFM – {line} traffic',
    fr: 'IDFM – Trafic {line}',
    de: 'IDFM – Verkehr {line}',
    es: 'IDFM – Tráfico {line}',
  },
  featureNext: {
    en: 'Next departure',
    fr: 'Prochain départ',
    de: 'Nächste Abfahrt',
    es: 'Próxima salida',
  },
  featureWait: { en: 'Leaves in', fr: 'Départ dans', de: 'Abfahrt in', es: 'Sale en' },
  featureDelay: {
    en: 'Delay of the next departure',
    fr: 'Retard du prochain départ',
    de: 'Verspätung der nächsten Abfahrt',
    es: 'Retraso de la próxima salida',
  },
  featureDisrupted: {
    en: 'Disrupted departures',
    fr: 'Départs perturbés',
    de: 'Gestörte Abfahrten',
    es: 'Salidas con incidencias',
  },
  featureStatus: { en: 'Traffic', fr: 'Trafic', de: 'Verkehr', es: 'Tráfico' },
  featureDisruptions: {
    en: 'Current disruptions',
    fr: 'Perturbations en cours',
    de: 'Aktuelle Störungen',
    es: 'Incidencias en curso',
  },

  // departure states
  onTime: { en: 'on time', fr: 'à l’heure', de: 'pünktlich', es: 'en hora' },
  late: { en: '+{n} min', fr: '+{n} min', de: '+{n} min', es: '+{n} min' },
  cancelled: { en: 'cancelled', fr: 'supprimé', de: 'fällt aus', es: 'cancelado' },
  badgeOnTime: { en: 'On time', fr: 'À l’heure', de: 'Pünktlich', es: 'Puntual' },
  badgeCancelled: { en: 'Cancelled', fr: 'Supprimé', de: 'Fällt aus', es: 'Cancelado' },
  badgeAtStop: { en: 'At the stop', fr: 'À quai', de: 'Am Bahnsteig', es: 'En andén' },
  inMinutes: { en: '{n} min', fr: '{n} min', de: '{n} min', es: '{n} min' },
  nextLine: {
    en: '{time} · {departure} · {state}',
    fr: '{time} · {departure} · {state}',
    de: '{time} · {departure} · {state}',
    es: '{time} · {departure} · {state}',
  },
  noDepartureShort: {
    en: 'No departure',
    fr: 'Aucun départ',
    de: 'Keine Abfahrt',
    es: 'Ninguna salida',
  },
  platform: {
    en: 'platform {platform}',
    fr: 'voie {platform}',
    de: 'Gleis {platform}',
    es: 'vía {platform}',
  },

  // traffic
  stateNormal: {
    en: 'Normal traffic',
    fr: 'Trafic normal',
    de: 'Normaler Verkehr',
    es: 'Tráfico normal',
  },
  stateDisrupted: { en: 'Disrupted', fr: 'Perturbé', de: 'Gestört', es: 'Con incidencias' },
  stateBlocked: { en: 'Interrupted', fr: 'Interrompu', de: 'Unterbrochen', es: 'Interrumpido' },
  stateLine: {
    en: '{state}: {title}',
    fr: '{state} : {title}',
    de: '{state}: {title}',
    es: '{state}: {title}',
  },
  severityBlocking: {
    en: 'Interrupted',
    fr: 'Interrompu',
    de: 'Unterbrochen',
    es: 'Interrumpido',
  },
  severityDisrupted: { en: 'Disrupted', fr: 'Perturbé', de: 'Gestört', es: 'Incidencia' },
  severityInformation: { en: 'Info', fr: 'Info', de: 'Info', es: 'Info' },
  severityPlanned: { en: 'Planned', fr: 'Prévu', de: 'Geplant', es: 'Previsto' },
  causeIncident: { en: 'incident', fr: 'incident', de: 'Störung', es: 'incidencia' },
  causeWorks: { en: 'works', fr: 'travaux', de: 'Bauarbeiten', es: 'obras' },
  periodFromTo: {
    en: '{begin} → {end}',
    fr: '{begin} → {end}',
    de: '{begin} → {end}',
    es: '{begin} → {end}',
  },
  periodFrom: {
    en: 'from {begin}',
    fr: 'à partir de {begin}',
    de: 'ab {begin}',
    es: 'desde {begin}',
  },

  // scene summaries
  summaryFirst: {
    en: '{stop}: the next {departure} leaves at {time}, in {minutes} min.',
    fr: '{stop} : le prochain {departure} part à {time}, dans {minutes} min.',
    de: '{stop}: Die nächste Abfahrt, {departure}, ist um {time}, in {minutes} min.',
    es: '{stop}: el próximo {departure} sale a las {time}, dentro de {minutes} min.',
  },
  summaryFirstLate: {
    en: '{stop}: the {departure} of {time} is {n} min late, leaving at {expected}.',
    fr: '{stop} : le {departure} de {time} a {n} min de retard, départ à {expected}.',
    de: '{stop}: {departure} um {time} hat {n} min Verspätung, Abfahrt um {expected}.',
    es: '{stop}: el {departure} de las {time} lleva {n} min de retraso, sale a las {expected}.',
  },
  summaryFirstCancelled: {
    en: '{stop}: the {departure} of {time} is cancelled.',
    fr: '{stop} : le {departure} de {time} est supprimé.',
    de: '{stop}: {departure} um {time} fällt aus.',
    es: '{stop}: el {departure} de las {time} está cancelado.',
  },
  summaryNext: {
    en: ' Then: {list}.',
    fr: ' Ensuite : {list}.',
    de: ' Danach: {list}.',
    es: ' Después: {list}.',
  },
  summaryNone: {
    en: '{stop}: no departure in the followed period.',
    fr: '{stop} : aucun départ sur la période suivie.',
    de: '{stop}: keine Abfahrt im verfolgten Zeitraum.',
    es: '{stop}: ninguna salida en el periodo seguido.',
  },
  summaryReminder: {
    en: '{stop}: the {departure} leaves in {minutes} min, at {expected}{late}.',
    fr: '{stop} : le {departure} part dans {minutes} min, à {expected}{late}.',
    de: '{stop}: {departure} fährt in {minutes} min ab, um {expected}{late}.',
    es: '{stop}: el {departure} sale dentro de {minutes} min, a las {expected}{late}.',
  },
  reminderLate: {
    en: ' ({n} min late)',
    fr: ' ({n} min de retard)',
    de: ' ({n} min Verspätung)',
    es: ' ({n} min de retraso)',
  },
  summaryDelayed: {
    en: '{stop}: the {departure} of {time} is {n} min late, leaving at {expected}.',
    fr: '{stop} : le {departure} de {time} a {n} min de retard, départ à {expected}.',
    de: '{stop}: {departure} um {time} hat {n} min Verspätung, Abfahrt um {expected}.',
    es: '{stop}: el {departure} de las {time} lleva {n} min de retraso, sale a las {expected}.',
  },
  summaryCancelled: {
    en: '{stop}: the {departure} of {time} is cancelled.',
    fr: '{stop} : le {departure} de {time} est supprimé.',
    de: '{stop}: {departure} um {time} fällt aus.',
    es: '{stop}: el {departure} de las {time} está cancelado.',
  },
  summaryLineDisrupted: {
    en: '{line}: {state}. {title}',
    fr: '{line} : {state}. {title}',
    de: '{line}: {state}. {title}',
    es: '{line}: {state}. {title}',
  },
  summaryLineRestored: {
    en: '{line}: traffic is back to normal.',
    fr: '{line} : le trafic est revenu à la normale.',
    de: '{line}: Der Verkehr läuft wieder normal.',
    es: '{line}: el tráfico ha vuelto a la normalidad.',
  },
  summaryLineNormal: {
    en: '{line}: normal traffic.',
    fr: '{line} : trafic normal.',
    de: '{line}: normaler Verkehr.',
    es: '{line}: tráfico normal.',
  },
  summaryLineOthers: {
    en: ' And {n} other disruption(s).',
    fr: ' Et {n} autre(s) perturbation(s).',
    de: ' Und {n} weitere Störung(en).',
    es: ' Y {n} incidencia(s) más.',
  },

  // widgets
  departsIn: { en: 'Leaves in', fr: 'Départ dans', de: 'Abfahrt in', es: 'Sale en' },
  nextDeparture: {
    en: 'Next departure',
    fr: 'Prochain départ',
    de: 'Nächste Abfahrt',
    es: 'Próxima salida',
  },
  minutesShort: { en: 'min', fr: 'min', de: 'min', es: 'min' },
  towards: {
    en: 'to {direction}',
    fr: 'vers {direction}',
    de: 'nach {direction}',
    es: 'hacia {direction}',
  },
  updatedAt: {
    en: 'Updated at {time}',
    fr: 'Mis à jour à {time}',
    de: 'Aktualisiert um {time}',
    es: 'Actualizado a las {time}',
  },
  windowNotStarted: {
    en: 'Departures of {hours} shown from {time}.',
    fr: 'Départs de {hours} affichés à partir de {time}.',
    de: 'Abfahrten von {hours} werden ab {time} angezeigt.',
    es: 'Salidas de {hours} visibles a partir de las {time}.',
  },
  trafficTitle: { en: 'Traffic', fr: 'Trafic', de: 'Verkehr', es: 'Tráfico' },
  noDeparture: {
    en: 'No departure in the next two hours.',
    fr: 'Aucun départ dans les deux prochaines heures.',
    de: 'Keine Abfahrt in den nächsten zwei Stunden.',
    es: 'Ninguna salida en las próximas dos horas.',
  },
  noStop: {
    en: 'No stop is configured: add one in the integration settings.',
    fr: 'Aucun arrêt n’est configuré : ajoutez-en un dans les réglages de l’intégration.',
    de: 'Keine Haltestelle eingerichtet: Füge eine in den Einstellungen der Integration hinzu.',
    es: 'No hay ninguna parada configurada: añade una en los ajustes de la integración.',
  },
  noLine: {
    en: 'No line is followed: add some in the integration settings.',
    fr: 'Aucune ligne n’est suivie : ajoutez-en dans les réglages de l’intégration.',
    de: 'Keine Linie verfolgt: Füge welche in den Einstellungen der Integration hinzu.',
    es: 'No se sigue ninguna línea: añade alguna en los ajustes de la integración.',
  },
  noApiKey: {
    en: 'Enter your PRIM API key in the integration settings.',
    fr: 'Renseignez votre clé d’API PRIM dans les réglages de l’intégration.',
    de: 'Gib deinen PRIM-API-Schlüssel in den Einstellungen der Integration ein.',
    es: 'Introduce tu clave de API de PRIM en los ajustes de la integración.',
  },
  unknownStop: {
    en: 'Stop "{name}" not found: use the "Find a stop" button of the integration.',
    fr: 'Arrêt « {name} » introuvable : utilisez le bouton « Chercher un arrêt » de l’intégration.',
    de: 'Haltestelle „{name}“ nicht gefunden: Nutze die Schaltfläche „Haltestelle suchen“ der Integration.',
    es: 'Parada «{name}» no encontrada: usa el botón «Buscar una parada» de la integración.',
  },
  unknownLine: {
    en: 'Line "{name}" not found: use the "Find a line" button of the integration.',
    fr: 'Ligne « {name} » introuvable : utilisez le bouton « Chercher une ligne » de l’intégration.',
    de: 'Linie „{name}“ nicht gefunden: Nutze die Schaltfläche „Linie suchen“ der Integration.',
    es: 'Línea «{name}» no encontrada: usa el botón «Buscar una línea» de la integración.',
  },
  unavailable: {
    en: 'The Île-de-France Mobilités API is unavailable for now.',
    fr: 'L’API d’Île-de-France Mobilités est indisponible pour le moment.',
    de: 'Die API von Île-de-France Mobilités ist derzeit nicht verfügbar.',
    es: 'La API de Île-de-France Mobilités no está disponible por ahora.',
  },

  // connection status
  statusOk: {
    en: 'Connected · {stops} stop(s), {lines} line(s) · {used} departure requests in 24 h',
    fr: 'Connecté · {stops} arrêt(s), {lines} ligne(s) · {used} requêtes de départs en 24 h',
    de: 'Verbunden · {stops} Haltestelle(n), {lines} Linie(n) · {used} Abfahrtsanfragen in 24 h',
    es: 'Conectado · {stops} parada(s), {lines} línea(s) · {used} peticiones de salidas en 24 h',
  },
  statusNothing: {
    en: 'API key entered. No stop or line configured yet.',
    fr: 'Clé d’API saisie. Aucun arrêt ni ligne configuré pour l’instant.',
    de: 'API-Schlüssel eingegeben. Noch keine Haltestelle und keine Linie eingerichtet.',
    es: 'Clave de API introducida. Aún no hay ninguna parada ni línea configurada.',
  },
  statusInvalidKey: {
    en: 'The PRIM API key is refused: check it.',
    fr: 'La clé d’API PRIM est refusée : vérifiez-la.',
    de: 'Der PRIM-API-Schlüssel wird abgelehnt: Überprüfe ihn.',
    es: 'La clave de API de PRIM es rechazada: compruébala.',
  },
  statusQuota: {
    en: 'Daily quota of the PRIM API reached: paused until {time}.',
    fr: 'Quota quotidien de l’API PRIM atteint : en pause jusqu’à {time}.',
    de: 'Tageskontingent der PRIM-API erreicht: pausiert bis {time}.',
    es: 'Cuota diaria de la API de PRIM alcanzada: en pausa hasta las {time}.',
  },
  statusBudget: {
    en: 'Close to the daily quota ({used} requests in 24 h): reads paused for a while.',
    fr: 'Proche du quota quotidien ({used} requêtes en 24 h) : lectures en pause un moment.',
    de: 'Nahe am Tageskontingent ({used} Anfragen in 24 h): Abfragen eine Weile pausiert.',
    es: 'Cerca de la cuota diaria ({used} peticiones en 24 h): lecturas en pausa un rato.',
  },
  statusUnreachable: {
    en: 'The Île-de-France Mobilités API cannot be reached; retrying.',
    fr: 'L’API d’Île-de-France Mobilités est injoignable ; nouvel essai en cours.',
    de: 'Die API von Île-de-France Mobilités ist nicht erreichbar; neuer Versuch läuft.',
    es: 'No se puede acceder a la API de Île-de-France Mobilités; reintentando.',
  },
  statusNotFound: {
    en: 'Not found: {names}. Use the "Find a stop" and "Find a line" buttons.',
    fr: 'Introuvable : {names}. Utilisez les boutons « Chercher un arrêt » et « Chercher une ligne ».',
    de: 'Nicht gefunden: {names}. Nutze die Schaltflächen „Haltestelle suchen“ und „Linie suchen“.',
    es: 'No encontrado: {names}. Usa los botones «Buscar una parada» y «Buscar una línea».',
  },

  // configuration screen actions
  stopOk: {
    en: '{stop}: OK, {count} departure(s), next {next}',
    fr: '{stop} : OK, {count} départ(s), prochain {next}',
    de: '{stop}: OK, {count} Abfahrt(en), nächste {next}',
    es: '{stop}: OK, {count} salida(s), próxima {next}',
  },
  stopError: {
    en: '{stop}: {error}',
    fr: '{stop} : {error}',
    de: '{stop}: {error}',
    es: '{stop}: {error}',
  },
  lineState: {
    en: '{line}: {state}',
    fr: '{line} : {state}',
    de: '{line}: {state}',
    es: '{line}: {state}',
  },
  trafficApiOk: {
    en: 'Traffic API: OK',
    fr: 'API trafic : OK',
    de: 'Verkehrs-API: OK',
    es: 'API de tráfico: OK',
  },
  trafficError: {
    en: 'Traffic: {error}',
    fr: 'Trafic : {error}',
    de: 'Verkehr: {error}',
    es: 'Tráfico: {error}',
  },
  entryNotFound: {
    en: '"{name}": not found',
    fr: '« {name} » : introuvable',
    de: '„{name}“: nicht gefunden',
    es: '«{name}»: no encontrado',
  },
  requestsCount: {
    en: '{used}/{quota} departure requests in 24 h, every {interval} min',
    fr: '{used}/{quota} requêtes de départs en 24 h, toutes les {interval} min',
    de: '{used}/{quota} Abfahrtsanfragen in 24 h, alle {interval} min',
    es: '{used}/{quota} peticiones de salidas en 24 h, cada {interval} min',
  },
  searchStopTooShort: {
    en: 'Type at least 2 characters of the stop name.',
    fr: 'Saisissez au moins 2 caractères du nom de l’arrêt.',
    de: 'Gib mindestens 2 Zeichen des Haltestellennamens ein.',
    es: 'Escribe al menos 2 caracteres del nombre de la parada.',
  },
  searchStopNone: {
    en: 'No stop matches "{query}".',
    fr: 'Aucun arrêt ne correspond à « {query} ».',
    de: 'Keine Haltestelle passt zu „{query}“.',
    es: 'Ninguna parada coincide con «{query}».',
  },
  searchStopFound: {
    en: '{list}. Copy the number of the right stop into a stop field.',
    fr: '{list}. Copiez le numéro du bon arrêt dans un champ d’arrêt.',
    de: '{list}. Kopiere die Nummer der richtigen Haltestelle in ein Haltestellenfeld.',
    es: '{list}. Copia el número de la parada correcta en un campo de parada.',
  },
  searchLineEmpty: {
    en: 'Type a line, e.g. "RER B" or "Bus 91".',
    fr: 'Saisissez une ligne, par exemple « RER B » ou « Bus 91 ».',
    de: 'Gib eine Linie ein, z. B. „RER B“ oder „Bus 91“.',
    es: 'Escribe una línea, por ejemplo «RER B» o «Bus 91».',
  },
  searchLineNone: {
    en: 'No line matches "{query}".',
    fr: 'Aucune ligne ne correspond à « {query} ».',
    de: 'Keine Linie passt zu „{query}“.',
    es: 'Ninguna línea coincide con «{query}».',
  },
  searchLineFound: {
    en: '{list}. Copy the identifier of the right line into a line field.',
    fr: '{list}. Copiez l’identifiant de la bonne ligne dans un champ de ligne.',
    de: '{list}. Kopiere die Kennung der richtigen Linie in ein Linienfeld.',
    es: '{list}. Copia el identificador de la línea correcta en un campo de línea.',
  },
  kindTrain: { en: 'train', fr: 'train', de: 'Zug', es: 'tren' },
  kindMetro: { en: 'metro', fr: 'métro', de: 'Metro', es: 'metro' },
  kindTram: { en: 'tram', fr: 'tram', de: 'Tram', es: 'tranvía' },
  kindBus: { en: 'bus', fr: 'bus', de: 'Bus', es: 'autobús' },
};

/**
 * @description Whether a language is one the texts are written in.
 * @param {unknown} language - The language.
 * @returns {boolean} True for en, fr, de and es.
 * @example
 * isLanguage('de'); // -> true
 */
function isLanguage(language) {
  return LANGUAGES.includes(language);
}

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
 * @returns {{ en: string, fr: string, de: string, es: string }} The message.
 * @example
 * all('statusQuota', { time: '14:00' });
 */
function all(key, values = {}) {
  const of = (language) => (typeof values === 'function' ? values(language) : values);
  return Object.fromEntries(
    LANGUAGES.map((language) => [language, t(key, language, of(language))]),
  );
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

export {
  LANGUAGES,
  TEXTS,
  isLanguage,
  t,
  all,
  sentence,
  departureLabel,
  stateText,
  nextLine,
  lineStateText,
};
