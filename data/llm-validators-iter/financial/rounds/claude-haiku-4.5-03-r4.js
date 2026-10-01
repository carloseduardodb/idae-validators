if (!o || typeof o !== 'object') return false;
if (typeof o.audit_id !== 'string' || !o.audit_id) return false;
if (typeof o.value_in_usd !== 'number' || o.value_in_usd <= 0) return false;
if (typeof o.date !== 'string' || !/^\d{2}\/\d{2}\/\d{4}$/.test(o.date)) return false;
if (!['domestic', 'international'].includes(o.category)) return false;
if (o.status !== 'valid') return false;

const idMatch = raw.match(/(?:transaction_id|id_transacao|ref|id=|<id>|codigo)["\s:=|<>]*([A-Za-z0-9]+)/i);
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

let utcDate = null;
const isoMatch = raw.match(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:[+-]\d{2}:\d{2}|Z))/);
if (isoMatch) {
  const date = new Date(isoMatch[1]);
  if (!isNaN(date)) {
    utcDate = date.toISOString().split('T')[0].split('-').reverse().join('/');
  }
}
if (!utcDate) {
  const dateOnlyMatch = raw.match(/(?:date)["\s:=|<>]*(\d{4}-\d{2}-\d{2})(?![T\d])/);
  if (dateOnlyMatch) {
    utcDate = dateOnlyMatch[1].split('-').reverse().join('/');
  }
}
if (!utcDate) {
  const spacedMatch = raw.match(/(?:quando)["\s:=|<>]*(\d{4}-\d{2}-\d{2})\s(\d{2}:\d{2}:\d{2})\s([+-]\d{2}:\d{2})/);
  if (spacedMatch) {
    const date = new Date(spacedMatch[1] + 'T' + spacedMatch[2] + spacedMatch[3]);
    if (!isNaN(date)) {
      utcDate = date.toISOString().split('T')[0].split('-').reverse().join('/');
    }
  }
}
if (!utcDate) {
  const unixMatch = raw.match(/(?:created_at)["\s:=|<>]*(\d{10})/);
  if (unixMatch) {
    const date = new Date(parseInt(unixMatch[1]) * 1000);
    if (!isNaN(date)) {
      utcDate = date.toISOString().split('T')[0].split('-').reverse().join('/');
    }
  }
}
if (!utcDate) {
  const dmy = raw.match(/(\d{1,2})-([a-z]{3})-(\d{4})/i);
  if (dmy) {
    const date = new Date(dmy[0]);
    if (!isNaN(date)) {
      utcDate = date.toISOString().split('T')[0].split('-').reverse().join('/');
    }
  }
}
if (!utcDate || o.date !== utcDate) return false;

const valueUsdMatch = raw.match(/value_usd["\s:=|<>]*([0-9.,]+)/i);
if (valueUsdMatch) {
  const rawAmount = parseFloat(valueUsdMatch[1].replace(/\./g, '').replace(',', '.'));
  if (Math.abs(rawAmount - o.value_in_usd) > 0.01) return false;
  return true;
}

const amountMatch = raw.match(/(?:amount|valor|value|money|total)["\s:=|<>]*R?\$?\s*([0-9.,]+)/i);
if (!amountMatch) return false;

const amountStr = amountMatch[1];
const rawAmount = parseFloat(amountStr.replace(/\./g, '').replace(',', '.'));
if (rawAmount <= 0 || isNaN(rawAmount)) return false;

const rates = { 'BRL': 0.2, 'USD': 1, 'EUR': 1.1, 'GBP': 1.27 };
const expected = rawAmount * rates[rawCurrency];
if (Math.abs(o.value_in_usd - expected) > 0.01) return false;

return true;
