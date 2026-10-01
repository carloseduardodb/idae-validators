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
const expectedStatus = statusRules[o.metric](o.value);
if (o.status !== expectedStatus) return false;

const metricPatterns = {
  temperature: /temperature|temp/i,
  humidity: /humidity|humid/i,
  pressure: /pressure|press/i
};
if (!metricPatterns[o.metric].test(raw)) return false;

const tsDate = o.timestamp_utc.substring(0, 10);
const tsTime = o.timestamp_utc.substring(11, 19);
const dateVariants = [
  tsDate,
  tsDate.replace(/-/g, '/'),
  tsDate.replace(/-/g, '-').split('-').reverse().join('-'),
  tsDate.split('-')[2] + '-' + tsDate.split('-')[1] + '-' + tsDate.split('-')[0]
];
const timeVariants = [tsTime, tsTime.replace(/:/g, '')];

let foundTimestamp = false;
for (const dv of dateVariants) {
  for (const tv of timeVariants) {
    if (raw.includes(dv) && raw.includes(tv)) {
      foundTimestamp = true;
      break;
    }
  }
  if (foundTimestamp) break;
}
if (!foundTimestamp && !raw.includes(tsDate)) return false;

const zonePatterns = {
  north: /\bn\b|north|zone-?a/i,
  south: /\bs\b|south|zone-?b/i,
  east: /\be\b|east|zone-?c/i,
  west: /\bw\b|west|zone-?d/i
};
if (!zonePatterns[o.zone].test(raw)) return false;

return true;
