// =============================================================================
// financial.js — Domínio financeiro com oráculo.
//
// Mantém a estrutura das fases do experimento original (JSON limpo, campos
// renomeados, pré-agregado, pipe informal, CSV, adversarial), mas cada
// registro é gerado junto com sua verdade-terreno, eliminando ambiguidades
// do gerador original (ex.: campo "amount_brl" com moeda USD).
// =============================================================================

const RATES = { BRL: 0.2, USD: 1, EUR: 1.1, GBP: 1.27 };
const INFORMAL = { real: 'BRL', dolar: 'USD', euro: 'EUR', libra: 'GBP' };
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const PREFIX = ['TX', 'OP', 'TR', 'PG', 'RF', 'DB', 'CR', 'TF', 'NF', 'RX'];
const CURS = ['BRL', 'USD', 'EUR', 'GBP'];

export const SPEC = `Target record (the FINAL, immutable goal — "telos"):
{
  "audit_id":     non-empty string — the transaction identifier copied verbatim from the input,
  "value_in_usd": positive number — the transaction amount converted to USD using EXACTLY these rates:
                  BRL * 0.2, USD * 1, EUR * 1.1, GBP * 1.27
                  (informal names: real=BRL, dolar=USD, euro=EUR, libra=GBP; codes may be lowercase).
                  If the input already gives the value in USD (e.g. a field named value_usd), do not convert it again.
                  Brazilian number format "1.234,56" means 1234.56,
  "date":         string "DD/MM/YYYY" — the UTC calendar date of the transaction
                  (convert timestamps with offsets to UTC first; timestamps without offset are already UTC),
  "category":     "domestic" if the currency is BRL, otherwise "international",
  "status":       "valid"
}
Rejection rule: if a record cannot be converted faithfully — missing currency, missing date,
amount that is zero, negative or not a number, currency outside {BRL, USD, EUR, GBP}, or a record
that is not a financial transaction at all — it must be REJECTED, never guessed.`;

// Validator do telos (nível "formato", equivalente ao validator original).
export function validator(o) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return false;
  if (typeof o.audit_id !== 'string' || !o.audit_id.trim()) return false;
  if (typeof o.value_in_usd !== 'number' || !Number.isFinite(o.value_in_usd) || o.value_in_usd <= 0) return false;
  if (typeof o.date !== 'string' || !/^\d{2}\/\d{2}\/\d{4}$/.test(o.date)) return false;
  const [d, m, y] = o.date.split('/').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCDate() !== d || dt.getUTCMonth() !== m - 1) return false;
  if (o.category !== 'domestic' && o.category !== 'international') return false;
  if (o.status !== 'valid' && o.status !== 'invalid') return false;
  return true;
}

// Validator com "ancoragem" (grounding): além do formato, exige que o
// identificador exista literalmente na entrada — verificável sem oráculo.
export function groundedValidator(o, raw) {
  if (!validator(o)) return false;
  return typeof raw === 'string' && raw.includes(o.audit_id);
}

export const tolerances = { value_in_usd: 0.011 };

// ---------------------------------------------------------------------------
const pad = (n, w = 2) => String(n).padStart(w, '0');
const ddmmyyyy = (dt) => `${pad(dt.getUTCDate())}/${pad(dt.getUTCMonth() + 1)}/${dt.getUTCFullYear()}`;
const round2 = (x) => Math.round(x * 100) / 100;
const brFormat = (x) => {
  const [i, f] = x.toFixed(2).split('.');
  return i.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + f;
};
function accept(audit_id, amount, cur, utcDate) {
  return {
    expect: 'accept',
    output: {
      audit_id, value_in_usd: round2(amount * RATES[cur]), date: ddmmyyyy(utcDate),
      category: cur === 'BRL' ? 'domestic' : 'international', status: 'valid',
    },
  };
}
const REJECT = { expect: 'reject' };
const id = (i, base) => `${PREFIX[i % PREFIX.length]}${pad(i + base, 4)}`;

function randomUtc(r) {
  return new Date(Date.UTC(2024, r.int(0, 11), r.int(1, 28), r.int(0, 23), r.int(0, 59), 0));
}

// P1 — JSON limpo, timestamps UTC.
function p1(i, r) {
  const cur = CURS[i % 4], amount = r.range(10, 5000), dt = randomUtc(r), tid = id(i, 0);
  const raw = JSON.stringify({ transaction_id: tid, amount, currency: cur, timestamp: dt.toISOString().replace('.000', '') });
  return { raw, truth: accept(tid, amount, cur, dt) };
}

