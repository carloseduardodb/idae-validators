// =============================================================================
// x0b-synth.js — Rodada nova de síntese para ampliar o corpus de falhas reais.
//
// Para cada domínio e cada assinatura de formato do fluxo de avaliação, pede a
// cada modelo um programa a partir de K amostras diferentes (uma por prompt),
// com o prompt de síntese do IDAE. As amostras vêm de um fluxo com semente
// diferente da avaliação (3001), para o programa não ver o registro em que
// será avaliado. USGS: amostras espaçadas dos 560 eventos, nos dois telos.
//
// Cada chamada vai para data/new-logs/x0b-synth.jsonl; rodar de novo pula as
// chamadas já registradas. Depois, `npm run corpus` inclui os programas novos.
// =============================================================================

import { readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { DOMAINS, streamOf, buildStream, signatureOf } from '../src/streams.js';
import { synthesisPrompt } from '../src/prompts.js';
import { pool } from '../src/util.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOG = join(ROOT, 'data/new-logs/x0b-synth.jsonl');
mkdirSync(dirname(LOG), { recursive: true });
process.env.IDAE_LLM_LOG = LOG;
const { chat, snapshotUsage } = await import('../src/llm-client.js');

const MODELS = (process.env.MODELS || 'claude-opus-4.5,claude-haiku-4.5').split(',');
const K = parseInt(process.env.K || '3');
const K_USGS = parseInt(process.env.K_USGS || '4');
const CONC = parseInt(process.env.CONC || '4');
const SYNTH_SEED = 3001;

// Escolhe k amostras variando o tipo de registro (normais e adversariais).
function pickSamples(records, k) {
  const groups = new Map();
  for (const e of records) {
    const g = e.kind || e.phase;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(e.raw);
  }
  const lists = [...groups.values()], out = [];
  for (let round = 0; out.length < k && lists.some(l => l.length > round); round++) {
    for (const l of lists) if (out.length < k && l[round] !== undefined) out.push(l[round]);
  }
  return out;
}

const jobs = [];
for (const D of DOMAINS) {
  const evalSigs = [...new Set(streamOf(D).map(e => e.sig))];
  let source;
  if (D.phases) {
    source = buildStream(D, { seed: SYNTH_SEED }).map(e => ({ ...e, sig: signatureOf(e.raw) }));
  } else {
    source = streamOf(D);
  }
  for (const sig of evalSigs) {
    const recs = source.filter(e => e.sig === sig);
    let samples;
    if (D.phases) samples = pickSamples(recs, K);
    else {
      const step = Math.max(1, Math.floor(recs.length / K_USGS));
      samples = Array.from({ length: Math.min(K_USGS, recs.length) }, (_, j) => recs[j * step].raw);
    }
    for (const sample of samples) {
      for (const model of MODELS) jobs.push({ domain: D.key, sig, model, prompt: synthesisPrompt(D.SPEC, [sample]) });
    }
  }
}

const done = new Set();
if (existsSync(LOG)) {
  for (const line of readFileSync(LOG, 'utf8').split('\n').filter(Boolean)) {
    try { const d = JSON.parse(line); done.add(d.model + '\n' + d.prompt); } catch {}
  }
}
const todo = jobs.filter(j => !done.has(j.model + '\n' + j.prompt));
console.log(`jobs: ${jobs.length}  |  já feitos: ${jobs.length - todo.length}  |  a fazer: ${todo.length}`);
const perDomain = {};
for (const j of jobs) perDomain[j.domain] = (perDomain[j.domain] || 0) + 1;
console.log('por domínio:', perDomain);
if (process.env.DRY) process.exit(0);

let ok = 0, fail = 0;
await pool(todo, CONC, async (j) => {
  try { await chat(j.prompt, { model: j.model }); ok++; } catch (e) { fail++; console.error('erro:', j.domain, j.sig, j.model, e.message.slice(0, 120)); }
  if ((ok + fail) % 20 === 0) console.log(`  ${ok + fail}/${todo.length}  ok=${ok} falhas=${fail}`);
});
console.log(`fim: ok=${ok} falhas=${fail}`, snapshotUsage());
