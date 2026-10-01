// ===================================================================
// Domain: iot
// ===================================================================

// ---- V0 (format-level), copied ----
const METRICS = ['temperature', 'humidity', 'pressure'];
const ZONES = ['north', 'south', 'east', 'west'];
const TS_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const RANGES = { temperature: [-60, 70], humidity: [0, 100], pressure: [850, 1100] };
function v0(o) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return false;
  if (typeof o.device_id !== 'string' || !o.device_id.trim()) return false;
  if (!METRICS.includes(o.metric)) return false;
  if (typeof o.value !== 'number' || !Number.isFinite(o.value)) return false;
  const [lo, hi] = RANGES[o.metric];
  if (o.value < lo || o.value > hi) return false;
  if (typeof o.timestamp_utc !== 'string' || !TS_RE.test(o.timestamp_utc) || isNaN(Date.parse(o.timestamp_utc))) return false;
  if (!['normal', 'warning', 'critical'].includes(o.status)) return false;
  if (!ZONES.includes(o.zone)) return false;
  return true;
}
function statusOf(metric, v) {
  if (metric === 'temperature') return v > 40 || v < -5 ? 'critical' : v > 30 || v < 0 ? 'warning' : 'normal';
  if (metric === 'humidity') return v > 90 ? 'critical' : v > 75 ? 'warning' : 'normal';
  return v < 960 || v > 1040 ? 'critical' : v < 980 || v > 1030 ? 'warning' : 'normal';
}

// ---- evidence in the raw string ----
const METRIC_EV = {
  temperature: /(?<![A-Za-z])(temp|therm)/i,
  humidity: /(?<![A-Za-z])(hum|umid|rh(?![A-Za-z]))/i,
  pressure: /(?<![A-Za-z])(press|baro)/i,
};
// a single capital letter standing alone as a token (e.g. "|F|", "311.92,K")
const letter = (s, c) => new RegExp(`(?<![A-Za-z0-9_\\-])${c}(?![A-Za-z0-9_\\-])`).test(s);
const UNIT_EV = {
  C: s => /[°º]\s?C|celsius|centigrad|degC/i.test(s) || letter(s, 'C'),
  F: s => /[°º]\s?F|fahrenheit|degF/i.test(s) || letter(s, 'F'),
  K: s => /[°º]\s?K|kelvin/i.test(s) || letter(s, 'K'),
  kPa: s => /kpa/i.test(s),
  hPa: s => /hpa|mbar|millibar/i.test(s),
  Pa: s => /pascal/i.test(s) || /(?<![A-Za-z0-9_\-])Pa(?![A-Za-z])/.test(s),
};

// Conversions to the canonical unit that the unit evidence allows.
function conversions(metric, s) {
  const has = k => UNIT_EV[k](s);
  const out = [];
  if (metric === 'temperature') {
    if (has('C') || (!has('F') && !has('K'))) out.push(['C', x => x]);
    if (has('F')) out.push(['F', x => (x - 32) * 5 / 9]);
    if (has('K')) out.push(['K', x => x - 273.15]);
  } else if (metric === 'humidity') out.push(['%', x => x]);
  else {
    if (has('hPa') || (!has('kPa') && !has('Pa'))) out.push(['hPa', x => x]);
    if (has('kPa')) out.push(['kPa', x => x * 10]);
  }
  return out;
}

// Zone tokens: words (en/pt), single letters N/S/E/W, vendor zone-A..D.
const ZONE_PATTERNS = [
  [/(?<![A-Za-z])(north|norte)(?![A-Za-z])/gi, 'north'], [/(?<![A-Za-z])(south|sul)(?![A-Za-z])/gi, 'south'],
  [/(?<![A-Za-z])(east|leste)(?![A-Za-z])/gi, 'east'], [/(?<![A-Za-z])(west|oeste)(?![A-Za-z])/gi, 'west'],
  [/(?<![A-Za-z0-9_\-])N(?![A-Za-z0-9_\-])/g, 'north'], [/(?<![A-Za-z0-9_\-])S(?![A-Za-z0-9_\-])/g, 'south'],
  [/(?<![A-Za-z0-9_\-])E(?![A-Za-z0-9_\-])/g, 'east'], [/(?<![A-Za-z0-9_\-])W(?![A-Za-z0-9_\-])/g, 'west'],
];
const VENDOR = { a: 'north', b: 'south', c: 'east', d: 'west' };
function zoneOccs(s) {
  const out = [];
  for (const [re, zone] of ZONE_PATTERNS) { re.lastIndex = 0; let m; while ((m = re.exec(s))) out.push({ zone, start: m.index, end: m.index + m[0].length, text: m[0] }); }
  const vre = /(?<![A-Za-z])zone[\s_\-]?([A-Da-d])(?![A-Za-z0-9])/gi; let m;
  while ((m = vre.exec(s))) out.push({ zone: VENDOR[m[1].toLowerCase()], start: m.index, end: m.index + m[0].length, text: m[0], vendor: true });
  return out;
}
const ZONE_SWAP_WORD = { north: 'south', south: 'north', east: 'west', west: 'east', norte: 'sul', sul: 'norte', leste: 'oeste', oeste: 'leste' };
const ZONE_SWAP_LETTER = { N: 'S', S: 'N', E: 'W', W: 'E', A: 'B', B: 'A', C: 'D', D: 'C', a: 'b', b: 'a', c: 'd', d: 'c' };
function swapZoneText(t, vendor) {
  if (vendor) return t.slice(0, -1) + ZONE_SWAP_LETTER[t.slice(-1)];
  if (t.length === 1) return ZONE_SWAP_LETTER[t];
  const w = ZONE_SWAP_WORD[t.toLowerCase()];
  return t === t.toUpperCase() ? w.toUpperCase() : t[0] === t[0].toUpperCase() ? w[0].toUpperCase() + w.slice(1) : w;
}
const OTHER_ZONE = { north: 'south', south: 'north', east: 'west', west: 'east' };