// P2 — JSON renomeado (fornecedor brasileiro), timestamps com offset -03:00.
// Registros após 21h locais caem no dia seguinte em UTC.
function p2(i, r) {
  const cur = CURS[i % 4], amount = r.range(10, 5000), tid = id(i, 1000);
  const y = 2024, mo = r.int(1, 12), d = r.int(1, 28), h = i % 5 === 0 ? r.int(21, 23) : r.int(8, 20), mi = r.int(0, 59);
  const local = `${y}-${pad(mo)}-${pad(d)}T${pad(h)}:${pad(mi)}:00-03:00`;
  const raw = JSON.stringify({ id_transacao: tid, valor: amount, moeda: cur, data_hora: local });
  return { raw, truth: accept(tid, amount, cur, new Date(local)) };
}

// P3 — Pré-agregado: valor já em USD (não deve ser convertido de novo).
function p3(i, r) {
  const cur = CURS[i % 4], usd = r.range(10, 5000), tid = id(i, 2000);
  const dt = new Date(Date.UTC(2024, r.int(0, 11), r.int(1, 28)));
  const raw = JSON.stringify({
    ref: tid, value_usd: usd, orig_currency: cur,
    date: dt.toISOString().slice(0, 10), category: cur === 'BRL' ? 'domestic' : 'international',
  });
  const truth = accept(tid, usd, 'USD', dt);
  truth.output.category = cur === 'BRL' ? 'domestic' : 'international';
  return { raw, truth };
}

// P4 — Pipe informal: moeda por extenso, número brasileiro, mês em português.
function p4(i, r) {
  const names = Object.keys(INFORMAL), name = names[i % 4], cur = INFORMAL[name];
  const amount = r.range(10, 9000), tid = id(i, 3000);
  const mo = r.int(0, 11), d = r.int(1, 28);
  const raw = `${tid}|${name}|${brFormat(amount)}|${pad(d)}-${MESES[mo]}-2024`;
  return { raw, truth: accept(tid, amount, cur, new Date(Date.UTC(2024, mo, d))) };
}

// P5 — CSV sem cabeçalho, colunas em ordem diferente (timestamp,moeda,valor,id).
function p5(i, r) {
  const cur = CURS[(i + 1) % 4], amount = r.range(10, 5000), dt = randomUtc(r), tid = id(i, 4000);
  const raw = `${dt.toISOString().replace('.000', '')},${cur},${amount},${tid}`;
  return { raw, truth: accept(tid, amount, cur, dt) };
}

// P6 — Adversarial: 7 variantes que DEVEM ser rejeitadas, 3 aceitáveis porém ardilosas.
const ADV = [
  (i, r) => ({ kind: 'sem-moeda', raw: JSON.stringify({ transaction_id: `AMB${pad(i, 4)}`, amount: r.range(10, 5000), timestamp: '2024-06-15T10:00:00Z' }), truth: REJECT }),
  (i) => ({ kind: 'valor-zero', raw: JSON.stringify({ transaction_id: `ZERO${pad(i, 4)}`, amount: 0, currency: 'USD', timestamp: '2024-06-15T10:00:00Z' }), truth: REJECT }),
  (i, r) => ({ kind: 'valor-negativo', raw: JSON.stringify({ transaction_id: `NEG${pad(i, 4)}`, amount: -r.range(10, 5000), currency: 'EUR', timestamp: '2024-06-15T10:00:00Z' }), truth: REJECT }),
  (i, r) => ({ kind: 'sem-data', raw: JSON.stringify({ transaction_id: `NODT${pad(i, 4)}`, amount: r.range(10, 5000), currency: 'BRL' }), truth: REJECT }),
  (i, r) => ({ kind: 'outro-dominio', raw: JSON.stringify({ sensor: `temp-${i}`, celsius: r.range(15, 40), humidity: r.range(0, 1) }), truth: REJECT }),
  (i) => ({ kind: 'valor-nao-numerico', raw: JSON.stringify({ transaction_id: `NAN${pad(i, 4)}`, amount: 'N/A', currency: 'GBP', timestamp: '2024-06-15T10:00:00Z' }), truth: REJECT }),
  (i, r) => ({ kind: 'moeda-desconhecida', raw: JSON.stringify({ transaction_id: `XYZ${pad(i, 4)}`, amount: r.range(10, 5000), currency: 'JPY', timestamp: '2024-06-15T10:00:00Z' }), truth: REJECT }),
  (i, r) => {
    const a = r.range(10, 5000);
    return { kind: 'aceita:moeda-minuscula-valor-string', raw: JSON.stringify({ transaction_id: `LOW${pad(i, 4)}`, amount: a.toFixed(2), currency: 'usd', timestamp: '2024-06-15T10:00:00Z' }), truth: accept(`LOW${pad(i, 4)}`, a, 'USD', new Date('2024-06-15T10:00:00Z')) };
  },
  (i, r) => {
    const a = r.range(1000, 9000);
    return { kind: 'aceita:numero-brasileiro', raw: JSON.stringify({ transaction_id: `BRN${pad(i, 4)}`, amount: brFormat(a), currency: 'BRL', timestamp: '2024-06-15T10:00:00Z' }), truth: accept(`BRN${pad(i, 4)}`, a, 'BRL', new Date('2024-06-15T10:00:00Z')) };
  },
  (i, r) => {
    const a = r.range(10, 5000);
    return { kind: 'aceita:virada-de-dia-utc', raw: JSON.stringify({ transaction_id: `UTC${pad(i, 4)}`, amount: a, currency: 'EUR', timestamp: '2024-12-31T22:30:00-03:00' }), truth: accept(`UTC${pad(i, 4)}`, a, 'EUR', new Date('2024-12-31T22:30:00-03:00')) };
  },
];
function p6(i, r) { return ADV[i % ADV.length](i, r); }

