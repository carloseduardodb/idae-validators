if (!o || typeof o !== 'object') return false;

// Check event_id
if (typeof o.event_id !== 'string' || o.event_id === '') return false;
if (!raw.includes(o.event_id)) return false;

// Check magnitude
if (typeof o.magnitude !== 'number' || !isFinite(o.magnitude)) return false;

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
if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(o.timestamp_utc)) return false;
const ts = new Date(o.timestamp_utc);
if (isNaN(ts.getTime())) return false;

// Verify timestamp relates to raw
const epoch = ts.getTime();
let epochMatch = false;
for (let i = 0; i < 1000; i++) {
  if (raw.includes(String(epoch + i))) { epochMatch = true; break; }
}
const isoPrefix = o.timestamp_utc.slice(0, 19);
const dateMatch = raw.includes(isoPrefix);
if (!epochMatch && !dateMatch) return false;

// Check place
if (typeof o.place !== 'string' || o.place === '') return false;
if (!raw.includes(o.place)) return false;

// Check event_type
if (typeof o.event_type !== 'string') return false;
if (!raw.toLowerCase().includes(o.event_type.toLowerCase())) return false;

// Check status
if (o.status !== 'reviewed' && o.status !== 'automatic') return false;
if (!raw.toLowerCase().includes(o.status)) return false;

// Check depth_km
if (typeof o.depth_km !== 'number' || !isFinite(o.depth_km) || o.depth_km < -10 || o.depth_km > 800) return false;

// Check significance
if (o.significance !== null) {
  if (!Number.isInteger(o.significance) || o.significance < 0 || o.significance > 2500) return false;
  if (!raw.includes(String(o.significance))) return false;
}

// Helper to check if a number appears in raw with reasonable precision
function numInRaw(n, precisions) {
  for (const p of precisions) {
    if (raw.includes(n.toFixed(p))) return true;
  }
  return raw.includes(String(n));
}

// Verify magnitude appears in raw exactly (not just as substring)
// Use word boundary approach - the number should appear as a standalone value
const magStr = String(o.magnitude);
const magPrecisions = [0, 1, 2, 3];
let magFound = false;
for (const p of magPrecisions) {
  const formatted = o.magnitude.toFixed(p);
  // Check if this exact number appears (with word boundaries via regex)
  const escaped = formatted.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp('(?:^|[^0-9.])' + escaped + '(?:[^0-9]|$)');
  if (re.test(raw)) { magFound = true; break; }
}
if (!magFound) return false;

// Verify lat/lon appear in raw
if (!numInRaw(o.latitude, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])) return false;
if (!numInRaw(o.longitude, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])) return false;

// Verify depth appears in raw
if (!numInRaw(o.depth_km, [0, 1, 2, 3, 4, 5, 6])) return false;

return true;
