// Sanidade das tarefas: aplicadas à verdade, cada tarefa concorda consigo
// mesma; remover um registro ou multiplicar um valor por 100 é detectado
// pelas tarefas que dependem desse campo. Não usa o corpus.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DOMAINS, streamOf } from '../src/streams.js';
import { TASKS } from '../src/tasks.js';

const truthOf = (D) => streamOf(D).filter(e => e.truth.expect === 'accept').map(e => e.truth.output);

for (const D of DOMAINS) {
  test(`${D.key}: verdade contra verdade`, () => {
    const T = truthOf(D);
    for (const t of TASKS[D.key]) assert.equal(t.compare(t.run(T), t.run(T)).ok, true, t.id);
  });
}

test('financial: valor ×100 num registro quebra F1, F2, F5 e não F3', () => {
  const D = DOMAINS.find(d => d.key === 'financial');
  const T = truthOf(D), P = T.map((o, i) => (i === 0 ? { ...o, value_in_usd: o.value_in_usd * 100 } : o));
  const r = Object.fromEntries(TASKS.financial.map(t => [t.id, t.compare(t.run(P), t.run(T)).ok]));
  assert.deepEqual([r.F1, r.F2, r.F3, r.F5], [false, false, true, false]);
});

test('iot: milissegundos no timestamp não mudam nenhuma tarefa', () => {
  const D = DOMAINS.find(d => d.key === 'iot');
  const T = truthOf(D), P = T.map(o => ({ ...o, timestamp_utc: o.timestamp_utc.replace('Z', '.000Z') }));
  for (const t of TASKS.iot) assert.equal(t.compare(t.run(P), t.run(T)).ok, true, t.id);
});

test('top-N: formato com menos de 10 registros válidos', () => {
  const F4 = TASKS.financial.find(t => t.id === 'F4');
  assert.equal(F4.compare([], []).ok, true);
  assert.equal(F4.compare(['a', 'b'], ['a', 'b']).ok, true);
  assert.equal(F4.compare(['a', 'x', 'y'], ['a']).ok, false);
});
