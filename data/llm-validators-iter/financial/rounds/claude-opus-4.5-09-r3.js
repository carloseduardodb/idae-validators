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
const hasBRL = /\bbrl\b|\breal\b|\breais\b|r\$/.test(rawLower);
const hasUSD = /\busd\b|\bdolar\b|\bdólar\b/.test(rawLower);
const hasEUR = /\beur\b|\beuro\b/.test(rawLower);
const hasGBP = /\bgbp\b|\blibra\b/.test(rawLower);

// Check if raw has value_usd field (should not convert)
const hasValueUsd = /value_usd/i.test(raw);

// Category validation
if (hasValueUsd && /orig_currency/i.test(raw) && hasBRL) {
  if (o.category !== 'domestic') return false;
} else if (hasBRL && !hasUSD && !hasEUR && !hasGBP) {
  if (o.category !== 'domestic') return false;
} else if ((hasUSD || hasEUR || hasGBP) && !hasBRL) {
  if (o.category !== 'international') return false;
}

// Parse numbers from raw
const numPatterns = raw.match(/[\d][.\d,]*[\d]|\d/g) || [];
const possibleValues = new Set();
for (const n of numPatterns) {
  if (/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(n)) {
    possibleValues.add(parseFloat(n.replace(/\./g, '').replace(',', '.')));
  }
  if (/^\d+(\.\d+)?$/.test(n)) {
    possibleValues.add(parseFloat(n));
  }
  if (/^\d{1,3}(,\d{3})*(\.\d+)?$/.test(n)) {
    possibleValues.add(parseFloat(n.replace(/,/g, '')));
  }
}

// Determine rate
let rate = null;
if (hasValueUsd) rate = 1;
else if (hasGBP && !hasBRL && !hasUSD && !hasEUR) rate = 1.27;
else if (hasEUR && !hasBRL && !hasUSD && !hasGBP) rate = 1.1;
else if (hasUSD && !hasBRL && !hasEUR && !hasGBP) rate = 1;
else if (hasBRL) rate = 0.2;

// Verify value_in_usd
if (rate !== null && possibleValues.size > 0) {
  let found = false;
  for (const v of possibleValues) {
    if (v > 0 && Math.abs(v * rate - o.value_in_usd) < 0.015) { found = true; break; }
  }
  if (!found) return false;
}

// Verify year in raw
if (!raw.includes(yyyy.toString())) return false;

// Extract potential dates from raw and verify output date matches
const isoMatch = raw.match(/(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2})([+-]\d{2}:\d{2}|Z)?)?/);
const unixMatch = raw.match(/[":,]\s*(\d{10})\s*[",}\s]|[":,]\s*(\d{10})$/);

if (isoMatch) {
  const [, y, m, day, hr, min, sec, tz] = isoMatch;
  let utcDate;
  if (tz) {
    const ts = new Date(`${y}-${m}-${day}T${hr || '00'}:${min || '00'}:${sec || '00'}${tz}`);
    utcDate = new Date(ts.toISOString());
  } else {
    utcDate = new Date(Date.UTC(+y, +m - 1, +day));
  }
  if (utcDate.getUTCFullYear() !== yyyy || utcDate.getUTCMonth() + 1 !== mm || utcDate.getUTCDate() !== dd) return false;
} else if (unixMatch) {
  const unix = unixMatch[1] || unixMatch[2];
  const ts = new Date(parseInt(unix, 10) * 1000);
  if (ts.getUTCFullYear() !== yyyy || ts.getUTCMonth() + 1 !== mm || ts.getUTCDate() !== dd) return false;
} else {
  // Check day and month appear somewhere - more flexible matching
  const dayStr = dd.toString();
  const dayPad = dayStr.padStart(2, '0');
  const monthNames = ['jan','feb','fev','mar','apr','abr','may','mai','jun','jul','aug','ago','sep','set','oct','out','nov','dec','dez'];
  const monthIdx = [1,2,2,3,4,4,5,5,6,7,8,8,9,9,10,10,11,12,12];
  
  const hasDay = raw.includes(dayPad) || new RegExp('\\b' + dayStr + '\\b').test(raw);
  const hasMonth = raw.includes(mm.toString().padStart(2,'0')) || 
                   new RegExp('\\b' + mm + '\\b').test(raw) ||
                   monthNames.some((name, i) => monthIdx[i] === mm && rawLower.includes(name));
  
  if (!hasDay || !hasMonth) return false;
}

return true;
