const round2 = n => Math.round(n * 100) / 100;

// Validate output structure
if (!o || typeof o !== 'object') return false;
if (typeof o.device_id !== 'string' || o.device_id === '') return false;
if (!['temperature', 'humidity', 'pressure'].includes(o.metric)) return false;
if (typeof o.value !== 'number' || !isFinite(o.value)) return false;
if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(o.timestamp_utc)) return false;
if (!['critical', 'warning', 'normal'].includes(o.status)) return false;
if (!['north', 'south', 'east', 'west'].includes(o.zone)) return false;

// Validate physical ranges
if (o.metric === 'temperature' && (o.value < -60 || o.value > 70)) return false;
if (o.metric === 'humidity' && (o.value < 0 || o.value > 100)) return false;
if (o.metric === 'pressure' && (o.value < 850 || o.value > 1100)) return false;

// Validate status derivation
let expectedStatus;
if (o.metric === 'temperature') {
  expectedStatus = (o.value > 40 || o.value < -5) ? 'critical' : (o.value > 30 || o.value < 0) ? 'warning' : 'normal';
} else if (o.metric === 'humidity') {
  expectedStatus = o.value > 90 ? 'critical' : o.value > 75 ? 'warning' : 'normal';
} else {
  expectedStatus = (o.value < 960 || o.value > 1040) ? 'critical' : (o.value < 980 || o.value > 1030) ? 'warning' : 'normal';
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

// Extract numbers from raw and verify value can be derived
const nums = raw.match(/-?\d+[,.]?\d*/g) || [];
const rawNums = nums.map(s => parseFloat(s.replace(',', '.')));

let valueFound = false;
for (const n of rawNums) {
  if (!isFinite(n)) continue;
  const candidates = [n];
  if (o.metric === 'temperature') {
    candidates.push(round2((n - 32) * 5 / 9)); // from F
    candidates.push(round2(n - 273.15)); // from K
  }
  if (o.metric === 'pressure') {
    candidates.push(round2(n * 10)); // from kPa
  }
  for (const c of candidates) {
    if (round2(c) === o.value) { valueFound = true; break; }
  }
  if (valueFound) break;
}
if (!valueFound) return false;

// Validate timestamp - check date components appear in raw or epoch conversion
const tsMatch = o.timestamp_utc.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})Z$/);
const [, yr, mo, dy, hr, mi, se] = tsMatch;
const outDate = new Date(o.timestamp_utc);
if (isNaN(outDate.getTime())) return false;

// Check if epoch seconds or milliseconds in raw
const epochSec = Math.floor(outDate.getTime() / 1000);
const epochMs = outDate.getTime();
const hasEpoch = raw.includes(String(epochSec)) || raw.includes(String(epochMs));

// Check if date components appear
const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const moNum = parseInt(mo, 10);
const hasYear = raw.includes(yr);
const hasMonth = raw.includes(mo) || raw.includes(String(moNum)) || (moNum >= 1 && moNum <= 12 && rawLower.includes(monthNames[moNum - 1]));
const hasDay = raw.includes(dy) || raw.includes(String(parseInt(dy, 10)));

if (!hasEpoch && !(hasYear && hasMonth && hasDay)) return false;

return true;
