// =============================================================================
// x7-task-impact.js — RQ6: impacto na tarefa de cada programa do corpus.
//
// Para cada programa, as saídas dele substituem as da verdade e cada tarefa
// de consumo (src/tasks.js, congelado) é calculada sobre as duas versões:
//
//   formato  só os registros da assinatura do programa (o consumidor de uma
//            única fonte; não depende da composição do fluxo)
//   fluxo    o domínio inteiro, com a verdade nos demais formatos (o
//            consumidor do dataset completo; o efeito é diluído)
//
// Registro em que o programa devolve null ou lança erro: some do dataset.
// Registro que deveria ser rejeitado e o programa entrega: entra no dataset.
// Um programa "resolve o caso" para uma tarefa se a comparação dá ok.
//
// Saída: results/x7-task-impact.json e resumo no console. Não faz chamadas de LLM.
// =============================================================================

import { readFileSync, writeFileSync } from 'fs';
import { createHash } from 'crypto';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { DOMAINS, streamOf } from '../src/streams.js';
import { compile } from '../src/util.js';
import { TASKS } from '../src/tasks.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// As tarefas precisam estar congeladas.
const frozen = readFileSync(join(ROOT, 'TASKS.sha256'), 'utf8').split(/\s+/)[0];
const actual = createHash('sha256').update(readFileSync(join(ROOT, 'src/tasks.js'))).digest('hex');
if (frozen !== actual) throw new Error('src/tasks.js difere do hash congelado em TASKS.sha256');

