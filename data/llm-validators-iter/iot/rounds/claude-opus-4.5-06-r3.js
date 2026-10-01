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
    candidates.push((n - 32) * 5 / 9);
    candidates.push(n - 273.15);
  } else if (o.metric === 'pressure') {
    candidates.push(n * 10);
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
const epochSec = Math.floor(ts.getTime() / 1000);
const epochMs = ts.getTime();

// Check for epoch seconds or milliseconds (exact match required)
const hasEpoch = parsedNums.some(n => n === epochSec || n === epochMs);
if (hasEpoch) return true;

// Check for date components in raw
const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const hasYear = raw.includes(String(tsYear));
const monthPadded = String(tsMonth).padStart(2, '0');
const dayPadded = String(tsDay).padStart(2, '0');
const hasMonthNum = new RegExp('\\b0?' + tsMonth + '\\b').test(raw) || raw.includes('-' + monthPadded) || raw.includes('/' + monthPadded);
const hasMonthName = monthNames.some((m, i) => rawLower.includes(m) && i + 1 === tsMonth);
const hasMonth = hasMonthNum || hasMonthName;
const hasDay = new RegExp('\\b0?' + tsDay + '\\b').test(raw) || raw.includes('-' + dayPadded) || raw.includes('/' + dayPadded);

if (!hasYear || !hasMonth || !hasDay) return false;

// Check time - extract all HH:MM(:SS) patterns and timezone offsets
const timeMatches = raw.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/g) || [];
const offsetMatch = raw.match(/([+-])(\d{2}):?(\d{2})/);
const hasZ = /\dZ\b|T\d{2}:\d{2}:\d{2}Z/.test(raw);
const isMidnight = tsHour === 0 && tsMin === 0 && tsSec === 0;

if (timeMatches.length === 0) {
  // No time in raw - output must be midnight
  return isMidnight;
}

// Parse offset if present
let offsetMinutes = 0;
if (offsetMatch) {
  const sign = offsetMatch[1] === '+' ? 1 : -1;
  offsetMinutes = sign * (parseInt(offsetMatch[2], 10) * 60 + parseInt(offsetMatch[3], 10));
} else if (hasZ) {
  offsetMinutes = 0;
}

// Check if any time in raw matches output when converted to UTC
for (const tm of timeMatches) {
  const parts = tm.split(':');
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const s = parts[2] ? parseInt(parts[2], 10) : 0;
  
  // Convert raw time to UTC using the offset found (or 0 if none/Z)
  const rawMinutes = h * 60 + m - offsetMinutes;
  const utcH = ((Math.floor(rawMinutes / 60) % 24) + 24) % 24;
  const utcM = ((rawMinutes % 60) + 60) % 60;
  
  if (utcH === tsHour && utcM === tsMin && s === tsSec) return true;
}

return false;
