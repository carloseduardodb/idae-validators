const raw_lower = raw.toLowerCase();

if (!o || typeof o !== 'object') return false;
if (typeof o.audit_id !== 'string' || o.audit_id === '') return false;
if (typeof o.value_in_usd !== 'number' || !isFinite(o.value_in_usd) || o.value_in_usd <= 0) return false;
if (typeof o.date !== 'string' || !/^\d{2}\/\d{2}\/\d{4}$/.test(o.date)) return false;
if (o.status !== 'valid') return false;
if (o.category !== 'domestic' && o.category !== 'international') return false;

if (!raw.includes(o.audit_id)) return false;

const [dd, mm, yyyy] = o.date.split('/');
const day = parseInt(dd, 10), month = parseInt(mm, 10), year = parseInt(yyyy, 10);
if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900 || year > 2100) return false;

const rates = { brl: 0.2, real: 0.2, usd: 1, dolar: 1, eur: 1.1, euro: 1.1, gbp: 1.27, libra: 1.27 };
const currencies = ['brl', 'real', 'usd', 'dolar', 'eur', 'euro', 'gbp', 'libra'];

let detectedCurrency = null;
for (const c of currencies) {
  if (raw_lower.includes(c)) {
    detectedCurrency = c;
    break;
  }
}
if (raw.includes('R$')) detectedCurrency = 'brl';
const isPreConverted = raw_lower.includes('value_usd') || raw_lower.includes('_usd');
if (isPreConverted) detectedCurrency = 'usd';

if (!detectedCurrency) return false;

const isBRL = detectedCurrency === 'brl' || detectedCurrency === 'real' || raw.includes('R$');
const origIsBRL = raw_lower.includes('brl') || raw_lower.includes('real') || raw.includes('R$');
if (o.category === 'domestic' && !origIsBRL) return false;
if (o.category === 'international' && origIsBRL) return false;

const rate = isPreConverted ? 1 : rates[detectedCurrency];

const numMatches = raw.match(/[\d.,]+/g) || [];
let foundValidAmount = false;
for (const numStr of numMatches) {
  let val;
  if (/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(numStr) || /^\d+(,\d+)$/.test(numStr)) {
    val = parseFloat(numStr.replace(/\./g, '').replace(',', '.'));
  } else {
    val = parseFloat(numStr.replace(/,/g, ''));
  }
  if (!isFinite(val) || val <= 0) continue;
  
  const expectedUsd = val * rate;
  if (Math.abs(o.value_in_usd - expectedUsd) < 0.015) {
    foundValidAmount = true;
    break;
  }
}
if (!foundValidAmount) return false;

const monthNames = {'jan':1,'fev':2,'feb':2,'mar':3,'abr':4,'apr':4,'mai':5,'may':5,'jun':6,'jul':7,'ago':8,'aug':8,'set':9,'sep':9,'out':10,'oct':10,'nov':11,'dez':12,'dec':12};

const isoMatch = raw.match(/(\d{4})-(\d{1,2})-(\d{1,2})(?:T(\d{2}):(\d{2}):(\d{2})([+-]\d{2}:\d{2}|Z)?)?/);
if (isoMatch) {
  let y = parseInt(isoMatch[1]), m = parseInt(isoMatch[2]), d = parseInt(isoMatch[3]);
  if (isoMatch[4] !== undefined) {
    let h = parseInt(isoMatch[4]), mi = parseInt(isoMatch[5]), s = parseInt(isoMatch[6]);
    let offset = isoMatch[7];
    let utc = new Date(Date.UTC(y, m - 1, d, h, mi, s));
    if (offset && offset !== 'Z') {
      const sign = offset[0] === '+' ? 1 : -1;
      const [oh, om] = offset.slice(1).split(':').map(Number);
      utc = new Date(utc.getTime() - sign * (oh * 60 + om) * 60000);
    }
    if (utc.getUTCDate() !== day || utc.getUTCMonth() + 1 !== month || utc.getUTCFullYear() !== year) return false;
  } else {
    if (d !== day || m !== month || y !== year) return false;
  }
  return true;
}

const dmyMatch = raw.match(/(\d{1,2})-([a-z]{3})-(\d{4})/i);
if (dmyMatch) {
  const d = parseInt(dmyMatch[1]), mName = dmyMatch[2].toLowerCase(), y = parseInt(dmyMatch[3]);
  const m = monthNames[mName];
  if (d !== day || m !== month || y !== year) return false;
  return true;
}

const epochMatch = raw.match(/(\d{10})/);
if (epochMatch) {
  const utc = new Date(parseInt(epochMatch[1]) * 1000);
  if (utc.getUTCDate() !== day || utc.getUTCMonth() + 1 !== month || utc.getUTCFullYear() !== year) return false;
  return true;
}

const dateTimeMatch = raw.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})\s*([+-]\d{2}:\d{2})/);
if (dateTimeMatch) {
  let y = parseInt(dateTimeMatch[1]), m = parseInt(dateTimeMatch[2]), d = parseInt(dateTimeMatch[3]);
  let h = parseInt(dateTimeMatch[4]), mi = parseInt(dateTimeMatch[5]), s = parseInt(dateTimeMatch[6]);
  let offset = dateTimeMatch[7];
  let utc = new Date(Date.UTC(y, m - 1, d, h, mi, s));
  const sign = offset[0] === '+' ? 1 : -1;
  const [oh, om] = offset.slice(1).split(':').map(Number);
  utc = new Date(utc.getTime() - sign * (oh * 60 + om) * 60000);
  if (utc.getUTCDate() !== day || utc.getUTCMonth() + 1 !== month || utc.getUTCFullYear() !== year) return false;
  return true;
}

if (raw.includes(year.toString())) return true;

return false;
