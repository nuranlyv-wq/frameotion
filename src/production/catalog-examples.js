import { MOTION_SKILLS } from './motion.js';
import { motionProducts, motionOutput } from '../../test/fixtures/motion-products.js';
import { exampleOutput, productionExamples } from '../../test/fixtures/production.js';
const clone = (v) => structuredClone(v);
const rect = (x, y, w, h) => ({ x, y, w, h });
const layer = (id, kind, bounds, fontSize = 42) => ({ id, kind, bounds, fontSize, align: 'left' });
const prop = (target, role, text = '', value = 0) => ({ target, role, text, value, visible: true });
const settings = { width: 1080, height: 1920, fps: 30, frames: 90 };
export function catalogExamples() {
  const base = exampleOutput(productionExamples.task, 'narrative', { input: { settings } });
  const entries = MOTION_SKILLS.map((skill) => {
    const kind = skill.target === 'headline' ? 'panel' : ['progress', 'number', 'cursor', 'panel'].includes(skill.target) ? skill.target : 'badge';
    const target = ['headline', 'component'].includes(skill.target) ? skill.target : 'object';
    const states = ['before', 'after'].map((id) => ({ id, props: [prop('surface', 'surface'), prop('label', 'foreground', 'Selected action'),
      prop('object', 'accent', kind === 'number' ? '%' : kind === 'badge' ? 'Open project' : '', id === 'before' ? 20 : 80)] }));
    const component = { id: 'specimen', fidelity: 'conceptual', evidenceIds: ['D1'], layout: 'relative',
      elements: [layer('surface', 'panel', rect(0, 0, 1000, 1000)), layer('label', 'text', rect(80, 70, 840, 140), 44),
        layer('object', kind, kind === 'cursor' ? rect(440, 410, 150, 230) : kind === 'number' ? rect(100, 300, 800, 400) : rect(100, 400, 800, 180), kind === 'number' ? 160 : 42)], states };
    const scene = { id: 'specimen', start: 0, end: 90, componentId: component.id,
      bounds: rect(90, 350, 820, 400), headline: rect(70, 130, 860, 130), copy: rect(70, 280, 860, 50),
      states: [{ id: 'before', at: 0 }, { id: 'after', at: 40 }], transition: { type: 'cut', frames: 0, target: '' },
      effects: [{ skill: skill.id, target, from: ['progress-fill', 'number-count'].includes(skill.id) ? 40 : 12,
        frames: 32, amount: skill.id === 'camera-drift' ? 6 : Math.min(skill.maxAmount, 80), easing: 'in-out-cubic' }] };
    const narrative = { ...base, scenes: [{ id: 'specimen', frames: 90, objective: skill.purpose, headline: skill.id.replaceAll('-', '\n'),
      copy: 'EDITABLE MOTION / KADR', featureIds: [], requiredStates: ['before', 'after'], handoff: '' }] };
    return { id: skill.id, narrative, kit: { version: 1, components: [component] }, timeline: { version: 1, ...settings, scenes: [scene] } };
  });
  for (const [id, example] of [['morph', motionProducts.juniper], ['zoom-through', motionProducts.relay]]) {
    const spec = { ...settings, frames: 300 };
    entries.push({ id, narrative: motionOutput(example, 'narrative', { input: { settings: spec } }), kit: clone(example.interface),
      timeline: motionOutput(example, 'motion', { input: { settings: spec } }) });
  }
  const shared = { id: 'shared', narrative: exampleOutput(productionExamples.task, 'narrative', { input: { settings } }),
    kit: clone(productionExamples.task.interface), timeline: exampleOutput(productionExamples.task, 'motion', { input: { settings: { ...settings, frames: 210 } } }) };
  delete shared.timeline.audio;
  entries.push(shared);
  const match = clone(shared); match.id = 'match';
  match.narrative.continuity = { id: 'focus', kind: 'pin', role: 'accent', label: '', purpose: 'Carry attention to the result' };
  const component = match.kit.components[0]; component.elements.push(layer('focus', 'pin', rect(760, 800, 90, 120)));
  for (const state of component.states) state.props.push(prop('focus', 'accent'));
  match.timeline.scenes[1].transition = { type: 'match', target: 'focus', frames: 24 };
  entries.push(match);
  return entries;
}
