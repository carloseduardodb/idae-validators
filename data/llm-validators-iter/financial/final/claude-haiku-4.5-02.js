if (!o || typeof o !== 'object') return false;
if (typeof o.audit_id !== 'string' || !o.audit_id) return false;
if (typeof o.value_in_usd !== 'number' || o.value_in_usd <= 0) return false;
if (typeof o.date !== 'string' || !/^\d{2}\/\d{2}\/\d{4}$/.test(o.date)) return false;
if (!['domestic', 'international'].includes(o.category)) return false;
if (o.status !== 'valid') return false;

const idMatch = raw.match(/(?:transaction_id|id_transacao|ref|id=|<id>|codigo)["\s:=|<>]*([A-Za-z0-9]+)/i);
const rawId = idMatch ? idMatch[1] : null;
if (!rawId || o.audit_id !== rawId) return false;

const currencyMatch = raw.match(/(?:currency|moeda|orig_currency|ccy|divisa)["\s:=|<>]*([A-Za-z$]+)/i);
const rawCurrency = currencyMatch ? currencyMatch[1].toLowerCase() : null;
const currencyMap = { 'real': 'brl', 'dolar': 'usd', 'euro': 'eur', 'libra': 'gbp', 'r$': 'brl' };
const normalizedCurrency = currencyMap[rawCurrency] || rawCurrency;

if (!['brl', 'usd', 'eur', 'gbp'].includes(normalizedCurrency)) return false;

const expectedCategory = normalizedCurrency === 'brl' ? 'domestic' : 'international';
if (o.category !== expectedCategory) return false;

const amountMatch = raw.match(/(?:amount|valor|value|money|total)["\s:=|<>]*([0-9.,R$]+)/i);
let rawAmount = amountMatch ? amountMatch[1].replace(/R\$/g, '').trim() : null;
if (rawAmount) {
  const parts = rawAmount.split(/[.,]/);
  if (parts.length === 3) {
    rawAmount = parts[0] + parts[1] + '.' + parts[2];
  } else if (parts.length === 2) {
    rawAmount = parts[0] + '.' + parts[1];
  }
}
const parsedAmount = rawAmount ? parseFloat(rawAmount) : null;

if (parsedAmount === null || parsedAmount <= 0 || isNaN(parsedAmount)) return false;

const hasValueUsd = /value_usd|valor_usd/.test(raw);
const rates = { 'brl': 0.2, 'usd': 1, 'eur': 1.1, 'gbp': 1.27 };
const expectedValue = hasValueUsd ? parsedAmount : parsedAmount * rates[normalizedCurrency];
if (Math.abs(o.value_in_usd - expectedValue) > 0.01) return false;

const dateMatch = raw.match(/(?:timestamp|data_hora|date|quando|created_at|emissao)["\s:=|<>]*([0-9T:\-+Z.]+|\d{1,2}-\w+-\d{4})/i);
const rawDate = dateMatch ? dateMatch[1] : null;

if (!rawDate) return false;

let utcDate;
if (/^\d+$/.test(rawDate)) {
  utcDate = new Date(parseInt(rawDate) * 1000);
} else if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
  utcDate = new Date(rawDate + 'T00:00:00Z');
} else if (/T/.test(rawDate)) {
  utcDate = new Date(rawDate);
} else if (/\d{1,2}-\w+-\d{4}/.test(rawDate)) {
  const parts = rawDate.match(/(\d{1,2})-(\w+)-(\d{4})/);
  if (!parts) return false;
  const monthMap = { 'jan': 0, 'fev': 1, 'mar': 2, 'abr': 3, 'mai': 4, 'jun': 5, 'jul': 6, 'ago': 7, 'set': 8, 'out': 9, 'nov': 10, 'dez': 11 };
  const month = monthMap[parts[2].toLowerCase()];
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

if (o.date !== expectedDate) return false;

return true;
