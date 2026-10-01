const raw_lower = raw.toLowerCase();

if (!o || typeof o !== 'object') return false;
if (typeof o.device_id !== 'string' || o.device_id === '') return false;
if (!['temperature', 'humidity', 'pressure'].includes(o.metric)) return false;
if (typeof o.value !== 'number' || !isFinite(o.value)) return false;
if (typeof o.timestamp_utc !== 'string') return false;
if (!['critical', 'warning', 'normal'].includes(o.status)) return false;
if (!['north', 'south', 'east', 'west'].includes(o.zone)) return false;

if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(o.timestamp_utc)) return false;
const ts = new Date(o.timestamp_utc);
if (isNaN(ts.getTime())) return false;

if (!raw.includes(o.device_id)) return false;

const rounded = Math.round(o.value * 100) / 100;
if (Math.abs(o.value - rounded) > 1e-9) return false;

if (o.metric === 'temperature' && (o.value < -60 || o.value > 70)) return false;
if (o.metric === 'humidity' && (o.value < 0 || o.value > 100)) return false;
if (o.metric === 'pressure' && (o.value < 850 || o.value > 1100)) return false;

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

const metric_patterns = {
  temperature: /temp|temperature/i,
  humidity: /hum|humidity/i,
  pressure: /press|pressure/i
};
if (!metric_patterns[o.metric].test(raw)) return false;

const zone_map = {
  north: /\bnorth\b|zone[_\-]?a\b|\bN\b/i,
  south: /\bsouth\b|zone[_\-]?b\b|\bS\b/i,
  east: /\beast\b|zone[_\-]?c\b|\bE\b/i,
  west: /\bwest\b|zone[_\-]?d\b|\bW\b/i
};
if (!zone_map[o.zone].test(raw)) return false;

const nums = raw.match(/-?\d+[,.]?\d*/g) || [];
const raw_nums = nums.map(n => parseFloat(n.replace(',', '.'))).filter(n => isFinite(n));

let value_plausible = false;
for (const n of raw_nums) {
  let candidates = [n];
  if (o.metric === 'temperature') {
    candidates.push((n - 32) * 5 / 9);
    candidates.push(n - 273.15);
  } else if (o.metric === 'pressure') {
    candidates.push(n * 10);
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

const year = ts.getUTCFullYear();
const month = ts.getUTCMonth() + 1;
const day = ts.getUTCDate();
const hour = ts.getUTCHours();
const minute = ts.getUTCMinutes();
const second = ts.getUTCSeconds();

const month_names = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

const epoch_sec = Math.floor(ts.getTime() / 1000);
const epoch_ms = ts.getTime();
const epoch_in_raw = raw.includes(String(epoch_sec)) || raw.includes(String(epoch_ms));

if (epoch_in_raw) return true;

if (!raw.includes(String(year))) return false;

const month_padded = String(month).padStart(2, '0');
const month_in_raw = raw.includes(month_padded) || 
                     month_names.some((m, i) => raw_lower.includes(m) && i + 1 === month);
if (!month_in_raw) return false;

const day_str = String(day);
const day_padded = day_str.padStart(2, '0');
const day_regex = new RegExp('[-/]' + day_padded + '(?:[T" ]|$)|[-/]' + day_str + '(?:[T" ]|$)|\\b' + day_padded + '[-/]|\\b' + day_str + '[-/]');
if (!day_regex.test(raw)) return false;

let offset_minutes = 0;
const tz_match = raw.match(/([+-])(\d{2}):(\d{2})/);
if (tz_match) {
  const sign = tz_match[1] === '+' ? 1 : -1;
  offset_minutes = sign * (parseInt(tz_match[2]) * 60 + parseInt(tz_match[3]));
}

const time_regex = /(\d{1,2}):(\d{2})(?::(\d{2}))?/g;
const time_matches = [...raw.matchAll(time_regex)];

if (time_matches.length > 0) {
  let time_found = false;
  for (const tm of time_matches) {
    const raw_hour = parseInt(tm[1]);
    const raw_min = parseInt(tm[2]);
    const raw_sec = tm[3] ? parseInt(tm[3]) : 0;
    
    const raw_date = new Date(Date.UTC(year, month - 1, day, raw_hour, raw_min, raw_sec));
    const utc_time = new Date(raw_date.getTime() - offset_minutes * 60000);
    
    if (ts.getTime() === utc_time.getTime()) {
      time_found = true;
      break;
    }
  }
  if (!time_found) return false;
} else {
  if (hour !== 0 || minute !== 0 || second !== 0) return false;
}

return true;
