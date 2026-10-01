// =============================================================================
// usgs.js — Dados reais do USGS Earthquake Catalog (560 eventos, mesmos
// arquivos do Exp-C5 original) com oráculo derivado deterministicamente
// dos campos-fonte (GeoJSON / CSV FDSN).
//
// Dois telos são avaliados:
//   ORIGINAL  — telos estrito: exige significance inteiro e depth >= 0.
//               O CSV do USGS não possui "sig"; qualquer valor aceito ali
//               é fabricado. Profundidades negativas são válidas no USGS.
//   CORRIGIDO — significance = null quando ausente na fonte; depth >= -10.
// =============================================================================

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '../../data/usgs');
const MAG_TYPES = new Set(['ml', 'md', 'mb', 'mw', 'mww', 'mwb', 'mwc', 'mwr', 'ms', 'mb_lg', 'mi', 'mh']);
const CSV_HEADER = 'time,latitude,longitude,depth,mag,magType,nst,gap,dmin,rms,net,id,updated,place,type,horizontalError,depthError,magError,magNst,status,locationSource,magSource';

const COMMON = `
  "event_id":       non-empty string — the USGS event id (GeoJSON "id"; CSV column "id"),
  "magnitude":      number — the event magnitude,
  "magnitude_type": lowercase string, one of: ml, md, mb, mw, mww, mwb, mwc, mwr, ms, mb_lg, mi, mh,
  "latitude":       number in [-90, 90],
  "longitude":      number in [-180, 180],
  "timestamp_utc":  origin time as "YYYY-MM-DDTHH:MM:SSZ" (UTC, milliseconds truncated),
  "place":          non-empty string — the place description verbatim,
  "event_type":     string — the event type verbatim (e.g. "earthquake", "quarry blast", "explosion"),
  "status":         "reviewed" or "automatic",`;

const FORMATS = `Inputs arrive either as a single GeoJSON Feature (JSON string; coordinates are [lon, lat, depth_km],
"time" is epoch milliseconds) or as a single CSV line WITHOUT header in the USGS FDSN column order:
${CSV_HEADER}
(place is double-quoted when it contains commas).`;

export const SPEC_CORRECTED = `Target record (the FINAL, immutable goal — "telos"):
{${COMMON}
  "depth_km":       number in [-10, 800] (negative depths — above the reference datum — are valid),
  "significance":   integer in [0, 2500] taken from the source field "sig", or null when the source has no such field
}
${FORMATS}
Rejection rule: if a required value is missing from the source, the record must be REJECTED, never guessed.`;

export const SPEC_ORIGINAL = `Target record (the FINAL, immutable goal — "telos"):
{${COMMON}
  "depth_km":       number between 0 and 800 (depth in kilometers),
  "significance":   integer between 0 and 2500
}
${FORMATS}`;

function baseValid(o) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return false;
  if (typeof o.event_id !== 'string' || !o.event_id.trim()) return false;
  if (typeof o.magnitude !== 'number' || !Number.isFinite(o.magnitude) || o.magnitude < -1 || o.magnitude > 10) return false;
  if (typeof o.magnitude_type !== 'string' || !MAG_TYPES.has(o.magnitude_type)) return false;
  if (typeof o.latitude !== 'number' || o.latitude < -90 || o.latitude > 90) return false;
  if (typeof o.longitude !== 'number' || o.longitude < -180 || o.longitude > 180) return false;
  if (typeof o.timestamp_utc !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(o.timestamp_utc)) return false;
  if (typeof o.place !== 'string' || !o.place.trim()) return false;
  if (typeof o.event_type !== 'string' || !o.event_type.trim()) return false;
  if (o.status !== 'reviewed' && o.status !== 'automatic') return false;
  return true;
}

export function validatorCorrected(o) {
  if (!baseValid(o)) return false;
  if (typeof o.depth_km !== 'number' || o.depth_km < -10 || o.depth_km > 800) return false;
  if (o.significance !== null && (!Number.isInteger(o.significance) || o.significance < 0 || o.significance > 2500)) return false;
  return true;
}

