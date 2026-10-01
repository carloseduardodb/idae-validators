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
    if (round2(n) === o.value) { valueValid = true; break; }
    if (round2((n - 32) * 5 / 9) === o.value) { valueValid = true; break; }
    if (round2(n - 273.15) === o.value) { valueValid = true; break; }
  } else if (o.metric === 'humidity') {
    if (round2(n) === o.value) { valueValid = true; break; }
  } else if (o.metric === 'pressure') {
    if (round2(n) === o.value) { valueValid = true; break; }
    if (round2(n * 10) === o.value) { valueValid = true; break; }
  }
}
if (!valueValid) return false;

// Verify timestamp can be derived from raw
const outTs = ts.getTime();
let tsValid = false;

// Check for epoch timestamps (seconds or milliseconds)
const epochMatches = raw.match(/\b(1[4-9]\d{8,12})\b/g) || [];
for (const em of epochMatches) {
  let epoch = parseInt(em);
  if (epoch > 1e11) epoch = Math.floor(epoch / 1000);
  if (epoch * 1000 === outTs) { tsValid = true; break; }
}

if (!tsValid) {
  // Extract date/time patterns from raw
  // ISO format: 2024-04-04T07:39:00Z or with offset
  const isoMatch = raw.match(/(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2}))?(?:Z|([+-]\d{2}):?(\d{2}))?/);
  // Space-separated: 2024-12-18 17:54:00
  const spaceMatch = raw.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
  // Month name format: may-18-2024
  const monthMatch = raw.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)-(\d{1,2})-(\d{4})\b/i);
  
  const outYear = ts.getUTCFullYear();
  const outMonth = ts.getUTCMonth() + 1;
  const outDay = ts.getUTCDate();
  const outHour = ts.getUTCHours();
  const outMin = ts.getUTCMinutes();
  const outSec = ts.getUTCSeconds();

  if (isoMatch) {
    const y = parseInt(isoMatch[1]), m = parseInt(isoMatch[2]), d = parseInt(isoMatch[3]);
    const h = isoMatch[4] ? parseInt(isoMatch[4]) : 0;
    const mi = isoMatch[5] ? parseInt(isoMatch[5]) : 0;
    const s = isoMatch[6] ? parseInt(isoMatch[6]) : 0;
    const offH = isoMatch[7] ? parseInt(isoMatch[7]) : 0;
    const offM = isoMatch[8] ? parseInt(isoMatch[8]) : 0;
    const offsetMin = offH * 60 + (offH < 0 ? -offM : offM);
    const rawDate = new Date(Date.UTC(y, m - 1, d, h, mi, s) - offsetMin * 60000);
    if (rawDate.getTime() === outTs) tsValid = true;
  }
  
  if (!tsValid && spaceMatch) {
    const y = parseInt(spaceMatch[1]), m = parseInt(spaceMatch[2]), d = parseInt(spaceMatch[3]);
    const h = parseInt(spaceMatch[4]), mi = parseInt(spaceMatch[5]), s = parseInt(spaceMatch[6]);
    // Check for timezone offset after the datetime
    const afterMatch = raw.slice(raw.indexOf(spaceMatch[0]) + spaceMatch[0].length).match(/^\s*([+-])(\d{2}):?(\d{2})/);
    let offsetMin = 0;
    if (afterMatch) {
      const sign = afterMatch[1] === '+' ? 1 : -1;
      offsetMin = sign * (parseInt(afterMatch[2]) * 60 + parseInt(afterMatch[3]));
    }
    const rawDate = new Date(Date.UTC(y, m - 1, d, h, mi, s) - offsetMin * 60000);
    if (rawDate.getTime() === outTs) tsValid = true;
  }
  
  if (!tsValid && monthMatch) {
    const months = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
    const m = months[monthMatch[1].toLowerCase()];
    const d = parseInt(monthMatch[2]), y = parseInt(monthMatch[3]);
    if (y === outYear && m === outMonth && d === outDay && outHour === 0 && outMin === 0 && outSec === 0) tsValid = true;
  }
}

if (!tsValid) return false;

return true;
