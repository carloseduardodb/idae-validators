// =============================================================================
// x2-mutation.js — RQ2: escore de mutação de cada validador.
//
// 1. Mutantes: até PROGS programas corretos por (domínio, assinatura), até
//    PER mutantes de primeira ordem por programa. Cada mutante é avaliado pelo
//    oráculo; ficam só os que produzem ao menos uma saída errada (os que só
//    passam a rejeitar ou quebrar não chegam ao validador). Mutantes com o
//    mesmo comportamento por registro contam uma vez. O conjunto é congelado
//    em data/mutants/mutants.jsonl (reusado se existir).
// 2. Escore de mutação = mutantes com ao menos uma saída errada barrada /
//    mutantes, para V0–V4 e para os validadores escritos por LLM.
// 3. Correlação de Spearman entre o escore de mutação e a força contra
//    falhas reais (X1, por comportamento) sobre todos os validadores.
// Não faz chamadas de LLM.
// =============================================================================

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { DOMAINS } from '../src/streams.js';
import { evaluate } from '../src/corpus.js';
import { mutants, spread } from '../src/mutation.js';
import { validatorsFor, llmValidatorsFor, nversionValidators } from '../src/validators/index.js';
import { evaluateProgram, aggregate, printTable, pct } from '../src/evaluate.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PROGS = parseInt(process.env.PROGS || '6');
const PER = parseInt(process.env.PER || '25');
const MFILE = join(ROOT, 'data/mutants/mutants.jsonl');

const corpus = readFileSync(join(ROOT, 'data/corpus/programs.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);

// 1. Mutantes
let kept;
if (existsSync(MFILE)) {
  kept = readFileSync(MFILE, 'utf8').trim().split('\n').map(JSON.parse);
  console.log(`mutantes reusados: ${kept.length}`);
} else {
  const groups = new Map();
  for (const p of corpus.filter(r => r.compiles && r.label === 'correct')) {
    const k = p.domain + '|' + p.sig;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(p);
  }
  const stats = { programs: 0, generated: 0, noChange: 0, onlyRejectOrCrash: 0, duplicates: 0, kept: 0, byOp: {} };
  const seen = new Set();
  kept = [];
  for (const progs of groups.values()) {
    for (const p of spread(progs, PROGS)) {
      stats.programs++;
      for (const m of spread(mutants(p.body), PER)) {
        stats.generated++;
        const r = evaluate({ domain: p.domain, sig: p.sig, body: m.body });
        if (!r.compiles || r.wrong === 0) { if (r.compiles && r.miss > 0) stats.onlyRejectOrCrash++; else stats.noChange++; continue; }
        if (seen.has(r.behavior)) { stats.duplicates++; continue; }
        seen.add(r.behavior);
        stats.kept++;
        stats.byOp[m.op] = (stats.byOp[m.op] || 0) + 1;
        kept.push({ id: `${p.id}~${m.op}@${m.at}`, parent: p.id, op: m.op, domain: p.domain, sig: p.sig, models: p.models, body: m.body, behavior: r.behavior, wrong: r.wrong, n: r.n });
      }
    }
  }
  mkdirSync(dirname(MFILE), { recursive: true });
  writeFileSync(MFILE, kept.map(x => JSON.stringify(x)).join('\n') + '\n');
  writeFileSync(join(ROOT, 'results/x2-mutants-stats.json'), JSON.stringify(stats, null, 2));
  console.log('mutantes:', stats);
}

// 2. Escore
const V = {}, broken = {};
for (const D of DOMAINS) {
  const llm = llmValidatorsFor(D.key);
  V[D.key] = { ...(await validatorsFor(D.key)), ...llm.validators };
  broken[D.key] = llm.broken;
}
const perMutant = [];
let i = 0;
for (const m of kept) {
  const acc = evaluateProgram(m, { ...V[m.domain], ...nversionValidators(m, corpus) });
  if (acc) perMutant.push({ id: m.id, op: m.op, domain: m.domain, acc });
  if (++i % 250 === 0) console.error(`  ${i}/${kept.length}`);
}
const NAMES = [...new Set(perMutant.flatMap(x => Object.keys(x.acc)))].sort((a, b) => (a.startsWith('L:') - b.startsWith('L:')) || a.localeCompare(b));
const total = aggregate(perMutant, NAMES);
const byDomain = Object.fromEntries(DOMAINS.map(D => [D.key, aggregate(perMutant.filter(x => x.domain === D.key), NAMES)]));
const ops = [...new Set(perMutant.map(x => x.op))];
const byOp = Object.fromEntries(ops.map(o => [o, aggregate(perMutant.filter(x => x.op === o), NAMES)]));

// 3. Correlação com X1 (força por comportamento), por domínio e no total.
function rank(a) {
  const idx = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]);
  const r = new Array(a.length);
  for (let i = 0; i < idx.length;) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2 + 1;
    i = j + 1;
  }
  return r;
}
function spearman(x, y) {
  const rx = rank(x), ry = rank(y), n = x.length;
  const mx = rx.reduce((s, v) => s + v, 0) / n, my = ry.reduce((s, v) => s + v, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) { num += (rx[i] - mx) * (ry[i] - my); dx += (rx[i] - mx) ** 2; dy += (ry[i] - my) ** 2; }
  return dx && dy ? num / Math.sqrt(dx * dy) : null;
}
function bootstrapCI(x, y, B = 2000) {
  let seed = 12345;
  const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };
  const vals = [];
  for (let b = 0; b < B; b++) {
    const ix = Array.from({ length: x.length }, () => Math.floor(rnd() * x.length));
    const r = spearman(ix.map(i => x[i]), ix.map(i => y[i]));
    if (r !== null) vals.push(r);
  }
  vals.sort((a, b) => a - b);
  return [vals[Math.floor(0.025 * vals.length)], vals[Math.floor(0.975 * vals.length)]];
}

