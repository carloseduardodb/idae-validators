// Validate output record structure and values
if (!o || typeof o !== 'object') return false;

const requiredFields = ['device_id', 'metric', 'value', 'timestamp_utc', 'status', 'zone'];
if (!requiredFields.every(f => f in o)) return false;

// Validate device_id: non-empty string, must appear in raw
if (typeof o.device_id !== 'string' || !o.device_id.trim()) return false;
if (!raw.includes(o.device_id)) return false;

// Validate metric
const validMetrics = ['temperature', 'humidity', 'pressure'];
if (!validMetrics.includes(o.metric)) return false;

// Validate value: must be a number
if (typeof o.value !== 'number' || isNaN(o.value)) return false;

// Validate value ranges (physical impossibility check)
const ranges = {
  temperature: [-60, 70],
  humidity: [0, 100],
  pressure: [850, 1100]
};
const [min, max] = ranges[o.metric];
if (o.value < min || o.value > max) return false;

// Validate timestamp_utc format: YYYY-MM-DDTHH:MM:SSZ
if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(o.timestamp_utc)) return false;

// Validate status based on metric and value
const statusMap = {
  temperature: (v) => v > 40 || v < -5 ? 'critical' : v > 30 || v < 0 ? 'warning' : 'normal',
  humidity: (v) => v > 90 ? 'critical' : v > 75 ? 'warning' : 'normal',
  pressure: (v) => v < 960 || v > 1040 ? 'critical' : v < 980 || v > 1030 ? 'warning' : 'normal'
};
if (o.status !== statusMap[o.metric](o.value)) return false;

// Validate zone
const validZones = ['north', 'south', 'east', 'west'];
if (!validZones.includes(o.zone)) return false;

// Verify timestamp appears in raw (in some form)
const dateMatch = o.timestamp_utc.substring(0, 10);
if (!raw.includes(dateMatch)) return false;

// Verify metric type appears in raw (check for metric name or abbreviations)
const metricPatterns = {
  temperature: /temp|temperature/i,
  humidity: /humid|humidity/i,
  pressure: /press|pressure/i
};
if (!metricPatterns[o.metric].test(raw)) return false;

// Verify zone appears in raw (check for zone name or abbreviations)
const zoneMap = { north: /north|zone-?a|[^a-z]n[^a-z]|^n$/i, south: /south|zone-?b|[^a-z]s[^a-z]|^s$/i, east: /east|zone-?c|[^a-z]e[^a-z]|^e$/i, west: /west|zone-?d|[^a-z]w[^a-z]|^w$/i };
if (!zoneMap[o.zone].test(raw)) return false;

// Verify value appears in raw (as number, possibly with unit or comma decimal)
const valueStr = o.value.toString();
const valuePatterns = [
  new RegExp(valueStr.replace('.', '[.,]'), 'i'),
  new RegExp(o.value.toFixed(2).replace('.', '[.,]'), 'i'),
  new RegExp(Math.round(o.value * 100) / 100)
];
if (!valuePatterns.some(p => p.test(raw))) return false;

return true;
