if (!o || typeof o !== 'object') return false;
if (typeof o.audit_id !== 'string' || !o.audit_id) return false;
if (typeof o.value_in_usd !== 'number' || o.value_in_usd <= 0) return false;
if (typeof o.date !== 'string' || !/^\d{2}\/\d{2}\/\d{4}$/.test(o.date)) return false;
if (!['domestic', 'international'].includes(o.category)) return false;
if (o.status !== 'valid') return false;

const idMatch = raw.match(/(?:transaction_id|id_transacao|ref|codigo)["\s:=|<>]*([A-Za-z0-9]+)|([A-Z]{2}\d+)(?=\|)/);
const rawId = idMatch ? (idMatch[1] || idMatch[2]) : null;
if (!rawId || o.audit_id !== rawId) return false;

const currencyMatch = raw.match(/(?:currency|moeda|orig_currency|ccy|divisa)["\s:=|<>]*([A-Za-z]+)|(?:real|dolar|euro|libra|BRL|USD|EUR|GBP|R\$)/i);
if (!currencyMatch) return false;
const currencyStr = currencyMatch[0].toLowerCase();
const currencyMap = { 'real': 'brl', 'dolar': 'usd', 'euro': 'eur', 'libra': 'gbp', 'r$': 'brl' };
const currency = currencyMap[currencyStr] || currencyStr.slice(0, 3);
if (!['brl', 'usd', 'eur', 'gbp'].includes(currency)) return false;

if ((currency === 'brl' && o.category !== 'domestic') || 
    (currency !== 'brl' && o.category !== 'international')) return false;

const tsMatch = raw.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:Z|([+-]\d{2}):(\d{2}))?/);
let day, month, year;
if (tsMatch) {
  year = tsMatch[1];
  month = tsMatch[2];
  day = tsMatch[3];
  if (tsMatch[7] !== undefined) {
    const offset = parseInt(tsMatch[7]) * 60 + parseInt(tsMatch[8]);
    const utcHour = parseInt(tsMatch[4]) - Math.floor(offset / 60);
    if (utcHour < 0) {
      const d = new Date(year + '-' + month + '-' + day);
      d.setUTCDate(d.getUTCDate() - 1);
      day = String(d.getUTCDate()).padStart(2, '0');
      month = String(d.getUTCMonth() + 1).padStart(2, '0');
      year = String(d.getUTCFullYear());
    } else if (utcHour >= 24) {
      const d = new Date(year + '-' + month + '-' + day);
      d.setUTCDate(d.getUTCDate() + 1);
      day = String(d.getUTCDate()).padStart(2, '0');
      month = String(d.getUTCMonth() + 1).padStart(2, '0');
      year = String(d.getUTCFullYear());
    }
  }
} else {
  const dateMatch = raw.match(/(\d{4})-(\d{2})-(\d{2})|(\d{2})-([A-Za-z]{3})-(\d{4})|(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!dateMatch) return false;
  if (dateMatch[1]) { year = dateMatch[1]; month = dateMatch[2]; day = dateMatch[3]; }
  else if (dateMatch[4]) { day = dateMatch[4]; month = dateMatch[5]; year = dateMatch[6]; }
  else { day = dateMatch[7]; month = dateMatch[8]; year = dateMatch[9]; }
  const monthMap = { 'jan': '01', 'fev': '02', 'mar': '03', 'abr': '04', 'mai': '05', 'jun': '06',
                     'jul': '07', 'ago': '08', 'set': '09', 'out': '10', 'nov': '11', 'dez': '12' };
  if (monthMap[month.toLowerCase()]) month = monthMap[month.toLowerCase()];
}
const expectedDate = String(day).padStart(2, '0') + '/' + String(month).padStart(2, '0') + '/' + year;
if (o.date !== expectedDate) return false;

const amountMatch = raw.match(/(?:amount|valor|value|money|total)["\s:=|<>]*R?\$?\s*([0-9.,]+)|(?:value_usd)["\s:=|<>]*([0-9.,]+)|\|([0-9.,]+)\||,([0-9.,]+),/i);
if (!amountMatch) return false;
let amount = (amountMatch[1] || amountMatch[2] || amountMatch[3] || amountMatch[4]).replace(/\./g, '').replace(',', '.');
amount = parseFloat(amount);
if (isNaN(amount) || amount <= 0) return false;

const hasValueUsd = /value_usd|valor_usd/.test(raw);
const rates = { 'brl': 0.2, 'usd': 1, 'eur': 1.1, 'gbp': 1.27 };
const expectedValue = hasValueUsd ? amount : amount * rates[currency];
if (Math.abs(o.value_in_usd - expectedValue) > 0.01) return false;

return true;
