if (!o || typeof o !== 'object') return false;

// Check event_id: non-empty string, must exist in raw
if (typeof o.event_id !== 'string' || o.event_id.length === 0) return false;
if (!raw.includes(o.event_id)) return false;

// Check magnitude: number, must exist in raw
if (typeof o.magnitude !== 'number' || !isFinite(o.magnitude)) return false;
if (!raw.includes(String(o.magnitude))) return false;

// Check magnitude_type: lowercase string from allowed list
const validMagTypes = ['ml', 'md', 'mb', 'mw', 'mww', 'mwb', 'mwc', 'mwr', 'ms', 'mb_lg', 'mi', 'mh'];
if (typeof o.magnitude_type !== 'string' || !validMagTypes.includes(o.magnitude_type)) return false;
if (!raw.toLowerCase().includes(o.magnitude_type)) return false;

// Check latitude: number in [-90, 90]
if (typeof o.latitude !== 'number' || !isFinite(o.latitude)) return false;
if (o.latitude < -90 || o.latitude > 90) return false;
if (!raw.includes(String(o.latitude))) return false;

// Check longitude: number in [-180, 180]
if (typeof o.longitude !== 'number' || !isFinite(o.longitude)) return false;
if (o.longitude < -180 || o.longitude > 180) return false;
if (!raw.includes(String(o.longitude))) return false;

// Check timestamp_utc: format YYYY-MM-DDTHH:MM:SSZ
if (typeof o.timestamp_utc !== 'string') return false;
const tsMatch = o.timestamp_utc.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})Z$/);
if (!tsMatch) return false;
const tsDate = new Date(o.timestamp_utc);
if (isNaN(tsDate.getTime())) return false;

// Verify timestamp relates to raw - check if epoch ms or ISO string exists
const epochMs = tsDate.getTime();
const rawHasEpoch = raw.includes(String(epochMs)) || raw.includes(String(epochMs).slice(0, -3));
const rawHasIso = raw.includes(o.timestamp_utc.slice(0, 19)) || raw.includes(o.timestamp_utc.slice(0, 10));
if (!rawHasEpoch && !rawHasIso) return false;

// Check place: non-empty string, must exist verbatim in raw
if (typeof o.place !== 'string' || o.place.length === 0) return false;
if (!raw.includes(o.place)) return false;

// Check event_type: string, must exist in raw
if (typeof o.event_type !== 'string') return false;
if (!raw.toLowerCase().includes(o.event_type.toLowerCase())) return false;

// Check status: "reviewed" or "automatic"
if (o.status !== 'reviewed' && o.status !== 'automatic') return false;
if (!raw.includes(o.status)) return false;

// Check depth_km: number in [-10, 800]
if (typeof o.depth_km !== 'number' || !isFinite(o.depth_km)) return false;
if (o.depth_km < -10 || o.depth_km > 800) return false;
if (!raw.includes(String(o.depth_km))) return false;

// Check significance: integer in [0, 2500] or null
if (o.significance !== null) {
  if (typeof o.significance !== 'number' || !Number.isInteger(o.significance)) return false;
  if (o.significance < 0 || o.significance > 2500) return false;
  if (!raw.includes(String(o.significance))) return false;
} else {
  // If null, raw should not contain "sig" field with a value
  const sigPattern = /"sig"\s*:\s*\d+/;
  if (sigPattern.test(raw)) return false;
}

return true;
