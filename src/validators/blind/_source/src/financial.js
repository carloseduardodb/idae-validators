// ===================================================================
// Domain: financial
// ===================================================================

// ---- V0 (format-level), copied ----
function v0(o) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return false;
  if (typeof o.audit_id !== 'string' || !o.audit_id.trim()) return false;
  if (typeof o.value_in_usd !== 'number' || !Number.isFinite(o.value_in_usd) || o.value_in_usd <= 0) return false;
  if (typeof o.date !== 'string' || !/^\d{2}\/\d{2}\/\d{4}$/.test(o.date)) return false;
  const [d, m, y] = o.date.split('/').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCDate() !== d || dt.getUTCMonth() !== m - 1) return false;
  if (o.category !== 'domestic' && o.category !== 'international') return false;
  if (o.status !== 'valid' && o.status !== 'invalid') return false;
  return true;
}

const RATES = { BRL: 0.2, USD: 1, EUR: 1.1, GBP: 1.27 };
const VAL_TOL = 0.0051; // output may be rounded to cents

// Currency evidence: ISO codes (any case), informal names, symbols.
const CUR_PATTERNS = [
  ['BRL', /(?<![A-Za-z])(brl|reais|real)(?![A-Za-z])/gi, 'word'],
  ['BRL', /R\$/g, 'sym'],
  ['USD', /(?<![A-Za-z])(usd|d[oó]lar(?:es)?|dollars?)(?![A-Za-z])/gi, 'word'],
  ['USD', /US\$|(?<![A-Za-z])\$/g, 'sym'],
  ['EUR', /(?<![A-Za-z])(eur|euros?)(?![A-Za-z])/gi, 'word'],
  ['EUR', /€/g, 'sym'],
  ['GBP', /(?<![A-Za-z])(gbp|libras?|pounds?|sterling)(?![A-Za-z])/gi, 'word'],
  ['GBP', /£/g, 'sym'],
];
function currencyOccs(s) {
  const out = [];
  for (const [cur, re, kind] of CUR_PATTERNS) {
    re.lastIndex = 0; let m;
    while ((m = re.exec(s))) {
      const st = m.index, en = st + m[0].length;
      const standalone = kind === 'sym' || (!/[A-Za-z0-9_]/.test(s[st - 1] || '') && !/[A-Za-z0-9_]/.test(s[en] || ''));
      out.push({ cur, start: st, end: en, text: m[0], kind, standalone });
    }
  }
  return out;
}

// Shared analysis of the raw string for a given output.
function analyze(raw, o) {
  const idSpans = tokenSpans(raw, o.audit_id);
  const dates = dateCands(raw);
  const masked = maskSpans(raw, [...idSpans, ...dates]);
  const curOccs = currencyOccs(masked);
  const curs = new Set(curOccs.map(c => c.cur));
  const nums = numberCands(masked).filter(n => n.value > 0);
  // rates the category allows (BRL <-> domestic; USD value may be pre-converted)
  const rates = o.category === 'domestic'
    ? ['BRL', ...(curs.has('USD') ? ['USD'] : [])]
    : [...curs].filter(c => c !== 'BRL');
  const amountMatches = [];
  for (const n of nums) for (const c of rates) if (close(n.value * RATES[c], o.value_in_usd, VAL_TOL)) amountMatches.push({ n, cur: c });
  const utcDates = new Set([...instantCands(raw, dates)].map(dmyUTC));
  return { idSpans, dates, curOccs, curs, amountMatches, utcDates };
}

// ---- V2: property / relational validator ----
export function property(o, raw) {
  if (!v0(o) || typeof raw !== 'string') return false;
  // telos: status is always "valid" for an accepted record
  if (o.status !== 'valid') return false;
  // audit_id copied verbatim: appears as a whole token in the input
  if (o.audit_id !== o.audit_id.trim()) return false;
  const a = analyze(raw, o);
  if (!a.idSpans.length) return false;
  // missing currency => reject: some supported currency must be named
  if (!a.curs.size) return false;
  // category derived from currency (BRL => domestic, else international)
  if (o.category === 'domestic' && !a.curs.has('BRL')) return false;
  if (o.category === 'international' && ![...a.curs].some(c => c !== 'BRL')) return false;
  // value_in_usd = (positive amount in input) x (exact rate of a named currency)
  if (!a.amountMatches.length) return false;
  // date = UTC calendar date of a date/time present in the input
  if (a.utcDates.size) { if (!a.utcDates.has(o.date)) return false; }
  else if (!tokenSpans(raw, o.date.slice(6), '0-9').length) return false; // missing date => reject
  return true;
}

