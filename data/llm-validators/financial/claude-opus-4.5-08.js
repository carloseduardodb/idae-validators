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

const hasBRL = /\bbrl\b/i.test(raw) || /\breal\b/i.test(raw) || /r\$/.test(rawLower) || /moeda.*brl/i.test(raw) || /"currency"\s*:\s*"brl"/i.test(raw);
const hasUSD = /\busd\b/i.test(raw) || /\bdolar\b/i.test(raw) || /divisa.*dolar/i.test(rawLower);
const hasEUR = /\beur\b/i.test(raw) || /\beuro\b/i.test(raw) || /ccy.*eur/i.test(rawLower);
const hasGBP = /\bgbp\b/i.test(raw) || /\blibra\b/i.test(raw) || /currency\s*=\s*"gbp"/i.test(raw);

// Determine expected category
let expectedCategory = null;
if (hasBRL && !hasUSD && !hasEUR && !hasGBP) expectedCategory = 'domestic';
else if ((hasUSD || hasEUR || hasGBP) && !hasBRL) expectedCategory = 'international';
else if (hasBRL && (hasUSD || hasEUR || hasGBP)) {
    // Could have orig_currency and value_usd scenario
    if (/value_usd|valueusd/i.test(rawNorm)) expectedCategory = 'domestic';
}

if (expectedCategory && o.category !== expectedCategory) return false;

// Extract numbers from raw for value validation
const rates = { brl: 0.2, usd: 1, eur: 1.1, gbp: 1.27 };
let rate = null;
if (hasBRL) rate = 0.2;
else if (hasEUR) rate = 1.1;
else if (hasGBP) rate = 1.27;
else if (hasUSD) rate = 1;

// Check if value_usd field exists in raw (pre-converted)
const hasValueUsd = /value_usd|valueusd/i.test(rawNorm);

// Extract potential numeric values from raw
const brFormat = raw.match(/\d{1,3}(?:\.\d{3})*,\d{2}/g) || [];
const stdFormat = raw.match(/\d+\.?\d*/g) || [];

let foundValidValue = false;

for (const numStr of brFormat) {
    const val = parseFloat(numStr.replace(/\./g, '').replace(',', '.'));
    if (val > 0) {
        let expected = hasValueUsd ? val : val * rate;
        if (Math.abs(o.value_in_usd - expected) < 0.01) foundValidValue = true;
    }
}

if (!foundValidValue) {
    for (const numStr of stdFormat) {
        const val = parseFloat(numStr);
        if (val > 0 && val < 1e10) {
            let expected = hasValueUsd ? val : val * rate;
            if (Math.abs(o.value_in_usd - expected) < 0.01) foundValidValue = true;
        }
    }
}

if (!foundValidValue) return false;

// Validate date appears related to raw content
const yearStr = String(yyyy);
if (!raw.includes(yearStr)) return false;

return true;
