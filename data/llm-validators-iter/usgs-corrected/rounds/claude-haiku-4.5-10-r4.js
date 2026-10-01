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

if (!o || typeof o !== 'object') return false;

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

const json = tryParseJSON(raw);

if (json && json.type === 'Feature' && json.geometry && json.properties && json.id) {
  const props = json.properties;
  const coords = json.geometry.coordinates;
  
  if (o.event_id !== json.id) return false;
  if (o.magnitude !== props.mag) return false;
  if (o.magnitude_type !== (props.magType || '').toLowerCase()) return false;
  if (o.longitude !== coords[0] || o.latitude !== coords[1] || o.depth_km !== coords[2]) return false;
  
  const date = new Date(props.time);
  const expectedTs = date.toISOString().replace(/\.\d{3}Z$/, 'Z');
  if (o.timestamp_utc !== expectedTs) return false;
  
  if (o.place !== props.place) return false;
  if (o.event_type !== props.type) return false;
  if (o.status !== props.status) return false;
  if (o.significance !== (props.sig !== undefined ? props.sig : null)) return false;
} else {
  const fields = parseCSVLine(raw);
  
  if (fields.length < 22) return false;
  
  const time = fields[0];
  const latitude = parseFloat(fields[1]);
  const longitude = parseFloat(fields[2]);
  const depth = parseFloat(fields[3]);
  const mag = parseFloat(fields[4]);
  const magType = fields[5];
  const id = fields[11];
  const place = fields[13];
  const type = fields[14];
  const status = fields[19];
  
  if (o.event_id !== id) return false;
  if (o.magnitude !== mag) return false;
  if (o.magnitude_type !== magType.toLowerCase()) return false;
  if (o.latitude !== latitude) return false;
  if (o.longitude !== longitude) return false;
  if (o.depth_km !== depth) return false;
  if (o.timestamp_utc !== time) return false;
  if (o.place !== place) return false;
  if (o.event_type !== type) return false;
  if (o.status !== status) return false;
  if (o.significance !== null) return false;
}

return true;
