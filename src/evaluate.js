// =============================================================================
// evaluate.js — Régua comum: aplica validadores às saídas de programas.
//
// Para cada programa (corpo JS) e cada registro da sua assinatura, a saída
// objeto é classificada como certa ou errada pelo oráculo e cada validador
// decide aceitar/barrar. Rejeição do próprio programa (null/erro) não chega
// ao validador. Usada por X1 (falhas reais), X2 (mutantes) e X3 (validadores
// escritos por LLM).
// =============================================================================

import { compile } from './util.js';
import { compareOutput } from './metrics.js';
import { DOMAINS, streamOf } from './streams.js';

const safe = (fn) => (x) => { try { const o = fn(x); return o === undefined ? null : o; } catch { return null; } };
const isObj = (o) => !!o && typeof o === 'object' && !Array.isArray(o);

// validators: { nome: (out, raw, run) => boolean }
export function evaluateProgram(p, validators) {
  const D = DOMAINS.find(d => d.key === p.domain);
  let run;
  try { run = safe(compile(p.body)); } catch { return null; }
  const recs = streamOf(D).filter(e => e.sig === p.sig);
  const acc = {};
  for (const n of Object.keys(validators)) acc[n] = { wrongAccepted: 0, wrongBlocked: 0, rightBlocked: 0, rightAccepted: 0, errors: 0 };
  for (const e of recs) {
    const out = run(e.raw);
    if (!isObj(out)) continue;
    const right = e.truth.expect === 'accept' && compareOutput(out, e.truth.output, D.tolerances).length === 0;
    for (const [n, check] of Object.entries(validators)) {
      let ok;
      try { ok = !!check(out, e.raw, run); } catch { ok = false; acc[n].errors++; }
      acc[n][(right ? 'right' : 'wrong') + (ok ? 'Accepted' : 'Blocked')]++;
    }
  }
  return acc;
}

// items: [{ acc: { nome: contagens } }]
export function aggregate(items, names) {
  const out = {};
  for (const n of names) {
    const it = items.filter(x => x.acc[n] && (x.acc[n].wrongAccepted + x.acc[n].wrongBlocked + x.acc[n].rightAccepted + x.acc[n].rightBlocked) > 0);
    const s = { programs: it.length, wrongAccepted: 0, wrongBlocked: 0, rightBlocked: 0, rightAccepted: 0, defective: 0, caught: 0, cleared: 0, errors: 0 };
    for (const x of it) {
      const a = x.acc[n];
      for (const k of ['wrongAccepted', 'wrongBlocked', 'rightBlocked', 'rightAccepted', 'errors']) s[k] += a[k];
      if (a.wrongAccepted + a.wrongBlocked > 0) {
        s.defective++;
        if (a.wrongBlocked > 0) s.caught++;
        if (a.wrongAccepted === 0) s.cleared++;
      }
    }
    const w = s.wrongAccepted + s.wrongBlocked, r = s.rightAccepted + s.rightBlocked;
    s.caughtWrongRate = w ? s.wrongBlocked / w : null;
    s.falseRejectionRate = r ? s.rightBlocked / r : null;
    s.programsCaughtRate = s.defective ? s.caught / s.defective : null;
    s.programsClearedRate = s.defective ? s.cleared / s.defective : null;
    out[n] = s;
  }
  return out;
}

export const pct = (x) => x === null || x === undefined ? '   -  ' : (100 * x).toFixed(1).padStart(5) + '%';

export function printTable(title, agg, names) {
  console.log(`\n=== ${title} ===`);
  console.log('validador       defeituosos  pegos(≥1)  limpos(todos)  saídas erradas barradas  rejeição falsa');
  for (const n of names) {
    const s = agg[n];
    if (!s || !s.programs) continue;
    console.log(n.padEnd(15) + String(s.defective).padStart(12) + pct(s.programsCaughtRate).padStart(11) + pct(s.programsClearedRate).padStart(15) +
      `${pct(s.caughtWrongRate)} (${s.wrongBlocked}/${s.wrongBlocked + s.wrongAccepted})`.padStart(25) + `${pct(s.falseRejectionRate)} (${s.rightBlocked})`.padStart(17));
  }
}
