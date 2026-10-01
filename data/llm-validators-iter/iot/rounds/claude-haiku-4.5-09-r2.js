if (!o || typeof o !== 'object') return false;

const { device_id, metric, value, timestamp_utc, status, zone } = o;

if (typeof device_id !== 'string' || !device_id) return false;
if (!['temperature', 'humidity', 'pressure'].includes(metric)) return false;
if (typeof value !== 'number' || !isFinite(value)) return false;
if (typeof timestamp_utc !== 'string' || !timestamp_utc) return false;
if (typeof status !== 'string' || !status) return false;
if (!['north', 'south', 'east', 'west'].includes(zone)) return false;

if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(timestamp_utc)) return false;

if (metric === 'temperature' && (value < -60 || value > 70)) return false;
if (metric === 'humidity' && (value < 0 || value > 100)) return false;
if (metric === 'pressure' && (value < 850 || value > 1100)) return false;

if (Math.round(value * 100) / 100 !== value) return false;

let expectedStatus;
if (metric === 'temperature') {
  if (value > 40 || value < -5) expectedStatus = 'critical';
  else if (value > 30 || value < 0) expectedStatus = 'warning';
  else expectedStatus = 'normal';
} else if (metric === 'humidity') {
  if (value > 90) expectedStatus = 'critical';
  else if (value > 75) expectedStatus = 'warning';
  else expectedStatus = 'normal';
} else if (metric === 'pressure') {
  if (value < 960 || value > 1040) expectedStatus = 'critical';
  else if (value < 980 || value > 1030) expectedStatus = 'warning';
  else expectedStatus = 'normal';
}

if (status !== expectedStatus) return false;

if (!raw.includes(device_id)) return false;

const metricPatterns = {
  temperature: /temperature|temp/i,
  humidity: /humidity|humid/i,
  pressure: /pressure|press/i
};
if (!metricPatterns[metric].test(raw)) return false;

const zoneMap = {
  north: /north|zone-A|(?:^|[^a-zA-Z])N(?:[^a-zA-Z]|$)/i,
  south: /south|zone-B|(?:^|[^a-zA-Z])S(?:[^a-zA-Z]|$)/i,
  east: /east|zone-C|(?:^|[^a-zA-Z])E(?:[^a-zA-Z]|$)/i,
  west: /west|zone-D|(?:^|[^a-zA-Z])W(?:[^a-zA-Z]|$)/i
};
if (!zoneMap[zone].test(raw)) return false;

const dateMatch = timestamp_utc.match(/(\d{4}-\d{2}-\d{2})/);
if (dateMatch && !raw.includes(dateMatch[1])) return false;

const timeMatch = timestamp_utc.match(/T(\d{2}):(\d{2}):(\d{2})/);
if (timeMatch) {
  const hour = timeMatch[1];
  const min = timeMatch[2];
  const sec = timeMatch[3];
  const timePattern = new RegExp(`${hour}:${min}:${sec}|${hour}:${min}|${parseInt(hour)}:${parseInt(min)}`, 'i');
  if (!timePattern.test(raw)) return false;
}

return true;
