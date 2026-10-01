// =============================================================================
// mutation.js — Operadores de mutação sobre o código de programas corretos.
//
// Os operadores imitam classes de erro plausíveis em programas de extração
// (sem olhar os defeitos do corpus): constantes/taxas erradas, operador
// aritmético trocado, limite off-by-one, fuso local em vez de UTC, perda de
// normalização de texto, guarda de rejeição removida (o programa "chuta"),
// condição invertida. São textuais (regex), então alguns mutantes caem em
// strings ou não mudam o comportamento; esses são descartados pelo oráculo.
// =============================================================================

const OPS = [
  // NUM: literal numérico ×10 e +1 (taxas, fatores, offsets)
  { op: 'NUM×10', re: /(?<![\w.$])(\d+\.\d+|\d+)(?![\w.])/g, to: (m) => String(Number(m) * 10) },
  { op: 'NUM+1', re: /(?<![\w.$])(\d+\.\d+|\d+)(?![\w.])/g, to: (m) => String(Number(m) + 1) },
  // AOR: troca de operador aritmético binário
  { op: 'AOR*/', re: /(?<=[\w)\]]\s*)\*(?=\s*[\w(])/g, to: () => '/' },
  { op: 'AOR/*', re: /(?<=[\w)\]]\s*)\/(?=\s*[\w(])/g, to: () => '*' },
  { op: 'AOR+-', re: /(?<=[\w)\]]\s*)\+(?![+=])(?=\s*[\w(])/g, to: () => '-' },
  { op: 'AOR-+', re: /(?<=[\w)\]]\s*)-(?![-=>])(?=\s*[\w(])/g, to: () => '+' },
  // ROR: limite
  { op: 'ROR<', re: /(?<![=<>!])<(?![=<])/g, to: () => '<=' },
  { op: 'ROR>', re: /(?<![=<>!=])>(?![=>])/g, to: () => '>=' },
  // UTC: fuso local em vez de UTC
  { op: 'UTC', re: /getUTC(\w+)/g, to: (m) => m.replace('getUTC', 'get') },
  // STR: perda de normalização de texto
  { op: 'STR', re: /\.(toLowerCase|toUpperCase|trim)\(\)/g, to: () => '' },
  // REJ: guarda de rejeição removida (o programa passa a "chutar")
  { op: 'REJ', re: /if\s*\((?:[^()]|\((?:[^()]|\([^()]*\))*\))*\)\s*\{?\s*return null;?\s*\}?/g, to: () => '' },
  // NEG: condição de igualdade invertida
  { op: 'NEG', re: /===|!==/g, to: (m) => (m === '===' ? '!==' : '===') },
];

// Todos os mutantes de primeira ordem de um corpo: [{ op, at, body }].
export function mutants(body) {
  const out = [];
  for (const { op, re, to } of OPS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(body))) {
      const rep = to(m[0]);
      if (rep === m[0]) continue;
      out.push({ op, at: m.index, body: body.slice(0, m.index) + rep + body.slice(m.index + m[0].length) });
      if (m[0].length === 0) re.lastIndex++;
    }
  }
  return out;
}

// Amostra estável de até k itens espalhados pela lista.
export function spread(list, k) {
  if (list.length <= k) return list;
  const step = list.length / k;
  return Array.from({ length: k }, (_, i) => list[Math.floor(i * step)]);
}
