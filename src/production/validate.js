import { checkSchema, ProductBlueprint, NarrativeBlueprint, InterfaceSceneKit, MotionTimeline } from './contracts.js';
import { absoluteBounds, cameraAt, poseAt, COMPONENT_TARGET, MOTION_SKILLS } from './motion.js';
import { contrast } from '../util.js';
import { soundLibrary } from './sound-library.js';

export class ContractError extends Error {
  constructor(issues) {
    super(issues.slice(0, 16).join('\n'));
    this.issues = issues;
  }
}

function shape(schema, data) {
  const issues = checkSchema(schema, data);
  if (issues.length) throw new ContractError(issues);
}

function checks(run) {
  const issues = [];
  run((condition, message) => { if (!condition) issues.push(message); });
  if (issues.length) throw new ContractError(issues);
}

const unique = (ids) => ids.length === new Set(ids).size;
const index = (values) => new Map(values.map((item) => [item.id, item]));
const idsOf = (items) => items.map((item) => item.id);
const inside = ({ x, y, w, h }, margin = 0) =>
  x >= margin && y >= margin && x + w <= 1000 - margin && y + h <= 1000 - margin;

export function validateProduct(data, source) {
  shape(ProductBlueprint, data);
  const features = index(data.features);
  const evidence = index(data.evidence);
  checks((check) => {
    check(unique(idsOf(data.evidence)), 'product.evidence: duplicate IDs');
    check(unique(idsOf(data.features)), 'product.features: duplicate IDs');
    for (const entry of data.evidence) {
      const original = source.evidence.find(({ id }) => id === entry.id);
      check(original?.source === entry.source && original?.text === entry.text, `evidence ${entry.id}: copy an original evidence entry verbatim`);
    }
    for (const entry of data.features) {
      check(entry.evidenceIds.every((id) => evidence.has(id)), `feature ${entry.id}: unknown evidence ID`);
    }
    for (const workflow of data.workflows) {
      check(workflow.featureIds.every((id) => features.has(id)), `workflow ${workflow.label}: unknown feature ID`);
    }
    check(unique(idsOf(data.assets)), 'product.assets: duplicate IDs');
    for (const asset of data.assets) {
      check(source.assets.some((original) => original.id === asset.id && original.kind === asset.kind && original.source === asset.source),
        `asset ${asset.id}: unavailable from the input`);
    }
  });
}

export function validateNarrative(data, product, settings) {
  shape(NarrativeBlueprint, data);
  const features = index(product.features);
  checks((check) => {
    check(unique(idsOf(data.scenes)), 'narrative.scenes: duplicate IDs');
    check(data.scenes.reduce((total, scene) => total + scene.frames, 0) === settings.frames, `narrative: total must equal ${settings.frames} frames`);
    check(data.scenes.some(({ requiredStates }) => requiredStates.length >= 2), 'narrative: demonstrate at least one interface state change within a scene');
    if (settings.creative) {
      check(Boolean(data.creative), 'narrative: provide a creative brief and two visual directions');
      if (data.creative) {
        const choices = data.creative.directions;
        check(unique(idsOf(choices)), 'creative: distinct IDs required');
        const selected = choices.find(({ id }) => id === data.creative.selected);
        check(selected && JSON.stringify(selected.artDirection) === JSON.stringify(data.artDirection), 'creative: selected direction must equal artDirection');
        check(choices[0].artDirection.typography !== choices[1].artDirection.typography && choices[0].keyframe.composition !== choices[1].keyframe.composition,
          'creative: differ in typography and composition, not just palette');
      }
      for (const scene of data.scenes) {
        check(Boolean(scene.action && scene.result && scene.focus), `scene ${scene.id}: describe visible action, result and focus`);
        for (const claim of scene.claims || []) check(claim.evidenceIds.every((id) => product.evidence.some((e) => e.id === id)), `scene ${scene.id}: unsupported claim`);
      }
    }
    if (settings.linkScenes && data.scenes.length > 1) {
      check(Boolean(data.continuity), 'narrative: define a continuity motif for the scene handoffs');
    }
    if (data.continuity) {
      const { id, kind, label } = data.continuity;
      check(!['headline', 'copy', COMPONENT_TARGET].includes(id), 'narrative.continuity: use an unreserved layer ID');
      check(kind === 'badge' ? Boolean(label.trim()) : label === '', 'narrative.continuity: a badge needs a label; a pin has an empty label');
      for (const scene of data.scenes.slice(0, -1)) {
        check(Boolean(scene.handoff.trim()), `scene ${scene.id}: describe how the motif hands over to the next scene`);
      }
    }
    for (const scene of data.scenes) {
      check(unique(scene.requiredStates), `scene ${scene.id}: duplicate required states`);
      check(scene.featureIds.every((id) => features.has(id)), `scene ${scene.id}: unknown feature ID`);
    }
  });
}

