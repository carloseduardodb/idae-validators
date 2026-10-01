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
const parsedTs = Date.parse(o.timestamp_utc);
if (isNaN(parsedTs)) return false;

// Verify timestamp components appear in raw (date part YYYY-MM-DD or epoch)
const tsYear = tsMatch[1];
const tsMonth = tsMatch[2];
const tsDay = tsMatch[3];
const tsHour = tsMatch[4];
const tsMin = tsMatch[5];
const tsSec = tsMatch[6];

// Check if raw contains the date in ISO format or as epoch
const dateStr = `${tsYear}-${tsMonth}-${tsDay}`;
const hasIsoDate = raw.includes(dateStr);
const epochMs = parsedTs;
const hasEpoch = raw.includes(String(epochMs).substring(0, 10));

if (!hasIsoDate && !hasEpoch) return false;

// If ISO date present, verify time components
if (hasIsoDate) {
  const timePattern = new RegExp(`${tsHour}:${tsMin}:${tsSec}`);
  if (!timePattern.test(raw)) return false;
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

// Verify latitude appears in raw (check significant digits)
const latStr = o.latitude.toString();
const latCheck = latStr.includes('.') ? latStr.split('.')[0] + '.' + latStr.split('.')[1].substring(0, 2) : latStr;
if (!raw.includes(latCheck) && !raw.includes(latCheck.replace('-', ''))) return false;

// Verify longitude appears in raw
const lonStr = o.longitude.toString();
const lonCheck = lonStr.includes('.') ? lonStr.split('.')[0] + '.' + lonStr.split('.')[1].substring(0, 2) : lonStr;
if (!raw.includes(lonCheck) && !raw.includes(lonCheck.replace('-', ''))) return false;

// Verify magnitude appears in raw - need exact match for the value
const magStr = o.magnitude.toString();
const magRegex = new RegExp('(^|[^0-9])' + magStr.replace('.', '\\.') + '([^0-9]|$)');
if (!magRegex.test(raw)) return false;

// Verify depth appears in raw
const depthStr = o.depth_km.toString();
const depthCheck = depthStr.includes('.') ? depthStr.split('.')[0] + '.' + depthStr.split('.')[1].substring(0, 1) : depthStr;
if (!raw.includes(depthCheck)) return false;

return true;
