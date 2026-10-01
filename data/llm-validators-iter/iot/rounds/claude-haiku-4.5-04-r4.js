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

const statusRules = {
  temperature: (v) => v > 40 || v < -5 ? 'critical' : v > 30 || v < 0 ? 'warning' : 'normal',
  humidity: (v) => v > 90 ? 'critical' : v > 75 ? 'warning' : 'normal',
  pressure: (v) => v < 960 || v > 1040 ? 'critical' : v < 980 || v > 1030 ? 'warning' : 'normal'
};
if (o.status !== statusRules[o.metric](o.value)) return false;

const metricPatterns = {
  temperature: /\b(temperature|temp)\b/i,
  humidity: /\b(humidity|humid)\b/i,
  pressure: /\b(pressure|press)\b/i
};
if (!metricPatterns[o.metric].test(raw)) return false;

const zonePatterns = {
  north: /\b(north|zone-?a|N)\b/i,
  south: /\b(south|zone-?b|S)\b/i,
  east: /\b(east|zone-?c|E)\b/i,
  west: /\b(west|zone-?d|W)\b/i
};
if (!zonePatterns[o.zone].test(raw)) return false;

const valueMatch = raw.match(/[-+]?\d+(?:[.,]\d+)?/g);
if (!valueMatch) return false;
const rawValues = valueMatch.map(v => parseFloat(v.replace(',', '.')));
if (!rawValues.some(v => Math.abs(v - o.value) < 0.01)) return false;

const dateMatch = raw.match(/\d{4}[-\/]?\d{2}[-\/]?\d{2}|\d{1,2}[-\w]+[-\d]{4}/i);
if (!dateMatch) return false;
const extractedDate = o.timestamp_utc.substring(0, 10);
if (!dateMatch[0].replace(/[-\/]/g, '').includes(extractedDate.replace(/-/g, ''))) return false;

const timeMatch = raw.match(/\d{1,2}:\d{2}(?::\d{2})?/);
const expectedTime = o.timestamp_utc.substring(11, 19);
if (timeMatch) {
  const rawTime = timeMatch[0];
  const rawParts = rawTime.split(':').map(Number);
  const expectedParts = expectedTime.split(':').map(Number);
  if (rawParts[0] !== expectedParts[0] || rawParts[1] !== expectedParts[1]) return false;
  if (rawParts.length === 3 && rawParts[2] !== expectedParts[2]) return false;
}

return true;
