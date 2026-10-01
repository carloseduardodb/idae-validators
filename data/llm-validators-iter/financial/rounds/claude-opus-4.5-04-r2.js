if (!o || typeof o !== 'object') return false;

// Check required fields exist and have correct types
if (typeof o.audit_id !== 'string' || o.audit_id === '') return false;
if (typeof o.value_in_usd !== 'number' || !isFinite(o.value_in_usd) || o.value_in_usd <= 0) return false;
if (typeof o.date !== 'string' || !/^\d{2}\/\d{2}\/\d{4}$/.test(o.date)) return false;
if (o.category !== 'domestic' && o.category !== 'international') return false;
if (o.status !== 'valid') return false;

// Validate date is real
const [dd, mm, yyyy] = o.date.split('/').map(Number);
const d = new Date(Date.UTC(yyyy, mm - 1, dd));
if (d.getUTCFullYear() !== yyyy || d.getUTCMonth() !== mm - 1 || d.getUTCDate() !== dd) return false;

// Check audit_id appears in raw
if (!raw.includes(o.audit_id)) return false;

// Detect currency from raw
const hasBRL = /\bbrl\b/i.test(raw) || /\breal\b/i.test(raw) || /r\$/i.test(raw) || /\bmoeda\b/i.test(raw);
const hasUSD = /\busd\b/i.test(raw) || /\bdolar\b/i.test(raw) || /value_usd/i.test(raw);
const hasEUR = /\beur\b/i.test(raw) || /\beuro\b/i.test(raw);
const hasGBP = /\bgbp\b/i.test(raw) || /\blibra\b/i.test(raw);

// Validate category matches currency
if (hasBRL && !hasUSD && !hasEUR && !hasGBP && o.category !== 'domestic') return false;
if ((hasUSD || hasEUR || hasGBP) && !hasBRL && o.category !== 'international') return false;

// Extract numbers from raw
const brNumMatch = raw.match(/(\d{1,3}(?:\.\d{3})*,\d{2})/g);
const stdNumMatch = raw.match(/\d+\.?\d*/g);

let possibleValues = [];
if (brNumMatch) {
  brNumMatch.forEach(n => {
    const v = parseFloat(n.replace(/\./g, '').replace(',', '.'));
    if (v > 0) possibleValues.push(v);
  });
}
if (stdNumMatch) {
  stdNumMatch.forEach(n => {
    const v = parseFloat(n);
    if (v > 0 && v < 1e12) possibleValues.push(v);
  });
}

// Check if value_in_usd can be derived from any found value with known rates
const rates = { brl: 0.2, usd: 1, eur: 1.1, gbp: 1.27 };
let valueValid = false;

for (const val of possibleValues) {
  if (/value_usd/i.test(raw) && Math.abs(val - o.value_in_usd) < 0.015) { valueValid = true; break; }
  if (hasBRL && Math.abs(val * 0.2 - o.value_in_usd) < 0.015) { valueValid = true; break; }
  if (hasUSD && Math.abs(val - o.value_in_usd) < 0.015) { valueValid = true; break; }
  if (hasEUR && Math.abs(val * 1.1 - o.value_in_usd) < 0.015) { valueValid = true; break; }
  if (hasGBP && Math.abs(val * 1.27 - o.value_in_usd) < 0.015) { valueValid = true; break; }
}

if (!valueValid) return false;

// Validate date appears in raw in some recognizable form
const datePatterns = [
  `${yyyy}-${String(mm).padStart(2,'0')}-${String(dd).padStart(2,'0')}`,
  `${String(dd).padStart(2,'0')}-`,
  `${String(dd).padStart(2,'0')}/`,
];

// Extract potential date components from raw
const isoMatch = raw.match(/(\d{4})-(\d{2})-(\d{2})/);
const tsMatch = raw.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})([+-]\d{2}:\d{2}|Z)?/);
const unixMatch = raw.match(/"created_at"\s*:\s*(\d{9,10})/);
const dmyMatch = raw.match(/(\d{1,2})[-\/]([a-z]{3}|\d{1,2})[-\/](\d{4})/i);
const dateFieldMatch = raw.match(/"date"\s*:\s*"(\d{4})-(\d{2})-(\d{2})"/);

let dateValid = false;

if (tsMatch) {
  const [, y, m, day, h, min, s, tz] = tsMatch;
  let dt = new Date(`${y}-${m}-${day}T${h}:${min}:${s}${tz || 'Z'}`);
  if (dt.getUTCFullYear() === yyyy && dt.getUTCMonth() === mm - 1 && dt.getUTCDate() === dd) dateValid = true;
} else if (unixMatch) {
  const ts = parseInt(unixMatch[1], 10);
  const dt = new Date(ts * 1000);
  if (dt.getUTCFullYear() === yyyy && dt.getUTCMonth() === mm - 1 && dt.getUTCDate() === dd) dateValid = true;
} else if (dateFieldMatch) {
  const [, y, m, day] = dateFieldMatch;
  if (parseInt(y) === yyyy && parseInt(m) === mm && parseInt(day) === dd) dateValid = true;
} else if (isoMatch) {
  const [, y, m, day] = isoMatch;
  if (parseInt(y) === yyyy && parseInt(m) === mm && parseInt(day) === dd) dateValid = true;
} else if (dmyMatch) {
  const months = {jan:1,fev:2,feb:2,mar:3,abr:4,apr:4,mai:5,may:5,jun:6,jul:7,ago:8,aug:8,set:9,sep:9,out:10,oct:10,nov:11,dez:12,dec:12};
  const [, day, mon, y] = dmyMatch;
  const mNum = months[mon.toLowerCase()] || parseInt(mon);
  if (parseInt(y) === yyyy && mNum === mm && parseInt(day) === dd) dateValid = true;
}

if (!dateValid) return false;

return true;
