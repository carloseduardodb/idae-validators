// =============================================================================
// x5-iterative-validators.js — RQ3b: o validador escrito por LLM melhora se o
// LLM puder iterar com autoverificação, como o agente que escreveu V2?
//
// Parte de cada um dos 80 validadores do X3 (rodada 1: mesmo prompt, mesma
// resposta, lida do log do X3) e faz até ROUNDS−1 revisões. A cada rodada o
// validador é executado contra os MESMOS exemplos do prompt (um por formato):
//   - a saída correta de cada exemplo precisa ser aceita;
//   - variantes erradas dessas saídas (src/output-mutants.js: mutador genérico
//     por tipo de campo) deveriam ser barradas;
//   - erros de compilação/execução são reportados.
// Nada do corpus (programas, defeitos, mutantes do X2) entra no feedback.
// Para quando não há falhas ou na rodada ROUNDS. A versão final é a de menor
// (rejeições falsas, variantes aceitas) na autoverificação; empate → a mais
// recente. Congela em data/llm-validators-iter/<domínio>/final/ e todas as
// rodadas em .../rounds/. Rodar de novo reusa as chamadas do log.
// =============================================================================

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { DOMAINS, streamOf } from '../src/streams.js';
import { cleanCode, pool } from '../src/util.js';
import { validatorPrompt } from '../src/prompts.js';
import { compileValidator } from '../src/validators/index.js';
import { outputMutants } from '../src/output-mutants.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOG = join(ROOT, 'data/new-logs/x5-validators.jsonl');
const OUT = join(ROOT, 'data/llm-validators-iter');
mkdirSync(dirname(LOG), { recursive: true });
process.env.IDAE_LLM_LOG = LOG;
const { chat, snapshotUsage } = await import('../src/llm-client.js');

const MODELS = (process.env.MODELS || 'claude-opus-4.5,claude-haiku-4.5').split(',');
const N = parseInt(process.env.N || '10');
const ROUNDS = parseInt(process.env.ROUNDS || '5');
const CONC = parseInt(process.env.CONC || '4');
const SHOW_FR = 4, SHOW_WA = 6;

// Exemplos do prompt com a saída correta (a mesma que o agente de V2 derivou
// à mão da especificação) e as variantes erradas.
function selfCheckCases(D) {
  const seen = new Set(), ex = [];
  for (const e of streamOf(D)) {
    if (e.kind || e.truth.expect !== 'accept' || seen.has(e.sig)) continue;
    seen.add(e.sig);
    ex.push({ raw: e.raw, output: e.truth.output });
  }
  const outputs = ex.map(x => x.output);
  return ex.map(x => ({ ...x, wrong: outputMutants(x.output, outputs, D.tolerances) }));
}

function selfCheck(code, cases) {
  let check;
  try { check = compileValidator(code); } catch (e) { return { compileError: e.message, fr: [], wa: [], nRight: cases.length, nWrong: cases.reduce((s, c) => s + c.wrong.length, 0) }; }
  const run = (o, raw) => { try { return { ok: check(o, raw) }; } catch (e) { return { ok: false, error: e.message }; } };
  const fr = [], wa = [];
  let nWrong = 0;
  for (const c of cases) {
    const r = run(c.output, c.raw);
    if (!r.ok) fr.push({ raw: c.raw, output: c.output, error: r.error });
    for (const w of c.wrong) {
      nWrong++;
      if (run(w.output, c.raw).ok) wa.push({ raw: c.raw, output: w.output, field: w.field, how: w.how });
    }
  }
  return { fr, wa, nRight: cases.length, nWrong };
}

const short = (s, n = 400) => (s.length > n ? s.slice(0, n) + '…' : s);

function feedbackPrompt(D, k, code, sc) {
  const lines = [];
  if (sc.compileError) lines.push(`It does not compile: ${sc.compileError}`);
  if (sc.fr.length) {
    lines.push(`Correct outputs it REJECTED (${sc.fr.length} of ${sc.nRight}; it must accept these):`);
    for (const f of sc.fr.slice(0, SHOW_FR)) {
      lines.push(`  input: ${short(f.raw)}`, `  correct output: ${JSON.stringify(f.output)}`);
      if (f.error) lines.push(`  (it threw: ${short(f.error, 200)})`);
    }
  }
  if (sc.wa.length) {
    lines.push(`Wrong outputs it ACCEPTED (${sc.wa.length} of ${sc.nWrong}; each differs from the correct output in one field, so it should reject them):`);
    for (const w of sc.wa.slice(0, SHOW_WA)) {
      lines.push(`  input: ${short(w.raw)}`, `  wrong output (${w.field} ${w.how}): ${JSON.stringify(w.output)}`);
    }
  }
  return `${validatorPrompt(D, k)}

Your current validator (function body):
${code}

It was run automatically on the example inputs above, against the correct output of each example and against wrong variants of those outputs. Results:
${lines.join('\n')}

Revise the validator. It must accept every correct output; among the rules that keep it that way, it should reject as many wrong outputs as possible. Keep following all the rules above (in particular, treat raw as an opaque string: other input formats will appear). Return ONLY the revised function body.`;
}

