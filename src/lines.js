// -----------------------------------------------------------------------------
// The lines of the network.
//
// The form takes a line the way a rider says it: "RER B", "B", "Transilien
// P", "Ligne P", "Métro 13", "M13", "13", "T3a", "Tram 2", "Bus 91", or its
// id in the reference data ("C01743", what the "Find a line" button shows).
// Without a mode, a single letter is a train line (RER A–E, Transilien H–V)
// and a number a metro line before a bus one: "B" is the RER B, "13" the
// metro 13. A bus line needs "Bus" — and its id when several networks share
// the number.
//
// Lines are read from the open data portal (no PRIM quota) and remembered in
// /data: what the user typed, and every line met in a departure (the SIRI
// answers only carry the id, "STIF:Line::C01743:").
// -----------------------------------------------------------------------------

const LINE_ID_REGEX = /(?:^|[:\s])(C\d{5})(?::|$)/i;
const MAX_CACHE_ENTRIES = 300;
// Without a mode: train lines first, then metro, tram, the rest, and bus.
const MODE_RANK = { rail: 0, metro: 1, tram: 2, funicular: 3, cableway: 3, bus: 4 };

/**
 * @description Remove the accents and lower a text.
 * @param {unknown} value - The text.
 * @returns {string} The folded text.
 * @example
 * fold('Métro'); // -> 'metro'
 */
