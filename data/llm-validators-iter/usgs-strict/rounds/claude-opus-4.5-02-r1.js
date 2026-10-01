if (!o || typeof o !== 'object') return false;

// Check event_id
if (typeof o.event_id !== 'string' || o.event_id.length === 0) return false;
if (!raw.includes(o.event_id)) return false;

// Check magnitude
if (typeof o.magnitude !== 'number' || !isFinite(o.magnitude)) return false;
if (!raw.includes(String(o.magnitude)) && !raw.includes(o.magnitude.toFixed(1))) return false;

// Check magnitude_type
const validMagTypes = ['ml', 'md', 'mb', 'mw', 'mww', 'mwb', 'mwc', 'mwr', 'ms', 'mb_lg', 'mi', 'mh'];
if (typeof o.magnitude_type !== 'string' || !validMagTypes.includes(o.magnitude_type)) return false;
if (!raw.toLowerCase().includes(o.magnitude_type)) return false;

// Check latitude
if (typeof o.latitude !== 'number' || !isFinite(o.latitude) || o.latitude < -90 || o.latitude > 90) return false;

// Check longitude
if (typeof o.longitude !== 'number' || !isFinite(o.longitude) || o.longitude < -180 || o.longitude > 180) return false;

// Check timestamp_utc format
if (typeof o.timestamp_utc !== 'string') return false;
const tsMatch = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})Z$/.exec(o.timestamp_utc);
if (!tsMatch) return false;
const parsedTs = Date.parse(o.timestamp_utc);
if (isNaN(parsedTs)) return false;

// Check place
if (typeof o.place !== 'string' || o.place.length === 0) return false;
if (!raw.includes(o.place)) return false;

// Check event_type
if (typeof o.event_type !== 'string') return false;
if (!raw.toLowerCase().includes(o.event_type.toLowerCase())) return false;

// Check status
if (o.status !== 'reviewed' && o.status !== 'automatic') return false;
if (!raw.toLowerCase().includes(o.status)) return false;

// Check depth_km
if (typeof o.depth_km !== 'number' || !isFinite(o.depth_km) || o.depth_km < 0 || o.depth_km > 800) return false;

// Check significance
if (typeof o.significance !== 'number' || !Number.isInteger(o.significance) || o.significance < 0 || o.significance > 2500) return false;

// Verify latitude and longitude appear in raw
const latStr = String(o.latitude);
const lonStr = String(o.longitude);
if (!raw.includes(latStr.substring(0, Math.min(5, latStr.length)))) return false;
if (!raw.includes(lonStr.substring(0, Math.min(5, lonStr.length)))) return false;

// Verify depth appears in raw
const depthStr = String(o.depth_km);
if (!raw.includes(depthStr.substring(0, Math.min(4, depthStr.length)))) return false;

// Verify significance appears in raw
if (!raw.includes(String(o.significance))) return false;

return true;
