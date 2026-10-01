const METRICS = ["temperature", "humidity", "pressure"];
const ZONES = ["north", "south", "east", "west"];
const STATUSES = ["normal", "warning", "critical"];

if (!o || typeof o !== "object") return false;
if (typeof o.device_id !== "string" || o.device_id === "") return false;
if (!METRICS.includes(o.metric)) return false;
if (typeof o.value !== "number" || !isFinite(o.value)) return false;
if (typeof o.timestamp_utc !== "string") return false;
if (!STATUSES.includes(o.status)) return false;
if (!ZONES.includes(o.zone)) return false;

if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(o.timestamp_utc)) return false;
if (isNaN(Date.parse(o.timestamp_utc))) return false;

if (Math.round(o.value * 100) !== o.value * 100) return false;

if (o.metric === "temperature" && (o.value < -60 || o.value > 70)) return false;
if (o.metric === "humidity" && (o.value < 0 || o.value > 100)) return false;
if (o.metric === "pressure" && (o.value < 850 || o.value > 1100)) return false;

let expectedStatus;
if (o.metric === "temperature") {
  expectedStatus = (o.value > 40 || o.value < -5) ? "critical" : (o.value > 30 || o.value < 0) ? "warning" : "normal";
} else if (o.metric === "humidity") {
  expectedStatus = o.value > 90 ? "critical" : o.value > 75 ? "warning" : "normal";
} else {
  expectedStatus = (o.value < 960 || o.value > 1040) ? "critical" : (o.value < 980 || o.value > 1030) ? "warning" : "normal";
}
if (o.status !== expectedStatus) return false;

if (!raw.includes(o.device_id)) return false;

const metricPatterns = {
  temperature: /temp|temperature/i,
  humidity: /hum|humidity/i,
  pressure: /press|pressure/i
};
if (!metricPatterns[o.metric].test(raw)) return false;

const zonePatterns = {
  north: /\bnorth\b|zone[_\-]?A|\bN\b/i,
  south: /\bsouth\b|zone[_\-]?B|\bS\b/i,
  east: /\beast\b|zone[_\-]?C|\bE\b/i,
  west: /\bwest\b|zone[_\-]?D|\bW\b/i
};
if (!zonePatterns[o.zone].test(raw)) return false;

const numMatch = raw.match(/-?\d+[,.]?\d*/g);
if (!numMatch) return false;
const rawNums = numMatch.map(n => parseFloat(n.replace(",", ".")));

const isCelsius = /celsius|\bC\b|°C/i.test(raw);
const isFahrenheit = /fahrenheit|\bF\b|°F/i.test(raw);
const isKelvin = /kelvin|\bK\b/i.test(raw);
const isKpa = /\bkPa\b/i.test(raw);

let foundMatch = false;
for (const n of rawNums) {
  if (!isFinite(n)) continue;
  let converted = n;
  if (o.metric === "temperature") {
    if (isFahrenheit) converted = (n - 32) * 5 / 9;
    else if (isKelvin) converted = n - 273.15;
  } else if (o.metric === "pressure" && isKpa) {
    converted = n * 10;
  }
  if (Math.abs(Math.round(converted * 100) / 100 - o.value) < 0.011) {
    foundMatch = true;
    break;
  }
}
if (!foundMatch) return false;

return true;
