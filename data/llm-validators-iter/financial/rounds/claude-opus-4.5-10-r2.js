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
const hasBRL = /\bbrl\b|"brl"|'brl'|\breal\b|\breais\b|r\$/.test(rawLower);
const hasUSD = /\busd\b|"usd"|'usd'|\bdolar\b|\bdólar\b/.test(rawLower);
const hasEUR = /\beur\b|"eur"|'eur'|\beuro\b|\beuros\b/.test(rawLower);
const hasGBP = /\bgbp\b|"gbp"|'gbp'|\blibra\b|\blibras\b/.test(rawLower);

// Category must match currency
if (hasBRL && !hasUSD && !hasEUR && !hasGBP) {
  if (o.category !== 'domestic') return false;
} else if (!hasBRL && (hasUSD || hasEUR || hasGBP)) {
  if (o.category !== 'international') return false;
}

// Extract numbers from raw for value validation
const rawNorm = raw.replace(/(\d)\.(\d{3})(?:[,.](\d{1,2}))?/g, (m, a, b, c) => c ? a + b + '.' + c : a + b);
const nums = rawNorm.match(/\d+(?:\.\d+)?/g) || [];
const rawNums = nums.map(Number).filter(n => n > 0 && n < 1e12);

// Check if value_usd field exists in raw (no conversion needed)
const hasValueUsd = /value_usd|valueusd/i.test(raw);

// Determine conversion rate
let rate = null;
if (hasValueUsd) rate = 1;
else if (hasBRL && !hasUSD && !hasEUR && !hasGBP) rate = 0.2;
else if (hasUSD && !hasBRL && !hasEUR && !hasGBP) rate = 1;
else if (hasEUR && !hasBRL && !hasUSD && !hasGBP) rate = 1.1;
else if (hasGBP && !hasBRL && !hasUSD && !hasEUR) rate = 1.27;
else if (hasEUR) rate = 1.1;
else if (hasGBP) rate = 1.27;

// Verify value_in_usd matches some number in raw after conversion
if (rate !== null) {
  const tolerance = 0.015;
  const found = rawNums.some(n => Math.abs(n * rate - o.value_in_usd) < tolerance);
  if (!found) return false;
}

// Verify date appears in raw (check year at minimum)
if (!raw.includes(String(yyyy))) return false;

// Extract potential dates/timestamps from raw and verify output date
const isoMatch = raw.match(/(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2})([+-]\d{2}:\d{2}|Z)?)?/);
const unixMatch = raw.match(/[":]\s*(\d{10})\s*[",}]/);

if (isoMatch) {
  const [, y, m, day, hr, min, sec, tz] = isoMatch;
  let utcDate;
  if (tz) {
    const ts = new Date(isoMatch[0]);
    utcDate = new Date(ts.toISOString());
  } else {
    utcDate = new Date(Date.UTC(+y, +m - 1, +day, +(hr||0), +(min||0), +(sec||0)));
  }
  const expDD = String(utcDate.getUTCDate()).padStart(2, '0');
  const expMM = String(utcDate.getUTCMonth() + 1).padStart(2, '0');
  const expYY = utcDate.getUTCFullYear();
  if (o.date !== `${expDD}/${expMM}/${expYY}`) return false;
} else if (unixMatch) {
  const ts = new Date(+unixMatch[1] * 1000);
  const expDD = String(ts.getUTCDate()).padStart(2, '0');
  const expMM = String(ts.getUTCMonth() + 1).padStart(2, '0');
  const expYY = ts.getUTCFullYear();
  if (o.date !== `${expDD}/${expMM}/${expYY}`) return false;
} else {
  // Try DD-mon-YYYY format
  const monMatch = raw.match(/(\d{1,2})-(\w{3})-(\d{4})/i);
  if (monMatch) {
    const months = {jan:1,fev:2,feb:2,mar:3,abr:4,apr:4,mai:5,may:5,jun:6,jul:7,ago:8,aug:8,set:9,sep:9,out:10,oct:10,nov:11,dez:12,dec:12};
    const mon = months[monMatch[2].toLowerCase()];
    if (mon) {
      const expDD = String(+monMatch[1]).padStart(2, '0');
      const expMM = String(mon).padStart(2, '0');
      if (o.date !== `${expDD}/${expMM}/${monMatch[3]}`) return false;
    }
  }
}

return true;
