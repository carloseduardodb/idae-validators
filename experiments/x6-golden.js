// =============================================================================
// x6-golden.js — RQ5: pares entrada/saída verificados como portão de nascimento.
//
// Premissa: cada formato (assinatura) tem k registros com a saída verificada
// (ou "deve ser rejeitado"), e o formato não muda na janela de uso. Um programa
// só é aprovado se reproduz exatamente a verdade em todos os k pares: saída
// igual ao oráculo nos pares de aceitação e null nos de rejeição. Se falha, é
// descartado antes de processar qualquer registro (defeito pego e limpo).
//
// Composição dos k pares:
//   primeiros     os k primeiros registros do formato na ordem do fluxo (os que
//                 o programa veria primeiro em produção)
//   sorteio       k registros do formato ao acaso (probabilidade exata,
//                 hipergeométrica)
//   estratificado um registro por tipo (normal e cada caso de borda), em ordem
//                 aleatória, completando com registros ao acaso (média de DRAWS
//                 sorteios)
// Cada composição sozinha (G), com V0 e com V2: o programa é pego se o portão
// falha OU se o validador barra ao menos uma saída errada (X1).
// Métricas por comportamento distinto (representante = 1º programa, como no X1)
// e por programa; programas corretos barrados pelo portão; incompletos barrados;
// rejeição falsa do validador nas saídas de programas aprovados.
// Não faz chamadas de LLM.
// =============================================================================

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { DOMAINS, streamOf } from '../src/streams.js';
import { compile } from '../src/util.js';
import { compareOutput } from '../src/metrics.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const KS = (process.env.KS || '1,3,5,10').split(',').map(Number);
const DRAWS = parseInt(process.env.DRAWS || '500');

