// =============================================================================
// corpus.js — Corpus de programas realmente sintetizados por LLM.
//
// Fonte: logs JSONL do IDAE (cada linha = prompt + resposta do modelo).
// Uma resposta entra no corpus quando o prompt é de síntese de programa sob
// o telos final de um dos domínios com oráculo. O programa é associado à
// assinatura de formato da amostra do prompt e reexecutado contra todos os
// registros dessa assinatura no fluxo de avaliação do domínio — exatamente
// os registros aos quais o IDAE o aplicaria por amortização.
//
// Comportamento por registro (independente de qualquer validador):
//   right   saída igual à verdade, ou null/erro quando deveria rejeitar
//   wrong   saída diferente da verdade, ou saída quando deveria rejeitar
//   miss    null/erro quando deveria aceitar
// =============================================================================

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import { cleanCode, compile } from './util.js';
import { compareOutput } from './metrics.js';
import { DOMAINS, streamOf, signatureOf } from './streams.js';

const SYNTH_HEAD = 'You are a code generator. Write ONLY the body of a JavaScript function that receives a single parameter called "entry" (a raw input string) and returns the target record';
const SAMPLE_HEAD = 'Sample input(s) — the function must handle inputs in this same format:\n';

export function normalizeCode(body) {
  return body
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:\\])\/\/.*$/gm, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

export const hashCode = (body) => createHash('sha1').update(normalizeCode(body)).digest('hex').slice(0, 12);

function sampleOf(prompt) {
  const i = prompt.indexOf(SAMPLE_HEAD);
  if (i < 0) return null;
  const rest = prompt.slice(i + SAMPLE_HEAD.length);
  const end = rest.search(/\n(\nThis is independent implementation|\nCRITICAL RULES:)/);
  return (end < 0 ? rest : rest.slice(0, end)).trim();
}

// Lê os logs e devolve { entries, skipped }: uma entrada por resposta de síntese.
export function readLogs(dir) {
  const entries = [], skipped = {};
  const skip = (why) => { skipped[why] = (skipped[why] || 0) + 1; };
  for (const file of readdirSync(dir).filter(f => f.endsWith('.jsonl')).sort()) {
    const lines = readFileSync(join(dir, file), 'utf8').split('\n').filter(Boolean);
    lines.forEach((line, lineNo) => {
      let d;
      try { d = JSON.parse(line); } catch { return skip('linha-invalida'); }
      if (typeof d.prompt !== 'string' || typeof d.response !== 'string') return skip('sem-prompt-ou-resposta');
      if (!d.prompt.startsWith(SYNTH_HEAD)) return skip('nao-e-sintese-sob-telos');
      const domain = DOMAINS.find(D => d.prompt.includes(D.SPEC));
      if (!domain) return skip('telos-fora-dos-dominios');
      const sample = sampleOf(d.prompt);
      if (!sample) return skip('sem-amostra');
      entries.push({
        log: file, line: lineNo + 1, model: d.model, domain: domain.key,
        variant: +(/independent implementation #(\d+)/.exec(d.prompt)?.[1] ?? 1),
        sample, sig: signatureOf(sample), body: cleanCode(d.response),
      });
    });
  }
  return { entries, skipped };
}

// Agrupa respostas idênticas (código normalizado + domínio + assinatura).
export function dedupe(entries) {
  const byKey = new Map();
  for (const e of entries) {
    const key = `${e.domain}|${e.sig}|${hashCode(e.body)}`;
    if (!byKey.has(key)) {
      byKey.set(key, {
        id: `${e.domain}:${hashCode(e.body)}:${e.sig}`, hash: hashCode(e.body), domain: e.domain, sig: e.sig,
        body: e.body, sample: e.sample, models: {}, occurrences: [],
      });
    }
    const p = byKey.get(key);
    p.models[e.model] = (p.models[e.model] || 0) + 1;
    p.occurrences.push(`${e.log}:${e.line}`);
  }
  return [...byKey.values()];
}

// Executa um programa sobre os registros da sua assinatura e classifica cada um.
export function evaluate(program) {
  const D = DOMAINS.find(x => x.key === program.domain);
  const recs = streamOf(D).filter(e => e.sig === program.sig);
  let fn;
  try { fn = compile(program.body); } catch (err) {
    return { compiles: false, error: String(err.message).slice(0, 200), n: recs.length, right: 0, wrong: 0, miss: 0, perRecord: [] };
  }
  const res = { compiles: true, n: recs.length, right: 0, wrong: 0, miss: 0, crashes: 0, nulls: 0, wrongFields: {}, perRecord: [] };
  for (const e of recs) {
    let out;
    try { out = fn(e.raw); } catch { out = undefined; res.crashes++; }
    if (out === null) res.nulls++;
    const isObj = !!out && typeof out === 'object' && !Array.isArray(out);
    let b, wrong = [];
    if (e.truth.expect === 'reject') {
      b = isObj ? 'wrong' : 'right';
      if (isObj) wrong = ['<should-reject>'];
    } else if (!isObj) b = 'miss';
    else {
      wrong = compareOutput(out, e.truth.output, D.tolerances);
      b = wrong.length ? 'wrong' : 'right';
    }
    res[b]++;
    for (const f of wrong) res.wrongFields[f] = (res.wrongFields[f] || 0) + 1;
    res.perRecord.push({ phase: e.phase, idx: e.idx, b });
  }
  res.label = !res.n ? 'no-records' : res.wrong ? 'defective' : res.miss ? 'incomplete' : 'correct';
  // Impressão digital de comportamento: programas com código diferente mas
  // mesmo resultado por registro não são falhas independentes.
  res.behavior = createHash('sha1')
    .update(program.domain + '|' + program.sig + '|' + res.perRecord.map(x => x.b[0]).join('') + '|' + JSON.stringify(Object.entries(res.wrongFields).sort()))
    .digest('hex').slice(0, 12);
  return res;
}
