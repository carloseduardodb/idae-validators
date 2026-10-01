const round2 = n => Math.round(n * 100) / 100;

// Validate output structure
if (!o || typeof o !== 'object') return false;
if (typeof o.device_id !== 'string' || o.device_id === '') return false;
if (!['temperature', 'humidity', 'pressure'].includes(o.metric)) return false;
if (typeof o.value !== 'number' || !Number.isFinite(o.value)) return false;
if (typeof o.timestamp_utc !== 'string') return false;
if (!['critical', 'warning', 'normal'].includes(o.status)) return false;
if (!['north', 'south', 'east', 'west'].includes(o.zone)) return false;

// Validate timestamp format
if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(o.timestamp_utc)) return false;
const ts = new Date(o.timestamp_utc);
if (isNaN(ts.getTime())) return false;

// Validate value is rounded to 2 decimals
if (o.value !== round2(o.value)) return false;

// Validate physically possible ranges
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

// Extract numbers from raw and verify value can be derived from one of them
const nums = raw.match(/-?\d+(?:[.,]\d+)?/g) || [];
const parsedNums = nums.map(s => parseFloat(s.replace(',', '.')));

let valueFound = false;
for (const n of parsedNums) {
  if (!Number.isFinite(n)) continue;
  const candidates = [n];
  if (o.metric === 'temperature') {
    candidates.push((n - 32) * 5 / 9); // F to C
    candidates.push(n - 273.15); // K to C
  } else if (o.metric === 'pressure') {
    candidates.push(n * 10); // kPa to hPa
  }
  for (const c of candidates) {
    if (round2(c) === o.value) { valueFound = true; break; }
  }
  if (valueFound) break;
}
if (!valueFound) return false;

// Verify timestamp can be derived from raw
const tsYear = ts.getUTCFullYear(), tsMonth = ts.getUTCMonth() + 1, tsDay = ts.getUTCDate();
const tsHour = ts.getUTCHours(), tsMin = ts.getUTCMinutes(), tsSec = ts.getUTCSeconds();

// Check for epoch seconds or milliseconds
const epochSec = Math.floor(ts.getTime() / 1000);
const epochMs = ts.getTime();
const hasEpoch = parsedNums.some(n => n === epochSec || n === epochMs);

// Check for date components in raw
const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const hasYear = raw.includes(String(tsYear));
const hasMonth = raw.includes(String(tsMonth).padStart(2, '0')) || raw.includes(String(tsMonth)) || monthNames.some((m, i) => rawLower.includes(m) && i + 1 === tsMonth);
const hasDay = raw.includes(String(tsDay).padStart(2, '0')) || raw.includes(String(tsDay));

if (!hasEpoch && !(hasYear && hasMonth && hasDay)) return false;

return true;
