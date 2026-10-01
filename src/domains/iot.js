// =============================================================================
// iot.js — Domínio de telemetria IoT com oráculo.
//
// Mesmas fases do experimento original (JSON, fornecedor renomeado,
// Fahrenheit, pipe legado, CSV em Kelvin, adversarial), com regras de
// normalização explícitas e verdade-terreno por registro.
// =============================================================================

const DEV = ['SENS', 'PROBE', 'NODE', 'EDGE', 'GW', 'MOD', 'UNIT', 'HUB', 'TAG', 'CTRL'];
const METRICS = ['temperature', 'humidity', 'pressure'];
const ZONES = ['north', 'south', 'east', 'west'];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

export const SPEC = `Target record (the FINAL, immutable goal — "telos"):
{
  "device_id":     non-empty string — the device identifier copied verbatim from the input,
  "metric":        "temperature" | "humidity" | "pressure"   (temp/hum/humid/press are abbreviations),
  "value":         number in the canonical unit, rounded to 2 decimals:
                   temperature in Celsius (convert from Fahrenheit: (F-32)*5/9; from Kelvin: K-273.15),
                   humidity in percent, pressure in hPa (1 mbar = 1 hPa; 1 kPa = 10 hPa).
                   Decimal comma "23,5" means 23.5,
  "timestamp_utc": string "YYYY-MM-DDTHH:MM:SSZ" (timestamps without offset are UTC; a date without time means 00:00:00),
  "status":        derived from the canonical value:
                   temperature: "critical" if > 40 or < -5, "warning" if > 30 or < 0, else "normal";
                   humidity:    "critical" if > 90, "warning" if > 75, else "normal";
                   pressure:    "critical" if < 960 or > 1040, "warning" if < 980 or > 1030, else "normal",
  "zone":          "north" | "south" | "east" | "west"  (N/S/E/W are abbreviations;
                   vendor zones map as zone-A=north, zone-B=south, zone-C=east, zone-D=west)
}
Rejection rule: if a record cannot be converted faithfully — missing metric, missing timestamp,
missing zone, a value that is not a number, a physically impossible value
(temperature outside [-60, 70] °C, humidity outside [0, 100] %, pressure outside [850, 1100] hPa),
or a record that is not sensor telemetry at all — it must be REJECTED, never guessed.`;

const TS_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const RANGES = { temperature: [-60, 70], humidity: [0, 100], pressure: [850, 1100] };

export function validator(o) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return false;
  if (typeof o.device_id !== 'string' || !o.device_id.trim()) return false;
  if (!METRICS.includes(o.metric)) return false;
  if (typeof o.value !== 'number' || !Number.isFinite(o.value)) return false;
  const [lo, hi] = RANGES[o.metric];
  if (o.value < lo || o.value > hi) return false;
  if (typeof o.timestamp_utc !== 'string' || !TS_RE.test(o.timestamp_utc) || isNaN(Date.parse(o.timestamp_utc))) return false;
  if (!['normal', 'warning', 'critical'].includes(o.status)) return false;
  if (!ZONES.includes(o.zone)) return false;
  return true;
}

export function statusOf(metric, v) {
  if (metric === 'temperature') return v > 40 || v < -5 ? 'critical' : v > 30 || v < 0 ? 'warning' : 'normal';
  if (metric === 'humidity') return v > 90 ? 'critical' : v > 75 ? 'warning' : 'normal';
  return v < 960 || v > 1040 ? 'critical' : v < 980 || v > 1030 ? 'warning' : 'normal';
}

// Validator "forte": formato + invariante entre campos (status coerente com
// o valor) + ancoragem do identificador na entrada.
export function groundedValidator(o, raw) {
  if (!validator(o)) return false;
  if (o.status !== statusOf(o.metric, o.value)) return false;
  return typeof raw === 'string' && raw.includes(o.device_id);
}

export const tolerances = { value: 0.051 };

