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
const rawNorm = raw.replace(/[\s\-_]/g, '').toLowerCase();

const hasBRL = /\bbrl\b/i.test(raw) || /\breal\b/i.test(raw) || /r\$/.test(rawLower) || /"moeda"\s*:\s*"brl"/i.test(raw);
const hasUSD = /\busd\b/i.test(raw) || /\bdolar\b/i.test(raw) || /value_usd/i.test(raw);
const hasEUR = /\beur\b/i.test(raw) || /\beuro\b/i.test(raw);
const hasGBP = /\bgbp\b/i.test(raw) || /\blibra\b/i.test(raw);

// Validate category matches currency
if (hasBRL && !hasUSD && !hasEUR && !hasGBP) {
  if (o.category !== 'domestic') return false;
} else if (hasUSD || hasEUR || hasGBP) {
  if (hasBRL && !hasUSD && !hasEUR && !hasGBP) {
    if (o.category !== 'domestic') return false;
  } else if (!hasBRL || hasUSD || hasEUR || hasGBP) {
    if ((hasUSD || hasEUR || hasGBP) && !hasBRL) {
      if (o.category !== 'international') return false;
    }
  }
}

// Extract numbers from raw to validate value_in_usd is derivable
const brNumMatch = raw.match(/(\d{1,3}(?:\.\d{3})*,\d{2})/g);
const stdNumMatch = raw.match(/(\d+\.?\d*)/g);

let possibleValues = [];
if (brNumMatch) {
  brNumMatch.forEach(n => {
    const v = parseFloat(n.replace(/\./g, '').replace(',', '.'));
    if (v > 0) possibleValues.push(v);
  });
}
if (stdNumMatch) {
  stdNumMatch.forEach(n => {
    const v = parseFloat(n);
    if (v > 0 && v < 1e12) possibleValues.push(v);
  });
}

// Check if value_in_usd can be derived from any found value with known rates
const rates = { brl: 0.2, usd: 1, eur: 1.1, gbp: 1.27 };
let valueValid = false;

for (const val of possibleValues) {
  for (const [ccy, rate] of Object.entries(rates)) {
    const converted = val * rate;
    if (Math.abs(converted - o.value_in_usd) < 0.015) {
      // Check currency consistency
      if (ccy === 'brl' && hasBRL) valueValid = true;
      else if (ccy === 'usd' && hasUSD) valueValid = true;
      else if (ccy === 'eur' && hasEUR) valueValid = true;
      else if (ccy === 'gbp' && hasGBP) valueValid = true;
      // For value_usd field, no conversion needed
      if (/value_usd/i.test(raw) && Math.abs(val - o.value_in_usd) < 0.015) valueValid = true;
    }
  }
  // Direct match for pre-converted USD values
  if (Math.abs(val - o.value_in_usd) < 0.015 && /value_usd/i.test(raw)) valueValid = true;
}

if (!valueValid) return false;

// Validate category consistency with detected currency
if (hasBRL && !hasUSD && !hasEUR && !hasGBP && o.category !== 'domestic') return false;
if ((hasUSD || hasEUR || hasGBP) && !hasBRL && o.category !== 'international') return false;

return true;
