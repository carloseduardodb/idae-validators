// =============================================================================
// tasks.js — Tarefas de consumo e tolerâncias (pré-registradas).
//
// Cada tarefa é o que um consumidor real faria com as saídas de um domínio.
// run(outputs) recebe a lista de objetos entregues (um por registro aceito) e
// devolve um resultado; compare(a, b) compara o resultado com as saídas do
// programa (a) e com a verdade (b) e devolve { ok, deviation, detail }.
// Um programa "resolve o caso" para uma tarefa se ok = true.
//
// O consumidor é tolerante como um consumidor real: lê números em string,
// datas e timestamps com Date.parse (aceita milissegundos), e ignora os
// registros cujo campo necessário não é legível (registro perdido para a
// tarefa). Campos extras são ignorados.
//
// "estrita" marca tarefas que exigem exatidão por natureza (conciliação,
// série de alertas). Foram incluídas para não escolher só tarefas que
// favorecem a tese.
//
// Este arquivo é congelado (SHA-256 em TASKS.sha256) antes da primeira
// execução contra o corpus.
// =============================================================================

// ---- leitura tolerante dos campos ------------------------------------------

const num = (x) => {
  if (typeof x === 'number') return Number.isFinite(x) ? x : null;
  if (typeof x === 'string' && x.trim() !== '' && Number.isFinite(Number(x))) return Number(x);
  return null;
};
const str = (x) => (typeof x === 'string' && x !== '' ? x : null);

// "DD/MM/YYYY" -> { day: "YYYY-MM-DD", month: "YYYY-MM" }
function finDate(x) {
  const m = typeof x === 'string' && x.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  return { day: `${m[3]}-${m[2]}-${m[1]}`, month: `${m[3]}-${m[2]}` };
}

// timestamp -> instante em ms (UTC), via Date.parse
function ts(x) {
  if (typeof x !== 'string') return null;
  const t = Date.parse(x);
  return Number.isFinite(t) ? t : null;
}
const isoDay = (t) => new Date(t).toISOString().slice(0, 10);
const isoMonth = (t) => new Date(t).toISOString().slice(0, 7);
const isoMinute = (t) => new Date(t).toISOString().slice(0, 16);

const region = (place) => (str(place) ? place.split(', ').pop() : null);

// ---- agregações e comparações ----------------------------------------------

function groupSum(outputs, key, val) {
  const m = {};
  for (const o of outputs) {
    const k = key(o), v = val(o);
    if (k == null || v == null) continue;
    m[k] = (m[k] || 0) + v;
  }
  return m;
}
const groupCount = (outputs, key) => groupSum(outputs, key, () => 1);
function groupMean(outputs, key, val) {
  const s = groupSum(outputs, key, val), c = groupSum(outputs, key, (o) => (val(o) == null ? null : 1));
  return Object.fromEntries(Object.keys(s).map(k => [k, s[k] / c[k]]));
}
function shares(outputs, key) {
  const c = groupCount(outputs, key);
  const n = Object.values(c).reduce((a, b) => a + b, 0) || 1;
  return Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v / n]));
}

// Mapas de números: chaves ausentes valem 0 (contagens e somas).
function cmpMap(tol, { relative = false, missingIsZero = true } = {}) {
  return (a, b) => {
    let worst = 0, worstKey = null, ok = true;
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (!missingIsZero && (!(k in a) || !(k in b))) { ok = false; worst = Infinity; worstKey = k; continue; }
      const x = a[k] ?? 0, y = b[k] ?? 0;
      const d = relative ? (y === 0 ? (x === 0 ? 0 : Infinity) : Math.abs(x - y) / Math.abs(y)) : Math.abs(x - y);
      if (d > worst) { worst = d; worstKey = k; }
      if (d > tol) ok = false;
    }
    return { ok, deviation: worst, detail: worstKey };
  };
}

// Top-N por valor. A tolerância "≥ 9 de 10 em comum" vira: no máximo
// N − minCommon identificadores de diferença em cada direção (faltando na
// lista do programa ou sobrando nela), o que também vale quando o formato tem
// menos de N registros válidos.
function topN(outputs, id, val, n = 10) {
  return outputs.filter(o => id(o) != null && val(o) != null)
    .sort((p, q) => val(q) - val(p) || String(id(p)).localeCompare(String(id(q))))
    .slice(0, n).map(id);
}
function cmpTop(minCommon, n = 10) {
  return (a, b) => {
    const missing = b.filter(x => !a.includes(x)).length, extra = a.filter(x => !b.includes(x)).length;
    const d = Math.max(missing, extra);
    return { ok: d <= n - minCommon, deviation: d, detail: `${b.length - missing}/${b.length} em comum, ${extra} a mais` };
  };
}

// Conjuntos: igualdade exata.
function cmpSet(a, b) {
  const A = new Set(a), B = new Set(b);
  const missing = [...B].filter(x => !A.has(x)).length, extra = [...A].filter(x => !B.has(x)).length;
  return { ok: missing === 0 && extra === 0, deviation: missing + extra, detail: `faltam ${missing}, sobram ${extra}` };
}

