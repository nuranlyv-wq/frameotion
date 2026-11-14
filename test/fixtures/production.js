// Детерминированные ответы четырёх этапов. Вход в пайплайн — только описание.
const rect = (x, y, w, h) => ({ x, y, w, h });
const layer = (id, kind, bounds, fontSize = 28, align = 'left', style = {}) => ({ id, kind, bounds, fontSize, align, ...style });
const prop = (target, role, text = '', value = 0, visible = true) => ({ target, role, text, value, visible });
const treatment = (field, texture, headlineSize, headlineFont, headlineAlign = 'left') =>
  ({ field, texture, headlineSize, headlineFont, headlineAlign, headlineColor: 'ink', copyAlign: headlineAlign });
const cue = (frame, kind, gain) => ({ frame, kind, gain });
const mono = { font: 'mono' };
const cut = { type: 'cut', frames: 0, target: '' };
const scene = (id, frames, objective, headline, copy, requiredStates = [], featureIds = ['workflow'], handoff = '') =>
  ({ id, frames, objective, headline, copy, requiredStates, featureIds, handoff });
const effect = (skill, target, from, frames, amount, easing = 'out-cubic') => ({ skill, target, from, frames, amount, easing });
const state = (id, props) => ({ id, props });
const versioned = (fields) => ({ version: 1, ...fields });

function kit(id, elements, states) {
  return versioned({
    components: [{ id, elements,
      fidelity: 'conceptual', evidenceIds: ['D1'], layout: 'relative', states }],
  });
}

function timeline({ fps, width, height, frames: totalFrames }, scenes, audio) {
  let start = 0;
  return versioned({ fps, width, height, frames: totalFrames, audio, scenes: scenes.map(({ frames, ...item }) => {
    const end = start + frames;
    const range = { start, end };
    start = end;
    return { componentId: '', bounds: rect(1, 1, 1, 1), states: [], transition: cut, ...item, ...range };
  }) });
}

function relayState(id, finished = false) {
  return state(id, [
    prop('board', 'surface'), prop('workspace', 'foreground', 'Launch checklist'),
    prop('serial', 'muted', 'RLY / 01'), prop('rule', 'background'),
    prop('selection', finished ? 'background' : 'surface'),
    prop('first', 'accent', '', 100), prop('second', finished ? 'accent' : 'muted', '', finished ? 100 : 0), prop('third', 'muted'),
    prop('title-a', 'muted', 'Write launch copy'), prop('title-b', 'foreground', 'Review design assets'),
    prop('title-c', 'muted', 'Publish release'), prop('divider', 'background'),
    prop('summary', finished ? 'accent' : 'muted', finished ? '02  /  03 COMPLETE' : '01  /  03 COMPLETE'),
    prop('meter', 'accent', '', finished ? 67 : 33),
    prop('pointer', 'foreground', '', 0, id === 'pointing'),
  ]);
}

const task = {
  name: 'Relay',
  description: 'Relay is a team task manager for small product teams. Mark a task done and see project progress update.',
  seconds: 7,
  audience: 'Small product teams',
  feature: 'Mark a task done and see project progress update.',
  concept: 'A live task board resolves into a bold progress statement after one click.',
  message: 'One click moves the project forward.',
  cta: 'Make progress visible.',
  visualLanguage: 'Graphite grid, lime signal and compressed display type with mono instrument labels',
  palette: { background: '#151815', foreground: '#F4F4EC', surface: '#262C26', muted: '#BAC2B4', accent: '#D8FA82', onAccent: '#15210D' },
  typography: 'sans',
  workflow: ['Mark a task done', 'Read the updated progress'],
  narrative: [
    scene('small-win', 123, 'Lead with the board; click the middle task and let the progress line answer.',
      'Work\nin motion.', 'RELAY  /  PROJECT WORKSPACE', ['queued', 'finished'], ['workflow'], 'Reframe the completed board under its new count.'),
    scene('momentum', 87, 'Use the new completion count as the headline and close on the same board.',
      '2 / 3', 'TASKS COMPLETE   /   RELAY', ['finished'], [], ''),
  ],
  interface: kit('relay-board', [
    layer('board', 'panel', rect(0, 0, 1000, 1000), 28, 'left', { finish: 'outline' }),
    layer('workspace', 'text', rect(58, 47, 630, 100), 44),
    layer('serial', 'text', rect(708, 64, 235, 69), 23, 'right', mono),
    layer('rule', 'panel', rect(55, 171, 890, 4)),
    layer('selection', 'panel', rect(35, 366, 930, 160), 28, 'left', { finish: 'outline' }),
    layer('first', 'check', rect(62, 236, 55, 72)),
    layer('second', 'check', rect(62, 410, 55, 72)),
    layer('third', 'check', rect(62, 578, 55, 72)),
    layer('title-a', 'text', rect(150, 214, 775, 115), 37),
    layer('title-b', 'text', rect(150, 386, 775, 116), 37),
    layer('title-c', 'text', rect(150, 555, 775, 117), 37),
    layer('divider', 'panel', rect(55, 719, 890, 4)),
    layer('summary', 'text', rect(62, 764, 870, 77), 30, 'left', mono),
    layer('meter', 'progress', rect(62, 884, 875, 45)),
    layer('pointer', 'cursor', rect(91, 455, 74, 95)),
  ], [relayState('queued'), relayState('pointing'), relayState('finished', true)]),
  timeline: [
    { id: 'small-win', frames: 123, componentId: 'relay-board', bounds: rect(67, 377, 866, 468),
      headline: rect(65, 119, 870, 208), copy: rect(68, 69, 845, 40),
      treatment: treatment('base', 'grid', 172, 'sans'),
      states: [{ id: 'queued', at: 0 }, { id: 'pointing', at: 27 }, { id: 'finished', at: 50 }],
      effects: [effect('slide-up', 'headline', 0, 15, 22),
        effect('slide-left', 'pointer', 27, 23, 112, 'in-out-cubic'), effect('slide-up', 'pointer', 27, 23, 105, 'in-out-cubic'),
        effect('progress-fill', 'meter', 50, 24, 0)] },
    { id: 'momentum', frames: 87, componentId: 'relay-board', bounds: rect(67, 463, 866, 426),
      headline: rect(65, 107, 870, 190), copy: rect(68, 298, 855, 55),
      treatment: treatment('accent', 'plain', 225, 'sans'),
      transition: { type: 'shared', frames: 17, target: 'component' },
      states: [{ id: 'finished', at: 0 }], effects: [effect('reveal-lines', 'headline', 0, 16, 0)] },
  ],
  audio: { bpm: 110, mood: 'bright', intensity: 'medium', key: 'D',
    cues: [cue(0, 'hit', 43), cue(27, 'swish', 38), cue(50, 'click', 95),
      cue(73, 'ding', 55), cue(119, 'whoosh', 47), cue(123, 'hit', 63)] },
};