function fold(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * @description The line id of a SIRI or Navitia reference.
 * @param {unknown} ref - "STIF:Line::C01743:", "line:IDFM:C01743", "C01743".
 * @returns {string} "C01743", '' when none.
 * @example
 * lineIdOf('STIF:Line::C01743:'); // -> 'C01743'
 */
function lineIdOf(ref) {
  const match = LINE_ID_REGEX.exec(String(ref ?? '').trim());
  return match ? match[1].toUpperCase() : '';
}

/**
 * @description Understand a typed line.
 * @param {unknown} input - "RER B", "M13", "Tram 2", "C01743"…
 * @returns {{ id?: string, mode?: string|null, network?: string|null, names?: string[] }|null}
 * An id, or the spellings of a short name with an optional mode; null when empty.
 * @example
 * parseLineInput('RER B'); // -> { mode: 'rail', network: 'RER', names: ['B'] }
 */
function parseLineInput(input) {
  const text = String(input ?? '').trim();
  const id = lineIdOf(text);
  if (id) {
    return { id };
  }
  let rest = fold(text).replace(/\s+/g, ' ');
  if (!rest) {
    return null;
  }
  let mode = null;
  let network = null;
  const prefixes = [
    [/^rer\s*/, 'rail', 'RER'],
    [/^transilien\s*/, 'rail', 'Transilien'],
    [/^(?:train|ligne)\s+(?=[a-z]$)/, 'rail', null],
    [/^(?:metro|m)\s*(?=\d)/, 'metro', null],
    [/^metro\s*/, 'metro', null],
    [/^(?:tramway|tram)\s*/, 'tram', null],
    [/^(?:bus|noctilien)\s*/, 'bus', null],
    [/^ligne\s+/, null, null],
  ];
  for (const [regex, prefixMode, prefixNetwork] of prefixes) {
    if (regex.test(rest)) {
      rest = rest.replace(regex, '');
      mode = prefixMode;
      network = prefixNetwork;
      break;
    }
  }
  rest = rest.replace(/\s*bis$/, 'b').replace(/\s+/g, ' ');
  if (!rest) {
    return null;
  }
  if (mode === 'tram' && /^\d/.test(rest)) {
    rest = `t${rest}`;
  }
  if (!mode && /^t\d+[a-z]?$/.test(rest)) {
    mode = 'tram';
  }
  const upper = rest.toUpperCase();
  // "T3a", "3B", "N01", "CDG VAL": the reference data mixes cases.
  const names = [
    ...new Set([upper, rest, upper.replace(/^(T\d+)([A-Z])$/, (_, a, b) => a + b.toLowerCase())]),
  ];
  return { mode, network, names };
}

/**
 * @description The name of a line, as riders say it.
 * @param {object} line - The line (opendata.toLine).
 * @returns {string} "RER B", "Transilien P", "Métro 13", "T3a", "Bus 91".
 * @example
 * lineName({ mode: 'metro', short: '13' }); // -> 'Métro 13'
 */
function lineName(line) {
  const short = line.short || line.name || line.id;
  switch (line.mode) {
    case 'metro':
      return `Métro ${short.replace(/^(\d+)B$/, '$1bis')}`;
    case 'tram':
      return /^T/i.test(short) ? short : `T${short}`;
    case 'rail':
      if (/^(RER|Transilien)$/i.test(line.network) && short.length <= 2) {
        return `${line.network} ${short}`;
      }
      return line.group || short;
    case 'bus':
      return `Bus ${short}`;
    default:
      return line.group || short;
  }
}

/**
 * @description Pick the best line among the candidates of a typed name.
 * @param {object[]} candidates - The lines found.
 * @param {{ mode: string|null, network: string|null }} wanted - What was typed.
 * @returns {object|null} The line.
 */
function pickLine(candidates, { mode, network }) {
  const usable = candidates
    .filter((line) => line.active && !line.replacement)
    .filter((line) => !mode || line.mode === mode)
    .filter((line) => !network || fold(line.network) === fold(network));
  usable.sort((a, b) => (MODE_RANK[a.mode] ?? 3) - (MODE_RANK[b.mode] ?? 3));
  return usable[0] ?? null;
}

/**
 * @description Create the line resolver.
 * @param {object} options - Options.
 * @param {object} options.opendata - The open data client.
 * @param {object} [options.store] - Where the lines are remembered.
 * @returns {object} The resolver.
 * @example
 * const lines = createLines({ opendata, store: createStore('lines.json') });
 * await lines.resolve('RER B'); // -> { id: 'C01743', name: 'RER B', … }
 */
function createLines({ opendata, store = null }) {
  // { typed: { "rer b": "C01743" }, lines: { C01743: { id, name, short, mode, color } } }
  let cache = { typed: {}, lines: {} };
  let loaded = false;

  const load = async () => {
    if (!loaded) {
      const saved = store ? await store.load(null) : null;
      if (saved && typeof saved === 'object' && saved.typed && saved.lines) {
        cache = saved;
      }
      loaded = true;
    }
  };

  const save = () => {
    const ids = Object.keys(cache.lines);
    if (ids.length > MAX_CACHE_ENTRIES) {
      ids.slice(0, ids.length - MAX_CACHE_ENTRIES).forEach((id) => delete cache.lines[id]);
    }
    store?.save(cache);
  };

  const remember = (line) => {
    const entry = {
      id: line.id,
      name: lineName(line),
      short: line.short,
      mode: line.mode,
      color: line.color,
    };
    cache.lines[line.id] = entry;
    return entry;
  };

  return {
    /**
     * @description Resolve what the user typed.
     * @param {string} input - A line name or id.
     * @returns {Promise<object|null>} `{ id, name, short, mode, color }`, null when none matches.
     * @throws {OpenDataError} When the portal fails.
     */
    async resolve(input) {
      await load();
      const key = fold(input);
      if (!key) {
        return null;
      }
      if (cache.typed[key] && cache.lines[cache.typed[key]]) {
        return cache.lines[cache.typed[key]];
      }
      const parsed = parseLineInput(input);
      if (!parsed) {
        return null;
      }
      let line;
      if (parsed.id) {
        [line = null] = await opendata.linesById([parsed.id]);
      } else {
        line = pickLine(await opendata.linesByShortName(parsed.names), parsed);
      }
      if (!line) {
        return null;
      }
      const entry = remember(line);
      cache.typed[key] = entry.id;
      save();
      return entry;
    },

    /**
     * @description Make sure the lines met in departures are known.
     * @param {string[]} ids - Line ids.
     * @returns {Promise<void>} Never fails: an unknown line keeps its id as name.
     */
    async learn(ids) {
      await load();
      const missing = [...new Set(ids)].filter((id) => id && !cache.lines[id]).slice(0, 50);
      if (missing.length === 0) {
        return;
      }
      try {
        (await opendata.linesById(missing)).forEach(remember);
        save();
      } catch {
        // The names are a nicety: the departures show the id meanwhile.
      }
    },

    /**
     * @description A known line, without any request.
     * @param {string} id - "C01743".
     * @returns {object|null} The line.
     */
    peek(id) {
      return cache.lines[id] ?? null;
    },

    /**
     * @description The line already resolved for a typed name, without any request.
     * @param {string} input - What the user typed.
     * @returns {object|null} The line.
     */
    peekTyped(input) {
      const id = cache.typed[fold(input)];
      return id ? (cache.lines[id] ?? null) : null;
    },

    /**
     * @description Search lines for the "Find a line" button.
     * @param {string} input - A typed line.
     * @returns {Promise<object[]>} The active lines matching, best first.
     */
    async search(input) {
      const parsed = parseLineInput(input);
      if (!parsed) {
        return [];
      }
      const found = parsed.id
        ? await opendata.linesById([parsed.id])
        : await opendata.linesByShortName(parsed.names);
      return found
        .filter((line) => line.active && !line.replacement)
        .filter((line) => !parsed.mode || line.mode === parsed.mode)
        .sort((a, b) => (MODE_RANK[a.mode] ?? 3) - (MODE_RANK[b.mode] ?? 3))
        .map((line) => ({ ...line, label: lineName(line) }));
    },
  };
}

export { fold, lineIdOf, parseLineInput, lineName, pickLine, createLines };
