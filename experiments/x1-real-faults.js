// =============================================================================
// x1-real-faults.js — RQ1: força de cada validador contra as falhas reais do
// corpus. Cada programa é executado sobre os registros da sua assinatura e
// cada validador decide, por registro, se a saída seria aceita (o IDAE aplica
// o validador a toda saída, inclusive às amortizadas).
//
// Por validador:
//   pegos(≥1)       programas defeituosos com ao menos uma saída errada
//                   barrada (o IDAE descartaria o programa)
//   limpos(todos)   programas defeituosos com TODAS as saídas erradas barradas
//   saídas erradas barradas / rejeição falsa (saídas corretas barradas)
// Tudo reportado por programa único e por comportamento distinto.
// Inclui V4 (N-version) e, se existirem, os validadores escritos por LLM (X3)
// e suas versões revisadas com autoverificação (X5).
// Não faz chamadas de LLM.
// =============================================================================

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { DOMAINS } from '../src/streams.js';
import { validatorsFor, llmValidatorsFor, iterValidatorsFor, nversionValidators } from '../src/validators/index.js';
import { evaluateProgram, aggregate, printTable } from '../src/evaluate.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const corpus = readFileSync(join(ROOT, 'data/corpus/programs.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
const rows = corpus.filter(r => r.compiles && r.label !== 'no-records');

const V = {}, broken = {};
for (const D of DOMAINS) {
  const llm = llmValidatorsFor(D.key), iter = iterValidatorsFor(D.key);
  V[D.key] = { ...(await validatorsFor(D.key)), ...llm.validators, ...iter.validators };
  broken[D.key] = [...llm.broken, ...iter.broken];
}

const perProgram = [];
let i = 0;
for (const p of rows) {
  const acc = evaluateProgram(p, { ...V[p.domain], ...nversionValidators(p, corpus) });
  if (acc) perProgram.push({ id: p.id, domain: p.domain, sig: p.sig, label: p.label, behavior: p.behavior, models: p.models, acc });
  if (++i % 200 === 0) console.error(`  ${i}/${rows.length}`);
}
const isLlm = (n) => /^[LI]:/.test(n);
const NAMES = [...new Set(perProgram.flatMap(x => Object.keys(x.acc)))].sort((a, b) => (isLlm(a) - isLlm(b)) || a.localeCompare(b));

// Um representante por comportamento distinto (o primeiro no corpus).
const reps = [...perProgram.reduce((m, x) => (m.has(x.behavior) ? m : m.set(x.behavior, x)), new Map()).values()];

const result = { generatedAt: new Date().toISOString(), validators: NAMES, brokenLlmValidators: broken, byDomain: {}, total: {} };
for (const [scope, items] of [['programs', perProgram], ['behaviors', reps]]) {
  result.total[scope] = aggregate(items, NAMES);
  for (const D of DOMAINS) (result.byDomain[D.key] ??= {})[scope] = aggregate(items.filter(x => x.domain === D.key), NAMES);
}
writeFileSync(join(ROOT, 'results/x1-real-faults.json'), JSON.stringify({ ...result, perProgram }, null, 2));

const base = NAMES.filter(n => !isLlm(n));
printTable('X1 — por comportamento distinto', result.total.behaviors, base);
printTable('X1 — por programa único', result.total.programs, base);
