// =============================================================================
// stats.js — Estatística exata para amostras pequenas.
// =============================================================================

export const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
export const sd = (a) => {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1));
};

// Intervalo de Wilson (95%) para proporção k/n.
export function wilson(k, n, z = 1.959964) {
  if (n === 0) return { lo: 0, hi: 0 };
  const p = k / n, d = 1 + z * z / n;
  const c = (p + z * z / (2 * n)) / d;
  const h = (z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))) / d;
  return { lo: Math.max(0, c - h), hi: Math.min(1, c + h) };
}

function binomTwoSided(k, n) {
  // P-valor exato bicaudal do teste binomial com p=0.5.
  const pmf = (i) => Math.exp(lnC(n, i) - n * Math.LN2);
  const obs = pmf(k);
  let p = 0;
  for (let i = 0; i <= n; i++) if (pmf(i) <= obs * (1 + 1e-9)) p += pmf(i);
  return Math.min(1, p);
}
function lnC(n, k) { return lnFact(n) - lnFact(k) - lnFact(n - k); }
function lnFact(n) { let s = 0; for (let i = 2; i <= n; i++) s += Math.log(i); return s; }

// McNemar exato: b = casos em que só A acerta, c = só B acerta.
export function mcnemarExact(b, c) {
  const n = b + c;
  return { b, c, p: n === 0 ? 1 : binomTwoSided(Math.min(b, c), n) };
}

// Wilcoxon signed-rank exato (bicaudal), enumeração para n <= 20.
export function wilcoxonExact(x, y) {
  const d = x.map((v, i) => v - y[i]).filter(v => Math.abs(v) > 1e-12);
  const n = d.length;
  if (n === 0) return { n, W: 0, p: 1 };
  const abs = d.map(Math.abs);
  const order = abs.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const ranks = new Array(n);
  for (let i = 0; i < n;) {
    let j = i;
    while (j + 1 < n && Math.abs(order[j + 1][0] - order[i][0]) < 1e-12) j++;
    for (let k = i; k <= j; k++) ranks[order[k][1]] = (i + j + 2) / 2;
    i = j + 1;
  }
  const Wp = d.reduce((s, v, i) => s + (v > 0 ? ranks[i] : 0), 0);
  const total = n * (n + 1) / 2;
  const W = Math.min(Wp, total - Wp);
  let count = 0;
  const N = 1 << n;
  for (let m = 0; m < N; m++) {
    let s = 0;
    for (let i = 0; i < n; i++) if (m & (1 << i)) s += ranks[i];
    if (Math.min(s, total - s) <= W + 1e-9) count++;
  }
  return { n, W, Wplus: Wp, p: Math.min(1, count / N) };
}

// Tamanho de efeito de Cliff (delta) entre duas amostras.
export function cliffsDelta(a, b) {
  let gt = 0, lt = 0;
  for (const x of a) for (const y of b) { if (x > y) gt++; else if (x < y) lt++; }
  return (gt - lt) / (a.length * b.length);
}