function dinnerState(id, confirmed = false, ticket = false) {
  return state(id, [
    prop('paper', 'surface'), prop('topline', 'accent'), prop('serial', 'accent', ticket ? 'RESERVATION  /  J-007' : 'SATURDAY SERVICE'),
    prop('house', 'foreground', 'The Lantern Room'), prop('details', 'muted', 'Dinner for two'),
    prop('rule', 'muted'), prop('time-a', 'background', ticket ? '02 GUESTS' : '6:30 PM'),
    prop('time-b', confirmed ? 'accent' : 'background', '7:00 PM'),
    prop('footer', confirmed ? 'accent' : 'muted', confirmed ? 'RESERVATION CONFIRMED' : 'SELECT AN AVAILABLE TIME'),
    prop('pointer', 'foreground', '', 0, id === 'pointing'),
  ]);
}

const restaurant = {
  name: 'Juniper',
  description: 'Juniper is a restaurant reservation platform for diners. Choose an available dinner time and receive confirmation of the table.',
  seconds: 9,
  audience: 'Diners planning a restaurant visit',
  feature: 'Choose an available dinner time and receive confirmation of the table.',
  concept: 'An evening invitation becomes a booking ticket; the chosen time is the visual throughline.',
  message: 'A table for tonight.',
  cta: 'Find your table.',
  visualLanguage: 'Wine-red ink and warm paper, editorial serif with a restrained mono reservation stamp',
  palette: { background: '#F7EDDD', foreground: '#321824', surface: '#FFF8EC', muted: '#76534F', accent: '#8A2941', onAccent: '#FFF1E8' },
  typography: 'serif',
  workflow: ['Choose a dinner time', 'Read the confirmation'],
  narrative: [
    scene('invitation', 48, 'Open on an evening invitation', 'Tonight,\nfor two.', 'JUNIPER  /  DINNER RESERVATIONS', [], [], 'Move from invitation to the booking paper.'),
    scene('choose', 105, 'Show the selected time and confirmation', 'Pick a time.', '01  /  SATURDAY EVENING', ['times', 'booked']),
    scene('receipt', 69, 'Carry the booked time into the ticket', 'See you\nat seven.', '02  /  BOOKING CONFIRMED', ['booked', 'ticket'], ['workflow']),
    scene('signoff', 48, 'End with a short brand lockup', 'Juniper.', 'FIND YOUR TABLE', [], [], ''),
  ],
  interface: kit('dinner-card', [
    layer('paper', 'panel', rect(0, 0, 1000, 1000), 28, 'left', { finish: 'raised' }),
    layer('topline', 'panel', rect(55, 74, 890, 7)),
    layer('serial', 'text', rect(80, 113, 840, 80), 24, 'center', mono),
    layer('house', 'text', rect(65, 227, 870, 140), 52, 'center'),
    layer('details', 'text', rect(80, 388, 840, 88), 32, 'center'),
    layer('rule', 'panel', rect(55, 526, 890, 4)),
    layer('time-a', 'badge', rect(80, 601, 396, 142), 39, 'center', { font: 'mono', finish: 'outline' }),
    layer('time-b', 'badge', rect(524, 601, 396, 142), 39, 'center', { font: 'mono', finish: 'outline' }),
    layer('footer', 'text', rect(62, 819, 876, 110), 26, 'center', mono),
    layer('pointer', 'cursor', rect(707, 692, 78, 92)),
  ], [dinnerState('times'), dinnerState('pointing'), dinnerState('booked', true), dinnerState('ticket', true, true)]),
  timeline: [
    { id: 'invitation', frames: 48, headline: rect(65, 276, 870, 223), copy: rect(68, 214, 864, 44),
      treatment: treatment('inverse', 'dots', 174, 'serif', 'center'),
      effects: [effect('slide-up', 'headline', 0, 18, 22)] },
    { id: 'choose', frames: 105, componentId: 'dinner-card', bounds: rect(76, 336, 848, 439),
      headline: rect(67, 140, 866, 101), copy: rect(69, 89, 862, 40),
      treatment: treatment('base', 'plain', 132, 'serif', 'center'),
      states: [{ id: 'times', at: 0 }, { id: 'pointing', at: 33 }, { id: 'booked', at: 58 }],
      effects: [effect('slide-left', 'pointer', 33, 25, 92, 'in-out-cubic'),
        effect('slide-up', 'pointer', 33, 25, 68, 'in-out-cubic')] },
    { id: 'receipt', frames: 69, componentId: 'dinner-card', bounds: rect(129, 160, 742, 400),
      headline: rect(65, 649, 870, 159), copy: rect(69, 600, 862, 45),
      treatment: treatment('base', 'dots', 128, 'serif', 'center'),
      transition: { type: 'shared', frames: 17, target: 'component' },
      states: [{ id: 'booked', at: 0 }, { id: 'ticket', at: 21 }],
      effects: [effect('fade-in', 'copy', 16, 9, 100), effect('reveal-lines', 'headline', 16, 22, 32)] },
    { id: 'signoff', frames: 48, headline: rect(63, 386, 874, 145), copy: rect(69, 538, 862, 52),
      treatment: treatment('accent', 'plain', 191, 'serif', 'center'),
      effects: [effect('slide-up', 'headline', 0, 15, 21)] },
  ],
  audio: { bpm: 83, mood: 'warm', intensity: 'calm', key: 'F',
    cues: [cue(48, 'swish', 48), cue(106, 'click', 72), cue(111, 'ding', 52),
      cue(150, 'whoosh', 34), cue(174, 'tick', 55), cue(222, 'pop', 51)] },
};

