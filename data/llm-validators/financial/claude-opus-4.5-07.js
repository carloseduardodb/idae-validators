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

return true;
