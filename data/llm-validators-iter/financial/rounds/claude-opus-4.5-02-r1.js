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

// Determine which currency
let detectedCurrency = null;
const currencies = [];
if (hasBRL) currencies.push('BRL');
if (hasUSD) currencies.push('USD');
if (hasEUR) currencies.push('EUR');
if (hasGBP) currencies.push('GBP');

if (currencies.length === 1) {
  detectedCurrency = currencies[0];
} else if (currencies.length > 1) {
  // Check for orig_currency pattern (value_usd case)
  if (/value_usd|value_in_usd/i.test(raw) && hasBRL) {
    detectedCurrency = 'USD'; // Already in USD
  }
}

// Validate category matches currency
if (detectedCurrency === 'BRL' && o.category !== 'domestic') return false;
if (detectedCurrency && detectedCurrency !== 'BRL' && o.category !== 'international') return false;

// Extract numbers from raw for value validation
const rates = { BRL: 0.2, USD: 1, EUR: 1.1, GBP: 1.27 };

// Parse Brazilian format numbers (1.234,56) and standard format
const brNumbers = raw.match(/\d{1,3}(?:\.\d{3})*,\d{2}/g) || [];
const stdNumbers = raw.match(/\d+\.?\d*/g) || [];

const parseBR = s => parseFloat(s.replace(/\./g, '').replace(',', '.'));
const parseStd = s => parseFloat(s);

let foundValidValue = false;

// Check if value_usd field exists (no conversion needed)
const hasValueUsd = /value_usd/i.test(raw);

for (const numStr of brNumbers) {
  const val = parseBR(numStr);
  if (val > 0) {
    if (hasValueUsd && Math.abs(val - o.value_in_usd) < 0.01) {
      foundValidValue = true;
      break;
    }
    for (const [ccy, rate] of Object.entries(rates)) {
      const converted = val * rate;
      if (Math.abs(converted - o.value_in_usd) < 0.01) {
        foundValidValue = true;
        break;
      }
    }
    if (foundValidValue) break;
  }
}

if (!foundValidValue) {
  for (const numStr of stdNumbers) {
    const val = parseStd(numStr);
    if (val > 0 && val < 1e10) {
      if (hasValueUsd && Math.abs(val - o.value_in_usd) < 0.01) {
        foundValidValue = true;
        break;
      }
      for (const [ccy, rate] of Object.entries(rates)) {
        const converted = val * rate;
        if (Math.abs(converted - o.value_in_usd) < 0.01) {
          foundValidValue = true;
          break;
        }
      }
      if (foundValidValue) break;
    }
  }
}

if (!foundValidValue) return false;

return true;
