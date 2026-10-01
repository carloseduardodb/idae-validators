if (!o || typeof o !== 'object') return false;
if (typeof o.audit_id !== 'string' || !o.audit_id) return false;
if (typeof o.value_in_usd !== 'number' || o.value_in_usd <= 0) return false;
if (typeof o.date !== 'string' || !/^\d{2}\/\d{2}\/\d{4}$/.test(o.date)) return false;
if (!['domestic', 'international'].includes(o.category)) return false;
if (o.status !== 'valid') return false;

const idMatch = raw.match(/(?:transaction_id|id_transacao|ref|codigo)["\s:=|<>]*([A-Za-z0-9]+)|TX\d+/i);
const rawId = idMatch ? idMatch[1] || idMatch[0] : null;
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

const dateMatch = raw.match(/(?:timestamp|data_hora|quando|emissao|created_at|date)["\s:=|<>]*([0-9T:\-+Z.]+)/i);
let utcDate = null;
if (dateMatch) {
  const dateStr = dateMatch[1];
  let date;
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    date = new Date(dateStr + 'T00:00:00Z');
  } else if (/^\d{10}$/.test(dateStr)) {
    date = new Date(parseInt(dateStr) * 1000);
  } else if (/^\d{13}$/.test(dateStr)) {
    date = new Date(parseInt(dateStr));
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

const amountMatch = raw.match(/(?:amount|valor|value_usd|value|money|total)["\s:=|<>]*([0-9.,]+)/i);
if (!amountMatch) return false;
let rawAmount = amountMatch[1].replace(/\./g, '').replace(',', '.');
rawAmount = parseFloat(rawAmount);
if (isNaN(rawAmount) || rawAmount <= 0) return false;

const hasValueUsd = /value_usd/.test(raw);
const rates = { 'BRL': 0.2, 'USD': 1, 'EUR': 1.1, 'GBP': 1.27 };
const expectedValue = hasValueUsd ? rawAmount : rawAmount * rates[rawCurrency];
if (Math.abs(o.value_in_usd - expectedValue) > 0.01) return false;

return true;
