// =============================================================================
// llm-client.js — Cliente LLM com seleção explícita de modelo (padrão:
// claude-opus-4.5). Usa a API de Mensagens da Anthropic (ANTHROPIC_API_KEY).
// Se existir src/llm-transport.local.js exportando send(message, model), ele é
// usado no lugar do transporte padrão. Registra cada chamada em JSONL quando
// IDAE_LLM_LOG está definido.
// =============================================================================

import { existsSync, appendFileSync } from 'fs';

export const MODEL = process.env.LLM_MODEL || 'claude-opus-4.5';

const API_URL = process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com';
// Identificadores da API da Anthropic para os nomes de modelo usados no estudo.
const API_MODEL = { 'claude-opus-4.5': 'claude-opus-4-5', 'claude-haiku-4.5': 'claude-haiku-4-5' };

async function anthropicSend(message, model) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('Defina ANTHROPIC_API_KEY');
  const res = await fetch(API_URL + '/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    signal: AbortSignal.timeout(180_000),
    body: JSON.stringify({
      model: API_MODEL[model] || model,
      max_tokens: 8192,
      messages: [{ role: 'user', content: message }],
    }),
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return data.content.filter(b => b.type === 'text').map(b => b.text).join('');
}

const localTransport = new URL('./llm-transport.local.js', import.meta.url);
const send = existsSync(localTransport) ? (await import(localTransport)).send : anthropicSend;

// Contabilidade global de uso (chamadas e caracteres), para custo em tokens.
export const usage = { calls: 0, promptChars: 0, responseChars: 0, errors: 0, ms: 0 };
export function resetUsage() { Object.assign(usage, { calls: 0, promptChars: 0, responseChars: 0, errors: 0, ms: 0 }); }
export function snapshotUsage() { return { ...usage, estTokens: Math.round((usage.promptChars + usage.responseChars) / 4) }; }

export async function chat(message, { model = MODEL, retries = 4 } = {}) {
  for (let attempt = 0; ; attempt++) {
    const t0 = Date.now();
    try {
      const text = await send(message, model);
      if (!text) throw new Error('Resposta vazia do modelo');
      usage.calls++; usage.promptChars += message.length; usage.responseChars += text.length;
      usage.ms += Date.now() - t0;
      if (process.env.IDAE_LLM_LOG) {
        appendFileSync(process.env.IDAE_LLM_LOG, JSON.stringify({
          ts: new Date().toISOString(), model, ms: Date.now() - t0, prompt: message, response: text,
        }) + '\n');
      }
      return text;
    } catch (e) {
      usage.errors++;
      if (attempt >= retries) throw e;
      await new Promise(r => setTimeout(r, 2000 * 2 ** attempt));
    }
  }
}
