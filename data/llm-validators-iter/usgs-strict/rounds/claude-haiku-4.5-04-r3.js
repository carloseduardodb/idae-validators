if (!o || typeof o !== 'object') return false;

if (typeof o.event_id !== 'string' || !o.event_id.trim()) return false;
if (typeof o.magnitude !== 'number' || isNaN(o.magnitude)) return false;
if (typeof o.magnitude_type !== 'string' || !o.magnitude_type) return false;
if (typeof o.latitude !== 'number' || o.latitude < -90 || o.latitude > 90) return false;
if (typeof o.longitude !== 'number' || o.longitude < -180 || o.longitude > 180) return false;
if (typeof o.timestamp_utc !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(o.timestamp_utc)) return false;
if (typeof o.place !== 'string' || !o.place.trim()) return false;
if (typeof o.event_type !== 'string') return false;
if (o.status !== 'reviewed' && o.status !== 'automatic') return false;
if (typeof o.depth_km !== 'number' || o.depth_km < 0 || o.depth_km > 800) return false;
if (typeof o.significance !== 'number' || !Number.isInteger(o.significance) || o.significance < 0 || o.significance > 2500) return false;

const validMagTypes = ['ml', 'md', 'mb', 'mw', 'mww', 'mwb', 'mwc', 'mwr', 'ms', 'mb_lg', 'mi', 'mh'];
if (!validMagTypes.includes(o.magnitude_type.toLowerCase())) return false;

if (!raw.includes(o.event_id)) return false;

const ts = new Date(o.timestamp_utc);
if (isNaN(ts.getTime())) return false;

const isoStr = ts.toISOString().replace(/\.\d{3}Z$/, 'Z');
if (o.timestamp_utc !== isoStr) return false;

if (!raw.includes(o.place)) return false;

if (!raw.includes(String(o.latitude))) return false;
if (!raw.includes(String(o.longitude))) return false;
if (!raw.includes(String(o.depth_km))) return false;
if (!raw.includes(String(o.magnitude))) return false;

return true;
