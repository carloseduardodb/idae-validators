// Helper: parse JSON safely
function tryParseJSON(str) {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

// Helper: parse CSV line (handles quoted fields)
function parseCSVLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      fields.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
}

// Helper: validate magnitude type
function isValidMagType(mt) {
  const valid = ['ml', 'md', 'mb', 'mw', 'mww', 'mwb', 'mwc', 'mwr', 'ms', 'mb_lg', 'mi', 'mh'];
  return valid.includes(mt);
}

// Helper: validate timestamp format
function isValidTimestamp(ts) {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(ts);
}

// Validate output record structure
if (!o || typeof o !== 'object') return false;

const required = ['event_id', 'magnitude', 'magnitude_type', 'latitude', 'longitude', 'timestamp_utc', 'place', 'event_type', 'status', 'depth_km'];
for (const field of required) {
  if (!(field in o)) return false;
}

// Type and value checks
if (typeof o.event_id !== 'string' || !o.event_id) return false;
if (typeof o.magnitude !== 'number' || isNaN(o.magnitude)) return false;
if (typeof o.magnitude_type !== 'string' || !isValidMagType(o.magnitude_type)) return false;
if (typeof o.latitude !== 'number' || o.latitude < -90 || o.latitude > 90) return false;
if (typeof o.longitude !== 'number' || o.longitude < -180 || o.longitude > 180) return false;
if (typeof o.timestamp_utc !== 'string' || !isValidTimestamp(o.timestamp_utc)) return false;
if (typeof o.place !== 'string' || !o.place) return false;
if (typeof o.event_type !== 'string') return false;
if (o.status !== 'reviewed' && o.status !== 'automatic') return false;
if (typeof o.depth_km !== 'number' || o.depth_km < -10 || o.depth_km > 800) return false;
if (o.significance !== null && (typeof o.significance !== 'number' || o.significance < 0 || o.significance > 2500 || !Number.isInteger(o.significance))) return false;

// Detect input format and validate consistency
const json = tryParseJSON(raw);
if (json && json.type === 'Feature' && json.geometry && json.properties) {
  // GeoJSON format
  const props = json.properties;
  const coords = json.geometry.coordinates;
  
  if (!Array.isArray(coords) || coords.length < 2) return false;
  const [lon, lat, depth] = coords;
  
  if (o.longitude !== lon || o.latitude !== lat) return false;
  if (depth !== undefined && o.depth_km !== depth) return false;
  
  if (o.event_id !== json.id) return false;
  if (o.magnitude !== props.mag) return false;
  if (o.magnitude_type !== props.magType) return false;
  if (o.place !== props.place) return false;
  if (o.event_type !== props.type) return false;
  if (o.status !== props.status) return false;
  
  const expectedTime = new Date(props.time).toISOString().replace(/\.\d{3}Z$/, 'Z');
  if (o.timestamp_utc !== expectedTime) return false;
  
  if (props.sig !== undefined && o.significance !== props.sig) return false;
  if (props.sig === undefined && o.significance !== null) return false;
  
  return true;
} else {
  // CSV format
  const fields = parseCSVLine(raw);
  const csvHeaders = ['time', 'latitude', 'longitude', 'depth', 'mag', 'magType', 'nst', 'gap', 'dmin', 'rms', 'net', 'id', 'updated', 'place', 'type', 'horizontalError', 'depthError', 'magError', 'magNst', 'status', 'locationSource', 'magSource'];
  
  if (fields.length < 15) return false;
  
  const time = fields[0];
  const lat = parseFloat(fields[1]);
  const lon = parseFloat(fields[2]);
  const depth = parseFloat(fields[3]);
  const mag = parseFloat(fields[4]);
  const magType = fields[5];
  const id = fields[11];
  const place = fields[13];
  const type = fields[14];
  const status = fields[19];
  
  if (isNaN(lat) || isNaN(lon) || isNaN(depth) || isNaN(mag)) return false;
  
  if (o.latitude !== lat || o.longitude !== lon || o.depth_km !== depth) return false;
  if (o.magnitude !== mag || o.magnitude_type !== magType) return false;
  if (o.event_id !== id || o.place !== place || o.event_type !== type) return false;
  if (o.status !== status) return false;
  
  const expectedTime = new Date(time).toISOString().replace(/\.\d{3}Z$/, 'Z');
  if (o.timestamp_utc !== expectedTime) return false;
  
  return true;
}