const round2 = x => Math.round(x * 100) / 100;
const VAL_TOL = 0.00501;

function analyze(raw, o) {
  const idSpans = tokenSpans(raw, o.device_id);
  const dates = dateCands(raw);
  const masked = maskSpans(raw, [...idSpans, ...dates]);
  const convs = METRICS.includes(o.metric) ? conversions(o.metric, masked) : [];
  const nums = numberCands(masked);
  const valueMatches = [];
  for (const n of nums) for (const [u, f] of convs) if (close(f(n.value), o.value, VAL_TOL)) valueMatches.push({ n, u, f });
  const instants = new Set([...instantCands(raw, dates)].map(isoSec));
  return { idSpans, dates, masked, valueMatches, instants, zones: zoneOccs(masked) };
}

// ---- V2: property / relational validator ----
export function property(o, raw) {
  if (!v0(o) || typeof raw !== 'string') return false;
  // status is derived from the canonical value
  if (o.status !== statusOf(o.metric, o.value)) return false;
  // value rounded to 2 decimals
  if (Math.abs(o.value * 100 - Math.round(o.value * 100)) > 1e-6) return false;
  // device_id copied verbatim: whole token in the input
  if (o.device_id !== o.device_id.trim()) return false;
  const a = analyze(raw, o);
  if (!a.idSpans.length) return false;
  // missing metric => reject: the metric (or its abbreviation) is named in the input
  if (!METRIC_EV[o.metric].test(a.masked)) return false;
  // missing zone => reject: the output zone is named (word, letter or vendor zone)
  if (!a.zones.some(z => z.zone === o.zone)) return false;
  // value = unit conversion (allowed by the input's unit evidence) of an input number
  if (!a.valueMatches.length) return false;
  // timestamp_utc = an instant (date [+ time] [+ offset], or epoch) present in the input
  if (a.instants.size) { if (!a.instants.has(o.timestamp_utc)) return false; }
  else if (!tokenSpans(raw, o.timestamp_utc.slice(0, 4), '0-9').length) return false;
  return true;
}

// ---- V3: metamorphic validator ----
export function metamorphic(run, raw, out) {
  const a = analyze(raw, out);

  // R1 identifier: renaming the device token changes only device_id
  const newId = mutateId(out.device_id, raw);
  if (newId && a.idSpans.length) {
    const o2 = safeRun(run, replaceSpans(raw, a.idSpans.map(s => ({ ...s, text: newId }))));
    if (!o2 || o2.device_id !== newId || !sameExcept(out, o2, ['device_id'])) return false;
  }

  // value token: unique input number (with a unique conversion) explaining value
  const spans = new Set(a.valueMatches.map(m => m.n.start + ':' + m.n.end));
  const vm = spans.size === 1 && new Set(a.valueMatches.map(m => m.u)).size === 1 ? a.valueMatches[0] : null;
  if (vm) {
    // R2 conversion follows the input: raw+1 => conv(raw+1); status re-derived
    const [lo, hi] = RANGES[out.metric];
    let n2 = vm.n.value + 1;
    if (vm.f(n2) > hi - 1) n2 = vm.n.value - 1;
    const exp = vm.f(n2);
    if (exp >= lo && exp <= hi) {
      const o2 = safeRun(run, replaceSpans(raw, [{ ...vm.n, text: formatLike(vm.n.style, n2) }]));
      if (!o2 || !close(o2.value, exp, VAL_TOL) || o2.status !== statusOf(out.metric, o2.value) ||
          !sameExcept(out, o2, ['value', 'status'])) return false;
    }
    // R3 physically impossible value must be rejected
    const o3 = safeRun(run, replaceSpans(raw, [{ ...vm.n, text: formatLike(vm.n.style, 9999) }]));
    if (o3) return false;
  }

  // R4 time: every date token one day later => timestamp_utc exactly +24h
  const shifted = shiftDates(raw, a.dates, 1);
  if (shifted) {
    const o2 = safeRun(run, shifted);
    if (!o2 || o2.timestamp_utc !== isoSec(Date.parse(out.timestamp_utc) + DAY_MS) || !sameExcept(out, o2, ['timestamp_utc'])) return false;
  }

  // R5 zone: swapping the (unambiguous) zone token swaps only the zone
  const mine = a.zones.filter(z => z.zone === out.zone);
  if (mine.length && a.zones.length === mine.length) {
    const o2 = safeRun(run, replaceSpans(raw, mine.map(z => ({ ...z, text: swapZoneText(z.text, z.vendor) }))));
    if (!o2 || o2.zone !== OTHER_ZONE[out.zone] || !sameExcept(out, o2, ['zone'])) return false;
  }
  return true;
}