const done = new Map();
for (const f of [join(ROOT, 'data/new-logs/x3-validators.jsonl'), LOG]) {
  if (!existsSync(f)) continue;
  for (const line of readFileSync(f, 'utf8').split('\n').filter(Boolean)) {
    try { const d = JSON.parse(line); done.set(d.model + '\n' + d.prompt, d.response); } catch {}
  }
}
let calls = 0, reused = 0, failures = 0;
async function ask(model, prompt) {
  const key = model + '\n' + prompt;
  if (done.has(key)) { reused++; return done.get(key); }
  if (process.env.DRY) throw new Error('DRY');
  const text = await chat(prompt, { model });
  done.set(key, text); calls++;
  return text;
}

const CASES = Object.fromEntries(DOMAINS.map(D => [D.key, selfCheckCases(D)]));
const jobs = [];
for (const D of DOMAINS) for (const model of MODELS) for (let k = 1; k <= N; k++) jobs.push({ D, model, k });

const summary = [];
await pool(jobs, CONC, async ({ D, model, k }) => {
  const name = `${model}-${String(k).padStart(2, '0')}`;
  const rounds = [];
  try {
    let code = cleanCode(await ask(model, validatorPrompt(D, k)));
    for (let r = 1; ; r++) {
      const sc = selfCheck(code, CASES[D.key]);
      rounds.push({ round: r, code, compileError: sc.compileError ?? null, falseRejections: sc.fr.length, wrongAccepted: sc.wa.length, nRight: sc.nRight, nWrong: sc.nWrong });
      if ((!sc.compileError && !sc.fr.length && !sc.wa.length) || r >= ROUNDS) break;
      code = cleanCode(await ask(model, feedbackPrompt(D, k, code, sc)));
    }
  } catch (e) {
    if (e.message !== 'DRY') { failures++; console.error('erro:', D.key, name, e.message.slice(0, 120)); }
  }
  if (!rounds.length) return;
  const score = (x) => [x.compileError ? 1 : 0, x.falseRejections, x.wrongAccepted];
  const best = rounds.reduce((b, x) => {
    const [a1, a2, a3] = score(x), [b1, b2, b3] = score(b);
    return a1 < b1 || (a1 === b1 && (a2 < b2 || (a2 === b2 && a3 <= b3))) ? x : b;
  });
  const dir = join(OUT, D.key);
  mkdirSync(join(dir, 'final'), { recursive: true });
  mkdirSync(join(dir, 'rounds'), { recursive: true });
  for (const x of rounds) writeFileSync(join(dir, 'rounds', `${name}-r${x.round}.js`), x.code + '\n');
  writeFileSync(join(dir, 'final', `${name}.js`), best.code + '\n');
  summary.push({ domain: D.key, model, k, chosenRound: best.round, rounds: rounds.map(({ code, ...x }) => x) });
  if (summary.length % 10 === 0) console.log(`  ${summary.length}/${jobs.length} validadores  chamadas novas=${calls}`);
});

summary.sort((a, b) => a.domain.localeCompare(b.domain) || a.model.localeCompare(b.model) || a.k - b.k);
writeFileSync(join(OUT, 'summary.json'), JSON.stringify({ rounds: ROUNDS, summary }, null, 2));

console.log(`\nfim: validadores=${summary.length}/${jobs.length} chamadas novas=${calls} reusadas=${reused} falhas=${failures}`, snapshotUsage());
for (const D of DOMAINS) for (const m of MODELS) {
  const s = summary.filter(x => x.domain === D.key && x.model === m);
  if (!s.length) continue;
  const first = s.map(x => x.rounds[0]), fin = s.map(x => x.rounds.find(r => r.round === x.chosenRound));
  const clean = (a) => a.filter(r => !r.compileError && !r.falseRejections).length;
  const wa = (a) => a.reduce((t, r) => t + r.wrongAccepted, 0) / a.reduce((t, r) => t + r.nWrong, 0);
  console.log(`${D.key.padEnd(15)} ${m.padEnd(17)} aceitam todos os corretos: ${clean(first)}→${clean(fin)}/${s.length}   variantes aceitas: ${(100 * wa(first)).toFixed(1)}%→${(100 * wa(fin)).toFixed(1)}%   rodadas médias ${(s.reduce((t, x) => t + x.rounds.length, 0) / s.length).toFixed(1)}`);
}