// ---------------------------------------------------------------------------
// Fases novas (idae-validators): formatos que não existiam no IDAE, para
// ampliar o corpus de falhas reais. Cada uma tem assinatura de formato
// própria, então não altera os registros nem as assinaturas de P1–P6.
// ---------------------------------------------------------------------------
const SYMBOL = { BRL: 'R$', USD: 'US$', EUR: '€', GBP: '£' };
const offsetStr = (m) => `${m < 0 ? '-' : '+'}${pad(Math.floor(Math.abs(m) / 60))}:${pad(Math.abs(m) % 60)}`;
// Horário local com offset (em minutos) e o instante UTC correspondente.
function localWithOffset(r, offMin) {
  const y = 2024, mo = r.int(1, 12), d = r.int(1, 28), h = r.int(0, 23), mi = r.int(0, 59), s = r.int(0, 59);
  const local = `${y}-${pad(mo)}-${pad(d)} ${pad(h)}:${pad(mi)}:${pad(s)} ${offsetStr(offMin)}`;
  const utc = new Date(Date.UTC(y, mo - 1, d, h, mi, s) - offMin * 60000);
  return { local, utc };
}
const OFFSETS = [-180, 60, 330, -300];

// P7 — Chave=valor separado por " | ", moeda como símbolo, número brasileiro, offset variado.
function p7(i, r) {
  const cur = CURS[i % 4], amount = r.range(10, 9000), tid = id(i, 5000);
  const { local, utc } = localWithOffset(r, OFFSETS[i % 4]);
  const raw = `id=${tid} | valor=${SYMBOL[cur]} ${brFormat(amount)} | quando=${local}`;
  return { raw, truth: accept(tid, amount, cur, utc) };
}

// P8 — JSON aninhado, valor como string, moeda minúscula, epoch em segundos.
function p8(i, r) {
  const cur = CURS[(i + 2) % 4], amount = r.range(10, 5000), tid = id(i, 6000), dt = randomUtc(r);
  const raw = JSON.stringify({ payment: { ref: tid, money: { value: amount.toFixed(2), ccy: cur.toLowerCase() } }, created_at: Math.floor(dt / 1000) });
  return { raw, truth: accept(tid, amount, cur, dt) };
}

// P9 — XML de uma transação, timestamp ISO com offset.
function p9(i, r) {
  const cur = CURS[(i + 3) % 4], amount = r.range(10, 5000), tid = id(i, 7000);
  const off = OFFSETS[(i + 1) % 4];
  const { local, utc } = localWithOffset(r, off);
  const iso = local.replace(' ', 'T').replace(' ', '');
  const raw = `<tx><id>${tid}</id><amount currency="${cur}">${amount.toFixed(2)}</amount><timestamp>${iso}</timestamp></tx>`;
  return { raw, truth: accept(tid, amount, cur, utc) };
}

// P10 — JSON com chaves em português, moeda por extenso e total em formato brasileiro.
function p10(i, r) {
  const names = Object.keys(INFORMAL), name = names[(i + 1) % 4], cur = INFORMAL[name];
  const amount = r.range(10, 9000), tid = id(i, 8000);
  const { local, utc } = localWithOffset(r, OFFSETS[(i + 2) % 4]);
  const raw = JSON.stringify({ codigo: tid, total: brFormat(amount), divisa: name, emissao: local.replace(' ', 'T').replace(' ', '') });
  return { raw, truth: accept(tid, amount, cur, utc) };
}

