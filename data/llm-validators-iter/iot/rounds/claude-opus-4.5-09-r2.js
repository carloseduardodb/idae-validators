const raw_lower = raw.toLowerCase();

// Check output structure
if (!o || typeof o !== 'object') return false;
if (typeof o.device_id !== 'string' || o.device_id === '') return false;
if (!['temperature', 'humidity', 'pressure'].includes(o.metric)) return false;
if (typeof o.value !== 'number' || !isFinite(o.value)) return false;
if (typeof o.timestamp_utc !== 'string') return false;
if (!['critical', 'warning', 'normal'].includes(o.status)) return false;
if (!['north', 'south', 'east', 'west'].includes(o.zone)) return false;

// Timestamp format check
if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(o.timestamp_utc)) return false;
const ts = new Date(o.timestamp_utc);
if (isNaN(ts.getTime())) return false;

// Device ID must appear in raw
if (!raw.includes(o.device_id)) return false;

// Value must be rounded to 2 decimals
const rounded = Math.round(o.value * 100) / 100;
if (Math.abs(o.value - rounded) > 1e-9) return false;

// Physical bounds check
if (o.metric === 'temperature' && (o.value < -60 || o.value > 70)) return false;
if (o.metric === 'humidity' && (o.value < 0 || o.value > 100)) return false;
if (o.metric === 'pressure' && (o.value < 850 || o.value > 1100)) return false;

// Status derivation check
let expected_status;
if (o.metric === 'temperature') {
  if (o.value > 40 || o.value < -5) expected_status = 'critical';
  else if (o.value > 30 || o.value < 0) expected_status = 'warning';
  else expected_status = 'normal';
} else if (o.metric === 'humidity') {
  if (o.value > 90) expected_status = 'critical';
  else if (o.value > 75) expected_status = 'warning';
  else expected_status = 'normal';
} else {
  if (o.value < 960 || o.value > 1040) expected_status = 'critical';
  else if (o.value < 980 || o.value > 1030) expected_status = 'warning';
  else expected_status = 'normal';
}
if (o.status !== expected_status) return false;

// Metric must be indicated in raw
const metric_patterns = {
  temperature: /temp|temperature/i,
  humidity: /hum|humidity/i,
  pressure: /press|pressure/i
};
if (!metric_patterns[o.metric].test(raw)) return false;

// Zone must be indicated in raw
const zone_map = {
  north: /\bnorth\b|zone[_\-]?a\b|\bN\b/i,
  south: /\bsouth\b|zone[_\-]?b\b|\bS\b/i,
  east: /\beast\b|zone[_\-]?c\b|\bE\b/i,
  west: /\bwest\b|zone[_\-]?d\b|\bW\b/i
};
if (!zone_map[o.zone].test(raw)) return false;

// Extract numeric values from raw and check if output value could derive from one
const nums = raw.match(/-?\d+[,.]?\d*/g) || [];
const raw_nums = nums.map(n => parseFloat(n.replace(',', '.'))).filter(n => isFinite(n));

let value_plausible = false;
for (const n of raw_nums) {
  let candidates = [n];
  if (o.metric === 'temperature') {
    candidates.push((n - 32) * 5 / 9); // F to C
    candidates.push(n - 273.15); // K to C
  } else if (o.metric === 'pressure') {
    candidates.push(n * 10); // kPa to hPa
  }
  for (const c of candidates) {
    if (Math.abs(Math.round(c * 100) / 100 - o.value) < 0.01) {
      value_plausible = true;
      break;
    }
  }
  if (value_plausible) break;
}
if (!value_plausible) return false;

// Timestamp plausibility
const year = ts.getUTCFullYear();
const month = ts.getUTCMonth() + 1;
const day = ts.getUTCDate();
const hour = ts.getUTCHours();
const minute = ts.getUTCMinutes();
const second = ts.getUTCSeconds();

const month_names = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

// Check for epoch timestamps
const epoch_sec = Math.floor(ts.getTime() / 1000);
const epoch_ms = ts.getTime();
const epoch_in_raw = raw.includes(String(epoch_sec)) || raw.includes(String(epoch_ms));

if (epoch_in_raw) {
  return true;
}

// For non-epoch: check year, month, day
const year_in_raw = raw.includes(String(year));
const month_in_raw = raw.includes(String(month).padStart(2, '0')) || 
                     raw_lower.includes('-' + month + '-') ||
                     raw_lower.includes('/' + month + '/') ||
                     month_names.some((m, i) => raw_lower.includes(m) && i + 1 === month);
const day_in_raw = raw.includes(String(day).padStart(2, '0')) || 
                   raw.includes('-' + day + 'T') ||
                   raw.includes('-' + day + '"') ||
                   raw.includes('-' + day + ' ');

if (!(year_in_raw && month_in_raw && day_in_raw)) return false;

// Check time components if present in raw (not midnight default)
const time_regex = /(\d{1,2}):(\d{2})(?::(\d{2}))?/g;
const time_matches = [...raw.matchAll(time_regex)];

if (time_matches.length > 0) {
  // Raw has explicit time, verify hour/minute/second match one of them (accounting for timezone offset)
  let time_found = false;
  
  // Also check for timezone offset in raw
  const tz_match = raw.match(/([+-])(\d{2}):?(\d{2})\s*$/m) || raw.match(/([+-])(\d{2}):?(\d{2})\s*["|>|\s]/);
  let offset_hours = 0;
  if (tz_match) {
    offset_hours = parseInt(tz_match[2]) * (tz_match[1] === '+' ? 1 : -1);
  }
  
  for (const tm of time_matches) {
    const raw_hour = parseInt(tm[1]);
    const raw_min = parseInt(tm[2]);
    const raw_sec = tm[3] ? parseInt(tm[3]) : 0;
    
    // Expected UTC hour after applying offset
    let expected_utc_hour = (raw_hour - offset_hours + 24) % 24;
    
    if (hour === expected_utc_hour && minute === raw_min && second === raw_sec) {
      time_found = true;
      break;
    }
  }
  if (!time_found) return false;
} else {
  // No explicit time in raw, output should be midnight
  if (hour !== 0 || minute !== 0 || second !== 0) return false;
}

return true;
