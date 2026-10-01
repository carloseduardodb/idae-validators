// =============================================================================
// prompts.js — Prompt de síntese do IDAE, copiado sem alterações de
// idae/src/approaches/index.js (commit e460355), para que os programas novos
// sejam comparáveis aos do corpus original.
// =============================================================================

import { streamOf } from './streams.js';

export function synthesisPrompt(spec, samples, variant = 1) {
  return `You are a code generator. Write ONLY the body of a JavaScript function that receives a single parameter called "entry" (a raw input string) and returns the target record described below — or returns null if the record must be rejected.

${spec}

Sample input(s) — the function must handle inputs in this same format:
${samples.map(s => s.length > 1500 ? s.slice(0, 1500) : s).join('\n')}
${variant > 1 ? `\nThis is independent implementation #${variant}: write your own solution from scratch.\n` : ''}
CRITICAL RULES:
- Return ONLY the function body code. No function declaration, no markdown, no explanation.
- The parameter is called "entry" and is a string.
- Numbers must be actual numbers (not strings).
- Do NOT use require() or import.`;
}

// Prompt do validador escrito por LLM (X3; também a 1ª rodada do X5).
export function validatorExamples(D) {
  const seen = new Set(), out = [];
  for (const e of streamOf(D)) {
    if (e.kind || e.truth.expect !== 'accept' || seen.has(e.sig)) continue;
    seen.add(e.sig);
    out.push(e.raw.slice(0, 1200));
  }
  return out;
}

export function validatorPrompt(D, k) {
  return `You are writing an acceptance validator. A program synthesized by an LLM converts ONE raw input string into ONE target record. Before the program's output is accepted, your validator checks it. The same program is reused for every later input of the same format, so a wrong-but-well-formed output that your validator accepts becomes silent data corruption at scale.

${D.SPEC}

Example inputs (ordinary, valid; one per input format seen so far):
${validatorExamples(D).join('\n')}

Write ONLY the body of a JavaScript function with two parameters: "o" (the output record, a JSON object) and "raw" (the raw input string). Return true if o is an acceptable output for raw, false otherwise.
Check the output format required above AND relations between the output and the input (values, identifiers, dates, derived fields) implied by the specification.
${k > 1 ? `\nThis is independent implementation #${k}: write your own solution from scratch.\n` : ''}
CRITICAL RULES:
- Treat raw as an opaque string: new input formats will appear, so do NOT depend on specific field names, key order, delimiters, tags or column positions of the examples; use generic string/regex searches.
- Do not reimplement the whole conversion; check necessary conditions that a correct output satisfies.
- Never reject a correct output.
- Return ONLY the function body code. No function declaration, no markdown, no explanation.
- Do NOT use require() or import.`;
}