export function validatorOriginal(o) {
  if (!baseValid(o)) return false;
  if (typeof o.depth_km !== 'number' || o.depth_km < 0 || o.depth_km > 800) return false;
  if (!Number.isInteger(o.significance) || o.significance < 0 || o.significance > 2500) return false;
  return true;
}

export const tolerances = { magnitude: 1e-6, latitude: 1e-6, longitude: 1e-6, depth_km: 1e-6 };

// ---------------------------------------------------------------------------
const isoSec = (ms) => new Date(Math.floor(ms / 1000) * 1000).toISOString().replace('.000', '');

function parseCsvLine(line) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

function truthGeo(raw) {
  const f = JSON.parse(raw), p = f.properties, [lon, lat, depth] = f.geometry.coordinates;
  return {
    event_id: f.id, magnitude: p.mag, magnitude_type: p.magType.toLowerCase(), latitude: lat, longitude: lon,
    depth_km: depth, timestamp_utc: isoSec(p.time), place: p.place, event_type: p.type, status: p.status,
    significance: p.sig ?? null,
  };
}

function truthCsv(line) {
  const c = parseCsvLine(line), h = CSV_HEADER.split(',');
  const r = Object.fromEntries(h.map((k, i) => [k, c[i]]));
  return {
    event_id: r.id, magnitude: +r.mag, magnitude_type: r.magType.toLowerCase(), latitude: +r.latitude, longitude: +r.longitude,
    depth_km: +r.depth, timestamp_utc: isoSec(Date.parse(r.time)), place: r.place, event_type: r.type, status: r.status,
    significance: null,
  };
}

// Oráculo para o telos CORRIGIDO: todo evento real é aceitável.
function truthCorrected(raw) {
  const out = raw.trim().startsWith('{') ? truthGeo(raw) : truthCsv(raw);
  return { expect: 'accept', output: out };
}

// Oráculo para o telos ORIGINAL: um registro só é representável fielmente
// se a fonte tem "sig" e depth >= 0; caso contrário a decisão correta é rejeitar.
function truthOriginal(raw) {
  const t = truthCorrected(raw).output;
  if (t.significance === null || t.depth_km < 0) return { expect: 'reject' };
  return { expect: 'accept', output: t };
}

export function loadPhases() {
  const geo = (f) => JSON.parse(readFileSync(join(DIR, f), 'utf8')).features.map(x => JSON.stringify(x));
  const csv = (f) => readFileSync(join(DIR, f), 'utf8').trim().split('\n').slice(1);
  const mixed = JSON.parse(readFileSync(join(DIR, 'data-phase5-mixed.json'), 'utf8')).map(e => e.data);
  return [
    { id: 'P1', label: 'GeoJSON (M4+, bem estruturado)', raws: geo('data-phase1-geojson-clean.json') },
    { id: 'P2', label: 'CSV (M1–3, redes mistas)', raws: csv('data-phase2-csv-mixed.csv') },
    { id: 'P3', label: 'GeoJSON (micro-eventos)', raws: geo('data-phase3-geojson-sparse.json') },
    { id: 'P4', label: 'CSV (M2–5, linhas brutas)', raws: csv('data-phase4-csv-raw.csv') },
    { id: 'P5', label: 'Misto GeoJSON + CSV intercalado', raws: mixed },
  ];
}

export const corrected = {
  name: 'usgs-corrigido', SPEC: SPEC_CORRECTED, validator: validatorCorrected,
  groundedValidator: (o, raw) => validatorCorrected(o) && raw.includes(o.event_id), tolerances, truth: truthCorrected,
};
export const original = {
  name: 'usgs-original', SPEC: SPEC_ORIGINAL, validator: validatorOriginal,
  groundedValidator: (o, raw) => validatorOriginal(o) && raw.includes(o.event_id), tolerances, truth: truthOriginal,
};
