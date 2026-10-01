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

const hasBRL = /\bbrl\b/i.test(raw) || /\breal\b/i.test(raw) || /r\$/.test(rawLower) || /"moeda"\s*:\s*"brl"/i.test(raw);
const hasUSD = /\busd\b/i.test(raw) || /\bdolar\b/i.test(raw) || /value_usd/i.test(raw);
const hasEUR = /\beur\b/i.test(raw) || /\beuro\b/i.test(raw) || /\bccy["']?\s*:\s*["']?eur/i.test(raw);
const hasGBP = /\bgbp\b/i.test(raw) || /\blibra\b/i.test(raw);

// Determine detected currency
let detectedCurrency = null;
if (hasBRL) detectedCurrency = 'BRL';
else if (hasUSD) detectedCurrency = 'USD';
else if (hasEUR) detectedCurrency = 'EUR';
else if (hasGBP) detectedCurrency = 'GBP';

if (!detectedCurrency) return false;

// Validate category matches currency
if (detectedCurrency === 'BRL' && o.category !== 'domestic') return false;
if (detectedCurrency !== 'BRL' && o.category !== 'international') return false;

// Extract numeric values from raw for validation
const rates = { BRL: 0.2, USD: 1, EUR: 1.1, GBP: 1.27 };

// Parse Brazilian format numbers (1.234,56) and standard format
const brNums = raw.match(/\d{1,3}(?:\.\d{3})*,\d{2}/g) || [];
const stdNums = raw.match(/(?<![,\d])\d+\.?\d*(?![,\d])/g) || [];

const parseBR = s => parseFloat(s.replace(/\./g, '').replace(',', '.'));
const parseStd = s => parseFloat(s);

const allValues = [
  ...brNums.map(parseBR),
  ...stdNums.map(parseStd)
].filter(v => v > 0 && isFinite(v));

// Check if value_in_usd could be derived from any value in raw
const isValueUsdField = /value_usd/i.test(raw);
const tolerance = 0.015;

let valueValid = false;
for (const val of allValues) {
  if (isValueUsdField && Math.abs(o.value_in_usd - val) < tolerance) {
    valueValid = true;
    break;
  }
  const converted = val * rates[detectedCurrency];
  if (Math.abs(o.value_in_usd - converted) < tolerance) {
    valueValid = true;
    break;
  }
}

if (!valueValid) return false;

// Extract all potential dates from raw and validate output date matches one
const extractDatesFromRaw = (raw) => {
  const dates = [];
  
  // ISO timestamps with optional offset
  const isoMatches = raw.match(/\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:[+-]\d{2}:\d{2}|Z)?)?/g) || [];
  for (const m of isoMatches) {
    const dt = new Date(m);
    if (!isNaN(dt)) dates.push(dt);
  }
  
  // Unix timestamp (10 digits)
  const unixMatches = raw.match(/\b1[4-9]\d{8}\b/g) || [];
  for (const u of unixMatches) {
    dates.push(new Date(parseInt(u) * 1000));
  }
  
  // DD-mon-YYYY format
  const monMap = {jan:0,fev:1,feb:1,mar:2,abr:3,apr:3,mai:4,may:4,jun:5,jul:6,ago:7,aug:7,set:8,sep:8,out:9,oct:9,nov:10,dez:11,dec:11};
  const monMatch = raw.match(/(\d{1,2})-([a-z]{3})-(\d{4})/i);
  if (monMatch) {
    const mon = monMap[monMatch[2].toLowerCase()];
    if (mon !== undefined) {
      dates.push(new Date(Date.UTC(parseInt(monMatch[3]), mon, parseInt(monMatch[1]))));
    }
  }
  
  return dates;
};

const rawDates = extractDatesFromRaw(raw);
if (rawDates.length > 0) {
  const outputDate = Date.UTC(yyyy, mm - 1, dd);
  let dateMatch = false;
  for (const rd of rawDates) {
    const utcDate = Date.UTC(rd.getUTCFullYear(), rd.getUTCMonth(), rd.getUTCDate());
    if (utcDate === outputDate) {
      dateMatch = true;
      break;
    }
  }
  if (!dateMatch) return false;
}

return true;