const corpus = readFileSync(join(ROOT, 'data/corpus/programs.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
const x1 = JSON.parse(readFileSync(join(ROOT, 'results/x1-real-faults.json'), 'utf8'));
const acc = new Map(x1.perProgram.map(p => [p.id, p.acc]));

const delivered = (truth) => (truth.expect === 'accept' ? [truth.output] : []);

const perProgram = [];
for (const p of corpus.filter(r => r.compiles)) {
  const D = DOMAINS.find(d => d.key === p.domain);
  const stream = streamOf(D);
  const fn = compile(p.body);
  const progOut = [], truthIn = [], truthOut = [];
  for (const e of stream) {
    if (e.sig !== p.sig) { truthOut.push(...delivered(e.truth)); continue; }
    let o; try { o = fn(e.raw); } catch { o = null; }
    if (o && typeof o === 'object') progOut.push(o);
    truthIn.push(...delivered(e.truth));
  }
  const scopes = { formato: [progOut, truthIn], fluxo: [[...truthOut, ...progOut], [...truthOut, ...truthIn]] };
  const tasks = {};
  for (const t of TASKS[p.domain]) {
    tasks[t.id] = {};
    for (const [scope, [P, T]] of Object.entries(scopes)) {
      const r = t.compare(t.run(P), t.run(T));
      tasks[t.id][scope] = { ok: r.ok, deviation: Number.isFinite(r.deviation) ? +r.deviation.toFixed(6) : String(r.deviation), detail: r.detail };
    }
  }
  const a = acc.get(p.id);
  perProgram.push({ id: p.id, domain: p.domain, sig: p.sig, label: p.label, behavior: p.behavior, models: p.models,
    wrongFields: p.wrongFields, wrong: p.wrong, right: p.right,
    caught: a ? { V0: a.V0?.wrongBlocked > 0, V2: a.V2?.wrongBlocked > 0 } : null, tasks });
}

// Um representante por comportamento (o primeiro, como no X1 do artigo anterior).
const reps = [...perProgram.reduce((m, x) => (m.has(x.behavior) ? m : m.set(x.behavior, x)), new Map()).values()];

function verdict(x, scope) {
  const oks = Object.values(x.tasks).map(t => t[scope].ok);
  const strictIds = new Set(TASKS[x.domain].filter(t => t.strict).map(t => t.id));
  const lax = Object.entries(x.tasks).filter(([id]) => !strictIds.has(id)).map(([, t]) => t[scope].ok);
  return {
    okTasks: oks.filter(Boolean).length, nTasks: oks.length,
    class: oks.every(Boolean) ? 'inofensivo' : oks.some(Boolean) ? 'depende' : 'grave',
    laxAllOk: lax.every(Boolean),
  };
}

const summary = {};
for (const scope of ['formato', 'fluxo']) {
  summary[scope] = {};
  for (const label of ['defective', 'incomplete', 'correct']) {
    for (const [unit, items] of [['behaviors', reps], ['programs', perProgram]]) {
      const xs = items.filter(x => x.label === label);
      const c = { n: xs.length, inofensivo: 0, depende: 0, grave: 0, laxAllOk: 0 };
      for (const x of xs) { const v = verdict(x, scope); c[v.class]++; if (v.laxAllOk) c.laxAllOk++; }
      summary[scope][`${label}-${unit}`] = c;
    }
  }
  // Por tarefa: fração dos comportamentos defeituosos que a tarefa tolera.
  summary[scope].perTask = {};
  for (const [dk, tasks] of Object.entries(TASKS)) for (const t of tasks) {
    const xs = reps.filter(x => x.label === 'defective' && x.domain === dk);
    const key = `${dk}:${t.id}`;
    summary[scope].perTask[key] = { name: t.name, strict: !!t.strict, n: xs.length, ok: xs.filter(x => x.tasks[t.id][scope].ok).length };
  }
}

const defectiveReps = reps.filter(x => x.label === 'defective').map(x => ({
  domain: x.domain, sig: x.sig, behavior: x.behavior, models: Object.keys(x.models || {}), wrongFields: x.wrongFields,
  wrong: x.wrong, right: x.right, caughtV2: x.caught?.V2 ?? null,
  formato: Object.fromEntries(Object.entries(x.tasks).map(([id, t]) => [id, t.formato.ok])),
  fluxo: Object.fromEntries(Object.entries(x.tasks).map(([id, t]) => [id, t.fluxo.ok])),
  verdict: { formato: verdict(x, 'formato'), fluxo: verdict(x, 'fluxo') },
}));

writeFileSync(join(ROOT, 'results/x7-task-impact.json'), JSON.stringify({ generatedAt: new Date().toISOString(), tasksSha256: actual, summary, defectiveReps, perProgram }, null, 2));

// ---- console -----------------------------------------------------------------
for (const scope of ['formato', 'fluxo']) {
  console.log(`\n=== X7 — escopo ${scope} ===`);
  for (const [k, c] of Object.entries(summary[scope])) if (k !== 'perTask')
    console.log(`${k.padEnd(22)} n=${String(c.n).padStart(4)}  inofensivo ${String(c.inofensivo).padStart(4)}  depende ${String(c.depende).padStart(4)}  grave ${String(c.grave).padStart(4)}  ok em todas as não estritas ${String(c.laxAllOk).padStart(4)}`);
  console.log('tarefa                         toleram (comportamentos defeituosos)');
  for (const [k, t] of Object.entries(summary[scope].perTask)) console.log(`${(k + (t.strict ? '*' : '')).padEnd(22)} ${t.name.padEnd(48)} ${t.ok}/${t.n}`);
}
console.log('\n=== Comportamentos defeituosos (escopo formato; ✓ = resolve o caso) ===');
for (const x of defectiveReps) {
  const marks = Object.entries(x.formato).map(([id, ok]) => `${id}${ok ? '✓' : '✗'}`).join(' ');
  console.log(`${x.domain.padEnd(15)} ${x.sig.slice(0, 32).padEnd(32)} ${JSON.stringify(x.wrongFields).slice(0, 44).padEnd(44)} V2:${x.caughtV2 ? 'pega' : 'não '}  ${marks}  → ${x.verdict.formato.class} | fluxo: ${x.verdict.fluxo.class}`);
}
