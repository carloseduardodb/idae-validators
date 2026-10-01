// Validate output record structure and types
if (typeof o !== 'object' || o === null) return false;

const required = ['event_id', 'magnitude', 'magnitude_type', 'latitude', 'longitude', 'timestamp_utc', 'place', 'event_type', 'status', 'depth_km', 'significance'];
for (const field of required) {
  if (!(field in o)) return false;
}

// Type checks
if (typeof o.event_id !== 'string' || !o.event_id.length) return false;
if (typeof o.magnitude !== 'number' || isNaN(o.magnitude)) return false;
if (typeof o.magnitude_type !== 'string') return false;
if (typeof o.latitude !== 'number' || o.latitude < -90 || o.latitude > 90) return false;
if (typeof o.longitude !== 'number' || o.longitude < -180 || o.longitude > 180) return false;
if (typeof o.timestamp_utc !== 'string') return false;
if (typeof o.place !== 'string' || !o.place.length) return false;
if (typeof o.event_type !== 'string') return false;
if (typeof o.depth_km !== 'number' || o.depth_km < 0 || o.depth_km > 800) return false;
if (typeof o.significance !== 'number' || !Number.isInteger(o.significance) || o.significance < 0 || o.significance > 2500) return false;

// Validate magnitude_type enum
const validMagTypes = ['ml', 'md', 'mb', 'mw', 'mww', 'mwb', 'mwc', 'mwr', 'ms', 'mb_lg', 'mi', 'mh'];
if (!validMagTypes.includes(o.magnitude_type)) return false;

// Validate status enum
if (o.status !== 'reviewed' && o.status !== 'automatic') return false;

// Validate timestamp format: YYYY-MM-DDTHH:MM:SSZ
if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(o.timestamp_utc)) return false;

// Parse timestamp to verify it's valid
const ts = new Date(o.timestamp_utc);
if (isNaN(ts.getTime())) return false;

// Extract values from raw input to cross-check
let rawMag, rawLat, rawLon, rawDepth, rawTime, rawId, rawPlace, rawMagType, rawStatus, rawType, rawSig;

// Try JSON format first
try {
  const json = JSON.parse(raw);
  if (json.type === 'Feature' && json.geometry && json.properties) {
    const coords = json.geometry.coordinates;
    rawLon = coords[0];
    rawLat = coords[1];
    rawDepth = coords[2];
    rawMag = json.properties.mag;
    rawTime = json.properties.time;
    rawId = json.id;
    rawPlace = json.properties.place;
    rawMagType = json.properties.magType;
    rawStatus = json.properties.status;
    rawType = json.properties.type;
    rawSig = json.properties.sig;
  }
} catch (e) {
  // Try CSV format
  const csvMatch = raw.match(/^([^,]+),([^,]+),([^,]+),([^,]+),([^,]+),([^,]+)(?:,[^,]*){7},([^,]+),([^,]+),(?:[^,]*,){4}([^,]+),([^,]+)$/);
  if (csvMatch) {
    rawTime = parseInt(csvMatch[1]);
    rawLat = parseFloat(csvMatch[2]);
    rawLon = parseFloat(csvMatch[3]);
    rawDepth = parseFloat(csvMatch[4]);
    rawMag = parseFloat(csvMatch[5]);
    rawMagType = csvMatch[6];
    rawId = csvMatch[7];
    rawPlace = csvMatch[8].replace(/^"|"$/g, '');
    rawType = csvMatch[9];
    rawStatus = csvMatch[10];
  }
}

// Cross-validate extracted values against output
if (rawId !== undefined && o.event_id !== rawId) return false;
if (rawMag !== undefined && o.magnitude !== rawMag) return false;
if (rawMagType !== undefined && o.magnitude_type !== rawMagType.toLowerCase()) return false;
if (rawLat !== undefined && o.latitude !== rawLat) return false;
if (rawLon !== undefined && o.longitude !== rawLon) return false;
if (rawDepth !== undefined && o.depth_km !== rawDepth) return false;
if (rawPlace !== undefined && o.place !== rawPlace) return false;
if (rawType !== undefined && o.event_type !== rawType) return false;
if (rawStatus !== undefined && o.status !== rawStatus) return false;
if (rawSig !== undefined && o.significance !== rawSig) return false;

// Validate timestamp matches raw time (if available)
if (rawTime !== undefined) {
  const expectedTs = new Date(rawTime).toISOString().replace(/\.\d{3}Z$/, 'Z');
  if (o.timestamp_utc !== expectedTs) return false;
}

return true;
