// Parse output structure
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

// Extract currency from raw
const currencyMatch = raw.match(/(?:currency|moeda|orig_currency|ccy|divisa)["\s:=|<>]*([A-Za-z]+)/i);
const currencyText = currencyMatch ? currencyMatch[1].toUpperCase() : null;
const currencyMap = { 'REAL': 'BRL', 'DOLAR': 'USD', 'EURO': 'EUR', 'LIBRA': 'GBP' };
const currency = currencyMap[currencyText] || currencyText;

if (!['BRL', 'USD', 'EUR', 'GBP'].includes(currency)) return false;
if (currency === 'BRL' && o.category !== 'domestic') return false;
if (currency !== 'BRL' && o.category !== 'international') return false;

// Extract amount and date
const valueUsdMatch = raw.match(/value_usd["\s:=|<>]*([0-9.,]+)/i);
const amountMatch = raw.match(/(?:amount|valor|value|money|total)["\s:=|<>]*R?\$?\s*([0-9.,]+)/i);
const dateMatch = raw.match(/(?:timestamp|data_hora|date|quando|created_at|emissao)["\s:=|<>]*([0-9T:\-+Z.]+|\d{1,2}-\w+-\d{4})/i);

let rawAmount = null;
if (valueUsdMatch) {
  rawAmount = parseFloat(valueUsdMatch[1].replace(/\./g, '').replace(',', '.'));
} else if (amountMatch) {
  rawAmount = parseFloat(amountMatch[1].replace(/\./g, '').replace(',', '.'));
}

if (rawAmount === null || rawAmount <= 0 || isNaN(rawAmount)) return false;

// Convert to USD
const rates = { 'BRL': 0.2, 'USD': 1, 'EUR': 1.1, 'GBP': 1.27 };
const expectedValue = valueUsdMatch ? rawAmount : rawAmount * rates[currency];
if (Math.abs(o.value_in_usd - expectedValue) > 0.01) return false;

// Parse and validate date
if (!dateMatch) return false;
let dateStr = dateMatch[1];
let utcDate;

if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
  utcDate = new Date(dateStr + 'T00:00:00Z');
} else if (/^\d{1,2}-\w+-\d{4}$/.test(dateStr)) {
  const months = { 'jan': 0, 'fev': 1, 'mar': 2, 'abr': 3, 'mai': 4, 'jun': 5, 'jul': 6, 'ago': 7, 'set': 8, 'out': 9, 'nov': 10, 'dez': 11 };
  const parts = dateStr.match(/(\d{1,2})-(\w+)-(\d{4})/);
  const m = months[parts[2].toLowerCase()];
  utcDate = new Date(Date.UTC(parseInt(parts[3]), m, parseInt(parts[1])));
} else if (/T/.test(dateStr)) {
  utcDate = new Date(dateStr);
} else {
  return false;
}

if (isNaN(utcDate.getTime())) return false;

const day = String(utcDate.getUTCDate()).padStart(2, '0');
const month = String(utcDate.getUTCMonth() + 1).padStart(2, '0');
const year = utcDate.getUTCFullYear();
const expectedDate = `${day}/${month}/${year}`;

return o.date === expectedDate;
