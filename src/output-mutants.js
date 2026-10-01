// =============================================================================
// output-mutants.js — Variantes erradas de uma saída correta, para o feedback
// do X5. Genérico por tipo de campo, sem nada específico de domínio ou do
// corpus:
//   número            ×10, ÷10, +1
//   data DD/MM/YYYY   ±1 dia
//   timestamp ISO     +1 h, −1 dia
//   texto             troca por outro valor do mesmo campo visto nas saídas
//                     corretas dos exemplos; se não houver, altera o último
//                     caractere (dígito +1 ou letra trocada)
// Só ficam variantes que o oráculo considera erradas (fora da tolerância).
// =============================================================================

import { compareOutput } from './metrics.js';

const DMY = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const r = (x) => Math.round(x * 1e6) / 1e6;

function shiftDMY(s, days) {
  const [, d, m, y] = DMY.exec(s);
  const t = new Date(Date.UTC(+y, +m - 1, +d + days));
  const p = (n) => String(n).padStart(2, '0');
  return `${p(t.getUTCDate())}/${p(t.getUTCMonth() + 1)}/${t.getUTCFullYear()}`;
}
const shiftISO = (s, ms) => new Date(Date.parse(s) + ms).toISOString().replace('.000Z', 'Z');

function bumpLast(s) {
  const c = s.at(-1);
  if (/\d/.test(c)) return s.slice(0, -1) + ((+c + 1) % 10);
  return s.slice(0, -1) + (c === 'x' ? 'y' : 'x');
}

// outputs: saídas corretas de todos os exemplos do domínio (para trocar valores
// de texto por outro valor plausível do mesmo campo).
export function outputMutants(o, outputs, tolerances) {
  const out = [];
  const add = (field, value, how) => {
    const m = { ...o, [field]: value };
    if (compareOutput(m, o, tolerances).length) out.push({ field, how, output: m });
  };
  for (const [k, v] of Object.entries(o)) {
    if (typeof v === 'number') {
      add(k, r(v * 10), '×10');
      add(k, r(v / 10), '÷10');
      add(k, r(v + 1), '+1');
    } else if (typeof v === 'string' && DMY.test(v)) {
      add(k, shiftDMY(v, 1), '+1 dia');
      add(k, shiftDMY(v, -1), '−1 dia');
    } else if (typeof v === 'string' && ISO.test(v)) {
      add(k, shiftISO(v, 3600e3), '+1 h');
      add(k, shiftISO(v, -86400e3), '−1 dia');
    } else if (typeof v === 'string' && v) {
      const other = outputs.map(x => x[k]).find(x => typeof x === 'string' && x !== v);
      add(k, other ?? bumpLast(v), other ? 'outro valor do campo' : 'último caractere alterado');
    }
  }
  return out;
}
