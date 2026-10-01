if (!o || typeof o !== 'object') return false;

const { device_id, metric, value, timestamp_utc, status, zone } = o;

if (typeof device_id !== 'string' || !device_id.trim()) return false;
if (!['temperature', 'humidity', 'pressure'].includes(metric)) return false;
if (typeof value !== 'number' || !isFinite(value)) return false;
if (typeof timestamp_utc !== 'string' || !timestamp_utc.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/)) return false;
if (!['north', 'south', 'east', 'west'].includes(zone)) return false;
if (!['critical', 'warning', 'normal'].includes(status)) return false;

if (metric === 'temperature' && (value < -60 || value > 70)) return false;
if (metric === 'humidity' && (value < 0 || value > 100)) return false;
if (metric === 'pressure' && (value < 850 || value > 1100)) return false;

if (Math.round(value * 100) / 100 !== value) return false;

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

if (!raw.includes(device_id)) return false;

const metricPatterns = {
  temperature: /temp(?:erature)?|°?C\b|celsius|fahrenheit|kelvin|[FK]\b/i,
  humidity: /humid(?:ity)?|%\s*RH|%\s*H/i,
  pressure: /press(?:ure)?|hPa|mbar|kPa/i
};
if (!metricPatterns[metric].test(raw)) return false;

const tsDate = timestamp_utc.substring(0, 10);
const tsTime = timestamp_utc.substring(11, 19);
if (!raw.includes(tsDate)) return false;

const timeMatch = raw.match(/\d{1,2}:\d{2}(?::\d{2})?/);
if (!timeMatch) return false;
const rawTime = timeMatch[0].split(':').slice(0, 2).join(':');
const expectedTimePrefix = tsTime.substring(0, 5);
if (rawTime !== expectedTimePrefix) return false;

const zonePatterns = {
  north: /\b(north|zone-?A|N)\b/i,
  south: /\b(south|zone-?B|S)\b/i,
  east: /\b(east|zone-?C|E)\b/i,
  west: /\b(west|zone-?D|W)\b/i
};
if (!zonePatterns[zone].test(raw)) return false;

return true;
