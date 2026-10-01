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

// Check if raw has value_usd field (should not convert)
const hasValueUsd = /value_usd|valueusd/i.test(raw);

// Extract potential numeric values from raw
const numPatterns = [
  /(\d{1,3}(?:\.\d{3})*,\d{2})/g,  // Brazilian format: 1.234,56
  /(\d+(?:,\d{3})*\.\d+)/g,         // US format: 1,234.56
  /(\d+\.\d+)/g,                     // Simple decimal: 1234.56
  /(\d+)/g                           // Integer
];

let foundValidValue = false;

for (const pattern of numPatterns) {
  const matches = raw.match(pattern) || [];
  for (const match of matches) {
    let numVal;
    if (/^\d{1,3}(?:\.\d{3})*,\d{2}$/.test(match)) {
      numVal = parseFloat(match.replace(/\./g, '').replace(',', '.'));
    } else {
      numVal = parseFloat(match.replace(/,/g, ''));
    }
    
    if (!isFinite(numVal) || numVal <= 0) continue;
    
    // Check if this value could produce the output
    if (hasValueUsd && Math.abs(numVal - o.value_in_usd) < 0.01) {
      foundValidValue = true;
      break;
    }
    
    if (detectedCurrency) {
      const converted = numVal * rates[detectedCurrency];
      if (Math.abs(converted - o.value_in_usd) < 0.01) {
        foundValidValue = true;
        break;
      }
    } else {
      // Try all rates
      for (const curr of Object.keys(rates)) {
        const converted = numVal * rates[curr];
        if (Math.abs(converted - o.value_in_usd) < 0.01) {
          foundValidValue = true;
          break;
        }
      }
    }
    if (foundValidValue) break;
  }
  if (foundValidValue) break;
}

if (!foundValidValue) return false;

// Validate date appears related to raw content
const yearStr = yyyy.toString();
if (!raw.includes(yearStr)) return false;

return true;
