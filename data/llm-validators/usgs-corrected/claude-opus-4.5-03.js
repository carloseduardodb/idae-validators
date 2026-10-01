if (!o || typeof o !== 'object') return false;

// Check event_id
if (typeof o.event_id !== 'string' || o.event_id === '') return false;
if (!raw.includes(o.event_id)) return false;

// Check magnitude
if (typeof o.magnitude !== 'number' || !isFinite(o.magnitude)) return false;
if (!raw.includes(String(o.magnitude)) && !raw.includes(o.magnitude.toFixed(1)) && !raw.includes(o.magnitude.toFixed(2))) return false;

// Check magnitude_type
const validMagTypes = ['ml', 'md', 'mb', 'mw', 'mww', 'mwb', 'mwc', 'mwr', 'ms', 'mb_lg', 'mi', 'mh'];
if (typeof o.magnitude_type !== 'string' || !validMagTypes.includes(o.magnitude_type)) return false;
if (!raw.toLowerCase().includes(o.magnitude_type)) return false;

// Check latitude
if (typeof o.latitude !== 'number' || !isFinite(o.latitude) || o.latitude < -90 || o.latitude > 90) return false;
if (!raw.includes(String(o.latitude))) return false;

// Check longitude
if (typeof o.longitude !== 'number' || !isFinite(o.longitude) || o.longitude < -180 || o.longitude > 180) return false;
if (!raw.includes(String(o.longitude))) return false;

// Check timestamp_utc
if (typeof o.timestamp_utc !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(o.timestamp_utc)) return false;
const ts = Date.parse(o.timestamp_utc);
if (isNaN(ts)) return false;
// Verify timestamp relates to raw - check for epoch ms or ISO string
const epochMatch = raw.match(/1[0-9]{12}/);
const isoMatch = raw.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
if (epochMatch) {
  const epochMs = parseInt(epochMatch[0], 10);
  if (Math.abs(ts - epochMs) > 999) return false;
} else if (isoMatch) {
  const rawTs = Date.parse(isoMatch[0] + 'Z');
  if (Math.abs(ts - rawTs) > 999) return false;
} else {
  return false;
}

// Check place
if (typeof o.place !== 'string' || o.place === '') return false;
if (!raw.includes(o.place)) return false;

// Check event_type
if (typeof o.event_type !== 'string') return false;
const rawLower = raw.toLowerCase();
if (!rawLower.includes(o.event_type.toLowerCase())) return false;

// Check status
if (o.status !== 'reviewed' && o.status !== 'automatic') return false;
if (!rawLower.includes(o.status)) return false;

// Check depth_km
if (typeof o.depth_km !== 'number' || !isFinite(o.depth_km) || o.depth_km < -10 || o.depth_km > 800) return false;
if (!raw.includes(String(o.depth_km))) return false;

// Check significance
if (o.significance !== null) {
  if (!Number.isInteger(o.significance) || o.significance < 0 || o.significance > 2500) return false;
  if (!raw.includes(String(o.significance))) return false;
}

return true;
