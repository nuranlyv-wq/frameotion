// Валидатор плана: структурные ошибки, ограничения профиля динамичности, качество.
// Возвращает машиночитаемый результат, по которому модель исправляет план.
import { getProfile, totalRange } from '../dynamism.js';
import { COMPONENTS, COMPONENT_NAMES, TRANSITIONS } from '../render/components/index.js';
import { SFX_KINDS, GENERIC_EVENTS, layoutScenes, attachProfile } from './model.js';
import { isHex, contrast, round } from '../util.js';
import { readSec } from './reading.js';
import { hasZoom, CAMERA_EASES, CAMERA_PURPOSES } from '../render/camera.js';
import { anchorsFor } from '../render/engine.js';

const TEXT_KEYS = new Set(['text', 'title', 'sub', 'label', 'query', 'brand', 'placeholder', 'button', 'headline', 'name', 'tagline', 'suffix', 'prefix']);
function collectTexts(o, out = [], path = '') {
  if (Array.isArray(o)) o.forEach((v, i) => collectTexts(v, out, `${path}[${i}]`));
  else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) {
    if (typeof v === 'string' && TEXT_KEYS.has(k)) out.push({ path: `${path}.${k}`, s: v });
    else collectTexts(v, out, `${path}.${k}`);
  }
  return out;
}

