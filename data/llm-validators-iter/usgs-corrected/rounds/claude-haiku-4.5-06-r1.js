// Parse raw input to extract source values
let source = {};
let isJson = false;

try {
  const parsed = JSON.parse(raw);
  isJson = true;
  
  if (parsed.type === "Feature" && parsed.geometry && parsed.properties) {
    const props = parsed.properties;
    const coords = parsed.geometry.coordinates;
    
    source.event_id = parsed.id;
    source.magnitude = props.mag;
    source.magnitude_type = props.magType;
    source.latitude = coords[1];
    source.longitude = coords[0];
    source.depth_km = coords[2];
    source.timestamp_utc = props.time ? new Date(props.time).toISOString().replace(/\.\d{3}Z$/, 'Z') : undefined;
    source.place = props.place;
    source.event_type = props.type;
    source.status = props.status;
    source.significance = props.sig !== undefined ? props.sig : null;
  }
} catch (e) {
  isJson = false;
}

if (!isJson) {
  const parts = raw.split(',');
  if (parts.length >= 22) {
    const parsePlace = () => {
      let placeStart = -1;
      let placeEnd = -1;
      let inQuotes = false;
      for (let i = 0; i < raw.length; i++) {
        if (raw[i] === '"') {
          if (!inQuotes) {
            placeStart = i + 1;
            inQuotes = true;
          } else {
            placeEnd = i;
            break;
          }
        }
      }
      return placeStart >= 0 && placeEnd > placeStart ? raw.substring(placeStart, placeEnd) : undefined;
    };
    
    source.timestamp_utc = parts[0].trim();
    source.latitude = parseFloat(parts[1]);
    source.longitude = parseFloat(parts[2]);
    source.depth_km = parseFloat(parts[3]);
    source.magnitude = parseFloat(parts[4]);
    source.magnitude_type = parts[5].trim();
    source.event_id = parts[11].trim();
    source.place = parsePlace();
    source.event_type = parts[14].trim();
    source.status = parts[19].trim();
    source.significance = null;
  }
}

// Validate output against source and schema
if (!o || typeof o !== 'object') return false;

// Required fields must exist and be non-null
if (!o.event_id || typeof o.event_id !== 'string' || o.event_id.length === 0) return false;
if (o.magnitude === undefined || o.magnitude === null || typeof o.magnitude !== 'number') return false;
if (!o.magnitude_type || typeof o.magnitude_type !== 'string') return false;
if (o.latitude === undefined || o.latitude === null || typeof o.latitude !== 'number') return false;
if (o.longitude === undefined || o.longitude === null || typeof o.longitude !== 'number') return false;
if (!o.timestamp_utc || typeof o.timestamp_utc !== 'string') return false;
if (!o.place || typeof o.place !== 'string' || o.place.length === 0) return false;
if (o.event_type === undefined || o.event_type === null || typeof o.event_type !== 'string') return false;
if (!o.status || typeof o.status !== 'string') return false;
if (o.depth_km === undefined || o.depth_km === null || typeof o.depth_km !== 'number') return false;

// Validate ranges
if (o.latitude < -90 || o.latitude > 90) return false;
if (o.longitude < -180 || o.longitude > 180) return false;
if (o.depth_km < -10 || o.depth_km > 800) return false;

// Validate magnitude_type
const validMagTypes = ['ml', 'md', 'mb', 'mw', 'mww', 'mwb', 'mwc', 'mwr', 'ms', 'mb_lg', 'mi', 'mh'];
if (!validMagTypes.includes(o.magnitude_type)) return false;

// Validate status
if (o.status !== 'reviewed' && o.status !== 'automatic') return false;

// Validate timestamp format (YYYY-MM-DDTHH:MM:SSZ)
if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(o.timestamp_utc)) return false;

// Validate significance
if (o.significance !== null) {
  if (typeof o.significance !== 'number' || o.significance < 0 || o.significance > 2500) return false;
}

// Check consistency with source
if (source.event_id && o.event_id !== source.event_id) return false;
if (source.magnitude !== undefined && o.magnitude !== source.magnitude) return false;
if (source.magnitude_type && o.magnitude_type !== source.magnitude_type) return false;
if (source.latitude !== undefined && o.latitude !== source.latitude) return false;
if (source.longitude !== undefined && o.longitude !== source.longitude) return false;
if (source.depth_km !== undefined && o.depth_km !== source.depth_km) return false;
if (source.timestamp_utc && o.timestamp_utc !== source.timestamp_utc) return false;
if (source.place && o.place !== source.place) return false;
if (source.event_type && o.event_type !== source.event_type) return false;
if (source.status && o.status !== source.status) return false;

return true;
