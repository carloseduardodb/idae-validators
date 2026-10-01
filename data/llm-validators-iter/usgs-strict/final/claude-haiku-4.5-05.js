if (!o || typeof o !== 'object') return false;

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

const validMagTypes = ['ml', 'md', 'mb', 'mw', 'mww', 'mwb', 'mwc', 'mwr', 'ms', 'mb_lg', 'mi', 'mh'];
if (!validMagTypes.includes(o.magnitude_type.toLowerCase())) return false;

if (!raw.includes(o.event_id)) return false;
if (!raw.includes(String(o.magnitude))) return false;
if (!raw.includes(String(o.latitude)) || !raw.includes(String(o.longitude))) return false;
if (!raw.includes(o.place)) return false;
if (!raw.includes(String(o.depth_km))) return false;

const dateMatch = o.timestamp_utc.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})Z$/);
if (!dateMatch) return false;
const date = new Date(o.timestamp_utc);
if (isNaN(date.getTime())) return false;

let timeInRaw = null;
const epochMatch = raw.match(/"time"\s*:\s*(\d+)/);
if (epochMatch) {
  timeInRaw = parseInt(epochMatch[1], 10);
} else {
  const csvTimeMatch = raw.match(/^(\d+),/);
  if (csvTimeMatch) {
    timeInRaw = parseInt(csvTimeMatch[1], 10);
  }
}

if (timeInRaw !== null) {
  const expectedDate = new Date(timeInRaw);
  if (expectedDate.toISOString().slice(0, 19) + 'Z' !== o.timestamp_utc) return false;
}

if (!raw.includes(o.event_type)) return false;
if (!raw.includes(String(o.significance))) return false;

return true;
