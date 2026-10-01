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

// Check metric type appears in raw
const rawLower = raw.toLowerCase();
if (o.metric === 'temperature' && !(/temp|temperature/.test(rawLower))) return false;
if (o.metric === 'humidity' && !(/hum|humidity/.test(rawLower))) return false;
if (o.metric === 'pressure' && !(/press|pressure/.test(rawLower))) return false;

// Check zone appears in raw
const zonePatterns = {
  north: /north|zone-a|["\s=|,:]n["\s|,>]|area.*n|"n"/i,
  south: /south|zone-b|["\s=|,:]s["\s|,>]|area.*s|"s"/i,
  east: /east|zone-c|["\s=|,:]e["\s|,>]|area.*e|"e"/i,
  west: /west|zone-d|["\s=|,:]w["\s|,>]|area.*w|"w"/i
};
if (!zonePatterns[o.zone].test(raw)) return false;

// Validate timestamp is a real date
const ts = new Date(o.timestamp_utc);
if (isNaN(ts.getTime())) return false;

// Extract timestamp components
const oYear = parseInt(o.timestamp_utc.slice(0, 4));
const oMonth = parseInt(o.timestamp_utc.slice(5, 7));
const oDay = parseInt(o.timestamp_utc.slice(8, 10));
const oHour = parseInt(o.timestamp_utc.slice(11, 13));
const oMin = parseInt(o.timestamp_utc.slice(14, 16));
const oSec = parseInt(o.timestamp_utc.slice(17, 19));

// Check timestamp against raw
const epochMatch = raw.match(/\b(\d{10,13})\b/);
if (epochMatch) {
  let epochMs = parseInt(epochMatch[1]);
  if (epochMs < 1e12) epochMs *= 1000;
  const epochDate = new Date(epochMs);
  if (Math.abs(ts.getTime() - epochDate.getTime()) > 1000) return false;
} else {
  // Check year appears
  if (!raw.includes(String(oYear))) return false;
  
  // Check day appears
  const dayStr = String(oDay).padStart(2, '0');
  const dayStr1 = String(oDay);
  if (!raw.includes(dayStr) && !raw.includes(dayStr1)) return false;
  
  // Check month appears
  const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const monthStr = String(oMonth).padStart(2, '0');
  const monthName = monthNames[oMonth - 1];
  if (!raw.includes(monthStr) && !rawLower.includes(monthName)) return false;
  
  // Check time handling
  const timeMatch = raw.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (timeMatch) {
    const rawHour = parseInt(timeMatch[1]);
    const rawMin = parseInt(timeMatch[2]);
    const rawSec = timeMatch[3] ? parseInt(timeMatch[3]) : 0;
    
    // Check for timezone offset
    const tzMatch = raw.match(/([+-])(\d{2}):?(\d{2})/);
    if (tzMatch) {
      const sign = tzMatch[1] === '+' ? 1 : -1;
      const tzHours = parseInt(tzMatch[2]);
      const tzMins = parseInt(tzMatch[3]);
      const rawDate = new Date(Date.UTC(oYear, oMonth - 1, oDay, rawHour, rawMin, rawSec));
      const adjustedMs = rawDate.getTime() - sign * (tzHours * 3600000 + tzMins * 60000);
      if (Math.abs(ts.getTime() - adjustedMs) > 1000) return false;
    } else if (raw.includes('Z') || !tzMatch) {
      // UTC or no timezone - direct match
      if (oHour !== rawHour || oMin !== rawMin) return false;
    }
  } else {
    // Date only - should be 00:00:00
    if (oHour !== 0 || oMin !== 0 || oSec !== 0) return false;
  }
}

// Check raw value can convert to output value
const numMatches = raw.match(/-?\d+[,.]?\d*/g) || [];
const possibleValues = numMatches.map(s => parseFloat(s.replace(',', '.')));

let valueFound = false;
for (const v of possibleValues) {
  if (!Number.isFinite(v)) continue;
  if (v === o.value) { valueFound = true; break; }
  if (round2((v - 32) * 5 / 9) === o.value) { valueFound = true; break; }
  if (round2(v - 273.15) === o.value) { valueFound = true; break; }
  if (o.metric === 'pressure' && round2(v * 10) === o.value) { valueFound = true; break; }
}
if (!valueFound) return false;

return true;
