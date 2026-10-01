if (!o || typeof o !== 'object') return false;
if (typeof o.audit_id !== 'string' || !o.audit_id) return false;
if (typeof o.value_in_usd !== 'number' || o.value_in_usd <= 0) return false;
if (typeof o.date !== 'string' || !/^\d{2}\/\d{2}\/\d{4}$/.test(o.date)) return false;
if (!['domestic', 'international'].includes(o.category)) return false;
if (o.status !== 'valid') return false;

const idMatch = raw.match(/(?:transaction_id|id_transacao|ref|id=|<id>|"?codigo"?)["\s:=|<>]*([A-Za-z0-9]+)/i);
const rawId = idMatch ? idMatch[1] : null;
if (!rawId || o.audit_id !== rawId) return false;

const currencyMatch = raw.match(/(?:currency|moeda|orig_currency|ccy|divisa)["\s:=|<>]*([A-Za-z]+)/i);
const currencyName = raw.match(/(?:real|dolar|euro|libra)/i);
let rawCurrency = null;
if (currencyMatch) {
  rawCurrency = currencyMatch[1].toUpperCase();
} else if (currencyName) {
  const nameMap = { 'real': 'BRL', 'dolar': 'USD', 'euro': 'EUR', 'libra': 'GBP' };
  rawCurrency = nameMap[currencyName[0].toLowerCase()];
}
if (!['BRL', 'USD', 'EUR', 'GBP'].includes(rawCurrency)) return false;

if ((rawCurrency === 'BRL' && o.category !== 'domestic') || 
    (rawCurrency !== 'BRL' && o.category !== 'international')) return false;

const datePatterns = [
  { regex: /(?:timestamp|data_hora|quando|emissao)["\s:=|<>]*(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:[+-]\d{2}:\d{2}|Z))/, parse: (s) => new Date(s) },
  { regex: /(?:date)["\s:=|<>]*(\d{4}-\d{2}-\d{2})(?![T\d])/, parse: (s) => new Date(s + 'T00:00:00Z') },
  { regex: /(?:quando)["\s:=|<>]*(\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}\s[+-]\d{2}:\d{2})/, parse: (s) => new Date(s.replace(' ', 'T')) },
  { regex: /(?:created_at)["\s:=|<>]*(\d{10})/, parse: (s) => new Date(parseInt(s) * 1000) },
  { regex: /(\d{1,2}-\w{3}-\d{4})/, parse: (s) => new Date(s) }
];

let utcDate = null;
for (const pattern of datePatterns) {
  const match = raw.match(pattern.regex);
  if (match) {
    const date = pattern.parse(match[1]);
    if (!isNaN(date)) {
      utcDate = date.toISOString().split('T')[0].split('-').reverse().join('/');
      break;
    }
  }
}
if (!utcDate || o.date !== utcDate) return false;

const valueUsdMatch = raw.match(/value_usd["\s:=|<>]*([0-9.,]+)/i);
const amountMatch = raw.match(/(?:amount|valor|value|money|total)["\s:=|<>]*R?\$?\s*([0-9.,]+)/i);

let rawAmount = null;
if (valueUsdMatch) {
  rawAmount = parseFloat(valueUsdMatch[1].replace(/\./g, '').replace(',', '.'));
  if (Math.abs(rawAmount - o.value_in_usd) > 0.01) return false;
} else if (amountMatch) {
  const amountStr = amountMatch[1];
  rawAmount = parseFloat(amountStr.replace(/\./g, '').replace(',', '.'));
  if (rawAmount <= 0 || isNaN(rawAmount)) return false;
  const rates = { 'BRL': 0.2, 'USD': 1, 'EUR': 1.1, 'GBP': 1.27 };
  const expected = rawAmount * rates[rawCurrency];
  if (Math.abs(o.value_in_usd - expected) > 0.01) return false;
} else {
  return false;
}

return true;
