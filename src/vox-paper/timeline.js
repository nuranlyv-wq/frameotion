import {clamp, ease, phase} from './math.js';
import {validateAction} from './catalog.js';

export function sampleAction(action, time) {
  validateAction(action);
  if (!Number.isFinite(time)) throw new TypeError('time must be finite');
  const local = time - (action.start ?? 0);
  const linear = clamp(local / action.duration);
  const p = action.direction === 'reverse' ? 1 - linear : linear;
  // Equal compression/opening time; the four accepted poses each last 0.5 s.
  // The final flat print is a stable landing; callers may choose longer lead/exit.
  const hold = .5, lead = Math.max(0, (action.duration - 2) / 2);
  const pose = Math.floor((local - lead) / hold + 1e-9);
  const amounts = [.26, .7, 1, .46];
  return {
    local, p, active: local >= 0 && local < action.duration,
    crumpleAmount: amounts[pose] ?? 0,
    print: action.technique === 'crumple' ? (pose >= 3 ? 'after' : 'before') : 'before',
    enter: phase(p, .06, .32), leave: phase(p, .69, .95),
    remove: phase(p, .13, .43), attach: phase(p, .48, .75),
    mark: phase(p, .2, .68), press: ease(clamp(p / .36)),
  };
}

// Cue semantics for a caller to map to the user's imported recordings.
// No generated sound or arbitrary library fallback is embedded in the renderer.
export function paperEvents(action) {
  validateAction(action);
  const start = action.start ?? 0, d = action.duration;
  if (action.technique === 'crumple') {
    const lead = Math.max(0, (d - 2) / 2);
    return ['crease', 'compress', 'compress', 'unfold'].map((kind, i) => ({kind, at: start + lead + i * .5}));
  }
  const kinds = {
    'calendar-tear': ['tear', .26], 'tear-split': ['tear', .2], 'strip-tear': ['tear', .2],
    'phrase-swap': ['tear', .13], stamp: ['impact', .36], marker: ['marker', .2],
    'tape-peel': ['peel', .18], 'label-peel': ['peel', .18],
  };
  const [kind, at] = kinds[action.technique] ?? ['paper', .15];
  const events = [{kind, at: start + d * (action.direction === 'reverse' ? 1 - at : at)}];
  if (action.technique === 'phrase-swap') events.push({kind: 'attach', at: start + d * (action.direction === 'reverse' ? .25 : .75)});
  return events.sort((a, b) => a.at - b.at);
}
