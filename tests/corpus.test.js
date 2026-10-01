import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCode, hashCode, evaluate } from '../src/corpus.js';
import { DOMAINS, streamOf } from '../src/streams.js';

const FIN = DOMAINS.find(d => d.key === 'financial');

// Programa correto escrito à mão para a Fase 1 do domínio financeiro.
const P1_OK = `
  const o = JSON.parse(entry);
  const r = { BRL: 0.2, USD: 1, EUR: 1.1, GBP: 1.27 }[o.currency];
  if (!r || !o.timestamp || !(o.amount > 0)) return null;
  const d = new Date(o.timestamp);
  const p = (n) => String(n).padStart(2, '0');
  return { audit_id: o.transaction_id, value_in_usd: Math.round(o.amount * r * 100) / 100,
    date: p(d.getUTCDate()) + '/' + p(d.getUTCMonth() + 1) + '/' + d.getUTCFullYear(),
    category: o.currency === 'BRL' ? 'domestic' : 'international', status: 'valid' };`;

const P1_SIG = streamOf(FIN).find(e => e.phase === 'P1').sig;

test('normalização ignora comentários e espaços', () => {
  assert.equal(normalizeCode('a = 1; // x\n/* y */  b = 2;'), 'a = 1; b = 2;');
  assert.equal(hashCode('return 1; // a'), hashCode('return   1;'));
});

test('programa correto é rotulado correct', () => {
  const r = evaluate({ domain: 'financial', sig: P1_SIG, body: P1_OK });
  assert.equal(r.compiles, true);
  assert.ok(r.n >= 100);
  assert.equal(r.wrong, 0);
});

test('programa que ignora a taxa é rotulado defective', () => {
  const bad = P1_OK.replace('o.amount * r', 'o.amount');
  const r = evaluate({ domain: 'financial', sig: P1_SIG, body: bad });
  assert.equal(r.label, 'defective');
  assert.ok(r.wrongFields.value_in_usd > 0);
});

test('programa que sempre devolve null é incomplete', () => {
  const r = evaluate({ domain: 'financial', sig: P1_SIG, body: 'return null;' });
  assert.equal(r.label, 'incomplete');
  assert.equal(r.wrong, 0);
});

test('programa que não compila é marcado', () => {
  const r = evaluate({ domain: 'financial', sig: P1_SIG, body: 'return {' });
  assert.equal(r.compiles, false);
});
