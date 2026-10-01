if (!o || typeof o !== 'object') return false;

// Check required fields exist and have correct types
if (typeof o.audit_id !== 'string' || o.audit_id === '') return false;
if (typeof o.value_in_usd !== 'number' || !isFinite(o.value_in_usd) || o.value_in_usd <= 0) return false;
if (typeof o.date !== 'string' || !/^\d{2}\/\d{2}\/\d{4}$/.test(o.date)) return false;
if (o.category !== 'domestic' && o.category !== 'international') return false;
if (o.status !== 'valid') return false;

// Validate date is real
const [dd, mm, yyyy] = o.date.split('/').map(Number);
const d = new Date(Date.UTC(yyyy, mm - 1, dd));
if (d.getUTCFullYear() !== yyyy || d.getUTCMonth() !== mm - 1 || d.getUTCDate() !== dd) return false;

// Check audit_id appears in raw
if (!raw.includes(o.audit_id)) return false;

// Detect currency from raw
const rawLower = raw.toLowerCase();
const hasBRL = /\bbrl\b|"brl"|'brl'|\breal\b|\breais\b|r\$|\bmoeda.*brl/i.test(rawLower);
const hasUSD = /\busd\b|"usd"|'usd'|\bdolar\b|\bdólar\b/.test(rawLower);
const hasEUR = /\beur\b|"eur"|'eur'|\beuro\b|\bccy.*eur/i.test(rawLower);
const hasGBP = /\bgbp\b|"gbp"|'gbp'|\blibra\b|currency.*gbp/i.test(rawLower);

// Check category matches currency
if (hasBRL && !hasUSD && !hasEUR && !hasGBP) {
  if (o.category !== 'domestic') return false;
} else if (!hasBRL && (hasUSD || hasEUR || hasGBP)) {
  if (o.category !== 'international') return false;
}

// Extract numbers from raw for value validation
const rawNorm = raw.replace(/(\d)\.(\d{3})(?:[,.](\d{1,2}))?/g, (m, a, b, c) => c ? a + b + '.' + c : a + b);
const nums = rawNorm.match(/\d+(?:\.\d+)?/g) || [];
const rawNums = nums.map(Number).filter(n => n > 0 && n < 1e12);

// Check if value_usd field exists (no conversion needed)
const hasValueUsd = /value_usd|valueusd/i.test(raw);

// Determine conversion rate
let rate = null;
if (hasValueUsd) rate = 1;
else if (hasBRL && !hasUSD && !hasEUR && !hasGBP) rate = 0.2;
else if (hasUSD && !hasBRL && !hasEUR && !hasGBP) rate = 1;
else if (hasEUR && !hasBRL && !hasUSD && !hasGBP) rate = 1.1;
else if (hasGBP && !hasBRL && !hasUSD && !hasEUR) rate = 1.27;

// Validate value conversion if we can determine rate
if (rate !== null) {
  const expectedValues = rawNums.map(n => n * rate);
  const tolerance = 0.015;
  const match = expectedValues.some(ev => Math.abs(ev - o.value_in_usd) < tolerance || Math.abs(ev - o.value_in_usd) / o.value_in_usd < 0.001);
  if (!match && rawNums.length > 0) return false;
}

// Validate date appears in raw (check year at minimum)
if (!raw.includes(String(yyyy))) return false;

// Extract date components from raw and validate
const isoMatch = raw.match(/(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2})([+-]\d{2}:\d{2}|Z)?)?/);
if (isoMatch) {
  let [, y, m, day, hr, min, sec, tz] = isoMatch;
  let utcDate = new Date(Date.UTC(+y, +m - 1, +day, +(hr||0), +(min||0), +(sec||0)));
  if (tz && tz !== 'Z') {
    const sign = tz[0] === '+' ? 1 : -1;
    const [tzH, tzM] = tz.slice(1).split(':').map(Number);
    utcDate = new Date(utcDate.getTime() - sign * (tzH * 60 + tzM) * 60000);
  }
  if (utcDate.getUTCFullYear() !== yyyy || utcDate.getUTCMonth() + 1 !== mm || utcDate.getUTCDate() !== dd) return false;
}

// Check for Unix timestamp
const unixMatch = raw.match(/(\d{10})(?!\d)/);
if (unixMatch && !isoMatch) {
  const ts = +unixMatch[1];
  const utcDate = new Date(ts * 1000);
  if (utcDate.getUTCFullYear() !== yyyy || utcDate.getUTCMonth() + 1 !== mm || utcDate.getUTCDate() !== dd) return false;
}

// Check DD-MMM-YYYY format
const monthNames = {jan:1,fev:2,feb:2,mar:3,abr:4,apr:4,mai:5,may:5,jun:6,jul:7,ago:8,aug:8,set:9,sep:9,out:10,oct:10,nov:11,dez:12,dec:12};
const dmmyMatch = raw.match(/(\d{1,2})-([a-z]{3})-(\d{4})/i);
if (dmmyMatch) {
  const [, day, mon, year] = dmmyMatch;
  const m = monthNames[mon.toLowerCase()];
  if (m && (+year !== yyyy || m !== mm || +day !== dd)) return false;
}

// Check YYYY-MM-DD without time
const ymdMatch = raw.match(/"date"\s*:\s*"(\d{4})-(\d{2})-(\d{2})"/);
if (ymdMatch && !isoMatch) {
  const [, y, m, day] = ymdMatch;
  if (+y !== yyyy || +m !== mm || +day !== dd) return false;
}

return true;
