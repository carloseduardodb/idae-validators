// Parse raw input as JSON or CSV
let input;
try {
  input = JSON.parse(raw);
  if (!input.geometry || !input.properties) return false;
  var isGeoJSON = true;
} catch {
  var isGeoJSON = false;
  try {
    const parts = raw.split(',');
    if (parts.length < 22) return false;
    input = {
      time: parts[0],
      latitude: parts[1],
      longitude: parts[2],
      depth: parts[3],
      mag: parts[4],
      magType: parts[5],
      id: parts[11],
      place: parts[13],
      type: parts[14],
      status: parts[19]
    };
  } catch {
    return false;
  }
}

// Validate output structure
if (!o || typeof o !== 'object') return false;

const required = ['event_id', 'magnitude', 'magnitude_type', 'latitude', 'longitude', 'timestamp_utc', 'place', 'event_type', 'status', 'depth_km', 'significance'];
if (!required.every(k => k in o)) return false;

// Validate field types and formats
if (typeof o.event_id !== 'string' || !o.event_id) return false;
if (typeof o.magnitude !== 'number' || isNaN(o.magnitude)) return false;
if (typeof o.magnitude_type !== 'string' || !/^(ml|md|mb|mw|mww|mwb|mwc|mwr|ms|mb_lg|mi|mh)$/.test(o.magnitude_type)) return false;
if (typeof o.latitude !== 'number' || o.latitude < -90 || o.latitude > 90) return false;
if (typeof o.longitude !== 'number' || o.longitude < -180 || o.longitude > 180) return false;
if (typeof o.timestamp_utc !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(o.timestamp_utc)) return false;
if (typeof o.place !== 'string' || !o.place) return false;
if (typeof o.event_type !== 'string') return false;
if (o.status !== 'reviewed' && o.status !== 'automatic') return false;
if (typeof o.depth_km !== 'number' || o.depth_km < 0 || o.depth_km > 800) return false;
if (typeof o.significance !== 'number' || !Number.isInteger(o.significance) || o.significance < 0 || o.significance > 2500) return false;

// Validate consistency with input
if (isGeoJSON) {
  const props = input.properties;
  const coords = input.geometry.coordinates;
  
  if (o.event_id !== input.id) return false;
  if (Math.abs(o.magnitude - props.mag) > 0.001) return false;
  if (o.magnitude_type !== props.magType) return false;
  if (Math.abs(o.latitude - coords[1]) > 0.0001) return false;
  if (Math.abs(o.longitude - coords[0]) > 0.0001) return false;
  if (Math.abs(o.depth_km - coords[2]) > 0.001) return false;
  if (o.place !== props.place) return false;
  if (o.event_type !== props.type) return false;
  if (o.status !== props.status) return false;
  if (o.significance !== props.sig) return false;
  
  const epochMs = props.time;
  const date = new Date(epochMs);
  const expected = date.toISOString().replace(/\.\d{3}Z$/, 'Z');
  if (o.timestamp_utc !== expected) return false;
} else {
  if (o.event_id !== input.id) return false;
  if (Math.abs(o.magnitude - parseFloat(input.mag)) > 0.001) return false;
  if (o.magnitude_type !== input.magType) return false;
  if (Math.abs(o.latitude - parseFloat(input.latitude)) > 0.0001) return false;
  if (Math.abs(o.longitude - parseFloat(input.longitude)) > 0.0001) return false;
  if (Math.abs(o.depth_km - parseFloat(input.depth)) > 0.001) return false;
  if (o.place !== input.place) return false;
  if (o.event_type !== input.type) return false;
  if (o.status !== input.status) return false;
  
  const epochMs = parseInt(input.time);
  const date = new Date(epochMs);
  const expected = date.toISOString().replace(/\.\d{3}Z$/, 'Z');
  if (o.timestamp_utc !== expected) return false;
}

return true;
