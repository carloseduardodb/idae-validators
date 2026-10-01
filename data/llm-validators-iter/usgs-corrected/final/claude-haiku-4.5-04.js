function tryParseJSON(str) {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

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

function isValidMagType(mt) {
  const valid = ['ml', 'md', 'mb', 'mw', 'mww', 'mwb', 'mwc', 'mwr', 'ms', 'mb_lg', 'mi', 'mh'];
  return valid.includes(mt);
}

function isValidTimestamp(ts) {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(ts);
}

const json = tryParseJSON(raw);
let sourceData = null;

if (json && json.type === 'Feature' && json.geometry && json.properties && json.id) {
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
  const fields = parseCSVLine(raw);
  if (fields.length >= 22) {
    const timeStr = fields[0];
    let timestamp_utc = null;
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(timeStr)) {
      timestamp_utc = timeStr.replace(/\.\d{3}Z$/, 'Z');
    } else {
      const time = parseInt(timeStr, 10);
      if (!isNaN(time)) {
        timestamp_utc = new Date(time).toISOString().replace(/\.\d{3}Z$/, 'Z');
      }
    }
    sourceData = {
      event_id: fields[11],
      magnitude: parseFloat(fields[4]),
      magnitude_type: fields[5],
      latitude: parseFloat(fields[1]),
      longitude: parseFloat(fields[2]),
      depth_km: parseFloat(fields[3]),
      timestamp_utc: timestamp_utc,
      place: fields[13],
      event_type: fields[14],
      status: fields[19],
      significance: null
    };
  }
}

if (!sourceData) return false;

if (!o.event_id || typeof o.event_id !== 'string' || o.event_id.trim() === '') return false;
if (o.magnitude === null || o.magnitude === undefined || typeof o.magnitude !== 'number') return false;
if (!o.magnitude_type || typeof o.magnitude_type !== 'string') return false;
if (o.latitude === null || o.latitude === undefined || typeof o.latitude !== 'number') return false;
if (o.longitude === null || o.longitude === undefined || typeof o.longitude !== 'number') return false;
if (!o.timestamp_utc || typeof o.timestamp_utc !== 'string') return false;
if (!o.place || typeof o.place !== 'string' || o.place.trim() === '') return false;
if (o.event_type === null || o.event_type === undefined || typeof o.event_type !== 'string') return false;
if (!o.status || typeof o.status !== 'string') return false;
if (o.depth_km === null || o.depth_km === undefined || typeof o.depth_km !== 'number') return false;

if (o.latitude < -90 || o.latitude > 90) return false;
if (o.longitude < -180 || o.longitude > 180) return false;
if (o.depth_km < -10 || o.depth_km > 800) return false;
if (!isValidMagType(o.magnitude_type)) return false;
if (!isValidTimestamp(o.timestamp_utc)) return false;
if (o.status !== 'reviewed' && o.status !== 'automatic') return false;

if (o.significance !== null) {
  if (typeof o.significance !== 'number' || o.significance < 0 || o.significance > 2500) return false;
}

if (o.event_id !== sourceData.event_id) return false;
if (Math.abs(o.magnitude - sourceData.magnitude) > 0.0001) return false;
if (o.magnitude_type !== sourceData.magnitude_type) return false;
if (Math.abs(o.latitude - sourceData.latitude) > 0.0001) return false;
if (Math.abs(o.longitude - sourceData.longitude) > 0.0001) return false;
if (Math.abs(o.depth_km - sourceData.depth_km) > 0.0001) return false;
if (o.timestamp_utc !== sourceData.timestamp_utc) return false;
if (o.place !== sourceData.place) return false;
if (o.event_type !== sourceData.event_type) return false;
if (o.status !== sourceData.status) return false;
if (o.significance !== sourceData.significance) return false;

return true;
