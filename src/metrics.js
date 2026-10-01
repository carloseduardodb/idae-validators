// =============================================================================
// metrics.js — Avaliação contra o oráculo (verdade-terreno por registro).
//
// Cada registro tem truth = { expect: 'accept', output } | { expect: 'reject' }.
// Para cada decisão de uma abordagem:
//   correct        aceito e idêntico à verdade (com tolerância numérica)
//   corrupt        aceito, mas diferente da verdade OU deveria ser rejeitado
//                  (corrupção silenciosa — a "alucinação" medida pelo oráculo)
//   correctReject  rejeitado e deveria ser rejeitado
//   falseReject    rejeitado, mas deveria ser aceito
// =============================================================================

export function compareOutput(out, truth, tolerances = {}) {
  const wrong = [];
  for (const [k, v] of Object.entries(truth)) {
    const o = out?.[k];
    if (typeof v === 'number') {
      const tol = tolerances[k] ?? 0.011;
      if (typeof o !== 'number' || !(Math.abs(o - v) <= tol)) wrong.push(k);
    } else if (v === null) {
      if (o !== null && o !== undefined) wrong.push(k);
    } else if (o !== v) wrong.push(k);
  }
  return wrong;
}

export function classify(decision, truth, tolerances) {
  if (!decision.accepted) return { cls: truth.expect === 'reject' ? 'correctReject' : 'falseReject' };
  if (truth.expect === 'reject') return { cls: 'corrupt', wrong: ['<should-reject>'] };
  const wrong = compareOutput(decision.output, truth.output, tolerances);
  return wrong.length ? { cls: 'corrupt', wrong } : { cls: 'correct' };
}

export function emptyTally() {
  return { n: 0, accepted: 0, correct: 0, corrupt: 0, correctReject: 0, falseReject: 0, fieldErrors: {}, shouldReject: 0 };
}

export function tally(t, decision, truth, tolerances) {
  const c = classify(decision, truth, tolerances);
  t.n++;
  if (truth.expect === 'reject') t.shouldReject++;
  if (decision.accepted) t.accepted++;
  t[c.cls]++;
  for (const f of c.wrong || []) t.fieldErrors[f] = (t.fieldErrors[f] || 0) + 1;
  return c;
}

export function merge(a, b) {
  const r = emptyTally();
  for (const t of [a, b]) {
    for (const k of ['n', 'accepted', 'correct', 'corrupt', 'correctReject', 'falseReject', 'shouldReject']) r[k] += t[k];
    for (const [f, v] of Object.entries(t.fieldErrors)) r.fieldErrors[f] = (r.fieldErrors[f] || 0) + v;
  }
  return r;
}

export function rates(t) {
  const n = t.n || 1;
  return {
    n: t.n,
    accuracy: (t.correct + t.correctReject) / n,          // decisões corretas
    correctRate: t.correct / n,                            // registros entregues corretos
    corruptRate: t.corrupt / n,                            // corrupção silenciosa / n
    corruptAmongAccepted: t.accepted ? t.corrupt / t.accepted : 0,
    falseRejectRate: t.falseReject / n,
    acceptRate: t.accepted / n,
    // "Validade" no sentido do artigo original (aceito pelo sistema):
  };
}
