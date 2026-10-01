// Validate output structure
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

// Extract currency from raw
const currencyMatch = raw.match(/(?:currency|moeda|orig_currency|ccy|divisa|currency=)["\s:=|<>]*([A-Za-z]+)/i) ||
                      raw.match(/(?:real|dolar|euro|libra|BRL|USD|EUR|GBP|R\$)/i);
if (!currencyMatch) return false;
const rawCurrency = currencyMatch[0].toLowerCase();
const currencyMap = { 'real': 'brl', 'dolar': 'usd', 'euro': 'eur', 'libra': 'gbp', 'r$': 'brl' };
const currency = currencyMap[rawCurrency] || rawCurrency.slice(0, 3);
if (!['brl', 'usd', 'eur', 'gbp'].includes(currency)) return false;

// Validate category matches currency
if ((currency === 'brl' && o.category !== 'domestic') || 
    (currency !== 'brl' && o.category !== 'international')) return false;

// Extract and validate date
const dateMatch = raw.match(/(\d{4})-(\d{2})-(\d{2})|(\d{2})-([A-Za-z]{3})-(\d{4})|(\d{1,2})\/(\d{1,2})\/(\d{4})/);
if (!dateMatch) return false;
let day, month, year;
if (dateMatch[1]) { year = dateMatch[1]; month = dateMatch[2]; day = dateMatch[3]; }
else if (dateMatch[4]) { day = dateMatch[4]; month = dateMatch[5]; year = dateMatch[6]; }
else { day = dateMatch[7]; month = dateMatch[8]; year = dateMatch[9]; }
const monthMap = { 'jan': '01', 'fev': '02', 'mar': '03', 'abr': '04', 'mai': '05', 'jun': '06',
                   'jul': '07', 'ago': '08', 'set': '09', 'out': '10', 'nov': '11', 'dez': '12' };
if (monthMap[month.toLowerCase()]) month = monthMap[month.toLowerCase()];
const expectedDate = String(day).padStart(2, '0') + '/' + String(month).padStart(2, '0') + '/' + year;
if (o.date !== expectedDate) return false;

// Extract amount and validate conversion
const amountMatch = raw.match(/(?:amount|valor|value|money|total)["\s:=|<>]*R?\$?\s*([0-9.,]+)/i) ||
                    raw.match(/\|([0-9.,]+)\|/) ||
                    raw.match(/,([0-9.,]+),/);
if (!amountMatch) return false;
let amount = amountMatch[1].replace(/\./g, '').replace(',', '.');
amount = parseFloat(amount);
if (isNaN(amount) || amount <= 0) return false;

// Check if value_usd is already in input
const hasValueUsd = /value_usd|valor_usd/.test(raw);
const rates = { 'brl': 0.2, 'usd': 1, 'eur': 1.1, 'gbp': 1.27 };
const expectedValue = hasValueUsd ? amount : amount * rates[currency];
if (Math.abs(o.value_in_usd - expectedValue) > 0.01) return false;

return true;
