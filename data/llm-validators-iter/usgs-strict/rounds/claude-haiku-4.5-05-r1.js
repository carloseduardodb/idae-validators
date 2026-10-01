// Validate output record structure and constraints
if (!o || typeof o !== 'object') return false;

// Required fields with type checks
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

// Validate magnitude_type is one of allowed values
const validMagTypes = ['ml', 'md', 'mb', 'mw', 'mww', 'mwb', 'mwc', 'mwr', 'ms', 'mb_lg', 'mi', 'mh'];
if (!validMagTypes.includes(o.magnitude_type.toLowerCase())) return false;

// Verify event_id appears in raw input
if (!raw.includes(o.event_id)) return false;

// Verify magnitude appears in raw input (as number)
if (!raw.includes(String(o.magnitude))) return false;

// Verify latitude and longitude appear in raw input
if (!raw.includes(String(o.latitude)) || !raw.includes(String(o.longitude))) return false;

// Verify place appears in raw input
if (!raw.includes(o.place)) return false;

// Verify timestamp_utc corresponds to a valid date
const dateMatch = o.timestamp_utc.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})Z$/);
if (!dateMatch) return false;
const date = new Date(o.timestamp_utc);
if (isNaN(date.getTime())) return false;

// Verify depth_km appears in raw input
if (!raw.includes(String(o.depth_km))) return false;

return true;
