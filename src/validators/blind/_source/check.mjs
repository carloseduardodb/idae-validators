// Self-check: validators must accept the hand-derived correct record of every
// SPEC.md example (V2), and a correct reference program must pass V3.
// The reference programs below are format-specific TEST SCAFFOLDING only.
import * as fin from './validators/financial.js';
import * as iot from './validators/iot.js';
import * as usc from './validators/usgs-corrected.js';
import * as uss from './validators/usgs-strict.js';

let fails = 0, passes = 0;
function assert(cond, msg) { if (cond) passes++; else { fails++; console.log('FAIL:', msg); } }
const r2 = x => Math.round(x * 100) / 100;
const pad = n => String(n).padStart(2, '0');

// ------------------------------------------------------------------ financial
const FIN = [
  ['{"transaction_id":"TX0000","amount":714.46,"currency":"BRL","timestamp":"2024-04-04T07:39:00Z"}', { audit_id: 'TX0000', value_in_usd: 142.89, date: '04/04/2024', category: 'domestic', status: 'valid' }],
  ['{"id_transacao":"TX1000","valor":939.83,"moeda":"BRL","data_hora":"2024-12-18T23:54:00-03:00"}', { audit_id: 'TX1000', value_in_usd: 187.97, date: '19/12/2024', category: 'domestic', status: 'valid' }],
  ['{"ref":"TX2000","value_usd":265.99,"orig_currency":"BRL","date":"2024-02-28","category":"domestic"}', { audit_id: 'TX2000', value_in_usd: 265.99, date: '28/02/2024', category: 'domestic', status: 'valid' }],
  ['TX3000|real|6.738,16|18-mai-2024', { audit_id: 'TX3000', value_in_usd: 1347.63, date: '18/05/2024', category: 'domestic', status: 'valid' }],
  ['2024-04-26T03:24:00Z,USD,4434.39,TX4000', { audit_id: 'TX4000', value_in_usd: 4434.39, date: '26/04/2024', category: 'international', status: 'valid' }],
  ['id=TX5000 | valor=R$ 6.633,82 | quando=2024-08-28 08:47:13 -03:00', { audit_id: 'TX5000', value_in_usd: 1326.76, date: '28/08/2024', category: 'domestic', status: 'valid' }],
  ['{"payment":{"ref":"TX6000","money":{"value":"2181.38","ccy":"eur"}},"created_at":1731406380}', { audit_id: 'TX6000', value_in_usd: 2399.52, date: '12/11/2024', category: 'international', status: 'valid' }],
  ['<tx><id>TX7000</id><amount currency="GBP">1839.59</amount><timestamp>2024-10-22T20:53:31+01:00</timestamp></tx>', { audit_id: 'TX7000', value_in_usd: 2336.28, date: '22/10/2024', category: 'international', status: 'valid' }],
  ['{"codigo":"TX8000","total":"1.821,34","divisa":"dolar","emissao":"2024-03-20T09:05:38+05:30"}', { audit_id: 'TX8000', value_in_usd: 1821.34, date: '20/03/2024', category: 'international', status: 'valid' }],
];
const RATE = { BRL: 0.2, USD: 1, EUR: 1.1, GBP: 1.27 };
const CUR = { brl: 'BRL', usd: 'USD', eur: 'EUR', gbp: 'GBP', real: 'BRL', dolar: 'USD', euro: 'EUR', libra: 'GBP', 'r$': 'BRL', 'us$': 'USD', '€': 'EUR', '£': 'GBP' };
const MONTHS = { jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12, feb: 2, apr: 4, may: 5, aug: 8, sep: 9, oct: 10, dec: 12 };
const brNum = s => (typeof s === 'number' ? s : /,/.test(s) ? Number(s.replace(/\./g, '').replace(',', '.')) : Number(s));
function isoMs(s) { // ISO with optional offset, space before offset allowed
  const t = s.trim().replace(' ', 'T').replace(/\s+([+-]\d{2}:?\d{2})$/, '$1');
  const ms = Date.parse(/(Z|[+-]\d{2}:?\d{2})$/.test(t) || !t.includes('T') ? (t.includes('T') ? t : t + 'T00:00:00Z') : t + 'Z');
  return Number.isNaN(ms) ? null : ms;
}
function finRef(raw) {
  let id, amt, cur, ms, usd = false, m;
  try {
    if (raw.startsWith('<tx>')) {
      id = /<id>(.*?)<\/id>/.exec(raw)[1]; m = /currency="(.*?)">(.*?)</.exec(raw); cur = m[1]; amt = brNum(m[2]); ms = isoMs(/<timestamp>(.*?)</.exec(raw)[1]);
    } else if (raw.startsWith('{')) {
      const j = JSON.parse(raw);
      if ('transaction_id' in j) { id = j.transaction_id; amt = j.amount; cur = j.currency; ms = isoMs(j.timestamp); }
      else if ('id_transacao' in j) { id = j.id_transacao; amt = j.valor; cur = j.moeda; ms = isoMs(j.data_hora); }
      else if ('value_usd' in j) { id = j.ref; amt = j.value_usd; usd = true; cur = j.orig_currency; ms = isoMs(j.date); }
      else if ('payment' in j) { id = j.payment.ref; amt = brNum(j.payment.money.value); cur = j.payment.money.ccy; ms = j.created_at * 1000; }
      else if ('codigo' in j) { id = j.codigo; amt = brNum(j.total); cur = j.divisa; ms = isoMs(j.emissao); }
    } else if (raw.startsWith('id=')) {
      const p = raw.split('|').map(s => s.split('=').slice(1).join('=').trim());
      id = p[0]; m = /^(R\$|US\$|€|£)?\s*(.*)$/.exec(p[1]); cur = m[1]; amt = brNum(m[2]); ms = isoMs(p[2]);
    } else if (raw.includes('|')) {
      const p = raw.split('|'); id = p[0]; cur = p[1]; amt = brNum(p[2]);
      const [d, mo, y] = p[3].split('-'); ms = Date.UTC(+y, MONTHS[mo.toLowerCase()] - 1, +d);
    } else { const p = raw.split(','); ms = isoMs(p[0]); cur = p[1]; amt = brNum(p[2]); id = p[3]; }
  } catch { return null; }
  const c = cur && CUR[String(cur).toLowerCase()];
  if (!id || !c || !(amt > 0) || ms == null) return null;
  const d = new Date(ms);
  return { audit_id: id, value_in_usd: r2(usd ? amt : amt * RATE[c]), date: `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`, category: c === 'BRL' ? 'domestic' : 'international', status: 'valid' };
}