// ---------------------------------------------------------------------------
const pad = (n, w = 2) => String(n).padStart(w, '0');
const r2 = (x) => Math.round(x * 100) / 100;
const iso = (dt) => dt.toISOString().replace('.000', '');
function accept(device_id, metric, value, dt, zone) {
  const v = r2(value);
  return { expect: 'accept', output: { device_id, metric, value: v, timestamp_utc: iso(dt), status: statusOf(metric, v), zone } };
}
const REJECT = { expect: 'reject' };
function canon(metric, r) {
  // Distribuição com caudas para exercitar os três níveis de status.
  if (metric === 'temperature') return r.range(-10, 45);
  if (metric === 'humidity') return r.range(20, 98);
  return r.range(950, 1050);
}
const randDt = (r, withTime = true) =>
  new Date(Date.UTC(2024, r.int(0, 11), r.int(1, 28), withTime ? r.int(0, 23) : 0, withTime ? r.int(0, 59) : 0, 0));

// P1 — JSON limpo.
function p1(i, r) {
  const metric = METRICS[i % 3], v = canon(metric, r), dt = randDt(r), zone = ZONES[i % 4];
  const dev = `${DEV[i % 10]}-${pad(i, 4)}`;
  const unit = { temperature: 'celsius', humidity: 'percent', pressure: 'hPa' }[metric];
  return { raw: JSON.stringify({ device_id: dev, metric, value: v, unit, timestamp: iso(dt), zone }), truth: accept(dev, metric, v, dt, zone) };
}

// P2 — Fornecedor com campos renomeados, zonas codificadas, timestamp sem offset.
function p2(i, r) {
  const metric = METRICS[i % 3], v = canon(metric, r), dt = randDt(r), z = i % 4;
  const dev = `${DEV[i % 10]}${pad(i + 1000, 4)}`;
  const short = { temperature: 'temp', humidity: 'hum', pressure: 'press' }[metric];
  const unit = { temperature: 'C', humidity: '%', pressure: 'hpa' }[metric];
  const recorded = iso(dt).replace('T', ' ').replace('Z', '');
  return {
    raw: JSON.stringify({ sensor_id: dev, reading_type: short, reading_value: v, measurement_unit: unit, recorded_at: recorded, location: `zone-${'ABCD'[z]}` }),
    truth: accept(dev, metric, v, dt, ZONES[z]),
  };
}

// P3 — Temperatura em Fahrenheit, só data, zona abreviada.
function p3(i, r) {
  const metric = METRICS[i % 3], c = canon(metric, r), dt = randDt(r, false), z = i % 4;
  const dev = `${DEV[i % 10]}-${pad(i + 2000, 4)}`;
  const raw = metric === 'temperature' ? +(c * 9 / 5 + 32).toFixed(2) : c;
  const unit = { temperature: 'fahrenheit', humidity: 'percent', pressure: 'hPa' }[metric];
  const truthV = metric === 'temperature' ? (raw - 32) * 5 / 9 : raw;
  return {
    raw: JSON.stringify({ id: dev, type: metric, val: raw, unit, ts: iso(dt).slice(0, 10), area: 'NSEW'[z] }),
    truth: accept(dev, metric, truthV, dt, ZONES[z]),
  };
}

// P4 — Pipe legado: F, %, mbar, data "mar-4-2024".
function p4(i, r) {
  const metric = METRICS[i % 3], c = canon(metric, r), z = i % 4;
  const mo = r.int(0, 11), d = r.int(1, 28), dt = new Date(Date.UTC(2024, mo, d));
  const dev = `${DEV[i % 10]}${pad(i + 3000, 4)}`;
  const short = { temperature: 'temp', humidity: 'humid', pressure: 'press' }[metric];
  const unit = { temperature: 'F', humidity: '%', pressure: 'mbar' }[metric];
  const raw = metric === 'temperature' ? +(c * 9 / 5 + 32).toFixed(2) : c;
  const truthV = metric === 'temperature' ? (raw - 32) * 5 / 9 : raw;
  return { raw: `${dev}|${short}|${raw}|${unit}|${MONTHS[mo]}-${d}-2024|${ZONES[z]}`, truth: accept(dev, metric, truthV, dt, ZONES[z]) };
}

// P5 — CSV com temperatura em Kelvin.
function p5(i, r) {
  const metric = METRICS[i % 3], c = canon(metric, r), dt = randDt(r), z = i % 4;
  const dev = `${DEV[i % 10]}${pad(i + 4000, 4)}`;
  const raw = metric === 'temperature' ? +(c + 273.15).toFixed(2) : c;
  const unit = { temperature: 'K', humidity: '%', pressure: 'hPa' }[metric];
  const truthV = metric === 'temperature' ? raw - 273.15 : raw;
  return { raw: `${dev},${metric},${raw},${unit},${iso(dt)},${ZONES[z]}`, truth: accept(dev, metric, truthV, dt, ZONES[z]) };
}

