if (!o || typeof o !== 'object') return false;

const { device_id, metric, value, timestamp_utc, status, zone } = o;

// Check required fields exist and are non-empty strings where needed
if (typeof device_id !== 'string' || !device_id.trim()) return false;
if (!['temperature', 'humidity', 'pressure'].includes(metric)) return false;
if (typeof value !== 'number' || !isFinite(value)) return false;
if (typeof timestamp_utc !== 'string' || !timestamp_utc.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/)) return false;
if (!['north', 'south', 'east', 'west'].includes(zone)) return false;
if (!['critical', 'warning', 'normal'].includes(status)) return false;

// Check value is within physically possible range
if (metric === 'temperature' && (value < -60 || value > 70)) return false;
if (metric === 'humidity' && (value < 0 || value > 100)) return false;
if (metric === 'pressure' && (value < 850 || value > 1100)) return false;

// Check value has at most 2 decimals
if (Math.round(value * 100) / 100 !== value) return false;

// Validate status matches value thresholds
let expectedStatus = 'normal';
if (metric === 'temperature') {
  if (value > 40 || value < -5) expectedStatus = 'critical';
  else if (value > 30 || value < 0) expectedStatus = 'warning';
} else if (metric === 'humidity') {
  if (value > 90) expectedStatus = 'critical';
  else if (value > 75) expectedStatus = 'warning';
} else if (metric === 'pressure') {
  if (value < 960 || value > 1040) expectedStatus = 'critical';
  else if (value < 980 || value > 1030) expectedStatus = 'warning';
}
if (status !== expectedStatus) return false;

// Check device_id appears in raw input
if (!raw.includes(device_id)) return false;

// Check metric type appears in raw (handle abbreviations)
const metricPatterns = {
  temperature: /temp(?:erature)?|°?C\b|celsius/i,
  humidity: /hum(?:idity)?|%|RH/i,
  pressure: /press(?:ure)?|hPa|mbar|kPa/i
};
if (!metricPatterns[metric].test(raw)) return false;

// Check zone appears in raw (handle abbreviations and vendor mappings)
const zoneMap = { north: /north|zone-?A|[^a-z]N\b/i, south: /south|zone-?B|[^a-z]S\b/i, east: /east|zone-?C|[^a-z]E\b/i, west: /west|zone-?D|[^a-z]W\b/i };
if (!zoneMap[zone].test(raw)) return false;

// Check timestamp date appears in raw
const dateStr = timestamp_utc.substring(0, 10);
if (!raw.includes(dateStr)) return false;

// Extract numeric values from raw to validate against output value
const numPattern = /[-+]?(\d+[.,]\d+|\d+)/g;
const rawNumbers = [];
let match;
while ((match = numPattern.exec(raw)) !== null) {
  rawNumbers.push(parseFloat(match[0].replace(',', '.')));
}

// Check that output value is plausibly derived from raw input
// For temperature/humidity/pressure, the value should appear in raw (possibly in different unit)
// or be derivable from a raw number via unit conversion
const tolerance = 0.01;
let foundMatch = false;

for (const rawNum of rawNumbers) {
  let derivedValue = rawNum;
  
  // Try no conversion
  if (Math.abs(derivedValue - value) < tolerance) {
    foundMatch = true;
    break;
  }
  
  // Try Fahrenheit to Celsius for temperature
  if (metric === 'temperature') {
    derivedValue = (rawNum - 32) * 5 / 9;
    if (Math.abs(derivedValue - value) < tolerance) {
      foundMatch = true;
      break;
    }
    // Try Kelvin to Celsius
    derivedValue = rawNum - 273.15;
    if (Math.abs(derivedValue - value) < tolerance) {
      foundMatch = true;
      break;
    }
  }
  
  // Try kPa to hPa for pressure
  if (metric === 'pressure') {
    derivedValue = rawNum * 10;
    if (Math.abs(derivedValue - value) < tolerance) {
      foundMatch = true;
      break;
    }
  }
}

if (!foundMatch) return false;

return true;
