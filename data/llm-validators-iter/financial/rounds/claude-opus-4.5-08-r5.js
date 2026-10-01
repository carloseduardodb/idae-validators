if (!o || typeof o !== 'object') return false;

if (typeof o.audit_id !== 'string' || o.audit_id === '') return false;
if (typeof o.value_in_usd !== 'number' || !isFinite(o.value_in_usd) || o.value_in_usd <= 0) return false;
if (typeof o.date !== 'string' || !/^\d{2}\/\d{2}\/\d{4}$/.test(o.date)) return false;
if (o.category !== 'domestic' && o.category !== 'international') return false;
if (o.status !== 'valid') return false;

const [dd, mm, yyyy] = o.date.split('/').map(Number);
const d = new Date(Date.UTC(yyyy, mm - 1, dd));
if (d.getUTCFullYear() !== yyyy || d.getUTCMonth() !== mm - 1 || d.getUTCDate() !== dd) return false;

if (!raw.includes(o.audit_id)) return false;

const hasBRL = /\bbrl\b/i.test(raw) || /\breal\b/i.test(raw) || /r\$/i.test(raw);
const hasUSD = /\busd\b/i.test(raw) || /\bdolar\b/i.test(raw);
const hasEUR = /\beur\b/i.test(raw) || /\beuro?\b/i.test(raw);
const hasGBP = /\bgbp\b/i.test(raw) || /\blibra\b/i.test(raw);
const hasValueUsd = /value_usd/i.test(raw);

if (hasBRL && !hasUSD && !hasEUR && !hasGBP && !hasValueUsd) {
    if (o.category !== 'domestic') return false;
} else if ((hasUSD || hasEUR || hasGBP) && !hasBRL) {
    if (o.category !== 'international') return false;
} else if (hasValueUsd && hasBRL) {
    if (o.category !== 'domestic') return false;
}

let rate = null;
if (hasValueUsd) rate = 1;
else if (hasBRL) rate = 0.2;
else if (hasEUR) rate = 1.1;
else if (hasGBP) rate = 1.27;
else if (hasUSD) rate = 1;

const brFormat = raw.match(/\d{1,3}(?:\.\d{3})*,\d{2}/g) || [];
const stdFormat = raw.match(/\d+(?:\.\d+)?/g) || [];

let foundValidValue = false;

for (const numStr of brFormat) {
    const val = parseFloat(numStr.replace(/\./g, '').replace(',', '.'));
    if (val > 0 && rate !== null) {
        let expected = val * rate;
        if (Math.abs(o.value_in_usd - expected) < 0.015) foundValidValue = true;
    }
}

if (!foundValidValue) {
    for (const numStr of stdFormat) {
        const val = parseFloat(numStr);
        if (val > 0 && val < 1e10 && rate !== null) {
            let expected = val * rate;
            if (Math.abs(o.value_in_usd - expected) < 0.015) foundValidValue = true;
        }
    }
}

if (!foundValidValue) return false;

const yearStr = String(yyyy);
if (!raw.includes(yearStr)) return false;

const isoMatch = raw.match(/(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2})([+-]\d{2}:\d{2}|Z)?)?/);
const dmyMatch = raw.match(/(\d{1,2})-([a-zA-Z]{3})-(\d{4})/i);
const unixMatches = raw.match(/\b\d{10}\b/g) || [];

let dateValid = false;

if (isoMatch) {
    let [, y, m, day, hr, min, sec, tz] = isoMatch;
    let utcDate = new Date(Date.UTC(+y, +m - 1, +day, +(hr||0), +(min||0), +(sec||0)));
    if (tz && tz !== 'Z') {
        const sign = tz[0] === '+' ? -1 : 1;
        const [tzH, tzM] = tz.slice(1).split(':').map(Number);
        utcDate = new Date(utcDate.getTime() + sign * (tzH * 60 + tzM) * 60000);
    }
    if (utcDate.getUTCFullYear() === yyyy && utcDate.getUTCMonth() + 1 === mm && utcDate.getUTCDate() === dd) dateValid = true;
}

if (!dateValid && dmyMatch) {
    const months = {jan:1,fev:2,feb:2,mar:3,abr:4,apr:4,mai:5,may:5,jun:6,jul:7,ago:8,aug:8,set:9,sep:9,out:10,oct:10,nov:11,dez:12,dec:12};
    const [, day, mon, y] = dmyMatch;
    const mNum = months[mon.toLowerCase()];
    if (+y === yyyy && mNum === mm && +day === dd) dateValid = true;
}

if (!dateValid && unixMatches.length > 0) {
    for (const unixStr of unixMatches) {
        const ts = parseInt(unixStr, 10);
        const utcDate = new Date(ts * 1000);
        if (utcDate.getUTCFullYear() === yyyy && utcDate.getUTCMonth() + 1 === mm && utcDate.getUTCDate() === dd) {
            dateValid = true;
            break;
        }
    }
}

if (!dateValid && !isoMatch && !dmyMatch && unixMatches.length === 0) {
    dateValid = true;
}

if (!dateValid) return false;

return true;
