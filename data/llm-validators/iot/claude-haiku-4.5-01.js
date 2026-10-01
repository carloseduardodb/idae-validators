// Validate output record structure and content
if (!o || typeof o !== 'object') return false;

const { device_id, metric, value, timestamp_utc, status, zone } = o;

// Check required fields exist and are strings/numbers as needed
if (typeof device_id !== 'string' || !device_id) return false;
if (!['temperature', 'humidity', 'pressure'].includes(metric)) return false;
if (typeof value !== 'number') return false;
if (typeof timestamp_utc !== 'string' || !timestamp_utc) return false;
if (!['critical', 'warning', 'normal'].includes(status)) return false;
if (!['north', 'south', 'east', 'west'].includes(zone)) return false;

// Validate timestamp format YYYY-MM-DDTHH:MM:SSZ
if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(timestamp_utc)) return false;

// Validate value is within physically possible ranges
if (metric === 'temperature' && (value < -60 || value > 70)) return false;
if (metric === 'humidity' && (value < 0 || value > 100)) return false;
if (metric === 'pressure' && (value < 850 || value > 1100)) return false;

// Validate value has at most 2 decimals
if (!/^-?\d+(\.\d{1,2})?$/.test(value.toString())) return false;

// Validate status matches value thresholds
let expectedStatus;
if (metric === 'temperature') {
  expectedStatus = value > 40 || value < -5 ? 'critical' : value > 30 || value < 0 ? 'warning' : 'normal';
} else if (metric === 'humidity') {
  expectedStatus = value > 90 ? 'critical' : value > 75 ? 'warning' : 'normal';
} else if (metric === 'pressure') {
  expectedStatus = value < 960 || value > 1040 ? 'critical' : value < 980 || value > 1030 ? 'warning' : 'normal';
}
if (status !== expectedStatus) return false;

// Verify device_id appears in raw input
if (!raw.includes(device_id)) return false;

// Verify metric type appears in raw (check for metric name or abbreviation)
const metricPatterns = {
  temperature: /temperature|temp/i,
  humidity: /humidity|humid/i,
  pressure: /pressure|press/i
};
if (!metricPatterns[metric].test(raw)) return false;

// Verify zone appears in raw (check for zone name or abbreviation)
const zoneMap = { north: /north|zone-A|[^a-z]N[^a-z]|^N$/i, south: /south|zone-B|[^a-z]S[^a-z]|^S$/i, east: /east|zone-C|[^a-z]E[^a-z]|^E$/i, west: /west|zone-D|[^a-z]W[^a-z]|^W$/i };
if (!zoneMap[zone].test(raw)) return false;

// Verify timestamp appears in raw (date part at minimum)
const datePart = timestamp_utc.substring(0, 10);
if (!raw.includes(datePart)) return false;

return true;
