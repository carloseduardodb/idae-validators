// ===================================================================
// Domain: usgs-corrected / usgs-strict (STRICT is set per file by build)
// ===================================================================

// ---- V0 (format-level), copied. baseValid was not shown in the V0 file;
// it is reconstructed from the telos field list (see NOTES.md). ----
const MAG_TYPES = new Set(['ml', 'md', 'mb', 'mw', 'mww', 'mwb', 'mwc', 'mwr', 'ms', 'mb_lg', 'mi', 'mh']);
const TS_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
function baseValid(o) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return false;
  if (typeof o.event_id !== 'string' || !o.event_id.trim()) return false;
  if (typeof o.magnitude !== 'number' || !Number.isFinite(o.magnitude)) return false;
  if (!MAG_TYPES.has(o.magnitude_type)) return false;
  if (typeof o.latitude !== 'number' || !(o.latitude >= -90 && o.latitude <= 90)) return false;
  if (typeof o.longitude !== 'number' || !(o.longitude >= -180 && o.longitude <= 180)) return false;
  if (typeof o.timestamp_utc !== 'string' || !TS_RE.test(o.timestamp_utc) || isNaN(Date.parse(o.timestamp_utc))) return false;
  if (typeof o.place !== 'string' || !o.place.trim()) return false;
  if (typeof o.event_type !== 'string') return false;
  if (o.status !== 'reviewed' && o.status !== 'automatic') return false;
  return true;
}
function validatorCorrected(o) {
  if (!baseValid(o)) return false;
  if (typeof o.depth_km !== 'number' || o.depth_km < -10 || o.depth_km > 800) return false;
  if (o.significance !== null && (!Number.isInteger(o.significance) || o.significance < 0 || o.significance > 2500)) return false;
  return true;
}
function validatorOriginal(o) {
  if (!baseValid(o)) return false;
  if (typeof o.depth_km !== 'number' || o.depth_km < 0 || o.depth_km > 800) return false;
  if (!Number.isInteger(o.significance) || o.significance < 0 || o.significance > 2500) return false;
  return true;
}
const v0 = o => (STRICT ? validatorOriginal(o) : validatorCorrected(o));

