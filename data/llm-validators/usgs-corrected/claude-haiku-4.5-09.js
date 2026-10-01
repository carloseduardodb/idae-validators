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

// Helper: extract source data from raw input
function extractSource(raw) {
  const json = tryParseJSON(raw);
  if (json && json.type === 'Feature' && json.geometry && json.properties) {
    const props = json.properties;
    const coords = json.geometry.coordinates;
    return {
      format: 'geojson',
      id: json.id,
      mag: props.mag,
      magType: props.magType,
      latitude: coords[1],
      longitude: coords[0],
      depth_km: coords[2],
      time: props.time,
      place: props.place,
      type: props.type,
      status: props.status,
      sig: props.sig
    };
  }

  const csvFields = parseCSVLine(raw.trim());
  if (csvFields.length >= 22) {
    const time = csvFields[0];
    const latitude = csvFields[1];
    const longitude = csvFields[2];
    const depth = csvFields[3];
    const mag = csvFields[4];
    const magType = csvFields[5];
    const id = csvFields[11];
    const place = csvFields[13];
    const type = csvFields[14];
    const status = csvFields[19];
    
    return {
      format: 'csv',
      id: id,
      mag: mag,
      magType: magType,
      latitude: latitude,
      longitude: longitude,
      depth_km: depth,
      time: time,
      place: place,
      type: type,
      status: status,
      sig: undefined
    };
  }

  return null;
}

// Main validation
const source = extractSource(raw);
if (!source) return false;

// Check required fields exist and are non-empty
if (!o.event_id || typeof o.event_id !== 'string') return false;
if (o.magnitude === null || o.magnitude === undefined || typeof o.magnitude !== 'number') return false;
if (!o.magnitude_type || typeof o.magnitude_type !== 'string') return false;
if (o.latitude === null || o.latitude === undefined || typeof o.latitude !== 'number') return false;
if (o.longitude === null || o.longitude === undefined || typeof o.longitude !== 'number') return false;
if (!o.timestamp_utc || typeof o.timestamp_utc !== 'string') return false;
if (!o.place || typeof o.place !== 'string') return false;
if (o.event_type === null || o.event_type === undefined || typeof o.event_type !== 'string') return false;
if (!o.status || typeof o.status !== 'string') return false;
if (o.depth_km === null || o.depth_km === undefined || typeof o.depth_km !== 'number') return false;

// Check field constraints
if (!isValidMagType(o.magnitude_type)) return false;
if (o.latitude < -90 || o.latitude > 90) return false;
if (o.longitude < -180 || o.longitude > 180) return false;
if (!isValidTimestamp(o.timestamp_utc)) return false;
if (o.status !== 'reviewed' && o.status !== 'automatic') return false;
if (o.depth_km < -10 || o.depth_km > 800) return false;
if (o.significance !== null && (typeof o.significance !== 'number' || o.significance < 0 || o.significance > 2500 || !Number.isInteger(o.significance))) return false;

// Validate source consistency
if (source.id && o.event_id !== source.id) return false;
if (source.mag !== undefined && source.mag !== null && Math.abs(parseFloat(source.mag) - o.magnitude) > 0.001) return false;
if (source.magType && o.magnitude_type !== source.magType.toLowerCase()) return false;
if (source.latitude !== undefined && source.latitude !== null && Math.abs(parseFloat(source.latitude) - o.latitude) > 0.0001) return false;
if (source.longitude !== undefined && source.longitude !== null && Math.abs(parseFloat(source.longitude) - o.longitude) > 0.0001) return false;
if (source.depth_km !== undefined && source.depth_km !== null && Math.abs(parseFloat(source.depth_km) - o.depth_km) > 0.001) return false;
if (source.place && o.place !== source.place) return false;
if (source.type && o.event_type !== source.type) return false;
if (source.status && o.status !== source.status) return false;
if (source.sig !== undefined && source.sig !== null && o.significance !== parseInt(source.sig)) return false;
if (source.sig === undefined && source.format === 'csv' && o.significance !== null) return false;

// Validate timestamp derivation from source time
if (source.time) {
  let sourceTime;
  if (source.format === 'geojson') {
    sourceTime = new Date(parseInt(source.time));
  } else if (source.format === 'csv') {
    sourceTime = new Date(source.time);
  }
  if (sourceTime && !isNaN(sourceTime)) {
    const isoStr = sourceTime.toISOString().replace(/\.\d{3}Z$/, 'Z');
    if (o.timestamp_utc !== isoStr) return false;
  }
}

return true;
