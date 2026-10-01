if (!o || typeof o !== 'object') return false;

if (typeof o.audit_id !== 'string' || o.audit_id === '') return false;
if (typeof o.value_in_usd !== 'number' || !isFinite(o.value_in_usd) || o.value_in_usd <= 0) return false;
if (typeof o.date !== 'string' || !/^\d{2}\/\d{2}\/\d{4}$/.test(o.date)) return false;
if (o.category !== 'domestic' && o.category !== 'international') return false;
if (o.status !== 'valid') return false;

const [dd, mm, yyyy] = o.date.split('/').map(Number);
const d = new Date(Date.UTC(yyyy, mm - 1, dd));
if (d.getUTCFullYear() !== yyyy || d.getUTCMonth() !== mm - 1 || d.getUTCDate() !== dd) return false;

if (!raw.includes(o.audit_id)) return false;

const rawLower = raw.toLowerCase();

const hasBRL = /\bbrl\b/i.test(raw) || /\breal\b/i.test(rawLower) || /r\$/.test(raw);
const hasUSD = /\busd\b/i.test(raw) || /\bdolar\b/i.test(rawLower);
const hasEUR = /\beur\b/i.test(raw) || /\beuro\b/i.test(rawLower);
const hasGBP = /\bgbp\b/i.test(raw) || /\blibra\b/i.test(rawLower);

// Check for value_usd field which indicates pre-converted USD value
const hasValueUsdField = /value_usd/i.test(raw);

// Determine the transaction currency (not the pre-converted field)
// If value_usd exists, look for orig_currency or similar to determine actual currency
let transactionCurrency = null;

if (hasValueUsdField) {
  // When value_usd is present, the orig_currency determines category
  if (hasBRL) transactionCurrency = 'BRL';
  else if (hasEUR) transactionCurrency = 'EUR';
  else if (hasGBP) transactionCurrency = 'GBP';
  else if (hasUSD) transactionCurrency = 'USD';
} else {
  // Normal case: detect the currency
  const currencies = [];
  if (hasBRL) currencies.push('BRL');
  if (hasUSD) currencies.push('USD');
  if (hasEUR) currencies.push('EUR');
  if (hasGBP) currencies.push('GBP');
  if (currencies.length === 1) transactionCurrency = currencies[0];
}

// Enforce category based on detected transaction currency
if (transactionCurrency) {
  if (transactionCurrency === 'BRL' && o.category !== 'domestic') return false;
  if (transactionCurrency !== 'BRL' && o.category !== 'international') return false;
}

// If we detect BRL indicators (like R$) and no other currency indicators, must be domestic
if (hasBRL && !hasUSD && !hasEUR && !hasGBP && o.category !== 'domestic') return false;

// If we detect non-BRL currency and no BRL, must be international
if (!hasBRL && (hasUSD || hasEUR || hasGBP) && o.category !== 'international') return false;

const rates = { BRL: 0.2, USD: 1, EUR: 1.1, GBP: 1.27 };

const brNums = raw.match(/\d{1,3}(?:\.\d{3})*,\d{2}/g) || [];
const stdNums = raw.match(/\d+\.\d+|\d+/g) || [];

const parseBR = s => parseFloat(s.replace(/\./g, '').replace(',', '.'));
const parseStd = s => parseFloat(s);

const allValues = [
  ...brNums.map(parseBR),
  ...stdNums.map(parseStd)
].filter(v => v > 0 && isFinite(v));

const tolerance = 0.02;

let valueValid = false;
for (const val of allValues) {
  if (Math.abs(o.value_in_usd - val) < tolerance) {
    valueValid = true;
    break;
  }
  for (const curr of ['BRL', 'USD', 'EUR', 'GBP']) {
    const converted = val * rates[curr];
    if (Math.abs(o.value_in_usd - converted) < tolerance) {
      valueValid = true;
      break;
    }
  }
  if (valueValid) break;
}

if (!valueValid) return false;

const extractDatesFromRaw = (raw) => {
  const dates = [];
  const isoMatches = raw.match(/\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:[+-]\d{2}:\d{2}|Z)?)?/g) || [];
  for (const m of isoMatches) {
    const dt = new Date(m);
    if (!isNaN(dt)) dates.push(dt);
  }
  const unixMatches = raw.match(/\b1[4-9]\d{8}\b/g) || [];
  for (const u of unixMatches) {
    dates.push(new Date(parseInt(u) * 1000));
  }
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
