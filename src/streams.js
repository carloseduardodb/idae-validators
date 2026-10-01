// =============================================================================
// streams.js — Domínios com oráculo e fluxos de avaliação.
//
// Cada domínio expõe { name, SPEC, validator, groundedValidator, tolerances }
// e um fluxo fixo de registros { phase, idx, kind, raw, truth, sig }.
// Financeiro e IoT usam o mesmo fluxo canônico dos experimentos E2/E4 do IDAE
// (semente 1001, 100 registros por fase, 50 na adversarial); USGS usa os 560
// eventos reais, com o oráculo do telos corrigido ou do telos estrito.
// =============================================================================

import { rng, formatSignature } from './util.js';
import { domain as FIN } from './domains/financial.js';
import { domain as IOT } from './domains/iot.js';
import { corrected as USGS_C, original as USGS_O, loadPhases } from './domains/usgs.js';

export const EVAL_SEED = 1001;

export function buildStream(domain, { seed = EVAL_SEED, n = 100, nAdv = 50 } = {}) {
  const r = rng(seed);
  const stream = [];
  for (const ph of domain.phases) {
    const count = ph.adversarial ? nAdv : n;
    for (let i = 0; i < count; i++) {
      const g = ph.gen(i, r);
      stream.push({ phase: ph.id, idx: i, raw: g.raw, truth: g.truth, kind: g.kind || null });
    }
  }
  return stream;
}

function usgsStream(variant) {
  const out = [];
  for (const ph of loadPhases()) {
    ph.raws.forEach((raw, idx) => out.push({ phase: ph.id, idx, raw, truth: variant.truth(raw), kind: null }));
  }
  return out;
}

export const DOMAINS = [
  { ...FIN, key: 'financial', stream: () => buildStream(FIN) },
  { ...IOT, key: 'iot', stream: () => buildStream(IOT) },
  { ...USGS_C, key: 'usgs-corrected', stream: () => usgsStream(USGS_C) },
  { ...USGS_O, key: 'usgs-strict', stream: () => usgsStream(USGS_O) },
];

// Assinatura de formato tolerante a amostras truncadas no prompt
// (o IDAE corta amostras em 1500 caracteres).
export function signatureOf(raw) {
  const s = raw.trim();
  if (s.startsWith('{') && /"type"\s*:\s*"Feature"/.test(s)) return 'json:geojson';
  return formatSignature(s);
}

const cache = new Map();
export function streamOf(domain) {
  if (!cache.has(domain.key)) {
    cache.set(domain.key, domain.stream().map(e => ({ ...e, sig: signatureOf(e.raw) })));
  }
  return cache.get(domain.key);
}
