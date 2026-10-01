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

// Validate timestamp against raw
const year = tsMatch[1];
const month = tsMatch[2];
const day = tsMatch[3];
const hour = tsMatch[4];
const minute = tsMatch[5];
const second = tsMatch[6];

// Check if raw contains epoch milliseconds
const epochMatch = raw.match(/["\s:,](\d{13})["\s,}\]]/);
if (epochMatch) {
  const epochMs = parseInt(epochMatch[1], 10);
  const d = new Date(epochMs);
  if (d.getUTCFullYear() !== parseInt(year, 10) ||
      d.getUTCMonth() + 1 !== parseInt(month, 10) ||
      d.getUTCDate() !== parseInt(day, 10) ||
      d.getUTCHours() !== parseInt(hour, 10) ||
      d.getUTCMinutes() !== parseInt(minute, 10) ||
      d.getUTCSeconds() !== parseInt(second, 10)) return false;
} else {
  // ISO format - verify full date-time string appears in raw (truncated to seconds)
  const isoPrefix = `${year}-${month}-${day}T${hour}:${minute}:${second}`;
  if (!raw.includes(isoPrefix)) return false;
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

// Verify latitude appears in raw
const latStr = String(o.latitude);
const latPrefix = latStr.substring(0, Math.min(6, latStr.length));
if (!raw.includes(latPrefix.replace('-', '')) && !raw.includes(latPrefix)) return false;

// Verify longitude appears in raw
const lonStr = String(o.longitude);
const lonPrefix = lonStr.substring(0, Math.min(6, lonStr.length));
if (!raw.includes(lonPrefix.replace('-', '')) && !raw.includes(lonPrefix)) return false;

// Verify magnitude appears in raw
const magStr = String(o.magnitude);
if (!raw.includes(magStr) && !raw.includes(magStr.substring(0, 4))) return false;

// Verify depth appears in raw
const depthStr = String(o.depth_km);
if (!raw.includes(depthStr) && !raw.includes(depthStr.substring(0, 5))) return false;

return true;
