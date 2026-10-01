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

const magStr = String(o.magnitude);
if (!raw.includes(magStr) && !raw.includes(o.magnitude.toFixed(1)) && !raw.includes(o.magnitude.toFixed(2))) return false;

const latStr = String(o.latitude);
if (!raw.includes(latStr) && !raw.includes(o.latitude.toFixed(2)) && !raw.includes(o.latitude.toFixed(4)) && !raw.includes(o.latitude.toFixed(6))) return false;

const lonStr = String(o.longitude);
if (!raw.includes(lonStr) && !raw.includes(o.longitude.toFixed(2)) && !raw.includes(o.longitude.toFixed(4)) && !raw.includes(o.longitude.toFixed(6))) return false;

const depthStr = String(o.depth_km);
if (!raw.includes(depthStr) && !raw.includes(o.depth_km.toFixed(1)) && !raw.includes(o.depth_km.toFixed(2)) && !raw.includes(o.depth_km.toFixed(3))) return false;

const ts = o.timestamp_utc;
const year = ts.slice(0,4), month = ts.slice(5,7), day = ts.slice(8,10);
const hour = ts.slice(11,13), min = ts.slice(14,16), sec = ts.slice(17,19);
const d = new Date(o.timestamp_utc);
if (isNaN(d.getTime())) return false;

const epochMs = d.getTime();
const epochSec = Math.floor(epochMs / 1000);
const hasEpoch = raw.includes(String(epochMs)) || raw.includes(String(epochSec));
const hasIso = raw.includes(year) && raw.includes(month) && raw.includes(day) && raw.includes(hour) && raw.includes(min);
if (!hasEpoch && !hasIso) return false;

if (o.significance !== null) {
  const sigRe = new RegExp('(^|[^0-9])' + o.significance + '([^0-9]|$)');
  if (!sigRe.test(raw)) return false;
}

if (o.significance === null) {
  if (/["']?sig["']?\s*[:=]\s*\d/.test(raw)) return false;
}

return true;