// ---- V3: metamorphic validator ----
const SWAP = { brl: 'eur', usd: 'eur', eur: 'gbp', gbp: 'eur', real: 'euro', dolar: 'euro', 'dólar': 'euro', dollar: 'euro', euro: 'libra', libra: 'euro', pound: 'euro' };
const NAME_CUR = { eur: 'EUR', gbp: 'GBP', euro: 'EUR', libra: 'GBP' };
function sameCase(model, s) {
  if (model === model.toUpperCase()) return s.toUpperCase();
  if (model[0] === model[0].toUpperCase()) return s[0].toUpperCase() + s.slice(1);
  return s;
}
function shiftDMY(dmy, n) { const [d, m, y] = dmy.split('/').map(Number); return dmyUTC(Date.UTC(y, m - 1, d + n)); }

export function metamorphic(run, raw, out) {
  const a = analyze(raw, out);

  // R1 identifier: renaming the id token changes only audit_id
  const newId = mutateId(out.audit_id, raw);
  if (newId && a.idSpans.length) {
    const o2 = safeRun(run, replaceSpans(raw, a.idSpans.map(s => ({ ...s, text: newId }))));
    if (!o2 || o2.audit_id !== newId || !sameExcept(out, o2, ['audit_id'])) return false;
  }

  // amount token: the unique input number that explains value_in_usd
  const spans = new Set(a.amountMatches.map(m => m.n.start + ':' + m.n.end));
  const am = spans.size === 1 ? a.amountMatches[0] : null;

  if (am) {
    // R2 linearity: doubling the amount doubles value_in_usd, nothing else changes
    const o2 = safeRun(run, replaceSpans(raw, [{ ...am.n, text: formatLike(am.n.style, am.n.value * 2) }]));
    if (!o2 || !close(o2.value_in_usd, am.n.value * 2 * RATES[am.cur], VAL_TOL) || !sameExcept(out, o2, ['value_in_usd'])) return false;
    // R3 zero amount must be rejected
    const o3 = safeRun(run, replaceSpans(raw, [{ ...am.n, text: formatLike(am.n.style, 0) }]));
    if (o3) return false;
  }

  // R4 date: moving every date token one day later moves `date` one day later
  const shifted = shiftDates(raw, a.dates, 1);
  if (shifted) {
    const o2 = safeRun(run, shifted);
    if (!o2 || o2.date !== shiftDMY(out.date, 1) || !sameExcept(out, o2, ['date'])) return false;
  }

  // Currency relations only when exactly one currency is named, in standalone tokens
  const occ = a.curOccs;
  if (a.curs.size === 1 && occ.every(c => c.standalone)) {
    // R5 swap currency word/code: rate and category follow the new currency
    if (am && occ.every(c => c.kind === 'word' && SWAP[c.text.toLowerCase()])) {
      const to = SWAP[occ[0].text.toLowerCase()];
      if (occ.every(c => SWAP[c.text.toLowerCase()] && NAME_CUR[SWAP[c.text.toLowerCase()]] === NAME_CUR[to])) {
        const cur2 = NAME_CUR[to];
        const o2 = safeRun(run, replaceSpans(raw, occ.map(c => ({ ...c, text: sameCase(c.text, SWAP[c.text.toLowerCase()]) }))));
        if (!o2 || !close(o2.value_in_usd, am.n.value * RATES[cur2], VAL_TOL) ||
            o2.category !== (cur2 === 'BRL' ? 'domestic' : 'international') ||
            !sameExcept(out, o2, ['value_in_usd', 'category'])) return false;
      }
    }
    // R6 missing currency must be rejected (never guessed)
    const o3 = safeRun(run, replaceSpans(raw, occ.map(c => ({ ...c, text: '' }))));
    if (o3) return false;
  }
  return true;
}
