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

const tsMatch = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})Z$/.exec(o.timestamp_utc);
if (!tsMatch) return false;
const [, yr, mo, dy, hr, mi, se] = tsMatch.map(Number);
if (mo < 1 || mo > 12 || dy < 1 || dy > 31 || hr > 23 || mi > 59 || se > 59) return false;

if (Math.round(o.value * 100) !== o.value * 100) return false;

if (o.metric === "temperature") {
  if (o.value < -60 || o.value > 70) return false;
  const expectedStatus = (o.value > 40 || o.value < -5) ? "critical" : (o.value > 30 || o.value < 0) ? "warning" : "normal";
  if (o.status !== expectedStatus) return false;
} else if (o.metric === "humidity") {
  if (o.value < 0 || o.value > 100) return false;
  const expectedStatus = o.value > 90 ? "critical" : o.value > 75 ? "warning" : "normal";
  if (o.status !== expectedStatus) return false;
} else {
  if (o.value < 850 || o.value > 1100) return false;
  const expectedStatus = (o.value < 960 || o.value > 1040) ? "critical" : (o.value < 980 || o.value > 1030) ? "warning" : "normal";
  if (o.status !== expectedStatus) return false;
}

if (!raw.includes(o.device_id)) return false;

const rawLower = raw.toLowerCase();
const hasTemp = /\b(temp|temperature)\b/.test(rawLower);
const hasHum = /\b(hum|humid|humidity)\b/.test(rawLower);
const hasPress = /\b(press|pressure)\b/.test(rawLower);
if (o.metric === "temperature" && !hasTemp) return false;
if (o.metric === "humidity" && !hasHum) return false;
if (o.metric === "pressure" && !hasPress) return false;

const zoneMap = { north: /\b(north|zone-a|n)\b/i, south: /\b(south|zone-b|s)\b/i, east: /\b(east|zone-c|e)\b/i, west: /\b(west|zone-d|w)\b/i };
if (!zoneMap[o.zone].test(raw)) return false;

const dateMatch = raw.match(/(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
const dateMatch2 = raw.match(/([a-z]{3})-(\d{1,2})-(\d{4})/i);
const epochMatch = raw.match(/(\d{10,13})\b/);
if (dateMatch) {
  if (parseInt(dateMatch[1]) !== yr || parseInt(dateMatch[2]) !== mo || parseInt(dateMatch[3]) !== dy) return false;
} else if (dateMatch2) {
  const months = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  const m = months[dateMatch2[1].toLowerCase()];
  if (m !== mo || parseInt(dateMatch2[2]) !== dy || parseInt(dateMatch2[3]) !== yr) return false;
} else if (epochMatch) {
  let epoch = parseInt(epochMatch[1]);
  if (epoch > 9999999999) epoch = Math.floor(epoch / 1000);
  const d = new Date(epoch * 1000);
  if (d.getUTCFullYear() !== yr || d.getUTCMonth() + 1 !== mo || d.getUTCDate() !== dy) return false;
}

return true;
