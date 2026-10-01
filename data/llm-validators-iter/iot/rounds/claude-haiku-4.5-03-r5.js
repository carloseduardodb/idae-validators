if (!o || typeof o !== 'object') return false;

const { device_id, metric, value, timestamp_utc, status, zone } = o;

if (typeof device_id !== 'string' || !device_id.trim()) return false;
if (!['temperature', 'humidity', 'pressure'].includes(metric)) return false;
if (typeof value !== 'number' || !isFinite(value)) return false;
if (typeof timestamp_utc !== 'string' || !timestamp_utc.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/)) return false;
if (!['north', 'south', 'east', 'west'].includes(zone)) return false;
if (!['critical', 'warning', 'normal'].includes(status)) return false;

if (metric === 'temperature' && (value < -60 || value > 70)) return false;
if (metric === 'humidity' && (value < 0 || value > 100)) return false;
if (metric === 'pressure' && (value < 850 || value > 1100)) return false;

if (Math.round(value * 100) / 100 !== value) return false;

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

if (!raw.includes(device_id)) return false;

const metricPatterns = {
  temperature: /temp(?:erature)?|°?C\b|celsius|fahrenheit|kelvin|[FK]\b/i,
  humidity: /humid(?:ity)?|%\s*RH|%\s*H/i,
  pressure: /press(?:ure)?|hPa|mbar|kPa/i
};
if (!metricPatterns[metric].test(raw)) return false;

const zonePatterns = {
  north: /\b(north|zone-?A|N)\b/i,
  south: /\b(south|zone-?B|S)\b/i,
  east: /\b(east|zone-?C|E)\b/i,
  west: /\b(west|zone-?D|W)\b/i
};
if (!zonePatterns[zone].test(raw)) return false;

const tsDate = timestamp_utc.substring(0, 10);
const tsTime = timestamp_utc.substring(11, 19);
const dateMatch = raw.match(/(\d{4})-(\d{2})-(\d{2})|(\d{1,2})-\w+-(\d{4})/);
if (!dateMatch) return false;

let rawDate;
if (dateMatch[1]) {
  rawDate = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
} else {
  const day = String(dateMatch[4]).padStart(2, '0');
  const year = dateMatch[5];
  const monthMap = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
                     jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };
  const monthMatch = raw.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\b/i);
  if (!monthMatch) return false;
  const month = monthMap[monthMatch[1].toLowerCase().substring(0, 3)];
  rawDate = `${year}-${month}-${day}`;
}
if (rawDate !== tsDate) return false;

if (tsTime !== '00:00:00' && !raw.includes(tsTime.substring(0, 5))) return false;

const valueMatch = raw.match(/[-+]?\d+(?:[.,]\d+)?/g);
if (!valueMatch) return false;

const rawValues = valueMatch.map(v => parseFloat(v.replace(',', '.')));
const tolerance = 0.01;
const found = rawValues.some(rv => Math.abs(rv - value) < tolerance);
if (!found) return false;

return true;
