// Validate output record structure
if (!o || typeof o !== 'object') return false;
if (typeof o.audit_id !== 'string' || !o.audit_id) return false;
if (typeof o.value_in_usd !== 'number' || o.value_in_usd <= 0) return false;
if (typeof o.date !== 'string' || !/^\d{2}\/\d{2}\/\d{4}$/.test(o.date)) return false;
if (!['domestic', 'international'].includes(o.category)) return false;
if (o.status !== 'valid') return false;

// Extract audit_id from raw input
const idMatch = raw.match(/(?:transaction_id|id_transacao|ref|TX\d+|id=TX\d+|<id>|"ref"|"codigo")["\s:=|<>]*([A-Za-z0-9]+)/i);
const rawId = idMatch ? idMatch[1] : null;
if (!rawId || o.audit_id !== rawId) return false;

// Extract currency from raw input
const currencyMatch = raw.match(/(?:currency|moeda|orig_currency|ccy|divisa|currency=)["\s:=|<>]*([A-Za-z]+)/i);
const currencyName = raw.match(/(?:real|dolar|euro|libra)/i);
let rawCurrency = null;
if (currencyMatch) {
  rawCurrency = currencyMatch[1].toUpperCase();
} else if (currencyName) {
  const nameMap = { 'real': 'BRL', 'dolar': 'USD', 'euro': 'EUR', 'libra': 'GBP' };
  rawCurrency = nameMap[currencyName[0].toLowerCase()];
}
if (!['BRL', 'USD', 'EUR', 'GBP'].includes(rawCurrency)) return false;

// Validate category matches currency
if ((rawCurrency === 'BRL' && o.category !== 'domestic') || 
    (rawCurrency !== 'BRL' && o.category !== 'international')) return false;

// Extract and validate date
const dateMatch = raw.match(/(?:timestamp|data_hora|date|quando|created_at|emissao)["\s:=|<>]*([0-9T:\-+Z.]+)/i);
let utcDate = null;
if (dateMatch) {
  const dateStr = dateMatch[1];
  let date;
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    date = new Date(dateStr + 'T00:00:00Z');
  } else if (/^\d{10,13}$/.test(dateStr)) {
    date = new Date(parseInt(dateStr) * (dateStr.length === 10 ? 1000 : 1));
  } else if (/T/.test(dateStr)) {
    date = new Date(dateStr);
  } else if (/\d{1,2}-\w+-\d{4}/.test(dateStr)) {
    date = new Date(dateStr);
  }
  if (date && !isNaN(date)) {
    utcDate = date.toISOString().split('T')[0];
  }
}
if (!utcDate || o.date !== utcDate.split('-').reverse().join('/')) return false;

// Extract amount and validate conversion
const amountMatch = raw.match(/(?:amount|valor|value_usd|value|money|total)["\s:=|<>]*([0-9.,]+)/i);
if (!amountMatch) return false;
let rawAmount = amountMatch[1].replace(/\./g, '').replace(',', '.');
rawAmount = parseFloat(rawAmount);
if (isNaN(rawAmount) || rawAmount <= 0) return false;

// Check if value_usd already in input
const hasValueUsd = /value_usd|value_usd/.test(raw);
const expectedValue = hasValueUsd ? rawAmount : rawAmount * (rawCurrency === 'BRL' ? 0.2 : rawCurrency === 'USD' ? 1 : rawCurrency === 'EUR' ? 1.1 : 1.27);
if (Math.abs(o.value_in_usd - expectedValue) > 0.01) return false;

return true;
