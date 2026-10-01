const metrics = ["temperature", "humidity", "pressure"];
const zones = ["north", "south", "east", "west"];
const statuses = ["normal", "warning", "critical"];

// Basic structure validation
if (!o || typeof o !== "object") return false;
if (typeof o.device_id !== "string" || o.device_id === "") return false;
if (!metrics.includes(o.metric)) return false;
if (typeof o.value !== "number" || isNaN(o.value)) return false;
if (typeof o.timestamp_utc !== "string") return false;
if (!statuses.includes(o.status)) return false;
if (!zones.includes(o.zone)) return false;

// Timestamp format check
if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(o.timestamp_utc)) return false;

// Value rounded to 2 decimals
if (Math.round(o.value * 100) !== o.value * 100) return false;

// Physical bounds
if (o.metric === "temperature" && (o.value < -60 || o.value > 70)) return false;
if (o.metric === "humidity" && (o.value < 0 || o.value > 100)) return false;
if (o.metric === "pressure" && (o.value < 850 || o.value > 1100)) return false;

// Status derivation check
let expectedStatus;
if (o.metric === "temperature") {
  if (o.value > 40 || o.value < -5) expectedStatus = "critical";
  else if (o.value > 30 || o.value < 0) expectedStatus = "warning";
  else expectedStatus = "normal";
} else if (o.metric === "humidity") {
  if (o.value > 90) expectedStatus = "critical";
  else if (o.value > 75) expectedStatus = "warning";
  else expectedStatus = "normal";
} else {
  if (o.value < 960 || o.value > 1040) expectedStatus = "critical";
  else if (o.value < 980 || o.value > 1030) expectedStatus = "warning";
  else expectedStatus = "normal";
}
if (o.status !== expectedStatus) return false;

// Device ID must appear in raw
if (!raw.includes(o.device_id)) return false;

// Metric indicator must appear in raw
const metricPatterns = {
  temperature: /temp|temperature/i,
  humidity: /hum|humidity/i,
  pressure: /press|pressure/i
};
if (!metricPatterns[o.metric].test(raw)) return false;

// Zone indicator must appear in raw
const zonePatterns = {
  north: /\bnorth\b|zone[_\-]?A|\bN\b/i,
  south: /\bsouth\b|zone[_\-]?B|\bS\b/i,
  east: /\beast\b|zone[_\-]?C|\bE\b/i,
  west: /\bwest\b|zone[_\-]?D|\bW\b/i
};
if (!zonePatterns[o.zone].test(raw)) return false;

// Timestamp validation - extract date/time components from raw and verify consistency
const tsDate = new Date(o.timestamp_utc);
if (isNaN(tsDate.getTime())) return false;

const year = tsDate.getUTCFullYear();
const month = tsDate.getUTCMonth() + 1;
const day = tsDate.getUTCDate();

// Year must appear in raw
if (!raw.includes(String(year))) return false;

// Day must appear in raw (as 1 or 2 digit)
const dayStr = String(day);
const dayPadded = day < 10 ? "0" + day : dayStr;
if (!raw.includes(dayStr) && !raw.includes(dayPadded)) return false;

// Value verification - the numeric value (possibly in different unit) should relate to raw
const rawNums = raw.match(/-?\d+[,.]?\d*/g) || [];
const rawValues = rawNums.map(n => parseFloat(n.replace(",", ".")));

let valueFound = false;
for (const rv of rawValues) {
  if (isNaN(rv)) continue;
  // Direct match (Celsius, %, hPa/mbar)
  if (Math.abs(Math.round(rv * 100) / 100 - o.value) < 0.015) { valueFound = true; break; }
  // Fahrenheit to Celsius
  if (o.metric === "temperature") {
    const fromF = Math.round((rv - 32) * 5 / 9 * 100) / 100;
    if (Math.abs(fromF - o.value) < 0.015) { valueFound = true; break; }
    // Kelvin to Celsius
    const fromK = Math.round((rv - 273.15) * 100) / 100;
    if (Math.abs(fromK - o.value) < 0.015) { valueFound = true; break; }
  }
  // kPa to hPa
  if (o.metric === "pressure") {
    const fromKPa = Math.round(rv * 10 * 100) / 100;
    if (Math.abs(fromKPa - o.value) < 0.015) { valueFound = true; break; }
  }
}
if (!valueFound) return false;

return true;
