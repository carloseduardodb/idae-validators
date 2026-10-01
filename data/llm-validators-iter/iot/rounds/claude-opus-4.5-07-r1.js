const round2 = n => Math.round(n * 100) / 100;

if (!o || typeof o !== 'object') return false;

// Check required fields exist and have correct types
if (typeof o.device_id !== 'string' || o.device_id === '') return false;
if (!['temperature', 'humidity', 'pressure'].includes(o.metric)) return false;
if (typeof o.value !== 'number' || !isFinite(o.value)) return false;
if (typeof o.timestamp_utc !== 'string') return false;
if (!['critical', 'warning', 'normal'].includes(o.status)) return false;
if (!['north', 'south', 'east', 'west'].includes(o.zone)) return false;

// Validate timestamp format
if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(o.timestamp_utc)) return false;
const ts = new Date(o.timestamp_utc);
if (isNaN(ts.getTime())) return false;

// Check value is rounded to 2 decimals
if (o.value !== round2(o.value)) return false;

// Check physically possible ranges
if (o.metric === 'temperature' && (o.value < -60 || o.value > 70)) return false;
if (o.metric === 'humidity' && (o.value < 0 || o.value > 100)) return false;
if (o.metric === 'pressure' && (o.value < 850 || o.value > 1100)) return false;

// Validate status derivation
let expectedStatus;
if (o.metric === 'temperature') {
  if (o.value > 40 || o.value < -5) expectedStatus = 'critical';
  else if (o.value > 30 || o.value < 0) expectedStatus = 'warning';
  else expectedStatus = 'normal';
} else if (o.metric === 'humidity') {
  if (o.value > 90) expectedStatus = 'critical';
  else if (o.value > 75) expectedStatus = 'warning';
  else expectedStatus = 'normal';
} else {
  if (o.value < 960 || o.value > 1040) expectedStatus = 'critical';
  else if (o.value < 980 || o.value > 1030) expectedStatus = 'warning';
  else expectedStatus = 'normal';
}
if (o.status !== expectedStatus) return false;

// Check device_id appears in raw
if (!raw.includes(o.device_id)) return false;

// Check metric indicator in raw
const rawLower = raw.toLowerCase();
if (o.metric === 'temperature' && !/temp|temperature/.test(rawLower)) return false;
if (o.metric === 'humidity' && !/hum|humidity/.test(rawLower)) return false;
if (o.metric === 'pressure' && !/press|pressure/.test(rawLower)) return false;

// Check zone indicator in raw
const zoneMap = { north: /north|zone-a|\bN\b/i, south: /south|zone-b|\bS\b/i, east: /east|zone-c|\bE\b/i, west: /west|zone-d|\bW\b/i };
if (!zoneMap[o.zone].test(raw)) return false;

// Extract numbers from raw to verify value conversion is plausible
const nums = raw.match(/-?\d+[.,]?\d*/g);
if (!nums) return false;
const parsedNums = nums.map(n => parseFloat(n.replace(',', '.')));

let valueFound = false;
for (const n of parsedNums) {
  if (!isFinite(n)) continue;
  // Direct match
  if (round2(n) === o.value) { valueFound = true; break; }
  // Fahrenheit conversion
  if (o.metric === 'temperature' && round2((n - 32) * 5 / 9) === o.value) { valueFound = true; break; }
  // Kelvin conversion
  if (o.metric === 'temperature' && round2(n - 273.15) === o.value) { valueFound = true; break; }
  // kPa to hPa
  if (o.metric === 'pressure' && round2(n * 10) === o.value) { valueFound = true; break; }
}
if (!valueFound) return false;

// Validate timestamp appears derivable from raw
const datePatterns = [
  /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
  /\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/,
  /\d{4}-\d{2}-\d{2}/,
  /[a-z]{3,9}-\d{1,2}-\d{4}/i,
  /\d{10,13}/
];
let hasTimeIndicator = datePatterns.some(p => p.test(raw));
if (!hasTimeIndicator) return false;

return true;
