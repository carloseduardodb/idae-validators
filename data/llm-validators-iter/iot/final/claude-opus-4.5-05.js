const round2 = n => Math.round(n * 100) / 100;

// Validate output structure
if (!o || typeof o !== 'object') return false;
if (typeof o.device_id !== 'string' || o.device_id === '') return false;
if (!['temperature', 'humidity', 'pressure'].includes(o.metric)) return false;
if (typeof o.value !== 'number' || !Number.isFinite(o.value)) return false;
if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(o.timestamp_utc)) return false;
if (!['critical', 'warning', 'normal'].includes(o.status)) return false;
if (!['north', 'south', 'east', 'west'].includes(o.zone)) return false;

// Check device_id exists in raw
if (!raw.includes(o.device_id)) return false;

// Check value within physical bounds
if (o.metric === 'temperature' && (o.value < -60 || o.value > 70)) return false;
if (o.metric === 'humidity' && (o.value < 0 || o.value > 100)) return false;
if (o.metric === 'pressure' && (o.value < 850 || o.value > 1100)) return false;

// Verify value is rounded to 2 decimals
if (o.value !== round2(o.value)) return false;

// Verify status derivation
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

// Check metric type appears in raw (abbreviated or full)
const rawLower = raw.toLowerCase();
if (o.metric === 'temperature' && !(/temp|temperature/.test(rawLower))) return false;
if (o.metric === 'humidity' && !(/hum|humidity/.test(rawLower))) return false;
if (o.metric === 'pressure' && !(/press|pressure/.test(rawLower))) return false;

// Check zone appears in raw (abbreviated or mapped)
const zoneMap = { north: ['north', 'zone-a', '"n"', '=n', '|n', ' n'], south: ['south', 'zone-b', '"s"', '=s', '|s', ' s'], east: ['east', 'zone-c', '"e"', '=e', '|e', ' e'], west: ['west', 'zone-d', '"w"', '=w', '|w', ' w'] };
const zonePatterns = zoneMap[o.zone];
if (!zonePatterns.some(p => rawLower.includes(p))) return false;

// Validate timestamp is a real date
const ts = new Date(o.timestamp_utc);
if (isNaN(ts.getTime())) return false;

// Check some date component appears in raw
const year = o.timestamp_utc.slice(0, 4);
const month = o.timestamp_utc.slice(5, 7);
const day = o.timestamp_utc.slice(8, 10);
const hasDateHint = raw.includes(year) || /\d{10,13}/.test(raw);
if (!hasDateHint) return false;

// Check raw value can convert to output value
const numMatches = raw.match(/-?\d+[,.]?\d*/g) || [];
const possibleValues = numMatches.map(s => parseFloat(s.replace(',', '.')));

let valueFound = false;
for (const v of possibleValues) {
  if (!Number.isFinite(v)) continue;
  const candidates = [v, round2((v - 32) * 5 / 9), round2(v - 273.15), round2(v * 10)];
  if (candidates.some(c => c === o.value)) {
    valueFound = true;
    break;
  }
}
if (!valueFound) return false;

return true;