let correlation = null;
const X1 = join(ROOT, 'results/x1-real-faults.json');
if (existsSync(X1)) {
  const x1 = JSON.parse(readFileSync(X1, 'utf8'));
  correlation = {};
  const pairs = (m1, m2) => NAMES.filter(n => m1[n]?.defective && m2[n]?.defective && !n.startsWith('V4-'))
    .map(n => ({ n, mut: m1[n].programsCaughtRate, real: m2[n].programsCaughtRate, mutOut: m1[n].caughtWrongRate, realOut: m2[n].caughtWrongRate }));
  // Um ponto por (domínio, validador); o total junta os pontos de todos os
  // domínios em vez de somar validadores diferentes sob o mesmo nome.
  const perDomain = DOMAINS.map(D => [D.key, pairs(byDomain[D.key], x1.byDomain[D.key].behaviors).map(p => ({ ...p, n: `${D.key}/${p.n}` }))]);
  for (const [k, ps] of [['total', perDomain.flatMap(([, ps]) => ps)], ...perDomain]) {
    if (ps.length < 5 || new Set(ps.map(p => p.real)).size < 2) { correlation[k] = { validators: ps.length, note: 'sem variância na força real' }; continue; }
    const a = ps.map(p => p.mut), b = ps.map(p => p.real);
    const ao = ps.map(p => p.mutOut), bo = ps.map(p => p.realOut);
    correlation[k] = { validators: ps.length, rhoPrograms: spearman(a, b), ci95: bootstrapCI(a, b), rhoOutputs: spearman(ao, bo), ci95Outputs: bootstrapCI(ao, bo), points: ps };
  }
}

writeFileSync(join(ROOT, 'results/x2-mutation.json'), JSON.stringify({ generatedAt: new Date().toISOString(), mutants: kept.length, validators: NAMES, brokenLlmValidators: broken, total, byDomain, byOp, correlation }, null, 2));

const base = NAMES.filter(n => !n.startsWith('L:'));
printTable(`X2 — mutantes (${kept.length}, comportamentos distintos)`, total, base);
console.log('\nescore de mutação (pegos ≥1) por operador:');
for (const o of ops) console.log(' ', o.padEnd(7), base.map(n => `${n}:${pct(byOp[o][n]?.programsCaughtRate)}`).join('  '));
if (correlation) {
  console.log('\nSpearman (escore de mutação × força em falhas reais, por validador):');
  for (const [k, c] of Object.entries(correlation)) {
    if (c.note) { console.log(`  ${k.padEnd(15)} n=${c.validators}  ${c.note}`); continue; }
    console.log(`  ${k.padEnd(15)} n=${c.validators}  ρ(programas)=${c.rhoPrograms?.toFixed(2)} [${c.ci95.map(v => v?.toFixed(2)).join(', ')}]  ρ(saídas)=${c.rhoOutputs?.toFixed(2)} [${c.ci95Outputs.map(v => v?.toFixed(2)).join(', ')}]`);
  }
}
