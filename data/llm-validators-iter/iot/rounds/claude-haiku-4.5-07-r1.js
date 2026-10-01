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

// Validate value is a number
if (typeof o.value !== 'number' || isNaN(o.value)) return false;

// Validate value ranges by metric
const ranges = {
  temperature: [-60, 70],
  humidity: [0, 100],
  pressure: [850, 1100]
};
const [min, max] = ranges[o.metric];
if (o.value < min || o.value > max) return false;

// Validate value has at most 2 decimals
if (!/^-?\d+(\.\d{1,2})?$/.test(o.value.toString())) return false;

// Validate timestamp_utc format YYYY-MM-DDTHH:MM:SSZ
if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(o.timestamp_utc)) return false;

// Validate timestamp appears in raw (in some form)
const dateMatch = o.timestamp_utc.substring(0, 10);
if (!raw.includes(dateMatch)) return false;

// Validate zone
const validZones = ['north', 'south', 'east', 'west'];
if (!validZones.includes(o.zone)) return false;

// Validate status is derived correctly
const statusRules = {
  temperature: (v) => v > 40 || v < -5 ? 'critical' : v > 30 || v < 0 ? 'warning' : 'normal',
  humidity: (v) => v > 90 ? 'critical' : v > 75 ? 'warning' : 'normal',
  pressure: (v) => v < 960 || v > 1040 ? 'critical' : v < 980 || v > 1030 ? 'warning' : 'normal'
};
const expectedStatus = statusRules[o.metric](o.value);
if (o.status !== expectedStatus) return false;

// Validate metric appears in raw (check for metric name or abbreviations)
const metricPatterns = {
  temperature: /temperature|temp/i,
  humidity: /humidity|humid/i,
  pressure: /pressure|press/i
};
if (!metricPatterns[o.metric].test(raw)) return false;

return true;
