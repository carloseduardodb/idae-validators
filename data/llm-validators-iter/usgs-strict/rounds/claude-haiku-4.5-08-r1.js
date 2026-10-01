// Parse raw input as JSON or CSV
let input;
try {
  input = JSON.parse(raw);
  if (!input.geometry || !input.properties) return false;
} catch {
  const parts = raw.split(',');
  if (parts.length < 22) return false;
  input = { csv: true, parts };
}

// Validate output structure
if (typeof o !== 'object' || o === null) return false;

const required = ['event_id', 'magnitude', 'magnitude_type', 'latitude', 'longitude', 'timestamp_utc', 'place', 'event_type', 'status', 'depth_km', 'significance'];
if (!required.every(k => k in o)) return false;

// Validate field types and ranges
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
if (typeof o.significance !== 'number' || o.significance < 0 || o.significance > 2500 || !Number.isInteger(o.significance)) return false;

// Validate against input
if (input.csv) {
  const [time, lat, lon, depth, mag, magType, , , , , , id, , place, type, , , , , status] = input.parts;
  if (o.event_id !== id.trim()) return false;
  if (Math.abs(parseFloat(mag) - o.magnitude) > 0.0001) return false;
  if (o.magnitude_type !== magType.trim().toLowerCase()) return false;
  if (Math.abs(parseFloat(lat) - o.latitude) > 0.0001) return false;
  if (Math.abs(parseFloat(lon) - o.longitude) > 0.0001) return false;
  if (Math.abs(parseFloat(depth) - o.depth_km) > 0.0001) return false;
  const expectedTime = new Date(parseInt(time)).toISOString().replace(/\.\d{3}Z$/, 'Z');
  if (o.timestamp_utc !== expectedTime) return false;
  const cleanPlace = place.trim().replace(/^"|"$/g, '');
  if (o.place !== cleanPlace) return false;
  if (o.event_type !== type.trim()) return false;
  if (o.status !== status.trim().toLowerCase()) return false;
} else {
  const props = input.properties;
  const coords = input.geometry.coordinates;
  if (o.event_id !== input.id) return false;
  if (Math.abs(props.mag - o.magnitude) > 0.0001) return false;
  if (o.magnitude_type !== props.magType.toLowerCase()) return false;
  if (Math.abs(coords[1] - o.latitude) > 0.0001) return false;
  if (Math.abs(coords[0] - o.longitude) > 0.0001) return false;
  if (Math.abs(coords[2] - o.depth_km) > 0.0001) return false;
  const expectedTime = new Date(props.time).toISOString().replace(/\.\d{3}Z$/, 'Z');
  if (o.timestamp_utc !== expectedTime) return false;
  if (o.place !== props.place) return false;
  if (o.event_type !== props.type) return false;
  if (o.status !== props.status) return false;
  if (o.significance !== props.sig) return false;
}

return true;
