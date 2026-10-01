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
  if (/value_usd|value_in_usd/i.test(raw) && hasBRL) {
    detectedCurrency = 'USD';
  }
}

// Validate category matches currency
if (detectedCurrency === 'BRL' && o.category !== 'domestic') return false;
if (detectedCurrency && detectedCurrency !== 'BRL' && o.category !== 'international') return false;

// Extract and validate date from raw
const monthMap = {jan:1,fev:2,feb:2,mar:3,abr:4,apr:4,mai:5,may:5,jun:6,jul:7,ago:8,aug:8,set:9,sep:9,out:10,oct:10,nov:11,dez:12,dec:12};

function extractDatesFromRaw(r) {
  const dates = [];
  // Unix timestamp
  const tsMatch = r.match(/[":]\s*(\d{10})\b/);
  if (tsMatch) {
    const dt = new Date(parseInt(tsMatch[1]) * 1000);
    dates.push({y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate()});
  }
  // ISO format with optional offset
  const isoRe = /(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2})([+-]\d{2}:\d{2}|Z)?)?/g;
  let m;
  while ((m = isoRe.exec(r)) !== null) {
    let y = parseInt(m[1]), mo = parseInt(m[2]), day = parseInt(m[3]);
    if (m[4] && m[7]) {
      const h = parseInt(m[4]), mi = parseInt(m[5]), s = parseInt(m[6]);
      let offset = 0;
      if (m[7] !== 'Z') {
        const sign = m[7][0] === '+' ? 1 : -1;
        const [oh, om] = m[7].slice(1).split(':').map(Number);
        offset = sign * (oh * 60 + om);
      }
      const utc = Date.UTC(y, mo - 1, day, h, mi, s) - offset * 60000;
      const dt = new Date(utc);
      dates.push({y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate()});
    } else {
      dates.push({y, m: mo, d: day});
    }
  }
  // DD-mon-YYYY
  const monRe = /(\d{1,2})-([a-z]{3})-(\d{4})/gi;
  while ((m = monRe.exec(r)) !== null) {
    const mon = monthMap[m[2].toLowerCase()];
    if (mon) dates.push({y: parseInt(m[3]), m: mon, d: parseInt(m[1])});
  }
  return dates;
}

const rawDates = extractDatesFromRaw(raw);
if (rawDates.length > 0) {
  const dateMatch = rawDates.some(rd => rd.y === yyyy && rd.m === mm && rd.d === dd);
  if (!dateMatch) return false;
}

// Extract numbers from raw for value validation
const rates = { BRL: 0.2, USD: 1, EUR: 1.1, GBP: 1.27 };
const brNumbers = raw.match(/\d{1,3}(?:\.\d{3})*,\d{2}/g) || [];
const stdNumbers = raw.match(/\d+\.?\d*/g) || [];

const parseBR = s => parseFloat(s.replace(/\./g, '').replace(',', '.'));
const parseStd = s => parseFloat(s);

let foundValidValue = false;
const hasValueUsd = /value_usd/i.test(raw);

for (const numStr of brNumbers) {
  const val = parseBR(numStr);
  if (val > 0) {
    if (hasValueUsd && Math.abs(val - o.value_in_usd) < 0.01) {
      foundValidValue = true;
      break;
    }
    for (const rate of Object.values(rates)) {
      if (Math.abs(val * rate - o.value_in_usd) < 0.01) {
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
      for (const rate of Object.values(rates)) {
        if (Math.abs(val * rate - o.value_in_usd) < 0.01) {
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
