// =============================================================================
// x3-analysis.js — RQ3 a partir de results/x1-real-faults.json.
//
// 1. Força dos validadores escritos por LLM (por modelo): mediana e faixa de
//    "pegos" e de rejeição falsa, comparadas com V0 e V2.
// 2. Erros correlacionados: taxa de saídas erradas ACEITAS por validadores
//    de cada modelo, separada pelo modelo que escreveu o programa.
//    Se validadores de um modelo aceitam mais os erros do próprio modelo,
//    a diagonal fica acima da outra célula da linha.
// 3. X5: as mesmas métricas para os validadores revisados com autoverificação
//    (I:*) e a comparação pareada L → I do mesmo validador.
// Não faz chamadas de LLM.
// =============================================================================

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { pct } from '../src/evaluate.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const x1 = JSON.parse(readFileSync(join(ROOT, 'results/x1-real-faults.json'), 'utf8'));
const MODELS = ['claude-opus-4.5', 'claude-haiku-4.5'];
const family = (prefix) => x1.validators.filter(n => n.startsWith(prefix));
const llm = family('L:');
const modelOf = (n) => MODELS.find(m => n.includes(m));

const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };

// 1. Força por domínio e modelo (por comportamento)
function strengthOf(names0) {
  const strength = {};
  for (const [d, v] of Object.entries(x1.byDomain)) {
    const b = v.behaviors;
    strength[d] = { V0: b.V0, V2: b.V2 };
    for (const m of MODELS) {
      const names = names0.filter(n => modelOf(n) === m && b[n]?.programs);
      const caught = names.map(n => b[n].programsCaughtRate).filter(x => x !== null);
      const fr = names.map(n => b[n].falseRejectionRate).filter(x => x !== null);
      strength[d][m] = {
        validators: names.length,
        caughtMedian: median(caught), caughtMin: Math.min(...caught), caughtMax: Math.max(...caught),
        falseRejMedian: median(fr), falseRejMax: Math.max(...fr),
        usable: names.filter(n => (b[n].falseRejectionRate ?? 0) <= 0.01).length,
      };
    }
  }
  return strength;
}
const strength = strengthOf(llm);

// 2. Erros correlacionados (por programa; só programas de um único modelo)
function correlated(llm) {
  const cross = {};
  for (const vm of MODELS) for (const pm of MODELS) cross[`${vm}|${pm}`] = { wrongAccepted: 0, wrong: 0, rightBlocked: 0, right: 0 };
  for (const p of x1.perProgram) {
    const pms = Object.keys(p.models);
    if (pms.length !== 1) continue;
    const pm = pms[0];
    for (const n of llm) {
      const a = p.acc[n];
      if (!a) continue;
      const c = cross[`${modelOf(n)}|${pm}`];
      c.wrongAccepted += a.wrongAccepted; c.wrong += a.wrongAccepted + a.wrongBlocked;
      c.rightBlocked += a.rightBlocked; c.right += a.rightBlocked + a.rightAccepted;
    }
  }

  // Interação: razão de chances de aceitar erro do próprio modelo, controlando a
  // permissividade geral de cada modelo de validador:
  //   OR = [odds(Opus-val, Opus-prog) / odds(Opus-val, Haiku-prog)]
  //      / [odds(Haiku-val, Opus-prog) / odds(Haiku-val, Haiku-prog)]
  // OR > 1: cada modelo é relativamente mais leniente com os próprios erros.
  // IC 95% por bootstrap sobre comportamentos distintos (saídas do mesmo
  // comportamento não são independentes).
  const odds = (c) => (c.wrongAccepted + 0.5) / (c.wrong - c.wrongAccepted + 0.5);
  function interaction(cells) {
    const [O, H] = MODELS;
    return (odds(cells[`${O}|${O}`]) / odds(cells[`${O}|${H}`])) / (odds(cells[`${H}|${O}`]) / odds(cells[`${H}|${H}`]));
  }
  const byBehavior = new Map();
  for (const p of x1.perProgram) {
    const pms = Object.keys(p.models);
    if (pms.length !== 1) continue;
    const cell = {};
    for (const n of llm) {
      const a = p.acc[n];
      if (!a || a.wrongAccepted + a.wrongBlocked === 0) continue;
      const k = `${modelOf(n)}|${pms[0]}`;
      cell[k] ??= { wrongAccepted: 0, wrong: 0 };
      cell[k].wrongAccepted += a.wrongAccepted; cell[k].wrong += a.wrongAccepted + a.wrongBlocked;
    }
    if (!Object.keys(cell).length) continue;
    if (!byBehavior.has(p.behavior)) byBehavior.set(p.behavior, []);
    byBehavior.get(p.behavior).push(cell);
  }
  const units = [...byBehavior.values()];
  function cellsOf(sample) {
    const c = {};
    for (const vm of MODELS) for (const pm of MODELS) c[`${vm}|${pm}`] = { wrongAccepted: 0, wrong: 0 };
    for (const u of sample) for (const cell of u) for (const [k, v] of Object.entries(cell)) { c[k].wrongAccepted += v.wrongAccepted; c[k].wrong += v.wrong; }
    return c;
  }
  let seed = 777;
  const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };
  const boots = [];
  for (let b = 0; b < 2000; b++) boots.push(interaction(cellsOf(Array.from({ length: units.length }, () => units[Math.floor(rnd() * units.length)]))));
  boots.sort((a, b) => a - b);
  const selfBias = { oddsRatio: interaction(cellsOf(units)), ci95: [boots[50], boots[1949]], behaviors: units.length };
  return { cross, selfBias };
}
const { cross, selfBias } = correlated(llm);

