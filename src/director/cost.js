// Учёт токенов и стоимости по всему прогону: каждый вызов модели, кэш, итог в USD.
import { PRICING, PRICING_SOURCE } from '../config.js';

export function priceUsage(model, u) {
  const p = PRICING[model];
  if (!p) return { usd: null, note: `нет тарифа для ${model}` };
  const w5 = u.cache_creation?.ephemeral_5m_input_tokens ?? null, w1 = u.cache_creation?.ephemeral_1h_input_tokens ?? null;
  const cw5 = w5 ?? (w1 == null ? (u.cache_creation_input_tokens || 0) : 0), cw1 = w1 || 0;
  const usd = ((u.input_tokens || 0) * p.input + cw5 * p.cacheWrite5m + cw1 * p.cacheWrite1h + (u.cache_read_input_tokens || 0) * p.cacheRead + (u.output_tokens || 0) * p.output) / 1e6;
  return { usd };
}

export class CostTracker {
  constructor({ budgetUSD = Infinity } = {}) { this.budgetUSD = budgetUSD; this.calls = []; this.extra = []; }

  // usage — объект usage из ответа Messages API; model — фактически обслуживавшая модель.
  record(model, usage, meta = {}) {
    // при серверном fallback в usage.iterations — учитываем по итерациям (у каждой своя модель/тариф)
    const parts = Array.isArray(usage.iterations) && usage.iterations.length && usage.iterations.every((i) => i.model && i.input_tokens != null)
      ? usage.iterations.map((i) => ({ model: i.model, usage: i })) : [{ model, usage }];
    let usd = 0;
    for (const part of parts) { const r = priceUsage(part.model, part.usage); usd += r.usd ?? 0; }
    const rec = {
      n: this.calls.length + 1, model, input: usage.input_tokens || 0, output: usage.output_tokens || 0,
      cacheRead: usage.cache_read_input_tokens || 0, cacheWrite: usage.cache_creation_input_tokens || 0, usd, ...meta,
    };
    this.calls.push(rec);
    return rec;
  }

  // Нетокенные статьи (для полноты отчёта): браузерный захват, песочница, озвучка.
  note(label, detail) { this.extra.push({ label, ...detail }); }

  get usd() { return this.calls.reduce((a, c) => a + c.usd, 0); }
  overBudget() { return this.usd >= this.budgetUSD; }

  summary() {
    const t = this.calls.reduce((a, c) => ({ input: a.input + c.input, output: a.output + c.output, cacheRead: a.cacheRead + c.cacheRead, cacheWrite: a.cacheWrite + c.cacheWrite }), { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
    return { usd: Number(this.usd.toFixed(6)), calls: this.calls.length, tokens: t, budgetUSD: this.budgetUSD === Infinity ? null : this.budgetUSD, pricing: PRICING_SOURCE, perCall: this.calls.map((c) => ({ ...c, usd: Number(c.usd.toFixed(6)) })), nonTokenCosts: this.extra };
  }
}

export const fmtUSD = (v) => `$${Number(v).toFixed(6)}`;
