// Validate output record structure and types
if (typeof o !== 'object' || o === null) return false;

const required = ['event_id', 'magnitude', 'magnitude_type', 'latitude', 'longitude', 'timestamp_utc', 'place', 'event_type', 'status', 'depth_km', 'significance'];
if (!required.every(k => k in o)) return false;

// Type checks
if (typeof o.event_id !== 'string' || !o.event_id.trim()) return false;
if (typeof o.magnitude !== 'number' || isNaN(o.magnitude)) return false;
if (typeof o.magnitude_type !== 'string' || !o.magnitude_type) return false;
if (typeof o.latitude !== 'number' || o.latitude < -90 || o.latitude > 90) return false;
if (typeof o.longitude !== 'number' || o.longitude < -180 || o.longitude > 180) return false;
if (typeof o.timestamp_utc !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(o.timestamp_utc)) return false;
if (typeof o.place !== 'string' || !o.place.trim()) return false;
if (typeof o.event_type !== 'string') return false;
if (o.status !== 'reviewed' && o.status !== 'automatic') return false;
if (typeof o.depth_km !== 'number' || o.depth_km < 0 || o.depth_km > 800) return false;
if (typeof o.significance !== 'number' || !Number.isInteger(o.significance) || o.significance < 0 || o.significance > 2500) return false;

// Validate magnitude_type is lowercase and in allowed set
const validMagTypes = ['ml', 'md', 'mb', 'mw', 'mww', 'mwb', 'mwc', 'mwr', 'ms', 'mb_lg', 'mi', 'mh'];
if (!validMagTypes.includes(o.magnitude_type) || o.magnitude_type !== o.magnitude_type.toLowerCase()) return false;

// Extract values from raw input to validate consistency
let inputData = {};
try {
  if (raw.trim().startsWith('{')) {
    // GeoJSON format
    const json = JSON.parse(raw);
    if (json.geometry?.coordinates) {
      inputData.lon = json.geometry.coordinates[0];
      inputData.lat = json.geometry.coordinates[1];
      inputData.depth = json.geometry.coordinates[2];
    }
    if (json.properties) {
      inputData.mag = json.properties.mag;
      inputData.magType = json.properties.magType;
      inputData.time = json.properties.time;
      inputData.place = json.properties.place;
      inputData.type = json.properties.type;
      inputData.status = json.properties.status;
      inputData.sig = json.properties.sig;
    }
    inputData.id = json.id;
  } else {
    // CSV format - parse without assuming column positions
    const csvLine = raw.trim();
    const fields = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < csvLine.length; i++) {
      const c = csvLine[i];
      if (c === '"') inQuotes = !inQuotes;
      else if (c === ',' && !inQuotes) {
        fields.push(current);
        current = '';
      } else current += c;
    }
    fields.push(current);
    
    // USGS FDSN order: time,latitude,longitude,depth,mag,magType,nst,gap,dmin,rms,net,id,updated,place,type,horizontalError,depthError,magError,magNst,status,locationSource,magSource
    if (fields.length >= 22) {
      inputData.time = parseInt(fields[0]);
      inputData.lat = parseFloat(fields[1]);
      inputData.lon = parseFloat(fields[2]);
      inputData.depth = parseFloat(fields[3]);
      inputData.mag = parseFloat(fields[4]);
      inputData.magType = fields[5];
      inputData.id = fields[11];
      inputData.place = fields[13].replace(/^"|"$/g, '');
      inputData.type = fields[14];
      inputData.status = fields[19];
    }
  }
} catch (e) {
  return false;
}

// Validate output matches input
if (inputData.id && o.event_id !== inputData.id) return false;
if (inputData.mag !== undefined && o.magnitude !== inputData.mag) return false;
if (inputData.magType && o.magnitude_type !== inputData.magType.toLowerCase()) return false;
if (inputData.lat !== undefined && o.latitude !== inputData.lat) return false;
if (inputData.lon !== undefined && o.longitude !== inputData.lon) return false;
if (inputData.depth !== undefined && o.depth_km !== inputData.depth) return false;
if (inputData.place && o.place !== inputData.place) return false;
if (inputData.type && o.event_type !== inputData.type) return false;
if (inputData.status && o.status !== inputData.status) return false;
if (inputData.sig !== undefined && o.significance !== inputData.sig) return false;

// Validate timestamp matches input time
if (inputData.time !== undefined) {
  const ts = new Date(o.timestamp_utc).getTime();
  if (Math.floor(inputData.time / 1000) !== Math.floor(ts / 1000)) return false;
}

return true;