// P6 — Adversarial: 7 rejeitar / 3 aceitar.
const TS = '2024-06-15T10:00:00Z';
const ADV = [
  (i, r) => ({ kind: 'sem-metrica', raw: JSON.stringify({ device_id: `BUG${pad(i, 4)}`, value: r.range(10, 40), timestamp: TS, zone: 'north' }), truth: REJECT }),
  (i) => ({ kind: 'valor-NaN', raw: JSON.stringify({ device_id: `CORR${pad(i, 4)}`, metric: 'temperature', value: 'NaN', unit: 'celsius', timestamp: TS, zone: 'south' }), truth: REJECT }),
  (i, r) => ({ kind: 'outro-dominio', raw: JSON.stringify({ transaction_id: `TX${i}`, amount: r.range(100, 5000), currency: 'USD', timestamp: TS }), truth: REJECT }),
  (i, r) => ({ kind: 'sem-timestamp', raw: JSON.stringify({ device_id: `NOTM${pad(i, 4)}`, metric: 'humidity', value: r.range(20, 95), unit: 'percent', zone: 'east' }), truth: REJECT }),
  (i) => ({ kind: 'fora-de-faixa-9999C', raw: JSON.stringify({ device_id: `MALF${pad(i, 4)}`, metric: 'temperature', value: 9999, unit: 'celsius', timestamp: TS, zone: 'east' }), truth: REJECT }),
  (i) => ({ kind: 'umidade-140', raw: JSON.stringify({ device_id: `HUM${pad(i, 4)}`, metric: 'humidity', value: 140, unit: 'percent', timestamp: TS, zone: 'west' }), truth: REJECT }),
  (i, r) => ({ kind: 'sem-zona', raw: JSON.stringify({ device_id: `NOZ${pad(i, 4)}`, metric: 'pressure', value: r.range(990, 1020), unit: 'hPa', timestamp: TS }), truth: REJECT }),
  (i, r) => {
    const kpa = +(r.range(980, 1020) / 10).toFixed(2);
    return { kind: 'aceita:pressao-kPa', raw: JSON.stringify({ device_id: `KPA${pad(i, 4)}`, metric: 'pressure', value: kpa, unit: 'kPa', timestamp: TS, zone: 'north' }), truth: accept(`KPA${pad(i, 4)}`, 'pressure', kpa * 10, new Date(TS), 'north') };
  },
  (i, r) => {
    const c = r.range(15, 35);
    return { kind: 'aceita:virgula-decimal', raw: JSON.stringify({ device_id: `DEC${pad(i, 4)}`, metric: 'temperature', value: c.toFixed(2).replace('.', ','), unit: 'celsius', timestamp: TS, zone: 'south' }), truth: accept(`DEC${pad(i, 4)}`, 'temperature', c, new Date(TS), 'south') };
  },
  (i) => ({ kind: 'aceita:limite-critico', raw: JSON.stringify({ device_id: `EDGE${pad(i, 4)}`, metric: 'temperature', value: 40.5, unit: 'celsius', timestamp: TS, zone: 'west' }), truth: accept(`EDGE${pad(i, 4)}`, 'temperature', 40.5, new Date(TS), 'west') }),
];
function p6(i, r) { return ADV[i % ADV.length](i, r); }

