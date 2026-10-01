const metrics = ["temperature", "humidity", "pressure"];
const zones = ["north", "south", "east", "west"];
const statuses = ["normal", "warning", "critical"];

if (!o || typeof o !== "object") return false;
if (typeof o.device_id !== "string" || o.device_id === "") return false;
if (!metrics.includes(o.metric)) return false;
if (typeof o.value !== "number" || isNaN(o.value)) return false;
if (typeof o.timestamp_utc !== "string") return false;
if (!statuses.includes(o.status)) return false;
if (!zones.includes(o.zone)) return false;

if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(o.timestamp_utc)) return false;

const valRounded = Math.round(o.value * 100) / 100;
if (Math.abs(valRounded - o.value) > 0.001) return false;

if (o.metric === "temperature" && (o.value < -60 || o.value > 70)) return false;
if (o.metric === "humidity" && (o.value < 0 || o.value > 100)) return false;
if (o.metric === "pressure" && (o.value < 850 || o.value > 1100)) return false;

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

if (!raw.includes(o.device_id)) return false;

const metricPatterns = {
  temperature: /temp|temperature/i,
  humidity: /hum|humidity/i,
  pressure: /press|pressure/i
};
if (!metricPatterns[o.metric].test(raw)) return false;

const zonePatterns = {
  north: /north|zone[_\-]?A(?!\w)|(?<![a-zA-Z])N(?![a-zA-Z])/i,
  south: /south|zone[_\-]?B(?!\w)|(?<![a-zA-Z])S(?![a-zA-Z])/i,
  east: /east|zone[_\-]?C(?!\w)|(?<![a-zA-Z])E(?![a-zA-Z])/i,
  west: /west|zone[_\-]?D(?!\w)|(?<![a-zA-Z])W(?![a-zA-Z])/i
};
if (!zonePatterns[o.zone].test(raw)) return false;

const tsDate = new Date(o.timestamp_utc);
if (isNaN(tsDate.getTime())) return false;

const year = tsDate.getUTCFullYear();
const month = tsDate.getUTCMonth() + 1;
const day = tsDate.getUTCDate();
const hour = tsDate.getUTCHours();
const minute = tsDate.getUTCMinutes();
const second = tsDate.getUTCSeconds();

if (!raw.includes(String(year))) return false;

const rawNums = raw.match(/-?\d+[,.]?\d*/g) || [];
const rawValues = rawNums.map(n => parseFloat(n.replace(",", ".")));

let valueFound = false;
for (const rv of rawValues) {
  if (isNaN(rv)) continue;
  if (Math.abs(Math.round(rv * 100) / 100 - o.value) < 0.015) { valueFound = true; break; }
  if (o.metric === "temperature") {
    const fromF = Math.round((rv - 32) * 5 / 9 * 100) / 100;
    if (Math.abs(fromF - o.value) < 0.015) { valueFound = true; break; }
    const fromK = Math.round((rv - 273.15) * 100) / 100;
    if (Math.abs(fromK - o.value) < 0.015) { valueFound = true; break; }
  }
  if (o.metric === "pressure") {
    const fromKPa = Math.round(rv * 10 * 100) / 100;
    if (Math.abs(fromKPa - o.value) < 0.015) { valueFound = true; break; }
  }
}
if (!valueFound) return false;

// Extract potential timestamps from raw and verify
const epochMsMatch = raw.match(/\b1[4-9]\d{11}\b/);
const epochMatch = raw.match(/\b1[4-9]\d{8}\b/);

if (epochMsMatch) {
  const epochMs = parseInt(epochMsMatch[0], 10);
  const rawDate = new Date(epochMs);
  if (Math.abs(tsDate.getTime() - rawDate.getTime()) > 60000) return false;
} else if (epochMatch) {
  const epoch = parseInt(epochMatch[0], 10);
  const rawDate = new Date(epoch * 1000);
  if (Math.abs(tsDate.getTime() - rawDate.getTime()) > 60000) return false;
} else {
  // Check day appears in raw
  const dayStr = String(day);
  const dayPadded = day < 10 ? "0" + day : dayStr;
  if (!raw.includes(dayPadded) && !new RegExp("\\b" + day + "\\b").test(raw)) return false;
  
  // Check month appears in raw (as number or name)
  const monthNames = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const monthPadded = month < 10 ? "0" + month : String(month);
  const monthInRaw = raw.includes(monthPadded) || 
                     new RegExp("\\b" + month + "\\b").test(raw) ||
                     new RegExp(monthNames[month - 1], "i").test(raw);
  if (!monthInRaw) return false;
  
  // Check if raw has explicit time - if so, verify hour/minute appear
  const timeMatch = raw.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (timeMatch) {
    const rawHour = parseInt(timeMatch[1], 10);
    const rawMin = parseInt(timeMatch[2], 10);
    
    // Check for timezone offset in raw
    const tzMatch = raw.match(/([+-])(\d{2}):?(\d{2})(?=\s|"|<|$|\|)/);
    
    if (tzMatch) {
      const sign = tzMatch[1] === '+' ? 1 : -1;
      const tzHours = parseInt(tzMatch[2], 10);
      const tzMins = parseInt(tzMatch[3], 10);
      const offsetMins = sign * (tzHours * 60 + tzMins);
      
      // Convert raw local time to UTC
      const rawTotalMins = rawHour * 60 + rawMin;
      const utcTotalMins = (rawTotalMins - offsetMins + 1440) % 1440;
      const expectedUtcHour = Math.floor(utcTotalMins / 60);
      const expectedUtcMin = utcTotalMins % 60;
      
      if (hour !== expectedUtcHour || minute !== expectedUtcMin) return false;
    } else if (raw.includes("Z") || /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(raw) || /\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(raw)) {
      // Explicit UTC or ISO-like format without offset - assume UTC
      if (hour !== rawHour || minute !== rawMin) return false;
    }
  } else {
    // No time in raw - should be 00:00:00
    if (hour !== 0 || minute !== 0 || second !== 0) return false;
  }
}

return true;
