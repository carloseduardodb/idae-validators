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
  temperature: /temp(?:erature)?|°C|celsius|C(?:\b|[^a-z])|K(?:\b|[^a-z])|F(?:\b|[^a-z])/i,
  humidity: /humid(?:ity)?|%RH|%\s*RH/i,
  pressure: /press(?:ure)?|hPa|kPa|mbar/i
};
if (!metricPatterns[metric].test(raw)) return false;

const zonePatterns = {
  north: /\b(north|N|zone-A)\b/i,
  south: /\b(south|S|zone-B)\b/i,
  east: /\b(east|E|zone-C)\b/i,
  west: /\b(west|W|zone-D)\b/i
};
if (!zonePatterns[zone].test(raw)) return false;

const [datePart, timePart] = timestamp_utc.split('T');
const [yyyy, mm, dd] = datePart.split('-');
const [hh, min, ss] = timePart.slice(0, -1).split(':');

const dateStr = `${yyyy}-${mm}-${dd}`;
if (!raw.includes(dateStr) && !(raw.includes(yyyy) && raw.includes(mm) && raw.includes(dd))) return false;

const timeStr = `${hh}:${min}:${ss}`;
if (!raw.includes(timeStr)) {
  const rawTimes = raw.match(/\d{1,2}:\d{2}(?::\d{2})?/g) || [];
  if (!rawTimes.some(t => t.includes(min) && t.includes(ss))) return false;
}

return true;
