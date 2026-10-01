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

const [date, time] = timestamp_utc.split('T');
const [y, m, d] = date.split('-');
if (!new RegExp(`${y}[-/]${m}[-/]${d}|${m}[-/]${d}[-/]${y}|${d}[-/]${m}[-/]${y}|${y}\\s+${m}\\s+${d}|${m}\\s+${d}\\s+${y}|${d}\\s+${m}\\s+${y}`, 'i').test(raw)) return false;

const [h, min, s] = time.slice(0, -1).split(':');
if (!new RegExp(`${h}:${min}:${s}|${parseInt(h)}:${parseInt(min)}:${parseInt(s)}`, 'i').test(raw)) return false;

const valueStr = value.toString();
const absValue = Math.abs(value).toString();
if (!new RegExp(absValue.replace(/\./g, '[.,]'), 'i').test(raw)) return false;

return true;
