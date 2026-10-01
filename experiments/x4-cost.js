// =============================================================================
// x4-cost.js — RQ4: custo de cada estratégia de validador.
//
//   tempo por verificação   mediana e p95 em µs, sobre saídas corretas de
//                           programas corretos (até SAMPLE registros por domínio)
//   execuções extras        chamadas adicionais de programa por registro (V3:
//                           contadas; V4: 1 por registro)
//   linhas de código        do validador (sem linhas vazias e comentários)
//   chamadas de LLM         para criar o validador (V4: 1 síntese extra por
//                           formato; L: 1 por validador; I: 1 + revisões)
// Não faz chamadas de LLM.
// =============================================================================

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { compile } from '../src/util.js';
import { DOMAINS, streamOf } from '../src/streams.js';
import { validatorsFor, llmValidatorsFor, iterValidatorsFor, nversionValidators } from '../src/validators/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SAMPLE = parseInt(process.env.SAMPLE || '300');
const corpus = readFileSync(join(ROOT, 'data/corpus/programs.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);

const loc = (text) => text.split('\n').filter(l => l.trim() && !/^\s*(\/\/|\*|\/\*)/.test(l)).length;
const fnLoc = (file, name) => {
  const s = readFileSync(file, 'utf8');
  const m = new RegExp(`^export function ${name}\\b[\\s\\S]*?^}`, 'm').exec(s);
  return m ? loc(m[0]) : null;
};
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

const result = {};
for (const D of DOMAINS) {
  // Registros de programas corretos, espalhados pelas assinaturas.
  const cases = [];
  const bySig = new Map();
  for (const p of corpus.filter(r => r.compiles && r.label === 'correct')) if (!bySig.has(p.sig)) bySig.set(p.sig, p);
  const per = Math.ceil(SAMPLE / bySig.size);
  for (const p of bySig.values()) {
    const fn = compile(p.body);
    let calls = 0;
    const run = (x) => { calls++; try { return fn(x); } catch { return null; } };
    const recs = streamOf(D).filter(e => e.sig === p.sig && e.truth.expect === 'accept').slice(0, per);
    for (const e of recs) {
      const out = run(e.raw);
      if (out && typeof out === 'object') cases.push({ p, out, raw: e.raw, run, count: () => calls, reset: () => { calls = 0; } });
    }
  }

  const V = { ...(await validatorsFor(D.key)), ...llmValidatorsFor(D.key).validators, ...iterValidatorsFor(D.key).validators };
  const r = {};
  for (const [n, check] of Object.entries(V)) {
    const times = [], extra = [];
    for (const c of cases) {
      c.reset();
      const t0 = process.hrtime.bigint();
      try { check(c.out, c.raw, c.run); } catch {}
      times.push(Number(process.hrtime.bigint() - t0) / 1000);
      extra.push(c.count());
    }
    r[n] = { n: times.length, medianUs: q(times, 0.5), p95Us: q(times, 0.95), extraRunsMean: extra.reduce((s, v) => s + v, 0) / extra.length };
  }
  // V4: um parceiro qualquer, mesma medição
  const times4 = [];
  for (const c of cases.slice(0, 100)) {
    const v4 = Object.values(nversionValidators(c.p, corpus, 1))[0];
    if (!v4) continue;
    const t0 = process.hrtime.bigint();
    try { v4(c.out, c.raw); } catch {}
    times4.push(Number(process.hrtime.bigint() - t0) / 1000);
  }
  if (times4.length) r.V4 = { n: times4.length, medianUs: q(times4, 0.5), p95Us: q(times4, 0.95), extraRunsMean: 1 };

  // Linhas de código e chamadas de LLM para criar
  const dom = join(ROOT, 'src/domains', D.key.startsWith('usgs') ? 'usgs.js' : `${D.key === 'financial' ? 'financial' : 'iot'}.js`);
  const v0name = D.key === 'usgs-corrected' ? 'validatorCorrected' : D.key === 'usgs-strict' ? 'validatorOriginal' : 'validator';
  const blind = readFileSync(join(ROOT, 'src/validators/blind', `${D.key}.js`), 'utf8');
  r.V0.loc = fnLoc(dom, v0name); r.V0.llmCallsToCreate = 0;
  r.V1.llmCallsToCreate = 0;
  r.V2.loc = loc(blind); r.V2.llmCallsToCreate = 0; r.V2.note = 'LOC do módulo inteiro (V2 e V3 compartilham helpers)';
  r.V3.llmCallsToCreate = 0;
  if (r.V4) { r.V4.llmCallsToCreate = 'uma síntese extra por formato'; }
  const llmDir = join(ROOT, 'data/llm-validators', D.key);
  const llmLoc = readdirSync(llmDir).map(f => loc(readFileSync(join(llmDir, f), 'utf8')));
  r.llmLocMedian = q(llmLoc, 0.5);
  const iterDir = join(ROOT, 'data/llm-validators-iter', D.key, 'final');
  if (existsSync(iterDir)) {
    r.iterLocMedian = q(readdirSync(iterDir).map(f => loc(readFileSync(join(iterDir, f), 'utf8'))), 0.5);
    const sum = JSON.parse(readFileSync(join(ROOT, 'data/llm-validators-iter/summary.json'), 'utf8')).summary.filter(x => x.domain === D.key);
    r.iterCallsMean = sum.reduce((t, x) => t + x.rounds.length, 0) / sum.length;
  }
  result[D.key] = r;
}

writeFileSync(join(ROOT, 'results/x4-cost.json'), JSON.stringify({ generatedAt: new Date().toISOString(), node: process.version, result }, null, 2));

console.log('=== X4 — custo por verificação (µs, mediana / p95) e execuções extras do programa por registro ===');
for (const [d, r] of Object.entries(result)) {
  const L = Object.keys(r).filter(n => n.startsWith('L:'));
  const lt = L.map(n => r[n].medianUs);
  const I = Object.keys(r).filter(n => n.startsWith('I:'));
  console.log(`\n${d}  (LOC: V0 ${r.V0.loc}, módulo V2/V3 ${r.V2.loc}, LLM mediana ${r.llmLocMedian})`);
  for (const n of ['V0', 'V1', 'V2', 'V3', 'V23', 'V4']) if (r[n]) console.log(`  ${n.padEnd(4)} ${r[n].medianUs.toFixed(1).padStart(8)} / ${r[n].p95Us.toFixed(1).padStart(8)} µs   execuções extras ${r[n].extraRunsMean.toFixed(2)}`);
  console.log(`  L:*  mediana das medianas ${q(lt, 0.5).toFixed(1)} µs (${L.length} validadores)`);
  if (I.length) console.log(`  I:*  mediana das medianas ${q(I.map(n => r[n].medianUs), 0.5).toFixed(1)} µs (${I.length} validadores; LOC mediana ${r.iterLocMedian}; chamadas médias para criar ${r.iterCallsMean.toFixed(1)})`);
}
