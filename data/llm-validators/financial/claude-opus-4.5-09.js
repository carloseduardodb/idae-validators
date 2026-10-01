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
const hasEUR = /\beur\b|"eur"|'eur'|\beuro\b/.test(rawLower);
const hasGBP = /\bgbp\b|"gbp"|'gbp'|\blibra\b/.test(rawLower);

// Category must match currency
if (hasBRL && !hasUSD && !hasEUR && !hasGBP) {
  if (o.category !== 'domestic') return false;
} else if (hasUSD || hasEUR || hasGBP) {
  if (hasBRL && (hasUSD || hasEUR || hasGBP)) {
    // Mixed currencies - check if orig_currency or similar indicates BRL is source
    if (/orig_currency|moeda|divisa/.test(rawLower) && hasBRL) {
      if (o.category !== 'domestic') return false;
    }
  } else {
    if (o.category !== 'international') return false;
  }
}

// Extract numbers from raw to validate value conversion
const rates = { brl: 0.2, real: 0.2, usd: 1, dolar: 1, eur: 1.1, euro: 1.1, gbp: 1.27, libra: 1.27 };

// Check if raw has value_usd field (should not convert)
const hasValueUsd = /value_usd|valueusd/i.test(raw);

// Parse Brazilian format numbers (1.234,56) and standard (1234.56)
const numPatterns = raw.match(/[\d.,]+/g) || [];
const possibleValues = [];
for (const n of numPatterns) {
  // Brazilian format: dots as thousands, comma as decimal
  if (/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(n)) {
    possibleValues.push(parseFloat(n.replace(/\./g, '').replace(',', '.')));
  }
  // Standard format
  if (/^\d+(\.\d+)?$/.test(n) || /^\d{1,3}(,\d{3})*(\.\d+)?$/.test(n)) {
    possibleValues.push(parseFloat(n.replace(/,/g, '')));
  }
}

// Determine applicable rate
let rate = null;
if (hasValueUsd) {
  rate = 1;
} else if (hasGBP && !hasBRL && !hasUSD && !hasEUR) {
  rate = 1.27;
} else if (hasEUR && !hasBRL && !hasUSD && !hasGBP) {
  rate = 1.1;
} else if (hasUSD && !hasBRL && !hasEUR && !hasGBP) {
  rate = 1;
} else if (hasBRL) {
  rate = 0.2;
}

// Verify value_in_usd matches some input value * rate
if (rate !== null) {
  const tolerance = 0.015;
  let found = false;
  for (const v of possibleValues) {
    if (v > 0) {
      const expected = v * rate;
      if (Math.abs(expected - o.value_in_usd) < tolerance) {
        found = true;
        break;
      }
    }
  }
  if (!found && possibleValues.length > 0) return false;
}

// Verify date appears in raw in some form
const yearStr = yyyy.toString();
if (!raw.includes(yearStr)) return false;

return true;
