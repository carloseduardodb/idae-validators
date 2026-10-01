if (!o || typeof o !== 'object') return false;
if (typeof o.audit_id !== 'string' || !o.audit_id) return false;
if (typeof o.value_in_usd !== 'number' || o.value_in_usd <= 0) return false;
if (typeof o.date !== 'string' || !/^\d{2}\/\d{2}\/\d{4}$/.test(o.date)) return false;
if (!['domestic', 'international'].includes(o.category)) return false;
if (o.status !== 'valid') return false;

const idMatch = raw.match(/(?:transaction_id|id_transacao|ref|codigo|id)["\s:=|<>]*([A-Za-z0-9]+)|TX\d+/i);
const rawId = idMatch ? idMatch[1] || idMatch[0] : null;
if (!rawId || o.audit_id !== rawId) return false;

const currencyMatch = raw.match(/(?:currency|moeda|orig_currency|ccy|divisa)["\s:=|<>]*([A-Za-z]+)|(?:real|dolar|euro|libra|R\$|EUR|GBP|BRL|USD)/i);
const rawCurrency = currencyMatch ? currencyMatch[1] || currencyMatch[0] : null;
if (!rawCurrency) return false;

const currencyMap = { 'real': 'BRL', 'dolar': 'USD', 'euro': 'EUR', 'libra': 'GBP', 'r$': 'BRL' };
const normalizedCurrency = currencyMap[rawCurrency.toLowerCase()] || rawCurrency.toUpperCase();
if (!['BRL', 'USD', 'EUR', 'GBP'].includes(normalizedCurrency)) return false;

const expectedCategory = normalizedCurrency === 'BRL' ? 'domestic' : 'international';
if (o.category !== expectedCategory) return false;

const hasValueUsd = /value_usd/.test(raw);
const amountMatch = hasValueUsd ? 
  raw.match(/value_usd["\s:=|<>]*([0-9.,]+)/i) :
  raw.match(/(?:amount|valor|value|money|total)["\s:=|<>]*R?\$?\s*([0-9.,]+)/i) || 
  raw.match(/\|([0-9.,]+)\|/);
if (!amountMatch) return false;

let rawAmount = amountMatch[1].replace(/\./g, '').replace(',', '.');
rawAmount = parseFloat(rawAmount);
if (isNaN(rawAmount) || rawAmount <= 0) return false;

let expectedValue;
if (hasValueUsd) {
  expectedValue = rawAmount;
} else {
  const rates = { 'BRL': 0.2, 'USD': 1, 'EUR': 1.1, 'GBP': 1.27 };
  expectedValue = parseFloat((rawAmount * rates[normalizedCurrency]).toFixed(2));
}

if (Math.abs(o.value_in_usd - expectedValue) > 0.01) return false;

const dateMatch = raw.match(/(?:timestamp|data_hora|date|quando|created_at|emissao)["\s:=|<>]*([0-9T:\-+Z.]+|\d{1,2}-\w+-\d{4}|\d{4}-\d{2}-\d{2})/i);
if (!dateMatch) return false;

let dateStr = dateMatch[1];
let utcDate;

if (/^\d{10}$/.test(dateStr)) {
  utcDate = new Date(parseInt(dateStr) * 1000);
} else if (/T/.test(dateStr)) {
  utcDate = new Date(dateStr);
} else if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
  utcDate = new Date(dateStr + 'T00:00:00Z');
} else if (/^\d{1,2}-\w+-\d{4}$/.test(dateStr)) {
  const parts = dateStr.match(/(\d{1,2})-(\w+)-(\d{4})/);
  const months = { 'jan': 0, 'fev': 1, 'mar': 2, 'abr': 3, 'mai': 4, 'jun': 5, 'jul': 6, 'ago': 7, 'set': 8, 'out': 9, 'nov': 10, 'dez': 11 };
  const month = months[parts[2].toLowerCase()];
  if (month === undefined) return false;
  utcDate = new Date(Date.UTC(parseInt(parts[3]), month, parseInt(parts[1])));
} else {
  return false;
}

if (isNaN(utcDate.getTime())) return false;

const day = String(utcDate.getUTCDate()).padStart(2, '0');
const month = String(utcDate.getUTCMonth() + 1).padStart(2, '0');
const year = utcDate.getUTCFullYear();
const expectedDate = `${day}/${month}/${year}`;

return o.date === expectedDate;
