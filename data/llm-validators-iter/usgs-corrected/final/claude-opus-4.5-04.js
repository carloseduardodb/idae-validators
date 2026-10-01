if (!o || typeof o !== 'object') return false;

// Validate event_id
if (typeof o.event_id !== 'string' || o.event_id.length === 0) return false;
if (!raw.includes(o.event_id)) return false;

// Validate magnitude
if (typeof o.magnitude !== 'number' || !isFinite(o.magnitude)) return false;

// Check magnitude appears in raw - try multiple representations
const magStr = String(o.magnitude);
const magFixed1 = o.magnitude.toFixed(1);
const magFixed2 = o.magnitude.toFixed(2);
const magFixed3 = o.magnitude.toFixed(3);
if (!raw.includes(magStr) && !raw.includes(magFixed1) && !raw.includes(magFixed2) && !raw.includes(magFixed3)) return false;

// Validate magnitude_type
const validMagTypes = ['ml', 'md', 'mb', 'mw', 'mww', 'mwb', 'mwc', 'mwr', 'ms', 'mb_lg', 'mi', 'mh'];
if (typeof o.magnitude_type !== 'string' || !validMagTypes.includes(o.magnitude_type)) return false;
if (!raw.toLowerCase().includes(o.magnitude_type)) return false;

// Validate latitude
if (typeof o.latitude !== 'number' || !isFinite(o.latitude) || o.latitude < -90 || o.latitude > 90) return false;
if (!raw.includes(String(o.latitude))) return false;

// Validate longitude
if (typeof o.longitude !== 'number' || !isFinite(o.longitude) || o.longitude < -180 || o.longitude > 180) return false;
if (!raw.includes(String(o.longitude))) return false;

// Validate timestamp_utc
if (typeof o.timestamp_utc !== 'string') return false;
const tsMatch = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})Z$/.exec(o.timestamp_utc);
if (!tsMatch) return false;
const d = new Date(o.timestamp_utc);
if (isNaN(d.getTime())) return false;

// Check timestamp relates to raw - either epoch ms or ISO string should be present
const epochMs = d.getTime();
const epochRange = [epochMs, epochMs + 999];
let timeFound = false;
const epochPattern = /\d{13}/g;
let m;
while ((m = epochPattern.exec(raw)) !== null) {
  const val = parseInt(m[0], 10);
  if (val >= epochRange[0] && val <= epochRange[1]) { timeFound = true; break; }
}
if (!timeFound) {
  const isoPrefix = o.timestamp_utc.slice(0, 19);
  if (!raw.includes(isoPrefix)) return false;
}

// Validate place
if (typeof o.place !== 'string' || o.place.length === 0) return false;
if (!raw.includes(o.place)) return false;

// Validate event_type
if (typeof o.event_type !== 'string') return false;
if (!raw.toLowerCase().includes(o.event_type.toLowerCase())) return false;

// Validate status
if (o.status !== 'reviewed' && o.status !== 'automatic') return false;
if (!raw.toLowerCase().includes(o.status)) return false;

// Validate depth_km
if (typeof o.depth_km !== 'number' || !isFinite(o.depth_km) || o.depth_km < -10 || o.depth_km > 800) return false;
if (!raw.includes(String(o.depth_km))) return false;

// Validate significance
if (o.significance !== null) {
  if (!Number.isInteger(o.significance) || o.significance < 0 || o.significance > 2500) return false;
  if (!raw.includes(String(o.significance))) return false;
}

// Cross-validate magnitude: ensure the exact or close representation exists
// Extract all numbers from raw that could be magnitude (typically small numbers with decimals)
const numPattern = /-?\d+\.?\d*/g;
let nums = [];
let nm;
while ((nm = numPattern.exec(raw)) !== null) {
  nums.push(parseFloat(nm[0]));
}
// Check if magnitude matches any extracted number closely
let magFound = nums.some(n => Math.abs(n - o.magnitude) < 0.0001);
if (!magFound) return false;

return true;
