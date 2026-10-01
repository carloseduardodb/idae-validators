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

const datePatterns = [
  yyyy + '-' + mm + '-' + dd,
  yyyy + '-' + mm.replace(/^0/, '') + '-' + dd.replace(/^0/, ''),
  dd + '-' + mm + '-' + yyyy,
  dd + '/' + mm + '/' + yyyy,
  year.toString(),
];
const monthNames = ['jan','fev','feb','mar','abr','apr','mai','may','jun','jul','ago','aug','set','sep','out','oct','nov','dez','dec'];
const monthNum = month - 1;
const possibleMonths = [monthNames[monthNum * 2], monthNames[monthNum * 2 + 1]].filter(Boolean);
if (month === 1) possibleMonths.push('jan');
if (month === 2) possibleMonths.push('fev', 'feb');
if (month === 3) possibleMonths.push('mar');
if (month === 4) possibleMonths.push('abr', 'apr');
if (month === 5) possibleMonths.push('mai', 'may');
if (month === 6) possibleMonths.push('jun');
if (month === 7) possibleMonths.push('jul');
if (month === 8) possibleMonths.push('ago', 'aug');
if (month === 9) possibleMonths.push('set', 'sep');
if (month === 10) possibleMonths.push('out', 'oct');
if (month === 11) possibleMonths.push('nov');
if (month === 12) possibleMonths.push('dez', 'dec');

let dateFound = datePatterns.some(p => raw.includes(p)) || 
                raw.match(/\d{10}/) ||
                possibleMonths.some(m => raw_lower.includes(m) && raw.includes(year.toString()));
if (!dateFound) return false;

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
if (raw_lower.includes('value_usd') || raw_lower.includes('_usd')) detectedCurrency = 'usd';

if (!detectedCurrency) return false;

const isBRL = detectedCurrency === 'brl' || detectedCurrency === 'real' || raw.includes('R$');
if (o.category === 'domestic' && !isBRL) return false;
if (o.category === 'international' && isBRL) return false;

const rate = rates[detectedCurrency] || 1;
const isPreConverted = raw_lower.includes('value_usd') || raw_lower.includes('_usd');

const numMatches = raw.match(/[\d.,]+/g) || [];
let foundValidAmount = false;
for (const numStr of numMatches) {
  let val;
  if (/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(numStr)) {
    val = parseFloat(numStr.replace(/\./g, '').replace(',', '.'));
  } else {
    val = parseFloat(numStr.replace(/,/g, ''));
  }
  if (!isFinite(val) || val <= 0) continue;
  
  const expectedUsd = isPreConverted ? val : val * rate;
  if (Math.abs(o.value_in_usd - expectedUsd) < 0.01) {
    foundValidAmount = true;
    break;
  }
}

return foundValidAmount;
