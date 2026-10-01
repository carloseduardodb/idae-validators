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

// Check depth_km
if (typeof o.depth_km !== 'number' || !isFinite(o.depth_km) || o.depth_km < -10 || o.depth_km > 800) return false;

// Check timestamp_utc format and presence in raw
if (typeof o.timestamp_utc !== 'string') return false;
const tsMatch = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})Z$/.exec(o.timestamp_utc);
if (!tsMatch) return false;
const ts = new Date(o.timestamp_utc);
if (isNaN(ts.getTime())) return false;

// Verify timestamp relates to raw input time
const epochMatch = raw.match(/1[0-9]{12}/);
const isoMatch = raw.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
if (epochMatch) {
  const epoch = parseInt(epochMatch[0], 10);
  const diff = Math.abs(ts.getTime() - epoch);
  if (diff >= 1000) return false;
} else if (isoMatch) {
  const rawTs = new Date(isoMatch[0] + 'Z');
  const diff = Math.abs(ts.getTime() - rawTs.getTime());
  if (diff >= 1000) return false;
} else {
  return false;
}

// Check place
if (typeof o.place !== 'string' || o.place === '') return false;
if (!raw.includes(o.place)) return false;

// Check event_type
if (typeof o.event_type !== 'string') return false;
if (!raw.toLowerCase().includes(o.event_type.toLowerCase())) return false;

// Check status
if (o.status !== 'reviewed' && o.status !== 'automatic') return false;
if (!raw.toLowerCase().includes(o.status)) return false;

// Check significance
if (o.significance !== null) {
  if (!Number.isInteger(o.significance) || o.significance < 0 || o.significance > 2500) return false;
  if (!raw.includes(String(o.significance))) return false;
}

// Helper to check if a number appears in raw with various precisions
function numInRaw(num, precisions) {
  for (const p of precisions) {
    if (raw.includes(num.toFixed(p))) return true;
  }
  return raw.includes(String(num));
}

// Verify magnitude appears in raw - must match exactly as it appears
if (!numInRaw(o.magnitude, [0, 1, 2, 3])) return false;

// Verify latitude appears in raw
if (!numInRaw(o.latitude, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])) return false;

// Verify longitude appears in raw
if (!numInRaw(o.longitude, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])) return false;

// Verify depth appears in raw
if (!numInRaw(o.depth_km, [0, 1, 2, 3])) return false;

// Extract all numbers from raw that could be magnitude (small positive numbers typically 0-10)
const magCandidates = raw.match(/-?\d+\.?\d*/g) || [];
let magFound = false;
for (const c of magCandidates) {
  const val = parseFloat(c);
  if (Math.abs(val - o.magnitude) < 0.0001) {
    magFound = true;
    break;
  }
}
if (!magFound) return false;

return true;