export const productionExamples = { task, restaurant };

export function exampleOutput(example, stage, { input }) {
  if (stage === 'product') return versioned({
    name: example.name, audience: example.audience, valueProposition: example.feature, evidence: input.evidence,
    features: [{ id: 'workflow', claim: example.feature, evidenceIds: ['D1'] }],
    workflows: [{ label: example.name + ' workflow', steps: example.workflow, featureIds: ['workflow'] }],
    brand: { colors: [], fonts: [] }, assets: [], unknowns: [{ subject: 'Product UI', reason: 'No screenshots or verified visual evidence' }], confidence: 'medium',
  });
  if (stage === 'narrative') { const result = versioned({
    message: example.message, callToAction: example.cta, scenes: structuredClone(example.narrative),
    artDirection: { concept: example.concept, visualLanguage: example.visualLanguage, palette: example.palette,
      typography: example.typography, grid: 10, safeArea: 60, radius: 22, layering: 'Text stays above surfaces',
      density: 'balanced', motion: 'Use movement to clarify the selected state',
      transitions: 'Hold visible state across the handoff', camera: 'fixed', forbidden: ['flash'] },
  });
    if (input.settings.creative) {
      result.creative = { brief: example.concept, selected: 'object-led', rationale: 'The product action is the focal point.', directions: [
        { id: 'object-led', artDirection: result.artDirection, keyframe: { headline: example.message, object: example.workflow[0], composition: 'centered' } },
        { id: 'editorial', artDirection: { ...result.artDirection, typography: example.typography === 'serif' ? 'mono' : 'serif', visualLanguage: 'Split editorial composition with a large action specimen',
          palette: { background: '#F2EEE6', foreground: '#1E2A32', surface: '#FFFFFF', muted: '#53616B', accent: '#214E64', onAccent: '#FFFFFF' } },
          keyframe: { headline: example.message, object: example.workflow[1], composition: 'split' } },
      ] };
      result.scenes = result.scenes.map((scene) => ({ ...scene, action: scene.objective, result: scene.handoff || example.message, focus: scene.requiredStates[0] || 'brand', claims: [] }));
    }
    return result;
  }
  if (stage === 'interface') return structuredClone(example.interface);
  if (stage === 'motion') return timeline(input.settings, structuredClone(example.timeline), example.audio);
  throw new Error('Unexpected stage: ' + stage);
}
