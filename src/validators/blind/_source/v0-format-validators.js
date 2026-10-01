// Existing FORMAT-level validators (V0) for reference. They check only types,
// ranges and formats of the output record.

// ---- from financial.js ----
export function validator(o) {
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

// ---- from iot.js ----
const METRICS = ['temperature', 'humidity', 'pressure'];
const ZONES = ['north', 'south', 'east', 'west'];
const TS_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const RANGES = { temperature: [-60, 70], humidity: [0, 100], pressure: [850, 1100] };
export function validator(o) {
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

export function statusOf(metric, v) {
  if (metric === 'temperature') return v > 40 || v < -5 ? 'critical' : v > 30 || v < 0 ? 'warning' : 'normal';
  if (metric === 'humidity') return v > 90 ? 'critical' : v > 75 ? 'warning' : 'normal';
  return v < 960 || v > 1040 ? 'critical' : v < 980 || v > 1030 ? 'warning' : 'normal';
}

// ---- from usgs.js ----
const MAG_TYPES = new Set(['ml', 'md', 'mb', 'mw', 'mww', 'mwb', 'mwc', 'mwr', 'ms', 'mb_lg', 'mi', 'mh']);
export function validatorCorrected(o) {
  if (!baseValid(o)) return false;
  if (typeof o.depth_km !== 'number' || o.depth_km < -10 || o.depth_km > 800) return false;
  if (o.significance !== null && (!Number.isInteger(o.significance) || o.significance < 0 || o.significance > 2500)) return false;
  return true;
}

export function validatorOriginal(o) {
  if (!baseValid(o)) return false;
  if (typeof o.depth_km !== 'number' || o.depth_km < 0 || o.depth_km > 800) return false;
  if (!Number.isInteger(o.significance) || o.significance < 0 || o.significance > 2500) return false;
  return true;
}

