// =============================================================================
// validators/index.js — Estratégias de validador por domínio.
//
//   V0  formato (validator do telos do IDAE)
//   V1  ancorado: V0 + identificador presente literalmente na entrada (IDAE)
//   V2  propriedades/relações entrada↔saída (blind/, escrito só a partir do telos)
//   V3  V0 + relações metamórficas (blind/, reexecuta o programa em entradas
//       transformadas)
//   V23 V2 + V3
//   V4  N-version: V0 + um segundo programa independente (mesmo domínio,
//       assinatura e modelo) precisa produzir a mesma saída; avaliado com até
//       3 parceiros diferentes (V4-1..V4-3)
//   L:* validadores escritos por LLM em uma chamada (data/llm-validators)
//   I:* os mesmos validadores L revisados pelo LLM com autoverificação
//       iterativa (X5, data/llm-validators-iter/<domínio>/final)
//
// Interface comum: check(out, raw, run) -> boolean, chamada só quando o
// programa devolveu um objeto (null é rejeição do próprio programa).
// =============================================================================

import vm from 'node:vm';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { DOMAINS } from '../streams.js';
import { compile } from '../util.js';
import { compareOutput } from '../metrics.js';

const BLIND = new URL('./blind/', import.meta.url);
const LLM_DIR = new URL('../../data/llm-validators/', import.meta.url);
const ITER_DIR = new URL('../../data/llm-validators-iter/', import.meta.url);

async function loadBlind(key) {
  const f = new URL(`${key}.js`, BLIND);
  return existsSync(f) ? import(f) : null;
}

export async function validatorsFor(domainKey) {
  const D = DOMAINS.find(d => d.key === domainKey);
  const b = await loadBlind(domainKey);
  const v = {
    V0: (o) => D.validator(o),
    V1: (o, raw) => D.groundedValidator(o, raw),
  };
  if (b) {
    v.V2 = (o, raw) => b.property(o, raw);
    v.V3 = (o, raw, run) => D.validator(o) && b.metamorphic(run, raw, o);
    v.V23 = (o, raw, run) => b.property(o, raw) && b.metamorphic(run, raw, o);
  }
  return v;
}

// Validador escrito por LLM: corpo de function(o, raw), isolado com timeout.
export function compileValidator(body) {
  const script = new vm.Script(`(function(o, raw){\n${body}\n})`);
  const ctx = vm.createContext({});
  const fn = script.runInContext(ctx, { timeout: 1000 });
  return (o, raw) => {
    ctx.__o = JSON.parse(JSON.stringify(o)); ctx.__raw = raw; ctx.__f = fn;
    return vm.runInContext('__f(__o, __raw)', ctx, { timeout: 200 }) === true;
  };
}

// { 'L:<domínio>:<modelo>-<k>': check } para o domínio; validadores que não compilam
// entram como "sempre barra" e são marcados em broken.
export function llmValidatorsFor(domainKey) {
  return loadDir(new URL(`${domainKey}/`, LLM_DIR), `L:${domainKey}:`);
}

// Validadores do X5: { 'I:<domínio>:<modelo>-<k>': check } (versão escolhida).
export function iterValidatorsFor(domainKey) {
  return loadDir(new URL(`${domainKey}/final/`, ITER_DIR), `I:${domainKey}:`);
}

function loadDir(dir, prefix) {
  const out = {}, broken = [];
  if (!existsSync(dir)) return { validators: out, broken };
  for (const f of readdirSync(dir).filter(f => f.endsWith('.js')).sort()) {
    const name = prefix + f.replace(/\.js$/, '');
    try { out[name] = compileValidator(readFileSync(new URL(f, dir), 'utf8')); }
    catch { out[name] = () => false; broken.push(name); }
  }
  return { validators: out, broken };
}

// Parceiros N-version para um programa: outros programas do corpus com o mesmo
// domínio e assinatura e ao menos um modelo em comum, em ordem estável.
export function nversionValidators(p, corpus, k = 3) {
  const D = DOMAINS.find(d => d.key === p.domain);
  const models = new Set(Object.keys(p.models));
  const partners = corpus.filter(q => q.id !== p.id && q.compiles && q.domain === p.domain && q.sig === p.sig && Object.keys(q.models).some(m => models.has(m)));
  const out = {};
  // Espalha a escolha pelo corpus para não pegar sempre os vizinhos imediatos.
  const step = Math.max(1, Math.floor(partners.length / k));
  for (let i = 0; i < Math.min(k, partners.length); i++) {
    const q = partners[i * step];
    let other;
    try { const fn = compile(q.body); other = (x) => { try { return fn(x); } catch { return null; } }; } catch { continue; }
    out[`V4-${i + 1}`] = (o, raw) => {
      if (!D.validator(o)) return false;
      const o2 = other(raw);
      return !!o2 && typeof o2 === 'object' && compareOutput(o2, o, D.tolerances).length === 0 && compareOutput(o, o2, D.tolerances).length === 0;
    };
  }
  return out;
}