// ---- generic evidence ----
// Whole numeric tokens (JSON / CSV / XML-safe boundaries) with their spans.
function numTokens(raw) {
  const out = []; const re = /(?<![\w.])-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?(?![\w.])/g; let m;
  while ((m = re.exec(raw))) out.push({ value: Number(m[0]), text: m[0], start: m.index, end: m.index + m[0].length, idx: out.length });
  return out;
}
const spansOf = (nums, v) => nums.filter(n => close(n.value, v, 1e-9));
// "sig" key followed by its value (the telos names the source field "sig")
function sigField(raw) {
  const m = /(?<![A-Za-z])sig(?![A-Za-z])[^A-Za-z0-9\-]{1,4}(-?\d+(?:\.\d+)?|null)/i.exec(raw);
  if (!m) return { word: /(?<![A-Za-z])sig(?![A-Za-z])/i.test(raw), val: undefined };
  const start = m.index + m[0].length - m[1].length;
  return { word: true, val: m[1] === 'null' ? null : Number(m[1]), start, end: start + m[1].length, text: m[1] };
}
// All alphanumeric runs of the input.
const alnumRuns = raw => raw.match(/[A-Za-z0-9_]+/g) || [];
// Place strings may be JSON-escaped or CSV-quoted in the input.
function containsVerbatim(raw, s) {
  return raw.includes(s) || raw.includes(JSON.stringify(s).slice(1, -1)) || raw.includes(s.replace(/"/g, '""'));
}
const GEOJSON_STRUCT = new Set(['Feature', 'FeatureCollection', 'Point', 'Geometry']);

// Distinct-token assignment for [magnitude, latitude, longitude, depth]:
// each field needs its own token, and lat/lon/depth must be a location group
// (within a few numeric tokens of each other, as the coordinate triple is).
const NEAR = 4;
function assignDistinct(lists, pick = []) {
  const i = pick.length;
  if (i === lists.length) {
    const [, la, lo, de] = pick;
    return Math.abs(la.idx - lo.idx) <= NEAR && Math.abs(de.idx - la.idx) <= NEAR && Math.abs(de.idx - lo.idx) <= NEAR;
  }
  for (const t of lists[i]) if (!pick.some(p => p.start === t.start) && assignDistinct(lists, [...pick, t])) return true;
  return false;
}

function analyze(raw, o) {
  const nums = numTokens(raw);
  const dates = dateCands(raw).filter(c => c.hasTime);
  const instants = [...new Set(dates.map(c => isoSec(c.ms)))].sort();
  return { nums, dates, instants, sig: sigField(raw) };
}

// ---- V2: property / relational validator ----
export function property(o, raw) {
  if (!v0(o) || typeof raw !== 'string') return false;
  const a = analyze(raw, o);
  // event_id verbatim, and the full id (net+code), not a fragment of a longer token
  if (!tokenSpans(raw, o.event_id, 'A-Za-z0-9_').length) return false;
  if (alnumRuns(raw).some(r => r !== o.event_id && r.includes(o.event_id))) return false;
  // magnitude_type is the input's magType lowercased
  if (!tokenSpans(raw.toLowerCase(), o.magnitude_type, 'A-Za-z0-9_').length) return false;
  // magnitude, latitude, longitude, depth copied from input numbers, each from its own
  // token; lat/lon/depth adjacent (coordinate triple)
  const lists = [o.magnitude, o.latitude, o.longitude, o.depth_km].map(v => spansOf(a.nums, v));
  if (lists.some(l => !l.length) || !assignDistinct(lists)) return false;
  if (o.latitude === o.longitude && lists[1].length < 2) return false;
  // place verbatim; not the "M x.y - place" title
  if (!containsVerbatim(raw, o.place) || !/[A-Za-z]/.test(o.place)) return false;
  const t = /^M\s*-?\d+(?:\.\d+)?\s+-\s+(.+)$/.exec(o.place);
  if (t && containsVerbatim(raw, t[1])) return false;
  // event_type verbatim, not a GeoJSON structural word, not another field
  if (!o.event_type.trim() || !containsVerbatim(raw, o.event_type) || GEOJSON_STRUCT.has(o.event_type)) return false;
  if (o.event_type === o.place || o.event_type === o.status) return false;
  // status is stated in the input
  if (!tokenSpans(raw.toLowerCase(), o.status, 'A-Za-z').length) return false;
  // timestamp = origin time: an instant in the input, and the earliest one (updated >= time)
  if (a.instants.length) { if (o.timestamp_utc !== a.instants[0]) return false; }
  else if (!tokenSpans(raw, o.timestamp_utc.slice(0, 4), '0-9').length) return false;
  // significance taken from "sig"; corrected: null iff no such field; strict: must exist
  if (STRICT) {
    if (typeof a.sig.val !== 'number' || o.significance !== a.sig.val) return false;
  } else if (a.sig.val !== undefined) {
    if (o.significance !== a.sig.val) return false;
  } else if (a.sig.word) {
    if (o.significance !== null && !spansOf(a.nums, o.significance).length) return false;
  } else if (o.significance !== null) return false;
  return true;
}

// ---- V3: metamorphic validator ----
function bumpText(text, delta) {
  const dec = (text.split('.')[1] || '').length;
  return (Number(text) + delta).toFixed(dec);
}
const negText = t => (t.startsWith('-') ? t.slice(1) : '-' + t);

export function metamorphic(run, raw, out) {
  const a = analyze(raw, out);
  const KEEP = ['event_id', 'magnitude', 'magnitude_type', 'latitude', 'longitude', 'timestamp_utc', 'place', 'event_type', 'status', 'depth_km', 'significance'];
  const only = (o2, changed) => sameExcept(out, o2, [...Object.keys(out).filter(k => !KEEP.includes(k)), ...changed]);

  // R1 identifier: renaming the id token changes only event_id
  const newId = mutateId(out.event_id, raw);
  const idSpans = tokenSpans(raw, out.event_id, 'A-Za-z0-9_');
  if (newId && idSpans.length) {
    const o2 = safeRun(run, replaceSpans(raw, idSpans.map(s => ({ ...s, text: newId }))));
    if (!o2 || o2.event_id !== newId || !only(o2, ['event_id'])) return false;
  }

  // R2 magnitude +1 and depth changed: both follow the input verbatim
  const magS = spansOf(a.nums, out.magnitude), depS = spansOf(a.nums, out.depth_km);
  const latS = spansOf(a.nums, out.latitude), lonS = spansOf(a.nums, out.longitude);
  const coordStarts = new Set([...latS, ...lonS].map(s => s.start));
  if (magS.length && !magS.some(s => coordStarts.has(s.start))) {
    const edits = magS.map(s => ({ ...s, text: bumpText(s.text, 1) }));
    const newMag = Number(edits[0].text);
    let newDepth = null;
    if (depS.length === 1 && !magS.some(s => s.start === depS[0].start) && !coordStarts.has(depS[0].start)) {
      // corrected telos: negative depths are valid and must be kept; strict: depth+1
      const t = STRICT ? bumpText(depS[0].text, 1) : '-1.5';
      newDepth = Number(t); edits.push({ ...depS[0], text: t });
    }
    const o2 = safeRun(run, replaceSpans(raw, edits));
    if (!o2 || !close(o2.magnitude, newMag, 1e-9)) return false;
    if (newDepth !== null && !close(o2.depth_km, newDepth, 1e-9)) return false;
    if (!sameExcept(out, o2, Object.keys(out).filter(k => !['event_id', 'latitude', 'longitude', 'timestamp_utc', 'place'].includes(k)))) return false;
  }

  // R3 coordinates: negating the lat and lon tokens negates latitude and longitude
  if (latS.length === 1 && lonS.length === 1 && latS[0].start !== lonS[0].start && out.latitude !== 0 && out.longitude !== 0) {
    const o2 = safeRun(run, replaceSpans(raw, [{ ...latS[0], text: negText(latS[0].text) }, { ...lonS[0], text: negText(lonS[0].text) }]));
    if (!o2 || !close(o2.latitude, -out.latitude, 1e-9) || !close(o2.longitude, -out.longitude, 1e-9) || !only(o2, ['latitude', 'longitude'])) return false;
  }

  // R4 origin time: moving the origin-time token one day earlier moves timestamp_utc by -24h
  const tc = a.dates.filter(c => isoSec(c.ms) === out.timestamp_utc);
  const shifted = tc.length ? shiftDates(raw, tc, -1) : null;
  if (shifted) {
    const o2 = safeRun(run, shifted);
    if (!o2 || o2.timestamp_utc !== isoSec(Date.parse(out.timestamp_utc) - DAY_MS) || !only(o2, ['timestamp_utc'])) return false;
  }

  // R5 significance follows the "sig" field
  if (typeof a.sig.val === 'number' && Number.isInteger(a.sig.val) && a.sig.val < 2500) {
    const o2 = safeRun(run, replaceSpans(raw, [{ start: a.sig.start, end: a.sig.end, text: String(a.sig.val + 1) }]));
    if (!o2 || o2.significance !== a.sig.val + 1 || !only(o2, ['significance'])) return false;
  }
  return true;
}
