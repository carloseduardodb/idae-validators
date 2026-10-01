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

// Validate date appears related to raw content
// Extract year from output and check it appears in raw
if (!raw.includes(yyyy.toString())) return false;

return true;
