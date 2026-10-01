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
    timestamp_utc: new Date(props.time).toISOString().replace(/\.\d{3}Z$/, 'Z'),
    place: props.place,
    event_type: props.type,
    status: props.status,
    significance: props.sig !== undefined ? props.sig : null
  };
} else {
  // CSV format
  const fields = parseCSVLine(raw);
  if (fields.length >= 22) {
    const time = parseInt(fields[0], 10);
    sourceData = {
      event_id: fields[11],
      magnitude: parseFloat(fields[4]),
      magnitude_type: fields[5],
      latitude: parseFloat(fields[1]),
      longitude: parseFloat(fields[2]),
      depth_km: parseFloat(fields[3]),
      timestamp_utc: new Date(time).toISOString().replace(/\.\d{3}Z$/, 'Z'),
      place: fields[13],
      event_type: fields[14],
      status: fields[19],
      significance: null
    };
  }
}

if (!sourceData) return false;

// Validate required fields exist and match
if (!o.event_id || o.event_id !== sourceData.event_id) return false;
if (o.magnitude === undefined || o.magnitude === null || o.magnitude !== sourceData.magnitude) return false;
if (!o.magnitude_type || o.magnitude_type !== sourceData.magnitude_type.toLowerCase()) return false;
if (!isValidMagType(o.magnitude_type)) return false;
if (o.latitude === undefined || o.latitude === null || o.latitude !== sourceData.latitude) return false;
if (o.latitude < -90 || o.latitude > 90) return false;
if (o.longitude === undefined || o.longitude === null || o.longitude !== sourceData.longitude) return false;
if (o.longitude < -180 || o.longitude > 180) return false;
if (!o.timestamp_utc || !isValidTimestamp(o.timestamp_utc)) return false;
if (o.timestamp_utc !== sourceData.timestamp_utc) return false;
if (!o.place || o.place !== sourceData.place) return false;
if (o.event_type === undefined || o.event_type === null || o.event_type !== sourceData.event_type) return false;
if (o.status !== 'reviewed' && o.status !== 'automatic') return false;
if (o.status !== sourceData.status) return false;
if (o.depth_km === undefined || o.depth_km === null || o.depth_km !== sourceData.depth_km) return false;
if (o.depth_km < -10 || o.depth_km > 800) return false;
if (o.significance !== sourceData.significance) return false;
if (o.significance !== null && (typeof o.significance !== 'number' || o.significance < 0 || o.significance > 2500)) return false;

return true;
