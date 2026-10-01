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
  } else if (/^\d{4}-\d{2}-\d{2}T/.test(dateStr)) {
    date = new Date(dateStr);
  } else if (/^\d{1,2}-\w{3}-\d{4}$/.test(dateStr)) {
    date = new Date(dateStr);
  } else if (/^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}/.test(dateStr)) {
    date = new Date(dateStr.replace(' ', 'T'));
  } else if (/^\d{10}$/.test(dateStr)) {
    date = new Date(parseInt(dateStr) * 1000);
  }
  if (date && !isNaN(date)) {
    utcDate = date.toISOString().split('T')[0].split('-').reverse().join('/');
  }
}
if (!utcDate || o.date !== utcDate) return false;

// Extract amount and validate conversion
const amountMatch = raw.match(/(?:amount|valor|value|money|total)["\s:=|<>]*R?\$?\s*([0-9.,]+)/i);
const valueUsdMatch = raw.match(/value_usd["\s:=|<>]*([0-9.,]+)/i);
let rawAmount = null;
if (valueUsdMatch) {
  rawAmount = parseFloat(valueUsdMatch[1].replace(/\./g, '').replace(',', '.'));
  if (rawAmount !== o.value_in_usd) return false;
} else if (amountMatch) {
  const amountStr = amountMatch[1];
  rawAmount = parseFloat(amountStr.replace(/\./g, '').replace(',', '.'));
  if (rawAmount <= 0 || isNaN(rawAmount)) return false;
  const rates = { 'BRL': 0.2, 'USD': 1, 'EUR': 1.1, 'GBP': 1.27 };
  const expected = rawAmount * rates[rawCurrency];
  if (Math.abs(o.value_in_usd - expected) > 0.01) return false;
}

return true;
