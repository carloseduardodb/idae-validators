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

if (Math.round(o.value * 100) / 100 !== o.value) return false;

if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(o.timestamp_utc)) return false;

const validZones = ['north', 'south', 'east', 'west'];
if (!validZones.includes(o.zone)) return false;

const statusRules = {
  temperature: (v) => v > 40 || v < -5 ? 'critical' : v > 30 || v < 0 ? 'warning' : 'normal',
  humidity: (v) => v > 90 ? 'critical' : v > 75 ? 'warning' : 'normal',
  pressure: (v) => v < 960 || v > 1040 ? 'critical' : v < 980 || v > 1030 ? 'warning' : 'normal'
};
const expectedStatus = statusRules[o.metric](o.value);
if (o.status !== expectedStatus) return false;

const metricPatterns = {
  temperature: /temperature|temp/i,
  humidity: /humidity|humid/i,
  pressure: /pressure|press/i
};
if (!metricPatterns[o.metric].test(raw)) return false;

const tsDate = o.timestamp_utc.substring(0, 10);
const tsYear = tsDate.substring(0, 4);
const tsMonth = tsDate.substring(5, 7);
const tsDay = tsDate.substring(8, 10);

const datePatterns = [
  tsDate,
  tsYear + '/' + tsMonth + '/' + tsDay,
  tsDay + '-' + tsMonth + '-' + tsYear,
  tsMonth + '-' + tsDay + '-' + tsYear,
  tsDay + '/' + tsMonth + '/' + tsYear,
  tsMonth + '/' + tsDay + '/' + tsYear
];

let foundDate = false;
for (const dp of datePatterns) {
  if (raw.includes(dp)) {
    foundDate = true;
    break;
  }
}
if (!foundDate) return false;

const zonePatterns = {
  north: /\bn\b|north|zone-?a/i,
  south: /\bs\b|south|zone-?b/i,
  east: /\be\b|east|zone-?c/i,
  west: /\bw\b|west|zone-?d/i
};
if (!zonePatterns[o.zone].test(raw)) return false;

const valueMatch = raw.match(/[-+]?\d+(?:[.,]\d+)?/g);
if (!valueMatch) return false;

let foundValue = false;
for (const vm of valueMatch) {
  const normalized = parseFloat(vm.replace(',', '.'));
  if (Math.abs(normalized - o.value) < 0.01) {
    foundValue = true;
    break;
  }
}
if (!foundValue) return false;

return true;