// ---- tarefas por domínio -----------------------------------------------------

const financial = [
  { id: 'F1', name: 'Total em USD por mês', tolerance: 'erro relativo ≤ 1% em todo mês',
    run: (O) => groupSum(O, o => finDate(o.date)?.month, o => num(o.value_in_usd)),
    compare: cmpMap(0.01, { relative: true }) },
  { id: 'F2', name: 'Total em USD por categoria', tolerance: 'erro relativo ≤ 1% em cada categoria',
    run: (O) => groupSum(O, o => str(o.category), o => num(o.value_in_usd)),
    compare: cmpMap(0.01, { relative: true }) },
  { id: 'F3', name: 'Fração de transações internacionais', tolerance: '|Δ| ≤ 1 ponto percentual',
    run: (O) => shares(O, o => str(o.category)),
    compare: cmpMap(0.01) },
  { id: 'F4', name: 'Dez maiores transações', tolerance: '≥ 9 de 10 em comum',
    run: (O) => topN(O, o => str(o.audit_id), o => num(o.value_in_usd)),
    compare: cmpTop(9) },
  // Tolerância por dia = 0,011 USD por transação da verdade naquele dia, a
  // mesma tolerância por registro do oráculo (arredondamento ao centavo).
  { id: 'F5', name: 'Conciliação diária (total por dia)', tolerance: '|Δ| ≤ 0,011 USD × transações do dia, em todo dia', strict: true,
    run: (O) => ({ sum: groupSum(O, o => finDate(o.date)?.day, o => num(o.value_in_usd)),
                   n: groupCount(O, o => (num(o.value_in_usd) == null ? null : finDate(o.date)?.day)) }),
    compare: (a, b) => {
      let ok = true, worst = 0, worstKey = null;
      for (const k of new Set([...Object.keys(a.sum), ...Object.keys(b.sum)])) {
        const d = Math.abs((a.sum[k] ?? 0) - (b.sum[k] ?? 0));
        if (d > worst) { worst = d; worstKey = k; }
        if (d > 0.011 * Math.max(1, b.n[k] ?? 0) + 1e-9) ok = false;
      }
      return { ok, deviation: worst, detail: worstKey };
    } },
];

const iot = [
  { id: 'I1', name: 'Média por métrica, zona e mês', tolerance: '|Δ| ≤ 0,5 unidade canônica em toda célula',
    run: (O) => groupMean(O, o => { const t = ts(o.timestamp_utc); return t == null || !str(o.metric) || !str(o.zone) ? null : `${o.metric}|${o.zone}|${isoMonth(t)}`; }, o => num(o.value)),
    compare: cmpMap(0.5, { missingIsZero: false }) },
  { id: 'I2', name: 'Alertas críticos por métrica e mês', tolerance: 'contagem exata',
    run: (O) => groupCount(O.filter(o => o.status === 'critical'), o => { const t = ts(o.timestamp_utc); return t == null || !str(o.metric) ? null : `${o.metric}|${isoMonth(t)}`; }),
    compare: cmpMap(0) },
  { id: 'I3', name: 'Distribuição de (métrica, status)', tolerance: '|Δ| ≤ 2 pontos percentuais em cada par',
    run: (O) => shares(O, o => (str(o.metric) && str(o.status) ? `${o.metric}|${o.status}` : null)),
    compare: cmpMap(0.02) },
  { id: 'I4', name: 'Série de alertas críticos (dispositivo, minuto UTC)', tolerance: 'conjunto idêntico', strict: true,
    run: (O) => O.filter(o => o.status === 'critical').map(o => { const t = ts(o.timestamp_utc); return t == null || !str(o.device_id) ? null : `${o.device_id}|${isoMinute(t)}`; }).filter(Boolean),
    compare: cmpSet },
];

const usgs = [
  { id: 'U1', name: 'Eventos por tipo', tolerance: 'contagem exata',
    run: (O) => groupCount(O, o => str(o.event_type)),
    compare: cmpMap(0) },
  { id: 'U2', name: 'Eventos de magnitude ≥ 4 por região', tolerance: 'contagem exata',
    run: (O) => groupCount(O.filter(o => (num(o.magnitude) ?? -Infinity) >= 4), o => region(o.place)),
    compare: cmpMap(0) },
  { id: 'U3', name: 'Profundidade média por região', tolerance: '|Δ| ≤ 1 km em toda região',
    run: (O) => groupMean(O, o => region(o.place), o => num(o.depth_km)),
    compare: cmpMap(1, { missingIsZero: false }) },
  { id: 'U4', name: 'Dez eventos mais significativos', tolerance: '≥ 9 de 10 em comum',
    run: (O) => topN(O, o => str(o.event_id), o => num(o.significance)),
    compare: cmpTop(9) },
  { id: 'U5', name: 'Eventos por dia UTC', tolerance: 'contagem exata', strict: true,
    run: (O) => groupCount(O, o => { const t = ts(o.timestamp_utc); return t == null ? null : isoDay(t); }),
    compare: cmpMap(0) },
];

export const TASKS = {
  financial,
  iot,
  'usgs-corrected': usgs,
  'usgs-strict': usgs,
};
