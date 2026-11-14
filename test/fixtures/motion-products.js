import { productionExamples, exampleOutput } from './production.js';
const clone = (v) => structuredClone(v);
const rect = (x, y, w, h) => ({ x, y, w, h });
const effect = (skill, target, from, frames, amount, easing = 'out-cubic') => ({ skill, target, from, frames, amount, easing });
const layer = (id, kind, bounds, fontSize = 32, align = 'left') => ({ id, kind, bounds, fontSize, align });
const prop = (target, role, text = '', value = 0, visible = true) => ({ target, role, text, value, visible });

export const motionProducts = {};
const relay = clone(productionExamples.task);
relay.seconds = 10;
relay.concept = 'A selected task expands into its working surface, then resolves into project progress.';
relay.narrative = [
  { ...relay.narrative[0], frames: 150, headline: 'One small step.', copy: 'RELAY / PROJECT WORKSPACE', handoff: 'Expand the selected row into the project result.' },
  { ...relay.narrative[1], frames: 150, headline: 'Moving forward.', copy: 'RELAY', requiredStates: ['result', 'settled'], featureIds: ['workflow'] },
];
relay.timeline[0].frames = 150;
relay.timeline[0].headline = rect(65, 108, 870, 90);
relay.timeline[0].treatment.headlineSize = 98;
relay.timeline[0].bounds = rect(67, 252, 866, 548);
relay.timeline[0].states = [{ id: 'queued', at: 0 }, { id: 'pointing', at: 30 }, { id: 'finished', at: 83 }];
relay.timeline[0].effects = [effect('slide-up', 'selection', 0, 24, 26), effect('slide-left', 'pointer', 30, 30, 100, 'in-out-cubic'),
  effect('slide-up', 'pointer', 30, 30, 90, 'in-out-cubic'), effect('cursor-click', 'pointer', 60, 23, 22),
  effect('focus-ring', 'selection', 57, 34, 75), effect('progress-fill', 'meter', 83, 30, 0)];
relay.interface.components.push({ id: 'relay-result', fidelity: 'conceptual', evidenceIds: ['D1'], layout: 'relative',
  elements: [layer('result-panel', 'panel', rect(0, 0, 1000, 1000)), layer('label', 'text', rect(70, 50, 860, 80), 32),
    layer('total', 'number', rect(60, 200, 880, 300), 210), layer('bar', 'progress', rect(70, 560, 860, 60)),
    layer('caption', 'text', rect(70, 660, 860, 100), 36), layer('mark', 'check', rect(410, 820, 160, 120))],
  states: ['result', 'settled'].map((id) => ({ id, props: [prop('result-panel', 'surface'), prop('label', 'muted', 'PROJECT PROGRESS'),
    prop('total', 'accent', ' / 3', id === 'result' ? 1 : 2), prop('bar', 'accent', '', id === 'result' ? 33 : 67),
    prop('caption', 'foreground', 'Review design assets'), prop('mark', 'accent', '', id === 'result' ? 0 : 100)] })),
});
relay.timeline[1] = { ...relay.timeline[1], frames: 150, componentId: 'relay-result', bounds: rect(67, 267, 866, 586),
  headline: rect(65, 108, 870, 100), copy: rect(68, 69, 845, 40), treatment: { ...relay.timeline[0].treatment, texture: 'plain' },
  transition: { type: 'zoom-through', frames: 36, sourceTarget: 'selection', target: 'result-panel' },
  states: [{ id: 'result', at: 0 }, { id: 'settled', at: 62 }],
  effects: [effect('number-count', 'total', 62, 34, 0), effect('progress-fill', 'bar', 62, 34, 0), effect('result-pop', 'mark', 96, 24, 24)] };
relay.audio.cues = [{ frame: 60, kind: 'click', gain: 80 }, { frame: 112, kind: 'ding', gain: 40 }, { frame: 150, kind: 'whoosh', gain: 50 }, { frame: 246, kind: 'ding', gain: 50 }];
motionProducts.relay = relay;

const juniper = clone(productionExamples.restaurant);
juniper.seconds = 10;
juniper.concept = 'Choose seven o’clock; the selected time becomes the reservation ticket.';
juniper.narrative = [
  { ...juniper.narrative[1], frames: 150, headline: 'Tonight, for two.', copy: 'JUNIPER / DINNER RESERVATIONS', handoff: 'The selected seven o’clock tile grows into a reservation ticket.' },
  { ...juniper.narrative[2], frames: 150, headline: 'Your evening, set.', copy: 'JUNIPER', requiredStates: ['booked', 'ticket'], handoff: '' },
];
const booking = clone(juniper.timeline[1]);
booking.frames = 150; booking.id = 'choose'; booking.bounds = rect(76, 285, 848, 510);
booking.headline = rect(65, 130, 870, 100); booking.treatment.headlineSize = 98;
booking.states = [{ id: 'times', at: 0 }, { id: 'pointing', at: 30 }, { id: 'booked', at: 86 }];
booking.effects = [effect('slide-up', 'paper', 0, 24, 30), effect('slide-left', 'pointer', 30, 30, 92, 'in-out-cubic'),
  effect('slide-up', 'pointer', 30, 30, 68, 'in-out-cubic'), effect('cursor-click', 'pointer', 60, 26, 24),
  effect('focus-ring', 'time-b', 60, 36, 75)];
const ticket = clone(juniper.interface.components[0]); ticket.id = 'reservation-ticket';
ticket.elements.find((e) => e.id === 'house').bounds = rect(65, 245, 870, 120);
ticket.elements.find((e) => e.id === 'time-b').bounds = rect(130, 530, 740, 220);
ticket.elements.find((e) => e.id === 'time-b').fontSize = 95;
for (const state of ticket.states) { state.props.find((p) => p.target === 'time-a').visible = false; state.props.find((p) => p.target === 'rule').visible = false; }
juniper.interface.components.push(ticket);
const receipt = clone(juniper.timeline[2]); receipt.frames = 150; receipt.componentId = ticket.id;
receipt.bounds = rect(129, 255, 742, 535); receipt.headline = rect(65, 130, 870, 100); receipt.copy = rect(69, 89, 862, 40);
receipt.treatment.headlineSize = 98; receipt.treatment.texture = 'plain';
receipt.transition = { type: 'morph', frames: 36, sourceTarget: 'time-b', target: 'paper' };
receipt.states = [{ id: 'booked', at: 0 }, { id: 'ticket', at: 58 }];
receipt.effects = [effect('result-pop', 'time-b', 58, 24, 20), effect('focus-ring', 'footer', 92, 36, 55)];
juniper.timeline = [booking, receipt];
juniper.audio.cues = [{ frame: 60, kind: 'click', gain: 70 }, { frame: 86, kind: 'ding', gain: 45 }, { frame: 150, kind: 'whoosh', gain: 45 }, { frame: 208, kind: 'tick', gain: 45 }];
motionProducts.juniper = juniper;

export function motionOutput(example, stage, request) {
  const output = exampleOutput(example, stage, request);
  // Format-specific composition: horizontal scenes place copy beside the editable UI.
  if (stage === 'motion' && request.input.settings.width > request.input.settings.height) {
    for (const scene of output.scenes) {
      scene.headline = rect(65, 270, 355, 290); scene.copy = rect(65, 160, 355, 80);
      scene.bounds = rect(490, 120, 440, 740);
      scene.treatment.headlineSize = 105;
      scene.effects = scene.effects.filter((e) => !['slide-left', 'slide-up'].includes(e.skill));
    }
  }
  return output;
}