// P11 — Adversarial nos formatos novos: 7 rejeitar / 3 aceitar.
const TS2 = '2024-06-15 10:00:00 -03:00';
const ADV2 = [
  (i, r) => ({ kind: 'kv-sem-moeda', raw: `id=KVM${pad(i, 4)} | valor=${brFormat(r.range(10, 5000))} | quando=${TS2}`, truth: REJECT }),
  (i, r) => ({ kind: 'kv-moeda-iene', raw: `id=KVY${pad(i, 4)} | valor=¥ ${brFormat(r.range(10, 5000))} | quando=${TS2}`, truth: REJECT }),
  (i) => ({ kind: 'aninhado-valor-vazio', raw: JSON.stringify({ payment: { ref: `NVZ${pad(i, 4)}`, money: { value: '', ccy: 'eur' } }, created_at: 1718445600 }), truth: REJECT }),
  (i, r) => ({ kind: 'aninhado-sem-data', raw: JSON.stringify({ payment: { ref: `NDT${pad(i, 4)}`, money: { value: r.range(10, 5000).toFixed(2), ccy: 'usd' } }, created_at: null }), truth: REJECT }),
  (i, r) => ({ kind: 'xml-valor-negativo', raw: `<tx><id>XNG${pad(i, 4)}</id><amount currency="GBP">-${r.range(10, 5000).toFixed(2)}</amount><timestamp>2024-06-15T10:00:00Z</timestamp></tx>`, truth: REJECT }),
  (i, r) => ({ kind: 'xml-moeda-chf', raw: `<tx><id>XCH${pad(i, 4)}</id><amount currency="CHF">${r.range(10, 5000).toFixed(2)}</amount><timestamp>2024-06-15T10:00:00Z</timestamp></tx>`, truth: REJECT }),
  (i) => ({ kind: 'pt-total-zero', raw: JSON.stringify({ codigo: `PTZ${pad(i, 4)}`, total: '0,00', divisa: 'euro', emissao: '2024-06-15T10:00:00-03:00' }), truth: REJECT }),
  (i, r) => {
    const a = r.range(1, 99);
    return { kind: 'aceita:kv-centavos-dolar', raw: `id=KVC${pad(i, 4)} | valor=US$ ${brFormat(a)} | quando=${TS2}`, truth: accept(`KVC${pad(i, 4)}`, a, 'USD', new Date('2024-06-15T13:00:00Z')) };
  },
  (i, r) => {
    const a = r.range(10, 5000);
    return { kind: 'aceita:xml-dia-anterior-utc', raw: `<tx><id>XDA${pad(i, 4)}</id><amount currency="EUR">${a.toFixed(2)}</amount><timestamp>2024-03-01T02:00:00+05:00</timestamp></tx>`, truth: accept(`XDA${pad(i, 4)}`, a, 'EUR', new Date('2024-03-01T02:00:00+05:00')) };
  },
  (i, r) => {
    const a = r.range(10000, 90000);
    return { kind: 'aceita:pt-milhar-libra', raw: JSON.stringify({ codigo: `PTL${pad(i, 4)}`, total: brFormat(a), divisa: 'libra', emissao: '2024-06-15T10:00:00+00:00' }), truth: accept(`PTL${pad(i, 4)}`, a, 'GBP', new Date('2024-06-15T10:00:00Z')) };
  },
];
function p11(i, r) { return ADV2[i % ADV2.length](i, r); }

export const phases = [
  { id: 'P1', label: 'JSON limpo (UTC)', gen: p1 },
  { id: 'P2', label: 'JSON renomeado, offset -03:00', gen: p2 },
  { id: 'P3', label: 'Pré-agregado (valor já em USD)', gen: p3 },
  { id: 'P4', label: 'Pipe informal (moeda por extenso, número BR)', gen: p4 },
  { id: 'P5', label: 'CSV sem cabeçalho, colunas reordenadas', gen: p5 },
  { id: 'P6', label: 'Adversarial (7 rejeitar / 3 aceitar)', gen: p6, adversarial: true },
  { id: 'P7', label: 'Chave=valor, símbolo de moeda, offset variado', gen: p7 },
  { id: 'P8', label: 'JSON aninhado, epoch em segundos', gen: p8 },
  { id: 'P9', label: 'XML com offset', gen: p9 },
  { id: 'P10', label: 'JSON em português, total brasileiro', gen: p10 },
  { id: 'P11', label: 'Adversarial nos formatos novos (7 rejeitar / 3 aceitar)', gen: p11, adversarial: true },
];

export const domain = { name: 'financeiro', SPEC, validator, groundedValidator, tolerances, phases };
