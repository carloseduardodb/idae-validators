if (!o || typeof o !== 'object') return false;

// Check required fields exist and have correct types
if (typeof o.audit_id !== 'string' || o.audit_id === '') return false;
if (typeof o.value_in_usd !== 'number' || o.value_in_usd <= 0 || !isFinite(o.value_in_usd)) return false;
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

// Determine which currency
let detectedCurrency = null;
const currencyCount = [hasBRL, hasUSD, hasEUR, hasGBP].filter(Boolean).length;
if (currencyCount === 1) {
  if (hasBRL) detectedCurrency = 'BRL';
  else if (hasUSD) detectedCurrency = 'USD';
  else if (hasEUR) detectedCurrency = 'EUR';
  else if (hasGBP) detectedCurrency = 'GBP';
}

// Validate category matches currency
if (detectedCurrency) {
  if (detectedCurrency === 'BRL' && o.category !== 'domestic') return false;
  if (detectedCurrency !== 'BRL' && o.category !== 'international') return false;
}

// Extract numbers from raw to validate value conversion
const rates = { BRL: 0.2, USD: 1, EUR: 1.1, GBP: 1.27 };

// Parse Brazilian format numbers (1.234,56) and standard format
const brNums = raw.match(/\d{1,3}(?:\.\d{3})*,\d{2}/g) || [];
const stdNums = raw.match(/\d+\.?\d*/g) || [];

const possibleValues = new Set();

for (const n of brNums) {
  const val = parseFloat(n.replace(/\./g, '').replace(',', '.'));
  if (val > 0) possibleValues.add(val);
}
for (const n of stdNums) {
  const val = parseFloat(n);
  if (val > 0 && val < 1e10) possibleValues.add(val);
}

// Check if value_usd field exists in raw (already converted)
const hasValueUsd = /value_usd|valueusd/i.test(raw);

// Validate the conversion
let validConversion = false;
const tolerance = 0.015;

for (const val of possibleValues) {
  if (hasValueUsd && Math.abs(o.value_in_usd - val) < tolerance) {
    validConversion = true;
    break;
  }
  for (const [ccy, rate] of Object.entries(rates)) {
    const converted = val * rate;
    if (Math.abs(o.value_in_usd - converted) < tolerance) {
      if (detectedCurrency && detectedCurrency !== ccy) continue;
      validConversion = true;
      break;
    }
  }
  if (validConversion) break;
}

if (!validConversion) return false;

// Validate date - extract possible dates from raw and check output matches one
const extractDates = (s) => {
  const dates = [];
  // ISO format: 2024-04-04, 2024-04-04T07:39:00Z, with optional offset
  const isoMatch = s.match(/(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2})([+-]\d{2}:\d{2}|Z)?)?/g) || [];
  for (const m of isoMatch) {
    const parts = m.match(/(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2})([+-]\d{2}:\d{2}|Z)?)?/);
    if (parts) {
      const dt = new Date(m.includes('T') ? m : m + 'T00:00:00Z');
      if (!isNaN(dt)) dates.push({ y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() });
    }
  }
  // DD-mon-YYYY format
  const monMap = { jan: 1, fev: 2, feb: 2, mar: 3, abr: 4, apr: 4, mai: 5, may: 5, jun: 6, jul: 7, ago: 8, aug: 8, set: 9, sep: 9, out: 10, oct: 10, nov: 11, dez: 12, dec: 12 };
  const monMatch = s.match(/(\d{1,2})-([a-z]{3})-(\d{4})/gi) || [];
  for (const m of monMatch) {
    const p = m.match(/(\d{1,2})-([a-z]{3})-(\d{4})/i);
    if (p && monMap[p[2].toLowerCase()]) {
      dates.push({ y: parseInt(p[3]), m: monMap[p[2].toLowerCase()], d: parseInt(p[1]) });
    }
  }
  // Unix timestamp (10 digits)
  const tsMatch = s.match(/\b1[4-9]\d{8}\b/g) || [];
  for (const ts of tsMatch) {
    const dt = new Date(parseInt(ts) * 1000);
    if (!isNaN(dt)) dates.push({ y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() });
  }
  return dates;
};

const possibleDates = extractDates(raw);
if (possibleDates.length > 0) {
  const dateMatch = possibleDates.some(pd => pd.y === yyyy && pd.m === mm && pd.d === dd);
  if (!dateMatch) return false;
} else {
  // Fallback: year must appear
  if (!raw.includes(yyyy.toString())) return false;
}

return true;
