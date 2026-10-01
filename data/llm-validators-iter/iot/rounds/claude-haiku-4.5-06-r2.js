if (!o || typeof o !== 'object') return false;

const requiredFields = ['device_id', 'metric', 'value', 'timestamp_utc', 'status', 'zone'];
if (!requiredFields.every(f => f in o)) return false;

if (typeof o.device_id !== 'string' || !o.device_id.trim()) return false;
if (!raw.includes(o.device_id)) return false;

const validMetrics = ['temperature', 'humidity', 'pressure'];
if (!validMetrics.includes(o.metric)) return false;

if (typeof o.value !== 'number' || isNaN(o.value)) return false;

const ranges = {
  temperature: [-60, 70],
  humidity: [0, 100],
  pressure: [850, 1100]
};
const [min, max] = ranges[o.metric];
if (o.value < min || o.value > max) return false;

if (!/^-?\d+(\.\d{1,2})?$/.test(o.value.toString())) return false;

if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(o.timestamp_utc)) return false;

const validZones = ['north', 'south', 'east', 'west'];
if (!validZones.includes(o.zone)) return false;

const statusMap = {
  temperature: (v) => v > 40 || v < -5 ? 'critical' : v > 30 || v < 0 ? 'warning' : 'normal',
  humidity: (v) => v > 90 ? 'critical' : v > 75 ? 'warning' : 'normal',
  pressure: (v) => v < 960 || v > 1040 ? 'critical' : v < 980 || v > 1030 ? 'warning' : 'normal'
};
if (o.status !== statusMap[o.metric](o.value)) return false;

const metricPatterns = {
  temperature: /temperature|temp/i,
  humidity: /humidity|humid/i,
  pressure: /pressure|press/i
};
if (!metricPatterns[o.metric].test(raw)) return false;

const dateMatch = o.timestamp_utc.match(/^(\d{4}-\d{2}-\d{2})/);
if (dateMatch) {
  const [year, month, day] = dateMatch[1].split('-');
  if (!raw.includes(year) || !raw.includes(month) || !raw.includes(day)) return false;
}

const timeMatch = o.timestamp_utc.match(/T(\d{2}):(\d{2}):(\d{2})/);
if (timeMatch) {
  const [, hours, minutes, seconds] = timeMatch;
  if (!raw.includes(hours) || !raw.includes(minutes) || !raw.includes(seconds)) return false;
}

const zonePatterns = {
  north: /north|zone-?a|^n$/i,
  south: /south|zone-?b|^s$/i,
  east: /east|zone-?c|^e$/i,
  west: /west|zone-?d|^w$/i
};
if (!zonePatterns[o.zone].test(raw)) return false;

return true;
