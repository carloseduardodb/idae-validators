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

// Validate physical bounds
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

// Extract numeric values from raw and verify output value can be derived from one of them
const nums = raw.match(/-?\d+[,.]?\d*/g) || [];
const parsedNums = nums.map(s => parseFloat(s.replace(',', '.'))).filter(n => Number.isFinite(n));

let valueValid = false;
for (const n of parsedNums) {
  if (o.metric === 'temperature') {
    // Could be C, F, or K
    if (round2(n) === o.value) { valueValid = true; break; }
    if (round2((n - 32) * 5 / 9) === o.value) { valueValid = true; break; }
    if (round2(n - 273.15) === o.value) { valueValid = true; break; }
  } else if (o.metric === 'humidity') {
    if (round2(n) === o.value) { valueValid = true; break; }
  } else if (o.metric === 'pressure') {
    // Could be hPa/mbar or kPa
    if (round2(n) === o.value) { valueValid = true; break; }
    if (round2(n * 10) === o.value) { valueValid = true; break; }
  }
}
if (!valueValid) return false;

// Verify timestamp can be derived from raw
// Extract potential timestamp indicators from raw
const epochMatch = raw.match(/\b(1[4-9]\d{8,12})\b/);
if (epochMatch) {
  let epoch = parseInt(epochMatch[1]);
  if (epoch > 1e11) epoch = Math.floor(epoch / 1000); // ms to s
  const d = new Date(epoch * 1000);
  if (d.toISOString().slice(0, 19) + 'Z' !== o.timestamp_utc) {
    // Check if there's also a date string that matches
    const isoMatch = raw.match(/\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2})?/);
    if (!isoMatch) return false;
  }
}

return true;
