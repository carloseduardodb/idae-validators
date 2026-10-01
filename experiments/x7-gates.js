// =============================================================================
// x7-gates.js — RQ6: o que cada portão de aceitação faz com os defeitos,
// separados pelo impacto na tarefa (X7, escopo formato).
//
// Para cada portão e cada comportamento defeituoso, p = probabilidade de o
// portão pegar o programa (V0, V2 e o oráculo exato são 0/1; os pares
// verificados vêm do X6 do artigo anterior, com probabilidade exata ou média
// de sorteios). Reporta o número esperado de comportamentos:
//   rejeitados à toa   inofensivos que o portão rejeita (custo de ressíntese)
//   aceitos com dano   não inofensivos que o portão aceita (dano na tarefa)
// com duas definições de inofensivo: todas as tarefas, ou todas as não estritas.
// Não faz chamadas de LLM.
// =============================================================================

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const x7 = JSON.parse(readFileSync(join(ROOT, 'results/x7-task-impact.json'), 'utf8'));
const x6 = JSON.parse(readFileSync(join(ROOT, 'results/x6-golden.json'), 'utf8'));
const x1 = JSON.parse(readFileSync(join(ROOT, 'results/x1-real-faults.json'), 'utf8'));
const acc = new Map(x1.perProgram.map(p => [p.id, p.acc]));

const reps = x7.defectiveReps;
const repIds = [...x7.perProgram.reduce((m, x) => (m.has(x.behavior) ? m : m.set(x.behavior, x.id)), new Map()).values()];
const idOf = new Map(x7.perProgram.filter(x => repIds.includes(x.id)).map(x => [x.behavior, x.id]));
reps.forEach((r, i) => { if (x6.perBehavior[i].domain !== r.domain || x6.perBehavior[i].sig !== r.sig) throw new Error('X6 desalinhado'); });

const caught = (r, v) => (acc.get(idOf.get(r.behavior))?.[v]?.wrongBlocked > 0 ? 1 : 0);
const either = (a, b) => 1 - (1 - a) * (1 - b);
const GATES = {
  'V0 formato': (r) => caught(r, 'V0'),
  'V2 propriedades': (r) => caught(r, 'V2'),
  'G primeiro par': (r, i) => x6.perBehavior[i]['primeiros-1'],
  'G 3 sorteados': (r, i) => x6.perBehavior[i]['sorteio-3'],
  'G primeiro par + V2': (r, i) => either(x6.perBehavior[i]['primeiros-1'], caught(r, 'V2')),
  'G 3 sorteados + V2': (r, i) => either(x6.perBehavior[i]['sorteio-3'], caught(r, 'V2')),
  'Oráculo exato': () => 1,
};

const result = {};
for (const [def, harmless] of [['todas', r => r.verdict.formato.class === 'inofensivo'], ['nao-estritas', r => r.verdict.formato.laxAllOk]]) {
  result[def] = { harmless: reps.filter(harmless).length, harmful: reps.filter(r => !harmless(r)).length, gates: {} };
  for (const [g, f] of Object.entries(GATES)) {
    let wasted = 0, damage = 0;
    reps.forEach((r, i) => { const p = f(r, i); if (harmless(r)) wasted += p; else damage += 1 - p; });
    result[def].gates[g] = { rejectedHarmless: +wasted.toFixed(3), acceptedHarmful: +damage.toFixed(3) };
  }
}
writeFileSync(join(ROOT, 'results/x7-gates.json'), JSON.stringify({ generatedAt: new Date().toISOString(), ...result }, null, 2));

for (const [def, r] of Object.entries(result)) {
  console.log(`\n=== X7 — inofensivo = ${def === 'todas' ? 'resolve todas as tarefas' : 'resolve todas as não estritas'} (${r.harmless} inofensivos, ${r.harmful} com dano) ===`);
  console.log('portão                  rejeitados à toa   aceitos com dano');
  for (const [g, x] of Object.entries(r.gates)) console.log(`${g.padEnd(22)} ${x.rejectedHarmless.toFixed(2).padStart(8)} / ${r.harmless}    ${x.acceptedHarmful.toFixed(2).padStart(8)} / ${r.harmful}`);
}