// ---------------------------------------------------------------------------
// Fases novas (idae-validators): formatos que não existiam no IDAE, cada um
// com assinatura de formato própria (não alteram P1–P6).
// ---------------------------------------------------------------------------
const offsetStr = (m) => `${m < 0 ? '-' : '+'}${pad(Math.floor(Math.abs(m) / 60))}:${pad(Math.abs(m) % 60)}`;
const OFFSETS = [120, -300, 330, -180];
function localWithOffset(r, offMin) {
  const y = 2024, mo = r.int(1, 12), d = r.int(1, 28), h = r.int(0, 23), mi = r.int(0, 59), s = r.int(0, 59);
  const local = `${y}-${pad(mo)}-${pad(d)} ${pad(h)}:${pad(mi)}:${pad(s)} ${offsetStr(offMin)}`;
  return { local, utc: new Date(Date.UTC(y, mo - 1, d, h, mi, s) - offMin * 60000) };
}
// Valor canônico -> valor e unidade de origem (variando por índice).
function inUnit(metric, c, k) {
  if (metric === 'temperature') return [[+(c * 9 / 5 + 32).toFixed(2), '°F', (v) => (v - 32) * 5 / 9], [c, '°C', (v) => v], [+(c + 273.15).toFixed(2), 'K', (v) => v - 273.15]][k % 3];
  if (metric === 'humidity') return [c, '%RH', (v) => v];
  return [[c, 'hPa', (v) => v], [+(c / 10).toFixed(3), 'kPa', (v) => v * 10], [c, 'mbar', (v) => v]][k % 3];
}
const ZABBR = { north: 'N', south: 'S', east: 'E', west: 'W' };
const SHORT = { temperature: 'temp', humidity: 'hum', pressure: 'press' };

// P7 — Chave=valor separado por " | ", unidade colada ao valor, horário local com offset.
function p7(i, r) {
  const metric = METRICS[i % 3], c = canon(metric, r), zone = ZONES[i % 4], dev = `${DEV[i % 10]}-${pad(i + 5000, 4)}`;
  const [v, unit, back] = inUnit(metric, c, Math.floor(i / 3));
  const { local, utc } = localWithOffset(r, OFFSETS[i % 4]);
  const raw = `dev=${dev} | ${SHORT[metric]}=${v}${unit} | at=${local} | zone=${ZABBR[zone]}`;
  return { raw, truth: accept(dev, metric, back(v), utc, zone) };
}

// P8 — JSON aninhado, valor string com vírgula decimal, zona de fornecedor, epoch em segundos.
function p8(i, r) {
  const metric = METRICS[(i + 1) % 3], c = canon(metric, r), z = i % 4, dev = `${DEV[i % 10]}${pad(i + 6000, 4)}`, dt = randDt(r);
  const [v, unit, back] = inUnit(metric, c, i);
  const raw = JSON.stringify({ device: { id: dev, zone: `zone-${'ABCD'[z]}` }, reading: { kind: metric, value: String(v).replace('.', ','), unit: unit.replace('°', '') }, ts: Math.floor(dt / 1000) });
  return { raw, truth: accept(dev, metric, back(v), dt, ZONES[z]) };
}

// P9 — XML com a grandeza como elemento e a unidade como atributo.
function p9(i, r) {
  const metric = METRICS[(i + 2) % 3], c = canon(metric, r), zone = ZONES[(i + 1) % 4], dev = `${DEV[i % 10]}${pad(i + 7000, 4)}`;
  const [v, unit, back] = inUnit(metric, c, i + 1);
  const { local, utc } = localWithOffset(r, OFFSETS[(i + 1) % 4]);
  const ts = local.replace(' ', 'T').replace(' ', '');
  const raw = `<reading device="${dev}" zone="${ZABBR[zone]}"><${metric} unit="${unit}">${v}</${metric}><time>${ts}</time></reading>`;
  return { raw, truth: accept(dev, metric, back(v), utc, zone) };
}

// P10 — JSON com valor e unidade na mesma string e epoch em milissegundos.
function p10(i, r) {
  const metric = METRICS[i % 3], c = canon(metric, r), zone = ZONES[(i + 2) % 4], dev = `${DEV[i % 10]}-${pad(i + 8000, 4)}`, dt = randDt(r);
  const [v, unit, back] = inUnit(metric, c, i + 2);
  const raw = JSON.stringify({ node: dev, measure: SHORT[metric], reading: `${v} ${unit}`, epoch_ms: dt.getTime(), area: ZABBR[zone] });
  return { raw, truth: accept(dev, metric, back(v), dt, zone) };
}