// ------------------------------------------------------------------ iot
const IOT = [
  ['{"device_id":"SENS-0000","metric":"temperature","value":-2.24,"unit":"celsius","timestamp":"2024-04-04T07:39:00Z","zone":"north"}', { device_id: 'SENS-0000', metric: 'temperature', value: -2.24, timestamp_utc: '2024-04-04T07:39:00Z', status: 'warning', zone: 'north' }],
  ['{"sensor_id":"SENS1000","reading_type":"temp","reading_value":0.25,"measurement_unit":"C","recorded_at":"2024-12-18 17:54:00","location":"zone-A"}', { device_id: 'SENS1000', metric: 'temperature', value: 0.25, timestamp_utc: '2024-12-18T17:54:00Z', status: 'normal', zone: 'north' }],
  ['{"id":"SENS-2000","type":"temperature","val":19.08,"unit":"fahrenheit","ts":"2024-02-28","area":"N"}', { device_id: 'SENS-2000', metric: 'temperature', value: -7.18, timestamp_utc: '2024-02-28T00:00:00Z', status: 'critical', zone: 'north' }],
  ['SENS3000|temp|88.09|F|may-18-2024|north', { device_id: 'SENS3000', metric: 'temperature', value: 31.16, timestamp_utc: '2024-05-18T00:00:00Z', status: 'warning', zone: 'north' }],
  ['SENS4000,temperature,311.92,K,2024-04-26T03:24:00Z,north', { device_id: 'SENS4000', metric: 'temperature', value: 38.77, timestamp_utc: '2024-04-26T03:24:00Z', status: 'warning', zone: 'north' }],
  ['dev=SENS-5000 | temp=14.99°F | at=2024-02-04 13:51:57 +02:00 | zone=N', { device_id: 'SENS-5000', metric: 'temperature', value: -9.45, timestamp_utc: '2024-02-04T11:51:57Z', status: 'critical', zone: 'north' }],
  ['{"device":{"id":"SENS6000","zone":"zone-A"},"reading":{"kind":"humidity","value":"79,93","unit":"%RH"},"ts":1717679640}', { device_id: 'SENS6000', metric: 'humidity', value: 79.93, timestamp_utc: '2024-06-06T13:14:00Z', status: 'warning', zone: 'north' }],
  ['<reading device="SENS7000" zone="S"><pressure unit="kPa">101.871</pressure><time>2024-08-08T05:47:38-05:00</time></reading>', { device_id: 'SENS7000', metric: 'pressure', value: 1018.71, timestamp_utc: '2024-08-08T10:47:38Z', status: 'normal', zone: 'south' }],
  ['{"node":"SENS-8000","measure":"temp","reading":"275.27 K","epoch_ms":1713106500000,"area":"E"}', { device_id: 'SENS-8000', metric: 'temperature', value: 2.12, timestamp_utc: '2024-04-14T14:55:00Z', status: 'normal', zone: 'east' }],
];
const METRIC = { temperature: 'temperature', temp: 'temperature', humidity: 'humidity', hum: 'humidity', pressure: 'pressure' };
const ZONE = { north: 'north', south: 'south', east: 'east', west: 'west', n: 'north', s: 'south', e: 'east', w: 'west', 'zone-a': 'north', 'zone-b': 'south', 'zone-c': 'east', 'zone-d': 'west' };
function statusOf(metric, v) {
  if (metric === 'temperature') return v > 40 || v < -5 ? 'critical' : v > 30 || v < 0 ? 'warning' : 'normal';
  if (metric === 'humidity') return v > 90 ? 'critical' : v > 75 ? 'warning' : 'normal';
  return v < 960 || v > 1040 ? 'critical' : v < 980 || v > 1030 ? 'warning' : 'normal';
}
function iotRef(raw) {
  let id, met, val, unit, ms, zone, m;
  try {
    if (raw.startsWith('<reading')) {
      id = /device="(.*?)"/.exec(raw)[1]; zone = /zone="(.*?)"/.exec(raw)[1];
      m = /<(\w+) unit="(.*?)">(.*?)</.exec(raw); met = m[1]; unit = m[2]; val = brNum(m[3]); ms = isoMs(/<time>(.*?)</.exec(raw)[1]);
    } else if (raw.startsWith('{')) {
      const j = JSON.parse(raw);
      if ('device_id' in j) { id = j.device_id; met = j.metric; val = j.value; unit = j.unit; ms = isoMs(j.timestamp); zone = j.zone; }
      else if ('sensor_id' in j) { id = j.sensor_id; met = j.reading_type; val = j.reading_value; unit = j.measurement_unit; ms = isoMs(j.recorded_at); zone = j.location; }
      else if ('device' in j) { id = j.device.id; zone = j.device.zone; met = j.reading.kind; val = brNum(j.reading.value); unit = j.reading.unit; ms = j.ts * 1000; }
      else if ('node' in j) { id = j.node; met = j.measure; [val, unit] = j.reading.split(' '); val = brNum(val); ms = j.epoch_ms; zone = j.area; }
      else { id = j.id; met = j.type; val = j.val; unit = j.unit; ms = isoMs(j.ts); zone = j.area; }
    } else if (raw.startsWith('dev=')) {
      const p = raw.split('|').map(s => s.trim());
      id = p[0].slice(4); m = /^(\w+)=(-?[\d.,]+)°?(\w+)$/.exec(p[1]); met = m[1]; val = brNum(m[2]); unit = m[3]; ms = isoMs(p[2].slice(3)); zone = p[3].slice(5);
    } else if (raw.includes('|')) {
      const p = raw.split('|'); id = p[0]; met = p[1]; val = brNum(p[2]); unit = p[3];
      const [mo, d, y] = p[4].split('-'); ms = Date.UTC(+y, MONTHS[mo.toLowerCase()] - 1, +d); zone = p[5];
    } else { const p = raw.split(','); [id, met] = p; val = brNum(p[2]); unit = p[3]; ms = isoMs(p[4]); zone = p[5]; }
  } catch { return null; }
  const metric = METRIC[String(met).toLowerCase()], z = ZONE[String(zone).toLowerCase()];
  if (!id || !metric || !z || ms == null || !Number.isFinite(val)) return null;
  const u = String(unit || '').toLowerCase();
  let v = val;
  if (metric === 'temperature') v = u.startsWith('f') ? (val - 32) * 5 / 9 : u.startsWith('k') ? val - 273.15 : val;
  if (metric === 'pressure' && u === 'kpa') v = val * 10;
  v = r2(v);
  const [lo, hi] = { temperature: [-60, 70], humidity: [0, 100], pressure: [850, 1100] }[metric];
  if (v < lo || v > hi) return null;
  return { device_id: id, metric, value: v, timestamp_utc: new Date(ms).toISOString().replace('.000Z', 'Z'), status: statusOf(metric, v), zone: z };
}

