// =============================================================================
// x0-corpus.js — Monta o corpus de programas sintetizados a partir dos logs do
// IDAE, deduplica, reexecuta cada programa contra o oráculo e salva:
//   data/corpus/programs.jsonl   um programa por linha (código + rótulo)
//   results/x0-corpus.json       resumo por domínio, modelo e rótulo
// Não faz chamadas de LLM.
// =============================================================================

import { mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readLogs, dedupe, evaluate } from '../src/corpus.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOG_DIRS = ['data/idae-logs', 'data/new-logs'];

const entries = [], skipped = {};
for (const dir of LOG_DIRS) {
  const r = readLogs(join(ROOT, dir));
  entries.push(...r.entries.map(e => ({ ...e, log: `${dir.split('/')[1]}/${e.log}` })));
  for (const [k, v] of Object.entries(r.skipped)) skipped[k] = (skipped[k] || 0) + v;
}
const programs = dedupe(entries);
console.log(`respostas de síntese: ${entries.length}  |  programas únicos: ${programs.length}`);
console.log('descartadas:', skipped);

const rows = [];
for (const p of programs) {
  const r = evaluate(p);
  const { perRecord, ...summary } = r;
  rows.push({ ...p, ...summary, perRecord });
}

mkdirSync(join(ROOT, 'data/corpus'), { recursive: true });
writeFileSync(join(ROOT, 'data/corpus/programs.jsonl'), rows.map(r => JSON.stringify(r)).join('\n') + '\n');

// Resumo
const key = (r) => `${r.domain}`;
const models = (r) => Object.keys(r.models).sort().join('+');
const summary = {};
for (const r of rows) {
  const k = key(r);
  summary[k] ??= { programs: 0, byModel: {}, labels: {}, behaviors: {}, compileErrors: 0, records: { right: 0, wrong: 0, miss: 0 }, wrongFields: {}, sigs: {} };
  const s = summary[k];
  s.programs++;
  if (r.compiles) (s.behaviors[r.label] ??= new Set()).add(r.behavior);
  s.byModel[models(r)] = (s.byModel[models(r)] || 0) + 1;
  if (!r.compiles) { s.compileErrors++; s.labels['no-compile'] = (s.labels['no-compile'] || 0) + 1; continue; }
  s.labels[r.label] = (s.labels[r.label] || 0) + 1;
  s.sigs[r.sig] = (s.sigs[r.sig] || 0) + 1;
  for (const b of ['right', 'wrong', 'miss']) s.records[b] += r[b];
  for (const [f, v] of Object.entries(r.wrongFields)) s.wrongFields[f] = (s.wrongFields[f] || 0) + v;
}

const byModelLabel = {};
for (const r of rows) {
  for (const m of Object.keys(r.models)) {
    byModelLabel[m] ??= {};
    const l = r.compiles ? r.label : 'no-compile';
    byModelLabel[m][l] = (byModelLabel[m][l] || 0) + 1;
  }
}

for (const s of Object.values(summary)) {
  s.behaviors = Object.fromEntries(Object.entries(s.behaviors).map(([l, set]) => [l, set.size]));
}

writeFileSync(join(ROOT, 'results/x0-corpus.json'), JSON.stringify({
  generatedAt: new Date().toISOString(), tz: process.env.TZ || null,
  responses: entries.length, uniquePrograms: programs.length, skipped, byDomain: summary, byModelLabel,
}, null, 2));

console.log('\ndomínio'.padEnd(18) + 'progs'.padStart(6) + '  correct  incompl.  defect.  no-rec  no-comp');
for (const [k, s] of Object.entries(summary)) {
  const L = (l) => String(s.labels[l] || 0).padStart(9);
  console.log(k.padEnd(17) + String(s.programs).padStart(6) + L('correct') + L('incomplete') + L('defective') + L('no-records') + L('no-compile'));
}
console.log('\ncomportamentos distintos (programas com o mesmo resultado por registro contam uma vez):');
for (const [k, s] of Object.entries(summary)) console.log(' ', k.padEnd(16), JSON.stringify(s.behaviors));
console.log('\npor modelo (um programa pode vir de mais de um modelo):');
for (const [m, l] of Object.entries(byModelLabel)) console.log(' ', m.padEnd(20), JSON.stringify(l));
console.log('\ncampos errados por domínio:');
for (const [k, s] of Object.entries(summary)) console.log(' ', k.padEnd(16), JSON.stringify(s.wrongFields));