export function validatePlan(planIn) {
  const plan = planIn._P ? planIn : attachProfile(planIn);
  const P = plan._P;
  const errors = [], warnings = [];
  // Каждая проблема несёт слой: technical | layout | consistency | narrative (ошибки) и artistic (рекомендации, никогда не блокируют).
  const err = (path, message, hint, layer = 'technical') => errors.push({ path, message, layer, ...(hint ? { hint } : {}) });
  const warn = (path, message, layer = 'technical') => warnings.push({ path, message, layer });
  const advise = (path, message) => warnings.push({ path, message, layer: 'artistic' });   // художественная рекомендация
  const directed = plan.meta?.craftRules !== false;   // режим «арт-директор»: спецификация, раскадровка, смысловые требования к камере

  // ── палитра ──
  const pal = plan.palette || {};
  for (const k of ['bg', 'fg', 'accent', 'accent2', 'muted']) if (!isHex(pal[k])) err(`palette.${k}`, `must be a hex color like #112233 (got ${JSON.stringify(pal[k])})`);
  if (isHex(pal.bg) && isHex(pal.fg)) {
    const c = contrast(pal.bg, pal.fg);
    if (c < 3) err('palette', `fg/bg contrast ${c.toFixed(1)}:1 is below 3:1 — text would be unreadable`);
    else if (c < 4.5) warn('palette', `fg/bg contrast ${c.toFixed(1)}:1 is below 4.5:1`);
    if (isHex(pal.accent) && contrast(pal.bg, pal.accent) < 2.2) warn('palette.accent', 'accent has low contrast against bg');
  }

  // ── сцены ──
  const scenes = plan.scenes || [];
  if (scenes.length < 2) err('scenes', `need at least 2 scenes (have ${scenes.length})`);
  const ids = new Set();
  scenes.forEach((s, i) => {
    const sp = `scenes[${i}]`;
    if (!s.id || typeof s.id !== 'string') err(`${sp}.id`, 'id required');
    else if (ids.has(s.id)) err(`${sp}.id`, `duplicate id "${s.id}"`); else ids.add(s.id);
    if (!COMPONENTS[s.component]) { err(`${sp}.component`, `unknown component "${s.component}"`, `use one of: ${COMPONENT_NAMES.join(', ')}`); return; }
    if (typeof s.duration !== 'number' || !isFinite(s.duration)) { err(`${sp}.duration`, 'duration must be a number of seconds'); return; }
    const longForm = Boolean(COMPONENTS[s.component].spec.long);
    const hardHi = COMPONENTS[s.component].spec.maxSec ?? 18;
    if (s.duration < 0.8 || s.duration > hardHi) err(`${sp}.duration`, `${s.duration}s is outside the technical limits 0.8–${hardHi}s for ${s.component}`, 'adjust scene duration');
    else {
      const dLo = P.sceneSec[0] - 0.05, dHi = COMPONENTS[s.component].spec.maxSec ?? (longForm ? P.sceneSec[1] * 1.7 : P.sceneSec[1] + 0.05);
      if (s.duration < dLo || s.duration > dHi) advise(`${sp}.duration`, `${s.duration}s is outside the usual ${P.id} pace ${P.sceneSec[0]}–${longForm ? round(dHi, 1) : P.sceneSec[1]}s; fine if the story needs it (reading time still applies)`);
    }
    // transition
    if (i > 0) {
      const tr = s.transition_in || {};
      const type = tr.type || P.transitions.defaultType;
      if (!TRANSITIONS[type]) err(`${sp}.transition_in.type`, `unknown transition "${type}"`, `known: ${Object.keys(TRANSITIONS).join(', ')}`);
      else if (!P.transitions.allowed.includes(type)) err(`${sp}.transition_in.type`, `"${type}" is not allowed at dynamism=${P.id}`, `allowed: ${P.transitions.allowed.join(', ')}`);
      const rg = type === 'zoom_into' ? P.zoomDur : [P.transitions.minDur, P.transitions.maxDur];
      if (tr.duration != null && type !== 'cut' && (tr.duration < rg[0] - 1e-6 || tr.duration > rg[1] + 1e-6)) err(`${sp}.transition_in.duration`, `${tr.duration}s outside ${rg[0]}–${rg[1]}s for ${type} at ${P.id}`);
      if (type === 'zoom_into') {
        if (tr.variant && !['portal', 'open', 'roll'].includes(tr.variant)) err(`${sp}.transition_in.variant`, 'variant must be portal|open|roll');
        if (tr.roll != null && (typeof tr.roll !== 'number' || Math.abs(tr.roll) > 25)) err(`${sp}.transition_in.roll`, 'roll must be a number of degrees within -25..25');
        const an = anchorsFor(scenes[i - 1], plan);
        if (typeof tr.target === 'string') { if (!an[tr.target]) err(`${sp}.transition_in.target`, `scene "${scenes[i - 1].id}" has no anchor "${tr.target}"`, `available anchors: ${Object.keys(an).slice(0, 12).join(', ') || '(none - declare props.anchors for a custom_draw scene)'}`); }
        else if (tr.target && typeof tr.target === 'object') { if (![tr.target.x, tr.target.y, tr.target.w, tr.target.h].every((v) => typeof v === 'number' && isFinite(v))) err(`${sp}.transition_in.target`, 'target rect needs numeric x,y,w,h (fractions)'); }
        else if (!Object.keys(an).length) err(`${sp}.transition_in.target`, `scene "${scenes[i - 1].id}" has no anchors to zoom into`, 'use another transition (a plain cut is fine), or add props.anchors to the custom_draw scene');
        else err(`${sp}.transition_in.target`, `zoom_into needs an explicit target: the final render never guesses one (anchors: ${Object.keys(an).slice(0, 8).join(', ')})`, 'set transition_in.target to an anchor of the previous scene');
      }
    }
    // props компонента
    const res = COMPONENTS[s.component].check({ ...s, props: s.props || {} }, plan);
    res.errors.forEach((e) => err(`${sp}.${e.path}`, e.message, e.hint));
    res.warnings.forEach((w) => warn(`${sp}.${w.path}`, w.message));
    // события
    const allowedEv = new Set([...GENERIC_EVENTS, ...Object.keys(COMPONENTS[s.component].spec.events || {})]);
    (s.events || []).forEach((e, k) => {
      const ep = `${sp}.events[${k}]`;
      if (!allowedEv.has(e.type)) err(`${ep}.type`, `event "${e.type}" not supported by ${s.component}`, `supported: ${[...allowedEv].join(', ')}`);
      if (typeof e.t !== 'number' || e.t < 0 || e.t > s.duration - 0.05) err(`${ep}.t`, `t must be within 0..${(s.duration - 0.05).toFixed(2)} (scene-local seconds)`);
      if (e.type === 'stop' && e.dur != null && (typeof e.dur !== 'number' || e.dur < 0.3 || e.dur > 1.5)) err(`${ep}.dur`, 'stop dur must be 0.3..1.5 seconds');
      if (e.type === 'stop' && typeof e.t === 'number' && e.t < 0.6) err(`${ep}.t`, `stop at t=${e.t} would hold an empty screen — place it after content has landed (t >= 0.6, ideally near the end of the scene) and let the payoff slam in right after it`);
      if (e.type === 'stop' && typeof e.t === 'number' && e.t + (e.dur ?? 0.7) > s.duration - 0.1) err(`${ep}.t`, `stop must end before the scene ends (t + dur <= ${(s.duration - 0.1).toFixed(2)})`);
      if (e.type === 'emphasis' && s.component === 'kinetic_type' && !(s.props?.lines || [])[e.line ?? 0]) err(`${ep}.line`, 'emphasis.line must reference an existing line index');
    });
    if (s.invert != null && typeof s.invert !== 'boolean') err(`${sp}.invert`, 'invert must be true/false');
    if (s.invert === true && isHex(pal.accent) && isHex(pal.fg) && contrast(pal.fg, pal.accent) < 2.2) warn(`${sp}.invert`, 'accent has low contrast on the inverted (light) field');
    if (s.camera != null) {
      if (!Array.isArray(s.camera) || s.camera.length > 4) err(`${sp}.camera`, 'camera must be an array of at most 4 segments');
      else s.camera.forEach((c, k) => {
        const cp = `${sp}.camera[${k}]`, num = (v) => typeof v === 'number' && isFinite(v);
        if (![c.t0, c.t1, c.z1].every(num) || c.t0 < 0 || c.t1 <= c.t0 || c.t1 > s.duration + 0.01) err(cp, `segment needs numeric t0 < t1 <= ${s.duration} and z1`);
        for (const z of [c.z0 ?? 1, c.z1]) if (num(z) && (z < 0.5 || z > 6)) err(cp, 'zoom must stay within 0.5..6');
        if ((c.x != null && !(c.x >= 0 && c.x <= 1)) || (c.y != null && !(c.y >= 0 && c.y <= 1))) err(cp, 'x and y are fractions 0..1');
        if (directed) {
          if (!CAMERA_PURPOSES.includes(c.purpose)) err(`${cp}.purpose`, `every camera move needs a semantic purpose: one of ${CAMERA_PURPOSES.join('|')}`, 'say WHY the camera moves (focus on the element the viewer must read, reveal context, follow an object...) or remove the move', 'narrative');
          else if (typeof c.reason !== 'string' || c.reason.trim().length < 8) err(`${cp}.reason`, 'camera move needs a short reason (what the viewer gains from it)', null, 'narrative');
          else if (c.purpose === 'hold' && (Math.abs((c.z1 ?? 1) - (c.z0 ?? 1)) > 0.02)) err(cp, 'a "hold" camera segment must keep the zoom constant (z0 = z1)', null, 'narrative');
        }
        if (c.ease && !CAMERA_EASES.includes(c.ease)) err(`${cp}.ease`, `ease must be one of ${CAMERA_EASES.join('|')}`);
        if (k > 0 && num(c.z0) && num(s.camera[k - 1].z1) && Math.abs(c.z0 - s.camera[k - 1].z1) > 0.02) warn(cp, 'z0 differs from the previous segment z1: the camera will jump');
      });
    }
    if (s.overlay_fn && !plan.assets?.baked?.[s.overlay_fn]) err(`${sp}.overlay_fn`, `fn "${s.overlay_fn}" is not baked (call run_sandbox_draw)`);
  });

  // ── таймлайн, плотность ──
  let total = 0, eventCount = 0, readSlack = Infinity;
  if (scenes.length && errors.every((e) => !/\.duration$|\.component$/.test(e.path))) {
    const lay = layoutScenes(plan);
    total = lay.total;
    const TR = totalRange(P, plan.meta?.length);
    if (total < TR[0] - 0.3 || total > TR[1] + 0.3) err('scenes', `total duration ${total.toFixed(1)}s is outside ${TR[0]}–${TR[1]}s for length=${plan.meta?.length || 'short'}/${P.id}`, total < TR[0] ? 'add a scene or lengthen scenes' : 'remove a scene or shorten scenes');
    eventCount = scenes.reduce((a, s) => a + (COMPONENTS[s.component] ? COMPONENTS[s.component].countEvents({ ...s, props: s.props || {}, events: s.events || [] }) : 0), 0);
    // ── время чтения: текст должен быть полностью виден достаточно долго до конца сцены / начала следующего перехода ──
    const bpmR = plan.audio?.bpm || P.bpm;
    scenes.forEach((s, i) => {
      const comp = COMPONENTS[s.component]; if (!comp?.readSpans) return;
      const outOverlap = lay.scenes[i + 1] ? lay.scenes[i + 1].tin : 0, end = s.duration - outOverlap;
      for (const sp of comp.readSpans({ ...s, props: s.props || {}, events: s.events || [] }, { P, bpm: bpmR, assets: plan.assets })) {
        const need = readSec(sp.text, P) * (sp.weight ?? 1), have = Math.min(sp.to ?? Infinity, end) - sp.from;
        readSlack = Math.min(readSlack, have - need);
        if (have < need - 0.05) err(`scenes[${i}].${sp.path}`, `"${String(sp.text).slice(0, 34)}" is fully visible for only ${Math.max(0, have).toFixed(1)} s but needs ~${need.toFixed(1)} s to be read`, 'shorten the text, start it earlier, lengthen the scene, or use fewer words per scene');
      }
    });
    const eps = total ? eventCount / total : 0;
    const lo = Math.ceil(P.eventsPerSec[0] * total), hi = Math.floor(P.eventsPerSec[1] * total);
    // плотность событий — темп профиля, а не корректность: только рекомендация, события не добавляют ради числа
    if (eventCount < lo * 0.9) advise('scenes', `event density ${eps.toFixed(2)}/s is below the usual ${P.id} pace ${P.eventsPerSec[0]}/s: fine for a quiet, hold-driven film; add motion only where the idea needs it`);
    else if (eventCount > hi * 1.1) advise('scenes', `event density ${eps.toFixed(2)}/s is above the usual ${P.id} pace ${P.eventsPerSec[1]}/s: check that every event has a reason`);
  }

  // ── режим арт-директора: что остаётся жёстким — привязка к фактам; всё остальное (зумы, число кастомных сцен, морфинг,
  //    виды появления текста, число шрифтов) решает концепция и проверяется слоями согласованности, а не квотами ──
  if (directed && scenes.length >= 3 && scenes.every((s) => COMPONENTS[s.component])) {
    if ((plan.meta?.libraryReads ?? 0) < 2) advise('meta.library', 'the reference library was not consulted: optional, but it is cheap and often sharpens the craft decisions');
    const factIds = new Set((plan.assets?.facts || []).map((f) => f.id));
    if (factIds.size) {
      const used = new Set();
      scenes.forEach((s, i) => {
        const ids = Array.isArray(s.facts) ? s.facts : [], good = ids.filter((id) => factIds.has(id)), bad = ids.filter((id) => !factIds.has(id));
        good.forEach((id) => used.add(id));
        if (bad.length) err(`scenes[${i}].facts`, `unknown fact ids: ${bad.join(', ')}`, `valid ids: ${[...factIds].slice(0, 8).join(', ')}...`);
        else if (!good.length) err(`scenes[${i}].facts`, 'every scene must be grounded in at least one fact: cite ids from FACTS (e.g. ["F3"])', 'set facts on the scene (edit_scene facts) and make its content actually come from those facts');
      });
      const need = Math.max(3, Math.ceil(scenes.length * 0.6));
      if (used.size < need) advise('scenes', `only ${used.size} distinct fact(s) are used; a film usually says something different in each scene (aim for ${need}+)`);
    }
  }

  // ── аудио ──
  const sfx = plan.audio?.sfx || [];
  if (sfx.length > 24) err('audio.sfx', 'max 24 explicit sfx cues');
  sfx.forEach((c, i) => {
    if (!SFX_KINDS.includes(c.kind)) err(`audio.sfx[${i}].kind`, `unknown sfx "${c.kind}"`, `known: ${SFX_KINDS.join(', ')}`);
    const sc = scenes.find((s) => s.id === c.scene);
    if (!sc) err(`audio.sfx[${i}].scene`, `unknown scene "${c.scene}"`);
    else if (typeof c.t !== 'number' || c.t < 0 || c.t > sc.duration) err(`audio.sfx[${i}].t`, `t must be within scene 0..${sc.duration}`);
  });
  const bpm = plan.audio?.bpm;
  if (bpm && (bpm < P.bpm * 0.9 || bpm > P.bpm * 1.1)) err('audio.bpm', `bpm ${bpm} outside ${Math.round(P.bpm * 0.9)}–${Math.round(P.bpm * 1.1)} for ${P.id}`);

  // ── язык ──
  const texts = collectTexts(scenes.map((s) => s.props || {}), []);
  if ((plan.meta?.lang || 'az') === 'az') {
    for (const t of texts) {
      if (/[Ѐ-ӿ]/.test(t.s)) err(`scenes${t.path}`, `Cyrillic text "${t.s.slice(0, 24)}" — the video language is Azerbaijani (Latin script)`);
      else if (/\b(the|and|with|your|for|you|from|this|that)\b/i.test(t.s) && !/google|\.com|\.az/i.test(t.s)) warn(`scenes${t.path}`, `"${t.s.slice(0, 28)}" looks English; the video language is Azerbaijani`);
    }
  }

  // язык внутри кода модели: тексты берутся из запечённых кадров
  if ((plan.meta?.lang || 'az') === 'az') for (const [i, s] of scenes.entries()) if (s.component === 'custom_draw') for (const tx of plan.assets?.baked?.[s.props?.fn]?.texts || []) if (/[\u0400-\u04FF]/.test(tx.s)) err(`scenes[${i}].props.fn`, `Cyrillic text "${tx.s.slice(0, 24)}" inside the drawing - the video language is Azerbaijani (Latin script)`);
  // ── общие предупреждения ──
  const last = scenes[scenes.length - 1];
  if (last && !['cta_end', 'brand_reveal'].includes(last.component) && !directed) advise('scenes', 'last scene is not cta_end/brand_reveal — a closing brand moment is usual');

  // энергетическая кривая: плотность событий по сценам (идея: контраст между участками, а не «быстро везде»)
  const dens = scenes.map((s) => (COMPONENTS[s.component] && s.duration ? COMPONENTS[s.component].countEvents({ ...s, props: s.props || {}, events: s.events || [] }) / s.duration : 0));
  let burstAt = null;
  if (scenes.length >= 3 && total) {
    const mx = Math.max(...dens);
    const lay2 = layoutScenes(plan);
    const bi = dens.indexOf(mx); burstAt = round((lay2.scenes[bi].start + lay2.scenes[bi].duration / 2) / total, 2);
  }
  const hasStop = scenes.some((s) => (s.events || []).some((e) => e.type === 'stop'));
  const trTypes = {};
  scenes.forEach((s, i) => { if (i) { const t = s.transition_in?.type || P.transitions.defaultType; trTypes[t] = (trTypes[t] || 0) + 1; } });
  const metrics = {
    dynamism: P.id, scenes: scenes.length, totalSec: round(total, 2), avgSceneSec: scenes.length ? round(scenes.reduce((a, s) => a + (s.duration || 0), 0) / scenes.length, 2) : 0,
    events: eventCount, eventsPerSec: total ? round(eventCount / total, 2) : 0, target: { eventsPerSec: P.eventsPerSec, sceneSec: P.sceneSec, totalSec: totalRange(P, plan.meta?.length) },
    transitions: trTypes, zoomInto: scenes.filter((s, i) => i > 0 && s.transition_in?.type === 'zoom_into').length, cameraMoves: scenes.filter((s) => Array.isArray(s.camera) && s.camera.length).length, customScenes: scenes.filter((s) => s.component === 'custom_draw').length, explicitSfx: sfx.length, bpm: bpm || P.bpm, readSlackSec: readSlack === Infinity ? null : round(readSlack, 2), sceneDensity: dens.map((d) => round(d, 2)), burstAt, hasStop, inverted: scenes.filter((s) => s.invert).length,
  };
  const by = (list, layer) => list.filter((i) => (i.layer || 'technical') === layer);
  const layers = {
    technical: { errors: by(errors, 'technical'), warnings: by(warnings, 'technical') },
    layout: { errors: by(errors, 'layout'), warnings: by(warnings, 'layout') },
    consistency: { errors: by(errors, 'consistency'), warnings: by(warnings, 'consistency') },
    narrative: { errors: by(errors, 'narrative'), warnings: by(warnings, 'narrative') },
    artistic: { recommendations: by(warnings, 'artistic') },
    // 5-й слой не автоматизируется: числа нет, есть пакет для человека (см. src/plan/review.js)
    human: { status: 'pending_human_review', note: 'aesthetic quality is judged by a person watching the film; no automated score exists or is implied' },
  };
  return { ok: errors.length === 0, errors, warnings, metrics, layers };
}