// ------------------------------------------------------------------ usgs
const GEO = '{"type":"Feature","properties":{"mag":4.3,"place":"241 km SE of Chiniak, Alaska","time":1711929411209,"updated":1717278950040,"tz":null,"url":"https://earthquake.usgs.gov/earthquakes/eventpage/us7000m94h","detail":"https://earthquake.usgs.gov/fdsnws/event/1/query?eventid=us7000m94h&format=geojson","felt":null,"cdi":null,"mmi":1,"alert":null,"status":"reviewed","tsunami":0,"sig":284,"net":"us","code":"7000m94h","ids":",ak02446vxnsz,us7000m94h,","sources":",ak,us,","types":",origin,phase-data,shakemap,","nst":74,"dmin":2.412,"rms":0.65,"gap":192,"magType":"mb","type":"earthquake","title":"M 4.3 - 241 km SE of Chiniak, Alaska"},"geometry":{"type":"Point","coordinates":[-149.6909,55.9718,13.098]},"id":"us7000m94h"}';
const CSV = '2024-06-30T23:28:24.780Z,17.976166666667,-66.6825,10.8,2.62,md,17,148,0.07367,0.07,pr,pr71454383,2024-06-30T23:44:06.530Z,"4 km ESE of Tallaboa, Puerto Rico",earthquake,0.25,0.36,0.035377088129387,6,reviewed,pr,pr';
const GEO_OK = { event_id: 'us7000m94h', magnitude: 4.3, magnitude_type: 'mb', latitude: 55.9718, longitude: -149.6909, timestamp_utc: '2024-03-31T23:56:51Z', place: '241 km SE of Chiniak, Alaska', event_type: 'earthquake', status: 'reviewed', depth_km: 13.098, significance: 284 };
const CSV_OK = { event_id: 'pr71454383', magnitude: 2.62, magnitude_type: 'md', latitude: 17.976166666667, longitude: -66.6825, timestamp_utc: '2024-06-30T23:28:24Z', place: '4 km ESE of Tallaboa, Puerto Rico', event_type: 'earthquake', status: 'reviewed', depth_km: 10.8, significance: null };
function csvSplit(line) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true; else if (c === ',') { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur); return out;
}
const tsTrunc = ms => new Date(Math.floor(ms / 1000) * 1000).toISOString().replace('.000Z', 'Z');
function usgsRef(strict) {
  return raw => {
    let r;
    try {
      if (raw.trim().startsWith('{')) {
        const j = JSON.parse(raw), p = j.properties, c = j.geometry.coordinates;
        r = { event_id: j.id, magnitude: p.mag, magnitude_type: p.magType && p.magType.toLowerCase(), latitude: c[1], longitude: c[0], timestamp_utc: p.time == null ? null : tsTrunc(p.time), place: p.place, event_type: p.type, status: p.status, depth_km: c[2], significance: 'sig' in p ? p.sig : null };
      } else {
        const f = csvSplit(raw.trim());
        const num = s => (s === '' ? null : Number(s));
        r = { event_id: f[11], magnitude: num(f[4]), magnitude_type: f[5] && f[5].toLowerCase(), latitude: num(f[1]), longitude: num(f[2]), timestamp_utc: f[0] ? tsTrunc(Date.parse(f[0])) : null, place: f[13], event_type: f[14], status: f[19], depth_km: num(f[3]), significance: null };
      }
    } catch { return null; }
    for (const [k, v] of Object.entries(r)) if (k !== 'significance' && (v == null || v === '')) return null;
    if (strict && !Number.isInteger(r.significance)) return null;
    return r;
  };
}

