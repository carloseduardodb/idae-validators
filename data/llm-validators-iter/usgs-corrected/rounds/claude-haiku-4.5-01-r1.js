// Parse raw input to determine format and extract source values
let source = {};
let isGeoJSON = false;

try {
  const parsed = JSON.parse(raw);
  if (parsed.type === "Feature" && parsed.geometry && parsed.properties && parsed.id) {
    isGeoJSON = true;
    source = {
      id: parsed.id,
      mag: parsed.properties.mag,
      magType: parsed.properties.magType,
      place: parsed.properties.place,
      time: parsed.properties.time,
      type: parsed.properties.type,
      status: parsed.properties.status,
      sig: parsed.properties.sig,
      coordinates: parsed.geometry.coordinates
    };
  }
} catch (e) {
  // Not JSON, try CSV
}

if (!isGeoJSON) {
  // Parse CSV line
  const csvMatch = raw.match(/^([^,]+),([^,]+),([^,]+),([^,]+),([^,]+),([^,]+)(?:,[^,]*){13},("(?:[^"]|"")*"|[^,]*),([^,]+),([^,]+)(?:,[^,]*){10}$/);
  if (!csvMatch) return false;
  
  const time = csvMatch[1];
  const lat = csvMatch[2];
  const lon = csvMatch[3];
  const depth = csvMatch[4];
  const mag = csvMatch[5];
  const magType = csvMatch[6];
  const place = csvMatch[8].replace(/^"(.*)"$/, '$1').replace(/""/g, '"');
  const type = csvMatch[9];
  const status = csvMatch[10];
  
  source = {
    id: null,
    mag: parseFloat(mag),
    magType: magType,
    place: place,
    time: new Date(time).getTime(),
    type: type,
    status: status,
    sig: null,
    coordinates: [parseFloat(lon), parseFloat(lat), parseFloat(depth)]
  };
}

// Validate required fields exist in source
if (!source.id || source.mag === undefined || !source.magType || !source.place || 
    source.time === undefined || !source.type || !source.status || !source.coordinates) {
  return false;
}

// Validate output structure and types
if (typeof o.event_id !== 'string' || !o.event_id ||
    typeof o.magnitude !== 'number' ||
    typeof o.magnitude_type !== 'string' ||
    typeof o.latitude !== 'number' ||
    typeof o.longitude !== 'number' ||
    typeof o.timestamp_utc !== 'string' ||
    typeof o.place !== 'string' || !o.place ||
    typeof o.event_type !== 'string' ||
    (o.status !== 'reviewed' && o.status !== 'automatic') ||
    typeof o.depth_km !== 'number' ||
    (o.significance !== null && typeof o.significance !== 'number')) {
  return false;
}

// Validate ranges
if (o.latitude < -90 || o.latitude > 90 ||
    o.longitude < -180 || o.longitude > 180 ||
    o.depth_km < -10 || o.depth_km > 800 ||
    (o.significance !== null && (o.significance < 0 || o.significance > 2500))) {
  return false;
}

// Validate magnitude_type
const validMagTypes = ['ml', 'md', 'mb', 'mw', 'mww', 'mwb', 'mwc', 'mwr', 'ms', 'mb_lg', 'mi', 'mh'];
if (!validMagTypes.includes(o.magnitude_type)) {
  return false;
}

// Validate timestamp format
if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(o.timestamp_utc)) {
  return false;
}

// Check consistency with source
if (o.event_id !== source.id ||
    o.magnitude !== source.mag ||
    o.magnitude_type !== source.magType.toLowerCase() ||
    o.latitude !== source.coordinates[1] ||
    o.longitude !== source.coordinates[0] ||
    o.depth_km !== source.coordinates[2] ||
    o.place !== source.place ||
    o.event_type !== source.type ||
    o.status !== source.status) {
  return false;
}

// Verify timestamp conversion (source.time is epoch ms, output is ISO string)
const expectedTime = new Date(source.time).toISOString().replace(/\.\d{3}Z$/, 'Z');
if (o.timestamp_utc !== expectedTime) {
  return false;
}

// Check significance field
if (source.sig !== undefined && source.sig !== null) {
  if (o.significance !== source.sig) return false;
} else {
  if (o.significance !== null) return false;
}

return true;
