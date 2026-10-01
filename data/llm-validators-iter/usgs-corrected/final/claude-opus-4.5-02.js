const isNum = v => typeof v === 'number' && !isNaN(v);
const isInt = v => Number.isInteger(v);
const isStr = v => typeof v === 'string';

if (!o || typeof o !== 'object') return false;

if (!isStr(o.event_id) || o.event_id.length === 0) return false;
if (!isNum(o.magnitude)) return false;
if (!isStr(o.magnitude_type) || !['ml','md','mb','mw','mww','mwb','mwc','mwr','ms','mb_lg','mi','mh'].includes(o.magnitude_type)) return false;
if (!isNum(o.latitude) || o.latitude < -90 || o.latitude > 90) return false;
if (!isNum(o.longitude) || o.longitude < -180 || o.longitude > 180) return false;
if (!isStr(o.timestamp_utc) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(o.timestamp_utc)) return false;
if (!isStr(o.place) || o.place.length === 0) return false;
if (!isStr(o.event_type)) return false;
if (o.status !== 'reviewed' && o.status !== 'automatic') return false;
if (!isNum(o.depth_km) || o.depth_km < -10 || o.depth_km > 800) return false;
if (o.significance !== null && (!isInt(o.significance) || o.significance < 0 || o.significance > 2500)) return false;

if (!raw.includes(o.event_id)) return false;
if (!raw.includes(o.place)) return false;
if (!raw.includes(o.event_type)) return false;
if (!raw.includes(o.status)) return false;

const magTypeRe = new RegExp(o.magnitude_type, 'i');
if (!magTypeRe.test(raw)) return false;

const numInRaw = (n, precisions) => {
  for (const p of precisions) {
    const s = p < 0 ? String(n) : n.toFixed(p);
    const re = new RegExp('(^|[^0-9.])' + s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^0-9]|$)');
    if (re.test(raw)) return true;
  }
  return false;
};

if (!numInRaw(o.magnitude, [-1, 1, 2])) return false;
if (!numInRaw(o.latitude, [-1, 2, 4, 6, 8, 10])) return false;
if (!numInRaw(o.longitude, [-1, 2, 4, 6, 8, 10])) return false;
if (!numInRaw(o.depth_km, [-1, 1, 2, 3])) return false;

const ts = o.timestamp_utc;
const d = new Date(ts);
if (isNaN(d.getTime())) return false;

const epochMs = d.getTime();
const hasEpochMs = raw.includes(String(epochMs));

let hasIsoMatch = false;
const isoRe = /(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?Z?/g;
let m;
while ((m = isoRe.exec(raw)) !== null) {
  const rawD = new Date(m[0].endsWith('Z') ? m[0] : m[0] + 'Z');
  if (!isNaN(rawD.getTime())) {
    const truncated = new Date(Math.floor(rawD.getTime() / 1000) * 1000);
    if (truncated.getTime() === epochMs) {
      hasIsoMatch = true;
      break;
    }
  }
}

if (!hasEpochMs && !hasIsoMatch) {
  const epochRe = /[^0-9](\d{13})[^0-9]/g;
  let found = false;
  while ((m = epochRe.exec(raw)) !== null) {
    const rawEpoch = parseInt(m[1], 10);
    const truncated = Math.floor(rawEpoch / 1000) * 1000;
    if (truncated === epochMs) {
      found = true;
      break;
    }
  }
  if (!found) return false;
}

if (o.significance !== null) {
  const sigRe = new RegExp('(^|[^0-9])' + o.significance + '([^0-9]|$)');
  if (!sigRe.test(raw)) return false;
}

if (o.significance === null) {
  if (/["']?sig["']?\s*[:=]\s*\d/.test(raw)) return false;
}

return true;
