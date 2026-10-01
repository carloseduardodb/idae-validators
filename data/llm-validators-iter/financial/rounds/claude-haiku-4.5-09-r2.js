// Validate output structure
if (!o || typeof o !== 'object') return false;
if (typeof o.audit_id !== 'string' || !o.audit_id) return false;
if (typeof o.value_in_usd !== 'number' || o.value_in_usd <= 0) return false;
if (typeof o.date !== 'string' || !/^\d{2}\/\d{2}\/\d{4}$/.test(o.date)) return false;
if (!['domestic', 'international'].includes(o.category)) return false;
if (o.status !== 'valid') return false;

// Extract audit_id from raw input
const idMatch = raw.match(/(?:transaction_id|id_transacao|ref|codigo|id)["\s:=|<>]*([A-Za-z0-9]+)/i);
const rawId = idMatch ? idMatch[1] : null;
if (!rawId || o.audit_id !== rawId) return false;

// Extract currency from raw input
const currencyMatch = raw.match(/(?:currency|moeda|orig_currency|ccy|divisa)["\s:=|<>]*([A-Za-z]+|R\$)/i);
let rawCurrency = null;
if (currencyMatch) {
  const curr = currencyMatch[1].toUpperCase();
  if (curr === 'R$') rawCurrency = 'BRL';
  else if (['BRL', 'USD', 'EUR', 'GBP', 'REAL', 'DOLAR', 'EURO', 'LIBRA'].includes(curr)) {
    const map = { 'REAL': 'BRL', 'DOLAR': 'USD', 'EURO': 'EUR', 'LIBRA': 'GBP' };
    rawCurrency = map[curr] || curr;
  }
}
if (!rawCurrency || !['BRL', 'USD', 'EUR', 'GBP'].includes(rawCurrency)) return false;

// Validate category matches currency
if ((rawCurrency === 'BRL' && o.category !== 'domestic') || 
    (rawCurrency !== 'BRL' && o.category !== 'international')) return false;

// Extract amount and validate conversion
const amountMatch = raw.match(/(?:amount|valor|value|money|total)["\s:=|<>]*([0-9.,]+)/i);
if (!amountMatch) return false;
let rawAmount = amountMatch[1].replace(/\./g, '').replace(',', '.');
rawAmount = parseFloat(rawAmount);
if (isNaN(rawAmount) || rawAmount <= 0) return false;

// Check if value_usd is already in input
const valueUsdMatch = raw.match(/value_usd["\s:=|<>]*([0-9.,]+)/i);
const expectedValue = valueUsdMatch ? 
  parseFloat(valueUsdMatch[1].replace(/\./g, '').replace(',', '.')) :
  rawAmount * { 'BRL': 0.2, 'USD': 1, 'EUR': 1.1, 'GBP': 1.27 }[rawCurrency];

if (Math.abs(o.value_in_usd - expectedValue) > 0.01) return false;

// Extract and validate date
const dateMatch = raw.match(/(?:timestamp|data_hora|date|quando|created_at|emissao)["\s:=|<>]*([0-9T:\-+Z.]+|\d{1,2}-\w+-\d{4})/i);
if (!dateMatch) return false;

let utcDate;
const dateStr = dateMatch[1];

if (/^\d+$/.test(dateStr)) {
  utcDate = new Date(parseInt(dateStr) * 1000);
} else if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
  utcDate = new Date(dateStr + 'T00:00:00Z');
} else if (/T/.test(dateStr)) {
  utcDate = new Date(dateStr);
} else if (/\d{1,2}-\w+-\d{4}/.test(dateStr)) {
  const parts = dateStr.match(/(\d{1,2})-(\w+)-(\d{4})/);
  if (!parts) return false;
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