const corpus = readFileSync(join(ROOT, 'data/corpus/programs.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
const x1 = JSON.parse(readFileSync(join(ROOT, 'results/x1-real-faults.json'), 'utf8'));
const acc = new Map(x1.perProgram.map(p => [p.id, p.acc]));

// Por programa: vetor de falhas no portão (registro em que o programa não
// reproduz a verdade) sobre os registros da sua assinatura.
const programs = [];
for (const p of corpus.filter(r => r.compiles && r.label !== 'no-records')) {
  const D = DOMAINS.find(d => d.key === p.domain);
  const recs = streamOf(D).filter(e => e.sig === p.sig);
  const fn = compile(p.body);
  const fails = recs.map(e => {
    let o; try { o = fn(e.raw); } catch { o = null; }
    const obj = o && typeof o === 'object';
    if (e.truth.expect === 'reject') return obj;
    return !obj || compareOutput(o, e.truth.output, D.tolerances).length > 0;
  });
  programs.push({ ...p, recs, fails, acc: acc.get(p.id) });
}

// Probabilidade de o portão com k pares pegar o programa, por composição.
function choose(n, k) { let r = 1; for (let i = 0; i < k; i++) r *= (n - i) / (k - i); return r; }
let seed = 4242;
const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };
function shuffle(a) { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; }

const strataCache = new Map();
function strata(p) {
  const key = p.domain + '|' + p.sig;
  if (!strataCache.has(key)) {
    const g = new Map();
    p.recs.forEach((e, i) => { const t = (e.kind || 'normal') + '/' + e.truth.expect; if (!g.has(t)) g.set(t, []); g.get(t).push(i); });
    strataCache.set(key, [...g.values()]);
  }
  return strataCache.get(key);
}
const drawCache = new Map();
function stratifiedDraws(p, k) {
  const key = p.domain + '|' + p.sig + '|' + k;
  if (!drawCache.has(key)) {
    const draws = [];
    for (let d = 0; d < DRAWS; d++) {
      const pick = new Set();
      for (const s of shuffle(strata(p))) { if (pick.size >= k) break; pick.add(s[Math.floor(rnd() * s.length)]); }
      for (const i of shuffle(p.recs.map((_, i) => i))) { if (pick.size >= k) break; pick.add(i); }
      draws.push([...pick]);
    }
    drawCache.set(key, draws);
  }
  return drawCache.get(key);
}

function pCatch(p, how, k) {
  const n = p.recs.length, f = p.fails.filter(Boolean).length;
  if (!f) return 0;
  if (how === 'primeiros') return p.fails.slice(0, k).some(Boolean) ? 1 : 0;
  if (how === 'sorteio') return k >= n ? 1 : 1 - choose(n - f, k) / choose(n, k);
  const draws = stratifiedDraws(p, k);
  return draws.filter(ix => ix.some(i => p.fails[i])).length / draws.length;
}

// Agregação: probabilidade de pegar (portão OU validador) somada sobre os itens.
function aggregate(items, how, k, v) {
  const r = { defective: 0, caught: 0, cleared: 0, correct: 0, correctBlocked: 0, incomplete: 0, incompleteBlocked: 0, rightBlocked: 0, right: 0 };
  for (const p of items) {
    const g = pCatch(p, how, k);
    const a = v ? p.acc?.[v] : null;
    if (p.label === 'defective') {
      r.defective++;
      const vCaught = a ? a.wrongBlocked > 0 : false;
      const vCleared = a ? a.wrongAccepted === 0 : false;
      r.caught += vCaught ? 1 : g;
      r.cleared += vCleared ? 1 : g;
    } else if (p.label === 'correct') { r.correct++; r.correctBlocked += g; }
    else if (p.label === 'incomplete') { r.incomplete++; r.incompleteBlocked += g; }
    if (a) { r.rightBlocked += (1 - g) * a.rightBlocked; r.right += (1 - g) * (a.rightBlocked + a.rightAccepted); }
  }
  r.caughtRate = r.caught / r.defective;
  r.clearedRate = r.cleared / r.defective;
  r.falseRejectionRate = r.right ? r.rightBlocked / r.right : 0;
  return r;
}

const reps = [...programs.reduce((m, x) => (m.has(x.behavior) ? m : m.set(x.behavior, x)), new Map()).values()];
const HOWS = ['primeiros', 'sorteio', 'estratificado'];
const result = { ks: KS, draws: DRAWS, behaviors: {}, programs: {}, perBehavior: [] };
for (const [scope, items] of [['behaviors', reps], ['programs', programs]]) {
  for (const v of [null, 'V0', 'V2']) {
    const vn = v ?? 'G';
    result[scope][vn] = {};
    for (const how of HOWS) for (const k of KS) result[scope][vn][`${how}-${k}`] = aggregate(items, how, k, v);
  }
  result[scope].V2only = aggregate(items, 'primeiros', 0, 'V2');
}
for (const p of reps.filter(x => x.label === 'defective')) {
  result.perBehavior.push({ domain: p.domain, sig: p.sig, failFraction: p.fails.filter(Boolean).length / p.recs.length,
    firstFailAt: p.fails.indexOf(true), v2: p.acc?.V2?.wrongBlocked > 0,
    ...Object.fromEntries(HOWS.flatMap(h => KS.map(k => [`${h}-${k}`, pCatch(p, h, k)]))) });
}
writeFileSync(join(ROOT, 'results/x6-golden.json'), JSON.stringify({ generatedAt: new Date().toISOString(), ...result }, null, 2));

const pct = (x) => (100 * x).toFixed(1).padStart(5) + '%';
for (const scope of ['behaviors', 'programs']) {
  const d = result[scope].G[`primeiros-1`].defective;
  console.log(`\n=== X6 — pares verificados (${scope === 'behaviors' ? 'por comportamento' : 'por programa'}; ${d} defeituosos) ===`);
  console.log(`V2 sozinho: pega ${pct(result[scope].V2only.caughtRate)}  rej. falsa ${pct(result[scope].V2only.falseRejectionRate)}`);
  console.log('composição      k   | G: pega  corretos barr.  incompl. barr. | G+V0: pega | G+V2: pega  limpos  rej.falsa');
  for (const how of HOWS) for (const k of KS) {
    const g = result[scope].G[`${how}-${k}`], g0 = result[scope].V0[`${how}-${k}`], g2 = result[scope].V2[`${how}-${k}`];
    console.log(`${how.padEnd(14)} ${String(k).padStart(3)}   | ${pct(g.caughtRate)}  ${g.correctBlocked.toFixed(1).padStart(6)}/${g.correct}  ${g.incompleteBlocked.toFixed(1).padStart(6)}/${g.incomplete}   | ${pct(g0.caughtRate)}     | ${pct(g2.caughtRate)}  ${pct(g2.clearedRate)}  ${pct(g2.falseRejectionRate)}`);
  }
}
