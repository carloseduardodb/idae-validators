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
  temperature: /temp|°?C(?![a-z])|celsius|fahrenheit|kelvin|K(?![a-z])|F(?![a-z])/i,
  humidity: /humid|%|RH/i,
  pressure: /press|hPa|mbar|kPa/i
};
if (!raw.match(metricPatterns[metric])) return false;

const dateMatch = timestamp_utc.match(/(\d{4})-(\d{2})-(\d{2})/);
if (!dateMatch) return false;
const [, year, month, day] = dateMatch;
if (!raw.includes(year)) return false;

const timeMatch = timestamp_utc.match(/T(\d{2}):(\d{2}):(\d{2})/);
if (!timeMatch) return false;
const [, hours, minutes, seconds] = timeMatch;
const timeStr = `${hours}:${minutes}:${seconds}`;
if (!raw.includes(timeStr) && !raw.includes(hours + ':' + minutes)) return false;

const zoneMap = { north: ['north', 'zone-a', 'zone-A', 'N'], south: ['south', 'zone-b', 'zone-B', 'S'], east: ['east', 'zone-c', 'zone-C', 'E'], west: ['west', 'zone-d', 'zone-D', 'W'] };
const zonePatterns = zoneMap[zone];
if (!zonePatterns.some(p => raw.toLowerCase().includes(p.toLowerCase()))) return false;

return true;
