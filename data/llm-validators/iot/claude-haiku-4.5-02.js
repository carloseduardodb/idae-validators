// Validate output record structure and values
if (!o || typeof o !== 'object') return false;

const { device_id, metric, value, timestamp_utc, status, zone } = o;

// Check required fields exist and are non-empty strings where needed
if (typeof device_id !== 'string' || !device_id.trim()) return false;
if (!['temperature', 'humidity', 'pressure'].includes(metric)) return false;
if (typeof value !== 'number' || !isFinite(value)) return false;
if (typeof timestamp_utc !== 'string' || !timestamp_utc.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/)) return false;
if (!['north', 'south', 'east', 'west'].includes(zone)) return false;
if (!['critical', 'warning', 'normal'].includes(status)) return false;

// Check value is within physically possible range
if (metric === 'temperature' && (value < -60 || value > 70)) return false;
if (metric === 'humidity' && (value < 0 || value > 100)) return false;
if (metric === 'pressure' && (value < 850 || value > 1100)) return false;

// Check value is rounded to 2 decimals
if (Math.round(value * 100) / 100 !== value) return false;

// Validate status matches value thresholds
let expectedStatus = 'normal';
if (metric === 'temperature') {
  if (value > 40 || value < -5) expectedStatus = 'critical';
  else if (value > 30 || value < 0) expectedStatus = 'warning';
} else if (metric === 'humidity') {
  if (value > 90) expectedStatus = 'critical';
  else if (value > 75) expectedStatus = 'warning';
} else if (metric === 'pressure') {
  if (value < 960 || value > 1040) expectedStatus = 'critical';
  else if (value < 980 || value > 1030) expectedStatus = 'warning';
}
if (status !== expectedStatus) return false;

// Check device_id appears in raw input
if (!raw.includes(device_id)) return false;

// Check metric type appears in raw (handle abbreviations)
const metricPatterns = {
  temperature: /temp(?:erature)?|°?C(?![a-z])|celsius/i,
  humidity: /humid(?:ity)?|%\s*RH|%\s*humidity/i,
  pressure: /press(?:ure)?|hPa|mbar|kPa/i
};
if (!raw.match(metricPatterns[metric])) return false;

// Check timestamp appears in raw (flexible format matching)
const dateMatch = timestamp_utc.match(/(\d{4})-(\d{2})-(\d{2})/);
if (dateMatch && !raw.includes(dateMatch[1])) return false;

// Check zone appears in raw (handle abbreviations and vendor mappings)
const zonePatterns = {
  north: /north|zone-?A|[^a-z]N(?:[^a-z]|$)/i,
  south: /south|zone-?B|[^a-z]S(?:[^a-z]|$)/i,
  east: /east|zone-?C|[^a-z]E(?:[^a-z]|$)/i,
  west: /west|zone-?D|[^a-z]W(?:[^a-z]|$)/i
};
if (!raw.match(zonePatterns[zone])) return false;

return true;
