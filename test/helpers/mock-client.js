// ИМИТАЦИЯ модели для проверки механики цикла без обращения к API (токены/стоимость — условные).
// Политика: первый ход собирает план с намеренными ошибками, затем «чинит» их по результату validate_plan.
import { googlePlan } from '../fixtures/google-plan.js';

let idc = 0;
const tu = (name, input) => ({ type: 'tool_use', id: `toolu_mock_${++idc}`, name, input });

export function mockClient({ dynamism = 'medium', breakIt = true } = {}) {
  const calls = [];
  const base = googlePlan(dynamism);
  const create = async (params) => {
    calls.push(params);
    const turn = calls.length;
    const last = params.messages[params.messages.length - 1];
    const usage = { input_tokens: turn === 1 ? 600 : 120, output_tokens: 900 + turn * 150, cache_creation_input_tokens: turn === 1 ? 4200 : 300, cache_read_input_tokens: turn === 1 ? 0 : 4200 + (turn - 2) * 300 };
    let content;
    if (turn === 1) {
      const sc = JSON.parse(JSON.stringify(base.scenes));
      if (breakIt) { sc[2].duration = 25; sc[1].events = []; sc[3].transition_in = { type: 'flash_cut', duration: 0.3 }; sc[0].props.lines[0].text = 'Привет, мир'; }
      content = [tu('set_project', { title: base.meta.title }), ...sc.map((s) => tu('add_scene', s))];
    } else {
      const results = Array.isArray(last.content) ? last.content : [];
      const val = results.map((r) => { try { return JSON.parse(r.content); } catch { return null; } }).find((o) => o && o.errors && o.metrics);
      if (val && val.ok === false) {
        const calls2 = [];
        for (const e of val.errors) {
          const m = e.path.match(/^scenes\[(\d+)\]\.duration/);
          if (m) calls2.push(tu('edit_scene', { id: base.scenes[Number(m[1])].id, duration: base.scenes[Number(m[1])].duration }));
          const tr = e.path.match(/^scenes\[(\d+)\]\.transition_in/);
          if (tr) calls2.push(tu('edit_scene', { id: base.scenes[Number(tr[1])].id, transition_in: base.scenes[Number(tr[1])].transition_in }));
          if (/props\.lines\[0\]\.text|Cyrillic/.test(e.path + e.message)) calls2.push(tu('edit_scene', { id: 's1', props_patch: { lines: base.scenes[0].props.lines } }));
          if (/density/.test(e.message)) calls2.push(tu('add_events', { scene: 's1', events: [{ t: 0.4, type: 'punch' }, { t: 1.0, type: 'flash', strength: 0.5 }] }), tu('add_events', { scene: 's3', events: [{ t: 0.5, type: 'punch' }, { t: 1.4, type: 'shake', strength: 0.6 }] }), tu('add_events', { scene: 's2', events: [{ t: 3.0, type: 'punch' }] }), tu('add_events', { scene: 's4', events: [{ t: 0.8, type: 'punch' }] }));
        }
        content = [...(calls2.length ? calls2 : []), tu('validate_plan', {})];
      } else if (val && val.ok === true) content = [tu('finalize_plan', {})];
      else content = [tu('validate_plan', {})];
    }
    return { id: `msg_mock_${turn}`, model: 'claude-opus-5-5', role: 'assistant', content, stop_reason: 'tool_use', usage };
  };
  const stream = (params) => ({ finalMessage: () => create(params) });
  return { messages: { create, stream }, beta: { messages: { create, stream } }, calls };
}