export function validateInterface(data, product, narrative, source) {
  shape(InterfaceSceneKit, data);
  const evidence = index(product.evidence);
  checks((check) => {
    check(unique(idsOf(data.components)), 'interface.components: duplicate IDs');
    for (const component of data.components) {
      const { id, states, elements, evidenceIds, fidelity } = component;
      const elementIds = idsOf(elements);
      check(evidenceIds.every((ref) => evidence.has(ref)), `component ${id}: unknown evidence ID`);
      check(fidelity === 'conceptual' || evidenceIds.some((ref) => source.interfaceEvidenceIds.includes(ref)),
        `component ${id}: reconstruction requires verified visual interface evidence`);
      check(unique(idsOf(states)) && unique(elementIds), `component ${id}: duplicate state or target ID`);
      check(elementIds.every((key) => !['headline', 'copy', 'canvas', COMPONENT_TARGET].includes(key)), `component ${id}: headline, copy, canvas and component are reserved target IDs`);
      const motif = narrative.continuity;
      if (motif) {
        const layer = elements.find((item) => item.id === motif.id);
        check(layer?.kind === motif.kind, `component ${id}: add continuity layer ${motif.id} of kind ${motif.kind}`);
      }
      for (const element of elements) {
        check(inside(element.bounds), `component ${id}/${element.id}: outside component bounds`);
      }
      for (const state of states) {
        const targets = state.props.map(({ target }) => target);
        check(unique(targets) && targets.length === elementIds.length && targets.every((target) => elementIds.includes(target)),
          `component ${id}/${state.id}: give one props record for every element`);
        check(state.props.some(({ visible }) => visible), `component ${id}/${state.id}: all elements hidden`);
        if (motif) {
          const prop = state.props.find(({ target }) => target === motif.id);
          check(prop?.visible && prop.role === motif.role && prop.text === motif.label,
            `component ${id}/${state.id}: keep continuity layer ${motif.id} visible with its declared role and label`);
        }
      }
    }
    for (const scene of narrative.scenes) {
      check(!scene.requiredStates.length || data.components.some((component) =>
        scene.requiredStates.every((id) => component.states.some((state) => state.id === id))),
      `scene ${scene.id}: no component covers its required states`);
    }
  });
}

function visibleSignature(component, state) {
  return JSON.stringify(component.elements.map((element) => {
    const prop = state.props.find(({ target }) => target === element.id);
    if (!prop.visible) return null;
    const appearance = [prop.role];
    if (['text', 'badge'].includes(element.kind)) appearance.push(prop.text);
    if (['progress', 'check', 'number'].includes(element.kind)) appearance.push(prop.value);
    return appearance;
  }));
}

