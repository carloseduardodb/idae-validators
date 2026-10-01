// =============================================================================
// x3-llm-validators.js — RQ3: validadores escritos pelo próprio LLM.
//
// Cada modelo recebe o MESMO material que o agente que escreveu V2 recebeu
// (telos + um exemplo normal por formato) e escreve o corpo de
// property(o, raw). N implementações independentes por domínio e modelo.
// As respostas vão para data/new-logs/x3-validators.jsonl e o código
// extraído para data/llm-validators/<domínio>/<modelo>-<k>.js.
// Rodar de novo pula as chamadas já registradas.
// =============================================================================

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { DOMAINS } from '../src/streams.js';
import { validatorPrompt } from '../src/prompts.js';
import { cleanCode, pool } from '../src/util.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOG = join(ROOT, 'data/new-logs/x3-validators.jsonl');
mkdirSync(dirname(LOG), { recursive: true });
process.env.IDAE_LLM_LOG = LOG;
const { chat, snapshotUsage } = await import('../src/llm-client.js');

const MODELS = (process.env.MODELS || 'claude-opus-4.5,claude-haiku-4.5').split(',');
const N = parseInt(process.env.N || '10');
const CONC = parseInt(process.env.CONC || '4');

const jobs = [];
for (const D of DOMAINS) for (const model of MODELS) for (let k = 1; k <= N; k++) {
  jobs.push({ domain: D.key, model, k, prompt: validatorPrompt(D, k) });
}

const done = new Map();
if (existsSync(LOG)) {
  for (const line of readFileSync(LOG, 'utf8').split('\n').filter(Boolean)) {
    try { const d = JSON.parse(line); done.set(d.model + '\n' + d.prompt, d.response); } catch {}
  }
}
const todo = jobs.filter(j => !done.has(j.model + '\n' + j.prompt));
console.log(`jobs: ${jobs.length}  |  já feitos: ${jobs.length - todo.length}  |  a fazer: ${todo.length}`);
if (process.env.DRY) process.exit(0);

let ok = 0, fail = 0;
await pool(todo, CONC, async (j) => {
  try { done.set(j.model + '\n' + j.prompt, await chat(j.prompt, { model: j.model })); ok++; }
  catch (e) { fail++; console.error('erro:', j.domain, j.model, j.k, e.message.slice(0, 120)); }
  if ((ok + fail) % 10 === 0) console.log(`  ${ok + fail}/${todo.length}  ok=${ok} falhas=${fail}`);
});

let written = 0;
for (const j of jobs) {
  const text = done.get(j.model + '\n' + j.prompt);
  if (!text) continue;
  const dir = join(ROOT, 'data/llm-validators', j.domain);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${j.model}-${String(j.k).padStart(2, '0')}.js`), cleanCode(text) + '\n');
  written++;
}
console.log(`fim: ok=${ok} falhas=${fail} arquivos=${written}`, snapshotUsage());
