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
  if (coords.length >= 3 && o.depth_km !== depth) return false;
  
  if (props.mag !== undefined && o.magnitude !== props.mag) return false;
  if (props.magType !== undefined && o.magnitude_type !== props.magType.toLowerCase()) return false;
  if (props.place !== undefined && o.place !== props.place) return false;
  if (props.type !== undefined && o.event_type !== props.type) return false;
  if (props.status !== undefined && o.status !== props.status) return false;
  if (json.id !== undefined && o.event_id !== json.id) return false;
  
  if (props.time !== undefined) {
    const expectedTS = new Date(props.time).toISOString().replace(/\.\d{3}Z$/, 'Z');
    if (o.timestamp_utc !== expectedTS) return false;
  }
  
  if (props.sig !== undefined) {
    if (o.significance !== props.sig) return false;
  } else {
    if (o.significance !== null) return false;
  }
} else {
  // Try CSV format
  const fields = parseCSVLine(raw.trim());
  const csvHeaders = ['time', 'latitude', 'longitude', 'depth', 'mag', 'magType', 'nst', 'gap', 'dmin', 'rms', 'net', 'id', 'updated', 'place', 'type', 'horizontalError', 'depthError', 'magError', 'magNst', 'status', 'locationSource', 'magSource'];
  
  if (fields.length >= csvHeaders.length) {
    const csv = {};
    for (let i = 0; i < csvHeaders.length && i < fields.length; i++) {
      csv[csvHeaders[i]] = fields[i];
    }
    
    if (csv.id && o.event_id !== csv.id) return false;
    if (csv.mag && o.magnitude !== parseFloat(csv.mag)) return false;
    if (csv.magType && o.magnitude_type !== csv.magType.toLowerCase()) return false;
    if (csv.latitude && o.latitude !== parseFloat(csv.latitude)) return false;
    if (csv.longitude && o.longitude !== parseFloat(csv.longitude)) return false;
    if (csv.depth && o.depth_km !== parseFloat(csv.depth)) return false;
    if (csv.place && o.place !== csv.place) return false;
    if (csv.type && o.event_type !== csv.type) return false;
    if (csv.status && o.status !== csv.status) return false;
    
    if (csv.time) {
      const expectedTS = new Date(csv.time).toISOString().replace(/\.\d{3}Z$/, 'Z');
      if (o.timestamp_utc !== expectedTS) return false;
    }
  }
}

return true;
