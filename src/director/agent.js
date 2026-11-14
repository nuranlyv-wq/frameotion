// Агентный цикл режиссёра: Claude Opus вызывает инструменты → план строится → валидируется →
// модель исправляет ошибки валидации → finalize_plan. Токены и стоимость считаются по каждому вызову.
import Anthropic from '@anthropic-ai/sdk';
import { CONFIG } from '../config.js';
import { CostTracker } from './cost.js';
import { PlanBuilder, TOOL_DEFS } from './tools.js';
import { buildSystemPrompt, buildUserMessage } from './prompt.js';
import { validatePlan } from '../plan/validate.js';
import { LENGTHS } from '../dynamism.js';
import {directorPreparation,preparationForModel} from '../craft/brief.js';

export function createClient() {
  return new Anthropic(); // ключ берётся из ANTHROPIC_API_KEY / .env, в код и логи не попадает
}

// Стриминг: ответы с кодом сцен длинные (десятки тысяч токенов), без стриминга их рвёт по таймауту.
async function callModel(client, params, st) {
  if (st.useFallback) {
    try {
      // Серверный fallback при отказе классификаторов безопасности (по рекомендации документации для Opus 5.5).
      return await client.beta.messages.stream({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }).finalMessage();
    } catch (e) {
      if (!(e instanceof Anthropic.BadRequestError)) throw e;
      st.useFallback = false; st.fallbackDisabledReason = String(e.message).slice(0, 200);
    }
  }
  return client.messages.stream(params).finalMessage();
}

// opts: {imp, style, dynamism, mode, brief, client?, onEvent?, budgetUSD?}
export async function runDirector(opts) {
  const { imp, style, dynamism, mode = 'silent', brief, length = 'short', angle = null, avoid = null, paletteMode = 'brand', onEvent = () => {}, maxTurns = CONFIG.maxTurns } = opts;
  const client = opts.client || createClient();
  const tracker = new CostTracker({ budgetUSD: opts.budgetUSD ?? CONFIG.maxRunCostUSD ?? LENGTHS[length]?.maxRunUSD ?? 1 });
  const builder = new PlanBuilder({ imp, style, dynamism, mode, length, paletteMode });
  if (angle) builder.plan.meta.angle = angle.id;
  builder.plan.meta.craftRules = opts.craftRules ?? true;   // обязательные правила ремесла (морфинг, пары шрифтов, виды появления)
  const system = buildSystemPrompt({ dynamism, mode });
  const preparation=directorPreparation({brief,description:imp?.title??imp?.name??'',settings:{pace:dynamism}});
  const messages = [{ role: 'user', content: buildUserMessage({ imp, style, dynamism, mode, brief, length, angle, avoid, palette: builder.plan.palette, paletteMode })+'\nLOCAL CREATIVE PREPARATION (reference operations are optional; use only this renderer’s actual tools):\n'+JSON.stringify(preparationForModel(preparation)) }];
  const st = { useFallback: CONFIG.useFallback };
  const trace = [];
  let nudges = 0, stopReason = 'max_turns', error = null;

  for (let turn = 1; turn <= maxTurns; turn++) {
    if (tracker.overBudget()) { stopReason = 'budget_exceeded'; break; }
    const params = {
      model: CONFIG.model, max_tokens: CONFIG.maxOutputTokens,
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      tools: TOOL_DEFS, messages, output_config: { effort: CONFIG.effort },
      cache_control: { type: 'ephemeral' },
    };
    let resp;
    try { resp = await callModel(client, params, st); }
    catch (e) { error = `${e.constructor?.name || 'Error'}: ${e.message}`; stopReason = 'api_error'; break; }
    const rec = tracker.record(resp.model || CONFIG.model, resp.usage || {}, { turn, stop: resp.stop_reason });
    messages.push({ role: 'assistant', content: resp.content });
    const tools = resp.content.filter((b) => b.type === 'tool_use');
    const step = { turn, stop: resp.stop_reason, usage: { input: rec.input, output: rec.output, cacheRead: rec.cacheRead, cacheWrite: rec.cacheWrite }, usd: Number(rec.usd.toFixed(6)), tools: [] };
    onEvent({ type: 'turn', turn, tools: tools.map((t) => t.name), usd: tracker.usd });

    if (resp.stop_reason === 'refusal') { stopReason = 'refusal'; error = `refusal: ${resp.stop_details?.category || 'n/a'}`; trace.push(step); break; }

    if (!tools.length) {
      trace.push(step);
      if (builder.finalized) { stopReason = 'finalized'; break; }
      if (++nudges > 2) { stopReason = 'no_finalize'; break; }
      messages.push({ role: 'user', content: 'You have not finalized the plan. Call validate_plan, fix any errors, then call finalize_plan.' });
      continue;
    }

    const results = [];
    for (const tu of tools) {
      if (resp.stop_reason === 'max_tokens') { results.push({ type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify({ ok: false, error: 'output truncated by max_tokens; resend in smaller pieces' }), is_error: true }); step.tools.push({ name: tu.name, ok: false }); continue; }
      const r = await builder.exec(tu.name, tu.input);
      let ok = !r.isError; if (typeof r.content === 'string') { try { const o = JSON.parse(r.content); if (o.ok === false) ok = false; } catch { /* текст */ } }
      step.tools.push({ name: tu.name, ok, ...(tu.name === 'validate_plan' || tu.name === 'finalize_plan' ? { errors: safeCount(r.content) } : {}) });
      results.push({ type: 'tool_result', tool_use_id: tu.id, content: r.content, is_error: r.isError });
    }
    trace.push(step);
    messages.push({ role: 'user', content: results });
    if (builder.finalized) { stopReason = 'finalized'; break; }
  }

  const finalValidation = validatePlan(builder.plan);
  // Ходы кончились, но план уже проходит ту самую проверку, что делает finalize_plan: принимаем его, а не выбрасываем работу и деньги.
  let autoFinalized = false;
  if (!builder.finalized && finalValidation.ok && (stopReason === 'max_turns' || stopReason === 'no_finalize')) { builder.finalized = true; autoFinalized = true; stopReason = 'auto_finalized'; }
  return {
    plan: builder.plan, finalized: builder.finalized && finalValidation.ok, autoFinalized, stopReason, error,
    turns: trace.length, trace, validation: finalValidation, cost: tracker.summary(),
    fallback: { enabled: st.useFallback, disabledReason: st.fallbackDisabledReason || null },
    sandbox: { runs: builder.sandboxRuns, ms: builder.sandboxMs },
    library: builder.library.summary(),
    creativePreparation:preparation,
  };
}

function safeCount(s) { if (typeof s !== 'string') return null; try { const o = JSON.parse(s); return Array.isArray(o.errors) ? o.errors.length : 0; } catch { return null; } }