// P11 — Adversarial nos formatos novos: 7 rejeitar / 3 aceitar.
const TS2 = '2024-06-15 10:00:00 +02:00';
const ADV2 = [
  (i, r) => ({ kind: 'kv-sem-zona', raw: `dev=KVZ-${pad(i, 4)} | temp=${r.range(10, 30)}°C | at=${TS2} | zone=`, truth: REJECT }),
  (i) => ({ kind: 'kv-valor-err', raw: `dev=KVE-${pad(i, 4)} | hum=ERR%RH | at=${TS2} | zone=S`, truth: REJECT }),
  (i, r) => ({ kind: 'aninhado-voltagem', raw: JSON.stringify({ device: { id: `NVT${pad(i, 4)}`, zone: 'zone-A' }, reading: { kind: 'voltage', value: String(r.range(200, 240)).replace('.', ','), unit: 'V' }, ts: 1718445600 }), truth: REJECT }),
  (i) => ({ kind: 'aninhado-sem-ts', raw: JSON.stringify({ device: { id: `NTS${pad(i, 4)}`, zone: 'zone-B' }, reading: { kind: 'pressure', value: '1013,2', unit: 'hPa' }, ts: null }), truth: REJECT }),
  (i) => ({ kind: 'xml-umidade-120', raw: `<reading device="XUM${pad(i, 4)}" zone="E"><humidity unit="%RH">120</humidity><time>2024-06-15T10:00:00Z</time></reading>`, truth: REJECT }),
  (i) => ({ kind: 'xml-sem-tempo', raw: `<reading device="XNT${pad(i, 4)}" zone="W"><temperature unit="°C">21.5</temperature><time></time></reading>`, truth: REJECT }),
  (i) => ({ kind: 'json-temp-impossivel', raw: JSON.stringify({ node: `JTI-${pad(i, 4)}`, measure: 'temp', reading: '-80 °C', epoch_ms: 1718445600000, area: 'N' }), truth: REJECT }),
  (i, r) => {
    const c = r.range(15, 35);
    return { kind: 'aceita:kv-kelvin', raw: `dev=KVK-${pad(i, 4)} | temp=${(c + 273.15).toFixed(2)}K | at=${TS2} | zone=N`, truth: accept(`KVK-${pad(i, 4)}`, 'temperature', +(c + 273.15).toFixed(2) - 273.15, new Date('2024-06-15T08:00:00Z'), 'north') };
  },
  (i, r) => {
    const p = r.range(990, 1020);
    return { kind: 'aceita:xml-pressao-mbar', raw: `<reading device="XMB${pad(i, 4)}" zone="S"><pressure unit="mbar">${p}</pressure><time>2024-01-01T01:30:00+03:00</time></reading>`, truth: accept(`XMB${pad(i, 4)}`, 'pressure', p, new Date('2023-12-31T22:30:00Z'), 'south') };
  },
  (i, r) => {
    const h = r.range(20, 70);
    return { kind: 'aceita:aninhado-umidade-virgula', raw: JSON.stringify({ device: { id: `NUV${pad(i, 4)}`, zone: 'zone-D' }, reading: { kind: 'humidity', value: String(h).replace('.', ','), unit: '%RH' }, ts: 1718445600 }), truth: accept(`NUV${pad(i, 4)}`, 'humidity', h, new Date(1718445600000), 'west') };
  },
];
function p11(i, r) { return ADV2[i % ADV2.length](i, r); }

export const phases = [
  { id: 'P1', label: 'JSON limpo', gen: p1 },
  { id: 'P2', label: 'Fornecedor renomeado, zonas codificadas', gen: p2 },
  { id: 'P3', label: 'Fahrenheit, só data, zona abreviada', gen: p3 },
  { id: 'P4', label: 'Pipe legado (F, %, mbar)', gen: p4 },
  { id: 'P5', label: 'CSV com Kelvin', gen: p5 },
  { id: 'P6', label: 'Adversarial (7 rejeitar / 3 aceitar)', gen: p6, adversarial: true },
  { id: 'P7', label: 'Chave=valor, unidade colada, offset', gen: p7 },
  { id: 'P8', label: 'JSON aninhado, vírgula decimal, epoch s', gen: p8 },
  { id: 'P9', label: 'XML com unidade em atributo', gen: p9 },
  { id: 'P10', label: 'JSON valor+unidade em string, epoch ms', gen: p10 },
  { id: 'P11', label: 'Adversarial nos formatos novos (7 rejeitar / 3 aceitar)', gen: p11, adversarial: true },
];

export const domain = { name: 'iot', SPEC, validator, groundedValidator, tolerances, phases };
