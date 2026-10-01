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
  north: /north|zone[_\-]?A(?!\w)|"N"|\bN\b|=N\b/i,
  south: /south|zone[_\-]?B(?!\w)|"S"|\bS\b|=S\b/i,
  east: /east|zone[_\-]?C(?!\w)|"E"|\bE\b|=E\b/i,
  west: /west|zone[_\-]?D(?!\w)|"W"|\bW\b|=W\b/i
};
if (!zonePatterns[o.zone].test(raw)) return false;

const numMatch = raw.match(/-?\d+[,.]?\d*/g);
if (!numMatch) return false;
const rawNums = numMatch.map(n => parseFloat(n.replace(",", ".")));

const isFahrenheit = /fahrenheit|°F/i.test(raw) || /[,|":]F[,|":\s]|[,|]F$/i.test(raw);
const isKelvin = /kelvin/i.test(raw) || /[,|":]K[,|":\s]|[,|]K$/i.test(raw) || /\s+K\b/.test(raw);
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

const outTs = Date.parse(o.timestamp_utc);

const epochMatch = raw.match(/\b1[4-9]\d{8,11}\b/g);
if (epochMatch) {
  let tsFound = false;
  for (const e of epochMatch) {
    const ep = parseInt(e, 10);
    const ms = e.length >= 12 ? ep : ep * 1000;
    if (Math.abs(ms - outTs) < 60000) { tsFound = true; break; }
  }
  if (!tsFound) return false;
}

const monthNames = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[- ](\d{1,2})[- ](\d{4})\b/i;
const mMatch = raw.match(monthNames);
if (mMatch) {
  const months = {jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11};
  const m = months[mMatch[1].toLowerCase().slice(0,3)];
  const d = parseInt(mMatch[2], 10);
  const y = parseInt(mMatch[3], 10);
  const expected = Date.UTC(y, m, d);
  const outDate = new Date(outTs);
  const outDateOnly = Date.UTC(outDate.getUTCFullYear(), outDate.getUTCMonth(), outDate.getUTCDate());
  if (outDateOnly !== expected) return false;
}

const isoFullMatch = raw.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})/g);
if (isoFullMatch) {
  let tsFound = false;
  for (const iso of isoFullMatch) {
    const parsed = Date.parse(iso);
    if (!isNaN(parsed) && Math.abs(parsed - outTs) < 1000) { tsFound = true; break; }
  }
  if (!tsFound) return false;
}

const dtSpaceMatch = raw.match(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\s*[+-]\d{2}:\d{2})?/g);
if (dtSpaceMatch && !isoFullMatch) {
  let tsFound = false;
  for (const dt of dtSpaceMatch) {
    let normalized = dt.replace(" ", "T").replace(/\s+([+-])/, "$1");
    const hasOffset = /[+-]\d{2}:\d{2}$/.test(normalized);
    const parsed = Date.parse(hasOffset ? normalized : normalized + "Z");
    if (!isNaN(parsed) && Math.abs(parsed - outTs) < 1000) { tsFound = true; break; }
  }
  if (!tsFound) return false;
}

const isoDateOnly = raw.match(/\b\d{4}-\d{2}-\d{2}\b/g);
if (isoDateOnly && !isoFullMatch && !dtSpaceMatch) {
  let tsFound = false;
  for (const iso of isoDateOnly) {
    const parsed = Date.parse(iso + "T00:00:00Z");
    if (!isNaN(parsed) && Math.abs(parsed - outTs) < 1000) { tsFound = true; break; }
  }
  if (!tsFound) return false;
}

return true;