// 3. X5: validadores revisados (I:*) e comparação pareada com o original (L:*)
const iter = family('I:');
let iterative = null;
if (iter.length) {
  const paired = [];
  for (const n of iter) {
    const d = n.split(':')[1], l = n.replace(/^I:/, 'L:');
    const b = x1.byDomain[d].behaviors;
    if (!b[n]?.programs || !b[l]?.programs) continue;
    paired.push({ domain: d, model: modelOf(n), name: n.slice(2),
      caught: [b[l].programsCaughtRate, b[n].programsCaughtRate], falseRej: [b[l].falseRejectionRate, b[n].falseRejectionRate] });
  }
  iterative = { strength: strengthOf(iter), ...correlated(iter), paired };
}

writeFileSync(join(ROOT, 'results/x3-analysis.json'), JSON.stringify({ generatedAt: new Date().toISOString(), strength, cross, selfBias, iterative }, null, 2));

console.log('=== X3 — validadores escritos por LLM (por comportamento; 10 por modelo e domínio) ===');
for (const [d, s] of Object.entries(strength)) {
  console.log(`\n${d}   V0 pega ${pct(s.V0?.programsCaughtRate)}  |  V2 pega ${pct(s.V2?.programsCaughtRate)} (rej. falsa ${pct(s.V2?.falseRejectionRate)})`);
  for (const m of MODELS) {
    const x = s[m];
    console.log(`  ${m.padEnd(17)} pega mediana ${pct(x.caughtMedian)} [${pct(x.caughtMin)}–${pct(x.caughtMax)}]  rej. falsa mediana ${pct(x.falseRejMedian)} (máx ${pct(x.falseRejMax)})  utilizáveis (rej. falsa ≤1%): ${x.usable}/${x.validators}`);
  }
}
console.log('\nsaídas erradas ACEITAS (validador do modelo × programa do modelo):');
for (const vm of MODELS) {
  console.log('  validador ' + vm.padEnd(17) + MODELS.map(pm => {
    const c = cross[`${vm}|${pm}`];
    return `prog ${pm}: ${pct(c.wrong ? c.wrongAccepted / c.wrong : null)} (${c.wrongAccepted}/${c.wrong})`;
  }).join('   '));
}
console.log(`\ninteração (leniência com os próprios erros, controlando permissividade): OR = ${selfBias.oddsRatio.toFixed(2)}  IC95% [${selfBias.ci95.map(v => v.toFixed(2)).join(', ')}]  (${selfBias.behaviors} comportamentos defeituosos)`);

if (iterative) {
  console.log('\n=== X5 — os mesmos validadores após autoverificação iterativa (L → I, por comportamento) ===');
  for (const [d, s] of Object.entries(iterative.strength)) {
    console.log(`\n${d}`);
    for (const m of MODELS) {
      const a = strength[d][m], x = s[m];
      console.log(`  ${m.padEnd(17)} pega mediana ${pct(a.caughtMedian)} → ${pct(x.caughtMedian)}   rej. falsa mediana ${pct(a.falseRejMedian)} → ${pct(x.falseRejMedian)}   utilizáveis ${a.usable} → ${x.usable}/${x.validators}`);
    }
  }
  const sb = iterative.selfBias;
  console.log(`\ninteração (I): OR = ${sb.oddsRatio.toFixed(2)}  IC95% [${sb.ci95.map(v => v.toFixed(2)).join(', ')}]`);
}
