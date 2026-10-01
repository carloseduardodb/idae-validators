// Parse raw input as JSON or CSV
let input;
try {
  input = JSON.parse(raw);
} catch {
  const parts = raw.split(',');
  if (parts.length < 22) return false;
  input = {
    time: parseInt(parts[0]),
    latitude: parseFloat(parts[1]),
    longitude: parseFloat(parts[2]),
    depth: parseFloat(parts[3]),
    mag: parseFloat(parts[4]),
    magType: parts[5],
    id: parts[11],
    place: parts[13].replace(/^"|"$/g, ''),
    type: parts[14],
    status: parts[19],
    sig: parseInt(parts[20]) || null
  };
}

// Extract source values
let srcTime, srcLat, srcLon, srcDepth, srcMag, srcMagType, srcId, srcPlace, srcType, srcStatus, srcSig;

if (input.geometry) {
  // GeoJSON Feature
  srcTime = input.properties?.time;
  srcLat = input.geometry?.coordinates?.[1];
  srcLon = input.geometry?.coordinates?.[0];
  srcDepth = input.geometry?.coordinates?.[2];
  srcMag = input.properties?.mag;
  srcMagType = input.properties?.magType;
  srcId = input.id;
  srcPlace = input.properties?.place;
  srcType = input.properties?.type;
  srcStatus = input.properties?.status;
  srcSig = input.properties?.sig;
} else {
  // CSV
  srcTime = input.time;
  srcLat = input.latitude;
  srcLon = input.longitude;
  srcDepth = input.depth;
  srcMag = input.mag;
  srcMagType = input.magType;
  srcId = input.id;
  srcPlace = input.place;
  srcType = input.type;
  srcStatus = input.status;
  srcSig = input.sig;
}

// Validate output structure
if (typeof o !== 'object' || o === null) return false;

// Check required fields exist and have correct types
if (typeof o.event_id !== 'string' || !o.event_id) return false;
if (typeof o.magnitude !== 'number') return false;
if (typeof o.magnitude_type !== 'string') return false;
if (typeof o.latitude !== 'number') return false;
if (typeof o.longitude !== 'number') return false;
if (typeof o.timestamp_utc !== 'string') return false;
if (typeof o.place !== 'string' || !o.place) return false;
if (typeof o.event_type !== 'string') return false;
if (typeof o.status !== 'string') return false;
if (typeof o.depth_km !== 'number') return false;
if (typeof o.significance !== 'number') return false;

// Validate field constraints
if (o.latitude < -90 || o.latitude > 90) return false;
if (o.longitude < -180 || o.longitude > 180) return false;
if (o.depth_km < 0 || o.depth_km > 800) return false;
if (o.significance < 0 || o.significance > 2500) return false;
if (!Number.isInteger(o.significance)) return false;

const validMagTypes = ['ml', 'md', 'mb', 'mw', 'mww', 'mwb', 'mwc', 'mwr', 'ms', 'mb_lg', 'mi', 'mh'];
if (!validMagTypes.includes(o.magnitude_type)) return false;

if (o.status !== 'reviewed' && o.status !== 'automatic') return false;

// Validate timestamp format
if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(o.timestamp_utc)) return false;

// Validate relations to source
if (o.event_id !== srcId) return false;
if (o.magnitude !== srcMag) return false;
if (o.magnitude_type !== srcMagType) return false;
if (o.latitude !== srcLat) return false;
if (o.longitude !== srcLon) return false;
if (o.depth_km !== srcDepth) return false;
if (o.place !== srcPlace) return false;
if (o.event_type !== srcType) return false;
if (o.status !== srcStatus) return false;
if (o.significance !== srcSig) return false;

// Validate timestamp conversion from epoch ms
const epochMs = srcTime;
const date = new Date(epochMs);
const expected = date.toISOString().replace(/\.\d{3}Z$/, 'Z');
if (o.timestamp_utc !== expected) return false;

return true;
