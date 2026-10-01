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
  north: /north|zone[_\-]?A\b/i,
  south: /south|zone[_\-]?B\b/i,
  east: /east|zone[_\-]?C\b/i,
  west: /west|zone[_\-]?D\b/i
};
let zoneMatch = zonePatterns[o.zone].test(raw);
if (!zoneMatch) {
  const abbrevMap = { N: "north", S: "south", E: "east", W: "west" };
  for (const [abbr, zone] of Object.entries(abbrevMap)) {
    const re = new RegExp(`(?:^|[\\s|,="'>/])${abbr}(?:[\\s|,}"'<]|$)`);
    if (re.test(raw) && zone === o.zone) {
      zoneMatch = true;
      break;
    }
  }
}
if (!zoneMatch) return false;

const numMatch = raw.match(/-?\d+[,.]?\d*/g);
if (!numMatch) return false;
const rawNums = numMatch.map(n => parseFloat(n.replace(",", ".")));

let foundMatch = false;
for (const n of rawNums) {
  if (!isFinite(n)) continue;
  let candidates = [n];
  if (o.metric === "temperature") {
    candidates.push((n - 32) * 5 / 9);
    candidates.push(n - 273.15);
  } else if (o.metric === "pressure") {
    candidates.push(n * 10);
  }
  for (const c of candidates) {
    if (Math.abs(Math.round(c * 100) / 100 - o.value) < 0.011) {
      foundMatch = true;
      break;
    }
  }
  if (foundMatch) break;
}
if (!foundMatch) return false;

const outDate = new Date(o.timestamp_utc);
const outTs = outDate.getTime();

const isoMatch = raw.match(/(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}):(\d{2}))?(?:\s*([+-])(\d{2}):?(\d{2})|Z)?/);
const epochMatch = raw.match(/\b(1[4-9]\d{8,11})\b/);
const dateStrMatch = raw.match(/\b([a-z]{3})-(\d{1,2})-(\d{4})\b/i);

let timeValidated = false;
if (isoMatch) {
  const [, y, mo, d, h, mi, s, sign, oh, om] = isoMatch;
  let dt = new Date(Date.UTC(+y, +mo - 1, +d, +(h || 0), +(mi || 0), +(s || 0)));
  if (sign && oh) {
    const offsetMin = (sign === "+" ? -1 : 1) * (+oh * 60 + +(om || 0));
    dt = new Date(dt.getTime() + offsetMin * 60000);
  }
  if (Math.abs(outTs - dt.getTime()) > 1000) return false;
  timeValidated = true;
} else if (epochMatch) {
  let epoch = parseInt(epochMatch[1]);
  if (epoch > 1e11) epoch = Math.floor(epoch / 1000);
  if (Math.abs(outTs / 1000 - epoch) > 1) return false;
  timeValidated = true;
} else if (dateStrMatch) {
  const months = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
  const mon = months[dateStrMatch[1].toLowerCase()];
  const day = +dateStrMatch[2];
  const year = +dateStrMatch[3];
  const dt = new Date(Date.UTC(year, mon, day, 0, 0, 0));
  if (Math.abs(outTs - dt.getTime()) > 1000) return false;
  timeValidated = true;
}

return true;