// ------------------------------------------------------------------ run
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function suite(name, mod, cases, ref) {
  for (const [raw, ok] of cases) {
    const got = ref(raw);
    assert(same(got, ok), `${name}: reference program disagrees with hand-derived record for ${raw.slice(0, 50)}: ${JSON.stringify(got)}`);
    const t0 = performance.now();
    assert(mod.property(ok, raw) === true, `${name}: property rejects correct record for ${raw.slice(0, 60)}`);
    let calls = 0;
    const counted = r => { calls++; return ref(r); };
    assert(mod.metamorphic(counted, raw, ref(raw)) === true, `${name}: metamorphic rejects reference program for ${raw.slice(0, 60)}`);
    const dt = performance.now() - t0;
    assert(calls <= 6 && dt < 50, `${name}: budget (calls=${calls}, ${dt.toFixed(1)} ms)`);
  }
  console.log(`${name}: ${cases.length} examples checked`);
}
suite('financial', fin, FIN, finRef);
suite('iot', iot, IOT, iotRef);
suite('usgs-corrected', usc, [[GEO, GEO_OK], [CSV, CSV_OK]], usgsRef(false));
suite('usgs-strict', uss, [[GEO, GEO_OK]], usgsRef(true));

// ---- sanity: a few wrong-but-well-formed outputs must be rejected (V2) ----
const bad = (mod, o, raw, why) => assert(mod.property(o, raw) === false, `sanity: should reject (${why})`);
bad(fin, { ...FIN[0][1], value_in_usd: 714.46 }, FIN[0][0], 'BRL not converted');
bad(fin, { ...FIN[1][1], date: '18/12/2024' }, FIN[1][0], 'local date instead of UTC');
bad(fin, { ...FIN[4][1], category: 'domestic' }, FIN[4][0], 'category inconsistent with currency');
bad(fin, { ...FIN[3][1], value_in_usd: r2(6.73816 * 0.2) }, FIN[3][0], 'Brazilian number misread');
bad(fin, { ...FIN[0][1], audit_id: 'TX000' }, FIN[0][0], 'id not verbatim');
bad(iot, { ...IOT[2][1], value: 19.08, status: 'normal' }, IOT[2][0], 'Fahrenheit not converted');
bad(iot, { ...IOT[0][1], status: 'normal' }, IOT[0][0], 'status not derived from value');
bad(iot, { ...IOT[7][1], zone: 'north' }, IOT[7][0], 'zone not in input');
bad(iot, { ...IOT[5][1], timestamp_utc: '2024-02-04T13:51:57Z' }, IOT[5][0], 'offset ignored');
bad(iot, { ...IOT[7][1], value: 101.87, status: 'critical' }, IOT[7][0], 'pressure not x10 kPa');
bad(usc, { ...GEO_OK, event_id: '7000m94h' }, GEO, 'code instead of id');
bad(usc, { ...GEO_OK, timestamp_utc: '2024-06-01T21:55:50Z' }, GEO, 'updated instead of time');
bad(usc, { ...GEO_OK, significance: null }, GEO, 'sig dropped');
bad(usc, { ...CSV_OK, significance: 0 }, CSV, 'sig invented');
bad(usc, { ...GEO_OK, place: 'M 4.3 - 241 km SE of Chiniak, Alaska' }, GEO, 'title as place');
bad(usc, { ...GEO_OK, depth_km: 13.1 }, GEO, 'depth rounded');
bad(uss, { ...CSV_OK, significance: 0 }, CSV, 'strict: sig fabricated for CSV');
bad(uss, { ...GEO_OK, depth_km: 0 }, GEO.replace('13.098', '-1.2'), 'strict: negative depth clamped');

