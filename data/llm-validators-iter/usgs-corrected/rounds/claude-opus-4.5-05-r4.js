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

// Check timestamp_utc format
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

// Helper to check if a number appears in raw with exact match (not as substring of larger number)
function numExactInRaw(num, precisions) {
  for (const p of precisions) {
    const s = num.toFixed(p);
    // Use regex to find the number with word boundaries or delimiters
    const escaped = s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/-/g, '\\-?');
    const re = new RegExp('(?:^|[^0-9.])' + escaped + '(?:[^0-9]|$)');
    if (re.test(raw)) return true;
  }
  const str = String(num);
  const escaped = str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/-/g, '\\-?');
  const re = new RegExp('(?:^|[^0-9.])' + escaped + '(?:[^0-9]|$)');
  return re.test(raw);
}

// Stricter number matching - find the actual number in raw
function findNumInRaw(num) {
  const nums = raw.match(/-?\d+\.?\d*/g) || [];
  for (const c of nums) {
    const val = parseFloat(c);
    if (Math.abs(val - num) < 1e-9) return true;
    // Allow for precision differences
    if (Math.abs(val - num) / Math.max(Math.abs(num), 1e-9) < 1e-6) return true;
  }
  return false;
}

// Verify magnitude appears in raw
if (!findNumInRaw(o.magnitude)) return false;

// Verify latitude appears in raw exactly
if (!findNumInRaw(o.latitude)) return false;

// Verify longitude appears in raw exactly
if (!findNumInRaw(o.longitude)) return false;

// Verify depth appears in raw exactly
if (!findNumInRaw(o.depth_km)) return false;

return true;
