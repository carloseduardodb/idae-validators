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

// Main validation
const requiredFields = ['event_id', 'magnitude', 'magnitude_type', 'latitude', 'longitude', 'timestamp_utc', 'place', 'event_type', 'status', 'depth_km'];

// Check all required fields exist and are not null/undefined
for (const field of requiredFields) {
  if (!(field in o) || o[field] === null || o[field] === undefined) {
    return false;
  }
}

// Type checks
if (typeof o.event_id !== 'string' || o.event_id.length === 0) return false;
if (typeof o.magnitude !== 'number' || isNaN(o.magnitude)) return false;
if (typeof o.magnitude_type !== 'string' || !isValidMagType(o.magnitude_type)) return false;
if (typeof o.latitude !== 'number' || o.latitude < -90 || o.latitude > 90) return false;
if (typeof o.longitude !== 'number' || o.longitude < -180 || o.longitude > 180) return false;
if (typeof o.timestamp_utc !== 'string' || !isValidTimestamp(o.timestamp_utc)) return false;
if (typeof o.place !== 'string' || o.place.length === 0) return false;
if (typeof o.event_type !== 'string') return false;
if (o.status !== 'reviewed' && o.status !== 'automatic') return false;
if (typeof o.depth_km !== 'number' || o.depth_km < -10 || o.depth_km > 800) return false;
if ('significance' in o && o.significance !== null && (o.significance < 0 || o.significance > 2500 || !Number.isInteger(o.significance))) return false;

// Parse raw input to validate consistency
const json = tryParseJSON(raw);
let sourceData = null;

if (json && json.type === 'Feature' && json.geometry && json.properties && json.id) {
  // GeoJSON format
  const props = json.properties;
  const coords = json.geometry.coordinates;
  sourceData = {
    event_id: json.id,
    magnitude: props.mag,
    magnitude_type: props.magType,
    latitude: coords[1],
    longitude: coords[0],
    depth_km: coords[2],
    timestamp_utc: props.time ? new Date(props.time).toISOString().replace(/\.\d{3}Z$/, 'Z') : null,
    place: props.place,
    event_type: props.type,
    status: props.status,
    significance: props.sig !== undefined ? props.sig : null
  };
} else {
  // Try CSV format
  const fields = parseCSVLine(raw);
  if (fields.length >= 22) {
    const timestamp = fields[0];
    const lat = parseFloat(fields[1]);
    const lon = parseFloat(fields[2]);
    const depth = parseFloat(fields[3]);
    const mag = parseFloat(fields[4]);
    const magType = fields[5];
    const id = fields[11];
    const place = fields[13];
    const type = fields[14];
    const status = fields[19];
    
    if (!isNaN(lat) && !isNaN(lon) && !isNaN(depth) && !isNaN(mag)) {
      sourceData = {
        event_id: id,
        magnitude: mag,
        magnitude_type: magType,
        latitude: lat,
        longitude: lon,
        depth_km: depth,
        timestamp_utc: timestamp,
        place: place,
        event_type: type,
        status: status,
        significance: null
      };
    }
  }
}

// Validate output matches source data
if (sourceData) {
  if (o.event_id !== sourceData.event_id) return false;
  if (o.magnitude !== sourceData.magnitude) return false;
  if (o.magnitude_type !== sourceData.magnitude_type) return false;
  if (o.latitude !== sourceData.latitude) return false;
  if (o.longitude !== sourceData.longitude) return false;
  if (o.timestamp_utc !== sourceData.timestamp_utc) return false;
  if (o.place !== sourceData.place) return false;
  if (o.event_type !== sourceData.event_type) return false;
  if (o.status !== sourceData.status) return false;
  if (o.depth_km !== sourceData.depth_km) return false;
  if (o.significance !== sourceData.significance) return false;
}

return true;