// ---- sanity: V3 catches defective programs that V2 cannot see ----
const alwaysBRL = r => { const o = finRef(r); return o && { ...o, category: 'domestic' }; };
assert(fin.metamorphic(alwaysBRL, FIN[4][0], alwaysBRL(FIN[4][0])) === false, 'sanity: V3 catches hard-coded category');
const defaultCur = r => finRef(r) || finRef(r.replace('<amount currency="">', '<amount currency="GBP">'));
assert(fin.metamorphic(defaultCur, FIN[7][0], defaultCur(FIN[7][0])) === false, 'sanity: V3 catches guessed currency');
const noKelvin = r => { const o = iotRef(r.replace(' K"', ' C"')); return o; };
assert(iot.metamorphic(noKelvin, IOT[0][0], noKelvin(IOT[0][0])) === true, 'sanity: noKelvin is fine on a Celsius input');
const guessZone = r => iotRef(r) || iotRef(r.replace(/"area":"[A-Z]*"/, '"area":"N"'));
assert(iot.metamorphic(guessZone, IOT[2][0], guessZone(IOT[2][0])) === true, 'sanity: V3 cannot see zone guessing when the zone is present');
const clampTemp = r => { const o = iotRef(r.replace(/"reading":"[\d.]+ K"/, '"reading":"300.00 K"')); return o; };
assert(iot.metamorphic(clampTemp, IOT[8][0], iotRef(IOT[8][0])) === false, 'sanity: V3 catches a program ignoring the value token');
const clampDepth = r => { const o = usgsRef(false)(r); return o && { ...o, depth_km: Math.max(0, o.depth_km) }; };
assert(usc.metamorphic(clampDepth, GEO, clampDepth(GEO)) === false, 'sanity: V3 catches depth clamping (corrected telos)');
const idFromCode = r => { const o = usgsRef(false)(r); return o && { ...o, event_id: GEO_OK.event_id }; };
assert(usc.metamorphic(idFromCode, GEO, idFromCode(GEO)) === false, 'sanity: V3 catches a constant event_id');

console.log(`\n${passes} assertions passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
