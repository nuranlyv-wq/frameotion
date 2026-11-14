// Ручной план «Google, азербайджанский» — для проверки движка без обращения к LLM.
// НЕ результат работы Opus: параметры подобраны под границы профилей динамичности И под правило времени чтения.
import { emptyPlan } from '../../src/plan/model.js';

const E = (t, type, extra = {}) => ({ t, type, ...extra });
const dot = (t, x, y, size, label) => ({ t, x, y, ...(size ? { size } : {}), ...(label ? { label } : {}) });
const search = (cps, dots, cards, dur, trType, trDur, extraEvents = []) => ({
  id: 's2', component: 'search_to_map', duration: dur, transition_in: { type: trType, duration: trDur, dir: 'left' },
  props: { brand: 'Google', query: 'ən yaxın kafe', button: 'Google Axtarış', placeholder: 'Axtarın', typing: { start: 0.4, cps }, dots, cards }, events: extraEvents,
});
const cta = (dur, tr, trDur, events) => ({ id: 'cta', component: 'cta_end', duration: dur, transition_in: { type: tr, duration: trDur, dir: 'up' }, props: { headline: 'İndi axtarın', button: 'Google ilə başla', url: 'google.com', font: 'didone' }, events });

export function googlePlan(dynamism = 'medium') {
  const p = emptyPlan({ dynamism, styleId: 'clean' });
  p.meta.title = 'Google — axtarış';
  p.meta.craftRules = false;   // ручной план не обязан содержать ui_morph

  if (dynamism === 'calm') {
    p.scenes = [
      { id: 's1', component: 'kinetic_type', duration: 4.0, props: { lines: [{ text: 'Bir sual.', size: 'xl', style: 'fade', at: 0.3 }, { text: 'Dünya cavab verir', size: 'l', style: 'cut', at: 1.1, emphasis: ['Dünya'], font: 'serif' }], emphasisFont: 'serif-italic', bg: 'grid' }, events: [E(0.5, 'punch'), E(1.7, 'emphasis', { line: 1 })] },
      search(8, [dot(3.9, 0.25, 0.3, 'M', 'Kafe · 200 m'), dot(4.4, 0.62, 0.2, 'L'), dot(4.9, 0.78, 0.5), dot(5.4, 0.35, 0.68)], [{ t: 3.4, title: 'Kafe', sub: '200 m' }], 6.0, 'crossfade', 0.7, [E(2.7, 'punch'), E(3.3, 'flash', { strength: 0.5 })]),
      { id: 's3', component: 'ui_cards', duration: 3.8, transition_in: { type: 'iris', duration: 0.7 }, props: { title: 'Sürətli və dəqiq', font: 'condensed', items: [{ icon: 'search', title: 'Dərhal nəticə', at: 0.5 }, { icon: 'globe', title: 'Hər dildə', at: 1.3 }] }, events: [E(0.4, 'punch'), E(2.0, 'punch')] },
      cta(3.4, 'crossfade', 0.7, [E(1.6, 'punch')]),
    ];
  } else if (dynamism === 'medium') {
    p.scenes = [
      { id: 's1', component: 'kinetic_type', duration: 3.6, props: { lines: [{ text: 'Bir sual.', size: 'xl', style: 'slam', at: 0.2 }, { text: 'Dünya cavab verir', size: 'l', style: 'type', at: 0.4, emphasis: ['Dünya'], font: 'mono' }], emphasisFont: 'serif-italic', bg: 'grid' }, events: [E(0.25, 'punch'), E(1.7, 'emphasis', { line: 1 }), E(2.2, 'flash', { strength: 0.5 })] },
      search(9, [dot(3.4, 0.25, 0.3, 'M', 'Kafe · 200 m'), dot(3.7, 0.62, 0.2, 'L'), dot(4.0, 0.78, 0.5), dot(4.3, 0.35, 0.65), dot(4.6, 0.55, 0.8, 'S')], [{ t: 3.0, title: 'Kafe', sub: '200 m' }], 5.6, 'push', 0.45, [E(2.6, 'punch')]),
      { id: 's3', component: 'ui_cards', duration: 3.2, transition_in: { type: 'zoom_through', duration: 0.4 }, props: { title: 'Sürətli və dəqiq', font: 'grotesk', items: [{ icon: 'search', title: 'Dərhal nəticə', at: 0.3 }, { icon: 'map', title: 'Xəritədə yaxınlıq', at: 0.7 }, { icon: 'globe', title: 'Hər dildə', at: 1.1 }] }, events: [E(0.5, 'punch'), E(1.6, 'shake', { strength: 0.6 })] },
      cta(2.8, 'wipe', 0.4, [E(0.8, 'punch'), E(1.6, 'flash', { strength: 0.6 })]),
    ];
  } else {
    p.scenes = [
      { id: 's1', component: 'kinetic_type', duration: 2.4, props: { lines: [{ text: 'Bir sual.', size: 'xl', style: 'slam', at: 0.1 }, { text: 'Dünya cavab verir', size: 'l', style: 'cut', at: 0.5, emphasis: ['Dünya'], font: 'condensed' }], emphasisFont: 'serif-italic', bg: 'rings' }, events: [E(0.15, 'punch'), E(0.55, 'shake'), E(1.0, 'emphasis', { line: 1 }), E(1.6, 'flash', { strength: 0.6 })] },
      search(12, [dot(2.35, 0.25, 0.3, 'M', 'Kafe · 200 m'), dot(2.6, 0.62, 0.2, 'L'), dot(2.85, 0.78, 0.5, 'M'), dot(3.1, 0.35, 0.65), dot(3.35, 0.55, 0.82, 'S')], [], 4.0, 'zoom_through', 0.25, [E(2.2, 'punch'), E(2.9, 'shake', { strength: 0.6 })]),
      { id: 's3', component: 'ui_cards', duration: 2.4, transition_in: { type: 'slice', duration: 0.25 }, props: { title: 'Sürətli və dəqiq', font: 'grotesk', items: [{ icon: 'search', title: 'Dərhal nəticə', at: 0.4 }, { icon: 'globe', title: 'Hər dildə', at: 0.8 }] }, events: [E(0.35, 'punch'), E(0.9, 'shake', { strength: 0.8 }), E(1.5, 'punch'), E(1.9, 'flash', { strength: 0.5 })] },
      { id: 's4', component: 'kinetic_type', duration: 2.4, invert: true, transition_in: { type: 'flash_cut', duration: 0.2 }, props: { lines: [{ text: 'Hər dildə.', size: 'xl', style: 'cut', at: 0.1 }, { text: 'Hər yerdə.', size: 'xl', style: 'cut', at: 0.7, emphasis: ['yerdə.'], font: 'serif-italic' }], bg: 'dots' }, events: [E(0.15, 'punch'), E(0.75, 'shake'), E(1.4, 'punch')] },
      cta(2.4, 'wipe', 0.25, [E(0.5, 'punch'), E(0.9, 'flash', { strength: 0.6 }), E(1.5, 'punch')]),
    ];
  }
  return p;
}
