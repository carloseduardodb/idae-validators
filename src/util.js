// =============================================================================
// util.js — RNG com semente, execução isolada de programas sintetizados,
// limpeza de código gerado e pool de concorrência.
// =============================================================================

import vm from 'node:vm';

// PRNG determinístico (mulberry32) — datasets reprodutíveis por semente.
export function rng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.range = (min, max) => +(min + next() * (max - min)).toFixed(2);
  next.int = (min, max) => Math.floor(min + next() * (max - min + 1));
  next.pick = (arr) => arr[Math.floor(next() * arr.length)];
  return next;
}

export function cleanCode(text) {
  let code = text.trim();
  const fence = code.match(/```(?:javascript|js)?\s*\n([\s\S]*?)```/);
  if (fence) code = fence[1].trim();
  // Aceita "function f(entry) { ... }" ou arrow e extrai o corpo.
  const fn = code.match(/^(?:async\s+)?function\s*\w*\s*\(\s*entry\s*\)\s*\{([\s\S]*)\}\s*;?\s*$/);
  if (fn) return fn[1].trim();
  const arrow = code.match(/^(?:const\s+\w+\s*=\s*)?\(?\s*entry\s*\)?\s*=>\s*\{([\s\S]*)\}\s*;?\s*$/);
  if (arrow) return arrow[1].trim();
  return code;
}

// Compila o corpo sintetizado num contexto isolado com timeout.
// A saída é normalizada via JSON (remove undefined, NaN -> null), para que
// o validator e o oráculo vejam exatamente o que seria persistido.
export function compile(body) {
  const script = new vm.Script(`(function(entry){\n${body}\n})`);
  const ctx = vm.createContext({});
  const fn = script.runInContext(ctx, { timeout: 1000 });
  return (entry) => {
    ctx.__entry = entry;
    const out = vm.runInContext('__f(__entry)', Object.assign(ctx, { __f: fn }), { timeout: 1000 });
    return out === undefined ? null : JSON.parse(JSON.stringify(out));
  };
}

export function parseJsonReply(text) {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*\n([\s\S]*?)```/);
  if (fence) t = fence[1].trim();
  if (t === 'null') return null;
  const s = t.indexOf('{'), e = t.lastIndexOf('}');
  if (s < 0 || e < s) return null;
  return JSON.parse(t.slice(s, e + 1));
}

export async function pool(items, limit, worker) {
  const out = new Array(items.length);
  let i = 0;
  const run = async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await worker(items[idx], idx);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return out;
}

export function formatSignature(raw) {
  const s = typeof raw === 'string' ? raw : JSON.stringify(raw);
  const t = s.trim();
  if (t.startsWith('{')) {
    try {
      const o = JSON.parse(t);
      const keys = o && o.type === 'Feature' ? 'geojson' : Object.keys(o).sort().join(',');
      return 'json:' + keys;
    } catch {}
  }
  if (t.includes('|')) return 'pipe:' + t.split('|').length;
  if (t.includes(',')) return 'csv';
  return 'other';
}
