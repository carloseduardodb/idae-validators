if (!o || typeof o !== 'object') return false;

// Check event_id
if (typeof o.event_id !== 'string' || o.event_id.length === 0) return false;
if (!raw.includes(o.event_id)) return false;

// Check magnitude
if (typeof o.magnitude !== 'number' || !isFinite(o.magnitude)) return false;

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

// Check depth_km
if (typeof o.depth_km !== 'number' || !isFinite(o.depth_km) || o.depth_km < -10 || o.depth_km > 800) return false;
if (!raw.includes(String(o.depth_km))) return false;

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
if (typeof o.place !== 'string' || o.place.length === 0) return false;
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
} else {
  // If significance is null, verify "sig" field is not present in a meaningful way
  const sigMatch = raw.match(/"sig"\s*:\s*(\d+)/);
  if (sigMatch) return false;
}

// Verify magnitude appears in raw - check multiple representations
const magStr = String(o.magnitude);
const magFound = raw.includes(magStr) || 
  raw.includes(o.magnitude.toFixed(1)) || 
  raw.includes(o.magnitude.toFixed(2)) ||
  raw.includes(o.magnitude.toFixed(3));

if (!magFound) return false;

// Additional check: magnitude value should match what's in raw more precisely
// Extract potential magnitude values from raw and verify
const magPatterns = raw.match(/-?\d+\.?\d*/g) || [];
let magMatch = false;
for (const p of magPatterns) {
  const val = parseFloat(p);
  if (Math.abs(val - o.magnitude) < 0.0001) {
    magMatch = true;
    break;
  }
}
if (!magMatch) return false;

return true;
