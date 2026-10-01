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
const tsMatch = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})Z$/.exec(o.timestamp_utc);
if (!tsMatch) return false;
const tsDate = new Date(o.timestamp_utc);
if (isNaN(tsDate.getTime())) return false;

// Verify timestamp components appear in raw (date part YYYY-MM-DD or epoch)
const year = tsMatch[1], month = tsMatch[2], day = tsMatch[3];
const hour = tsMatch[4], minute = tsMatch[5], second = tsMatch[6];
const dateStr = `${year}-${month}-${day}`;
const epochMs = tsDate.getTime();
// Check if raw contains the date string or an epoch that matches within 1 second
const hasDateStr = raw.includes(dateStr);
const epochPattern = new RegExp(String(Math.floor(epochMs / 1000)) + '\\d{0,3}');
const hasEpoch = epochPattern.test(raw);
if (!hasDateStr && !hasEpoch) return false;

// If raw has date string, verify time components
if (hasDateStr) {
  if (!raw.includes(hour + ':' + minute + ':' + second)) return false;
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

// Check depth_km
if (typeof o.depth_km !== 'number' || !isFinite(o.depth_km) || o.depth_km < -10 || o.depth_km > 800) return false;

// Check significance
if (o.significance !== null) {
  if (!Number.isInteger(o.significance) || o.significance < 0 || o.significance > 2500) return false;
  if (!raw.includes(String(o.significance))) return false;
}

// Verify magnitude appears in raw with reasonable precision
const magStr = o.magnitude.toString();
const magFound = raw.includes(magStr) || raw.includes(o.magnitude.toFixed(1)) || raw.includes(o.magnitude.toFixed(2));
if (!magFound) return false;

// Verify latitude appears in raw
const latAbs = Math.abs(o.latitude);
const latCheck = raw.includes(latAbs.toString().substring(0, 5)) || raw.includes(o.latitude.toString().substring(0, 6));
if (!latCheck) return false;

// Verify longitude appears in raw
const lonAbs = Math.abs(o.longitude);
const lonCheck = raw.includes(lonAbs.toString().substring(0, 5)) || raw.includes(o.longitude.toString().substring(0, 7));
if (!lonCheck) return false;

// Verify depth appears in raw
const depthStr = o.depth_km.toString();
const depthCheck = raw.includes(depthStr) || raw.includes(depthStr.substring(0, 4));
if (!depthCheck) return false;

return true;