export function validateTimeline(data, narrative, kit, settings) {
  shape(MotionTimeline, data);
  if (data.choreography) {
    checks((check) => {
      check(Math.abs(data.width / data.height - 16 / 9) < .001, 'kinetic-workbench: requires 16:9 landscape');
      check(data.frames / data.fps >= 12 && data.frames / data.fps <= 18, 'kinetic-workbench: duration must be 12–18 seconds');
      check(Boolean(settings.allowChoreography), 'kinetic-workbench: select this recipe explicitly for a visual creation product');
      for (const field of ['width', 'height', 'fps', 'frames']) check(data[field] === settings[field], `timeline.${field}: expected ${settings[field]}`);
      for (const cue of data.audio?.cues || []) {
        check(cue.frame < settings.frames, 'audio: cue beyond final frame');
        if (cue.assetId) check(soundLibrary().sounds.some((s) => s.id === cue.assetId), `audio: unknown sound asset ${cue.assetId}`);
      }
    });
    return;
  }
  const components = index(kit.components);
  const skills = index(MOTION_SKILLS);
  const margin = narrative.artDirection.safeArea;
  checks((check) => {
    for (const field of ['width', 'height', 'fps', 'frames']) {
      check(data[field] === settings[field], `timeline.${field}: expected ${settings[field]}`);
    }
    check(data.scenes.length === narrative.scenes.length, 'timeline: scene count differs from narrative');
    let previous = null;
    for (const [i, scene] of data.scenes.entries()) {
      const { id, start, end, componentId, bounds, states, effects, transition } = scene;
      const expected = narrative.scenes[i];
      const duration = end - start;
      const component = components.get(componentId);
      check(expected?.id === id && expected?.frames === duration, `scene ${id}: must match narrative order and duration`);
      check(start === (previous?.end ?? 0), `scene ${id}: scene ranges must be contiguous`);
      check(inside(scene.headline, margin) && (!expected?.copy || inside(scene.copy, margin)),
        `scene ${id}: headline or copy outside safe area`);
      if (scene.treatment) {
        const { background, foreground, accent, onAccent } = narrative.artDirection.palette;
        const field = scene.treatment.field;
        const paper = field === 'inverse' ? foreground : field === 'accent' ? accent : background;
        const ink = field === 'inverse' ? background : field === 'accent' ? onAccent : foreground;
        const headline = scene.treatment.headlineColor === 'accent' ? accent : ink;
        check(contrast(paper, headline) >= 3, `scene ${id}: headline needs more contrast with its background`);
      }
      if (componentId) {
        check(Boolean(component), `scene ${id}: unknown component ${componentId}`);
        check(inside(bounds, margin), `scene ${id}: component outside safe area`);
      }
      const available = index(component?.states || []);
      check(states.length ? states[0].at === 0 : !componentId, `scene ${id}: give the initial state at frame 0`);
      for (const [j, cue] of states.entries()) {
        check(available.has(cue.id) && cue.at < duration && (j === 0 || cue.at > states[j - 1].at),
          `scene ${id}: invalid or unordered state cue ${cue.id} at ${cue.at}`);
      }
      const actual = states.map((cue) => cue.id);
      const required = expected?.requiredStates || [];
      check(required.every((key, j) => actual.indexOf(key) > (j ? actual.indexOf(required[j - 1]) : -1)),
        `scene ${id}: required states must occur in narrative order`);
      if (required.length >= 2 && required.every((key) => available.has(key))) {
        for (const [j, key] of required.entries()) {
          if (j > 0) check(visibleSignature(component, available.get(key)) !== visibleSignature(component, available.get(required[j - 1])),
            `scene ${id}: required state ${key} must change visible properties`);
        }
      }
      const elements = index(component?.elements || []);
      for (const [j, shot] of (scene.camera || []).entries()) {
        check(['canvas','headline','copy',COMPONENT_TARGET].includes(shot.target) || elements.has(shot.target), `scene ${id}: unknown camera target ${shot.target}`);
        check(shot.target !== COMPONENT_TARGET || Boolean(component), `scene ${id}: camera needs a component`);
        check(shot.at >= transition.frames && shot.at+shot.frames <= duration && (!j || shot.at>=scene.camera[j-1].at+scene.camera[j-1].frames), `scene ${id}: camera moves overlap or exceed scene/bridge`);
      }
      const poseEnds = new Map();
      for (const pose of scene.poses || []) {
        check(elements.has(pose.target) || ['headline','copy'].includes(pose.target), `scene ${id}: unknown pose target ${pose.target}`);
        check(pose.at >= transition.frames && pose.at+pose.frames<=duration && pose.at >= (poseEnds.get(pose.target) ?? 0), `scene ${id}: poses overlap or exceed scene/bridge`);
        poseEnds.set(pose.target,pose.at+pose.frames);
      }
      if (narrative.continuity) check(!(scene.camera?.length || scene.poses?.some((p)=>p.target===narrative.continuity.id)), `scene ${id}: global motif cannot share camera/pose tracks`);
      if (previous && transition.type !== 'cut') {
        const oldComponent=components.get(previous.componentId);
        const oldTargets=new Set(['canvas','headline','copy',COMPONENT_TARGET,...(oldComponent?.elements.map(e=>e.id)||[])]);
        if (previous.camera?.every(s=>oldTargets.has(s.target))) {
          const c=cameraAt(previous,oldComponent,previous.end-previous.start-1);
          check(c.x===500&&c.y===500&&c.scale===1&&c.rotation===0,`scene ${id}: reset previous camera to canvas/100 before a semantic bridge, or use a cut`);
        }
        for (const target of new Set((previous.poses || []).map(p=>p.target))) {
          const p=poseAt(previous,target,previous.end-previous.start-1);
          check(p.x===0&&p.y===0&&p.scale===1&&p.rotation===0&&p.opacity===1,`scene ${id}: reset previous object poses before a semantic bridge, or use a cut`);
        }
      }
      if (narrative.continuity && i > 0) {
        check(transition.type === 'match' && transition.target === narrative.continuity.id,
          `scene ${id}: use a match transition on ${narrative.continuity.id}`);
      }
      if (narrative.continuity) check(Boolean(component), `scene ${id}: use a component that contains the continuity layer`);
      if (transition.type === 'cut') {
        check(transition.frames === 0 && transition.target === '', `scene ${id}: cut has no duration or target`);
      } else if (['morph', 'zoom-through'].includes(transition.type)) {
        const old = components.get(previous?.componentId);
        const source = old?.elements.find(({ id }) => id === transition.sourceTarget);
        const target = elements.get(transition.target);
        const from = old?.states.find(({ id }) => id === previous?.states.at(-1)?.id)?.props.find(({ target }) => target === transition.sourceTarget);
        const to = available.get(states[0]?.id)?.props.find(({ target }) => target === transition.target);
        check(source && target && ['panel', 'badge'].includes(source.kind) && ['panel', 'badge'].includes(target.kind) && from?.visible && to?.visible,
          `scene ${id}: morph needs visible panel/badge sourceTarget and target in adjacent scenes`);
        check(!narrative.continuity, `scene ${id}: object morph cannot also carry a global motif`);
        check(transition.frames >= (transition.type === 'zoom-through' ? 18 : 12) && transition.frames <= 45 && transition.frames < duration &&
          !states.some((cue) => cue.at > 0 && cue.at < transition.frames), `scene ${id}: invalid morph duration or state change during bridge`);
        check(!effects.some((effect) => effect.from < transition.frames), `scene ${id}: start effects after the bridge`);
        check(!previous?.effects.some((effect) => effect.skill === 'camera-drift'), `scene ${id}: camera must settle before an object bridge`);
      } else if (transition.type === 'match') {
        const motif = narrative.continuity;
        const oldComponent = components.get(previous?.componentId);
        const source = oldComponent?.elements.find(({ id }) => id === transition.target);
        const target = elements.get(transition.target);
        check(motif && transition.target === motif.id && source?.kind === motif.kind && target?.kind === motif.kind,
          `scene ${id}: match needs the declared continuity layer in the previous and current component`);
        check(transition.frames >= 8 && transition.frames <= 32 && transition.frames < duration &&
          !states.some((cue) => cue.at > 0 && cue.at < transition.frames),
        `scene ${id}: match must take 8–32 frames and finish before the next state cue`);
        check(!effects.some(({ target }) => target === transition.target), `scene ${id}: the match transition controls the continuity layer`);
      } else {
        const before = available.get(previous?.states.at(-1)?.id);
        const after = available.get(states[0]?.id);
        const sharedProp = (state) => state?.props.find(({ target }) => target === transition.target);
        const previousProp = sharedProp(before);
        const nextProp = sharedProp(after);
        const whole = transition.target === COMPONENT_TARGET;
        check(component && componentId === previous?.componentId && (whole ? before && after :
          elements.has(transition.target) && previousProp?.visible && nextProp?.visible),
        `scene ${id}: shared transition requires a visible target in both scenes`);
        if (whole && component && before && after) {
          check(visibleSignature(component, before) === visibleSignature(component, after),
            `scene ${id}: shared component must preserve its appearance at the cut`);
        }
        if (previousProp && nextProp) {
          check(['role', 'text', 'value'].every((field) => previousProp[field] === nextProp[field]),
            `scene ${id}: shared target must preserve its appearance at the cut`);
        }
        check(!effects.some(({ target, skill }) => (target === transition.target || (whole && elements.has(target))) &&
          ['slide-up', 'slide-left', 'fade-in'].includes(skill)), `scene ${id}: shared target cannot have an entrance effect`);
        check(transition.frames >= 2 && transition.frames < duration &&
          !states.some((cue) => cue.at > 0 && cue.at < transition.frames), `scene ${id}: invalid shared transition duration or state changes during handoff`);
      }
      if (narrative.continuity) {
        check(!effects.some(({ target }) => target === narrative.continuity.id),
          `scene ${id}: do not apply entrance effects to the continuity layer`);
      }
      check(unique(effects.map((effect) => `${effect.target}:${effect.skill}`)), `scene ${id}: duplicate skill on the same target`);
      for (const effect of effects) {
        const skill = skills.get(effect.skill);
        const target = elements.get(effect.target);
        const textTarget = effect.target === 'headline' || (effect.target === 'copy' && Boolean(expected?.copy));
        const compatible = skill?.target === 'any' ? target || textTarget :
          skill?.target === 'headline' ? effect.target === 'headline' : skill?.target === 'component' ? Boolean(component) && effect.target === 'component' : target?.kind === skill?.target;
        check(skill && compatible,
          `scene ${id}: invalid skill or target ${effect.skill}/${effect.target}`);
        check(effect.from + effect.frames <= duration && effect.amount <= skill?.maxAmount && effect.frames >= 6 && effect.frames <= 90,
          `scene ${id}: effect ${effect.skill}/${effect.target} exceeds duration or amount limits`);
        if (['progress-fill', 'number-count'].includes(effect.skill)) {
          check(effect.from > 0 && states.some((cue) => cue.at === effect.from) &&
            !states.some((cue) => cue.at > effect.from && cue.at < effect.from + effect.frames),
          `scene ${id}: progress-fill must start at a state cue after frame 0 and end before the next cue`);
        }
        if (['slide-up', 'slide-left'].includes(effect.skill) && (target || textTarget)) {
          const area = target ? absoluteBounds(bounds, target.bounds) : scene[effect.target];
          const axis = effect.skill === 'slide-left' ? 'x' : 'y';
          check(inside({ ...area, [axis]: area[axis] + effect.amount }, margin),
            `scene ${id}/${effect.target}: slide starts outside safe area`);
        }
      }
      previous = scene;
    }
    if (settings.motionFirst) {
      const uiFrames = data.scenes.filter((s) => s.componentId).reduce((n, s) => n + s.end - s.start, 0);
      check(uiFrames >= settings.frames * 0.65, 'motion-first: editable product objects must carry at least 65% of the film');
      check(data.scenes.some((s) => s.camera?.length || s.poses?.some(p=>!['headline','copy'].includes(p.target)) || s.effects.some((e) => !['headline', 'copy'].includes(e.target)) || ['morph', 'zoom-through'].includes(s.transition.type)),
        'motion-first: animate product objects, not only text');
    }
    check(previous?.end === settings.frames, 'timeline: last frame must match total');
    for (const cue of data.audio?.cues || []) {
      check(cue.frame < settings.frames, `audio: cue ${cue.kind} is beyond the final frame`);
      if (cue.assetId) check(soundLibrary().sounds.some((s) => s.id === cue.assetId), `audio: unknown sound asset ${cue.assetId}`);
    }
  });
}
