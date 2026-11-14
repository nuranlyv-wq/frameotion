// The treatment says what a shot is for. This report pairs that intent with the
// actual actors, handoff and time available in the compiled score.
import {ACTIONS, LINKS, SHOWS} from './techniques.js';
import {stageTextActors} from './stage-player.js';
import {causalContinuityContext} from '../craft/continuity.js';

const reading = text => Math.max(22, text.trim().split(/\s+/u).length * 6);
const tool = (id, entry, actors) => ({
  tool: id, title: entry.title, solves: entry.solves, actors, ...(entry.limits && {limits: entry.limits}),
});

function visibleCopy(element) {
  if (element.card) return [element.card.title, element.card.subtitle, element.card.badge].filter(Boolean).join(' · ');
  return element.text;
}

function settlesAt(element) {
  const poses = element.motion ?? [];
  const motionEnds = poses.filter((key,index)=>index && ['x','y','scale','rotate','opacity'].some(field=>
    Math.abs((key[field] ?? 0)-(poses[index-1][field] ?? 0)) >= (['x','y'].includes(field) ? 8 : 5))).at(-1)?.frame ?? 0;
  return Math.max(element.start + (element.enter === 'none' ? 0 : element.enterFrames),
    motionEnds, element.formTrack?.keys.at(-1)?.frame ?? 0,
    element.fold ? element.fold.at+element.fold.frames : 0,
    element.wordClick ? element.wordClick.at + element.wordClick.frames : 0);
}

export function directionPlan(treatment, score, settings = {}) {
  const selected = treatment.directions.find(direction => direction.id === treatment.selected);
  const scenes = score.scenes.map((scene, index) => {
    const beat = scene.sourceScene ? treatment.beats.find(item => item.id === scene.sourceScene) : treatment.beats[index];
    const previousScene = score.scenes[index - 1];
    const previous = previousScene?.sourceScene ? treatment.beats.find(item => item.id === previousScene.sourceScene) : treatment.beats[index - 1];
    const next = score.scenes[index + 1];
    const visual = beat.visual;
    const own = score.elements.filter(element => element.start >= scene.start && element.start < scene.end);
    const visible = score.elements.filter(element => element.start < scene.end && element.end > scene.start);
    const endsBefore = scene.end - (next?.transition && next.transition.kind !== 'portal' ? next.transition.frames : 0);
    const startsAfter = scene.start + (scene.transition?.kind === 'portal' ? scene.transition.frames : scene.transition?.revealFrames ?? 0);
    const text = visible.flatMap(element=>element.stage?stageTextActors(element,score.fps):[element]).flatMap(element => {
      const copy = visibleCopy(element);
      if (!copy) return [];
      const end = Math.min(endsBefore, element.end - (element.exit === 'cut' || element.end === score.frames ? 0 : 7));
      const readable = (text, start, stop) => ({
        id: element.id, text, enter: element.enter,
        readableFrames: Math.max(0, stop - Math.max(startsAfter, start)), neededFrames: reading(text),
      });
      if (!element.wordClick) return [readable(copy, settlesAt(element), end)];
      const {word, replace, at, frames} = element.wordClick;
      const outcome = replace ?? '●';
      // The second line refers to the visual result, not the original word's reading window.
      return [readable(copy, element.start + element.enterFrames, Math.min(end, at)),
        {...readable(outcome, at + frames, end), replaces: word}];
    });
    const tools = [];
    for(const element of own.filter(element=>element.stage))tools.push({tool:'composition',title:'Authored scene graph',actors:element.stage.nodes.map(node=>element.id+'-'+node.id),
      stage:element.stage});
    const add = (id, items) => { if (items.length) tools.push(tool(id, ACTIONS[id], items.map(item => item.id))); };
    for (const id of ['word-lift', 'kinetic-stretch', 'word-type']) add(id, own.filter(item => item.enter === id));
    add('object-reveal', own.filter(item => item.objectReveal));
    add('word-click', own.filter(item => item.wordClick));
    add('key-phrase', own.filter(item => item.emphasis));
    add('press', own.filter(item => /^(button|press|sent-mark)-/.test(item.id)));
    add('stagger', own.filter(item => /^item-\d+-\d+$/.test(item.id)));
    add('sequence', own.filter(item => item.id.startsWith('path-')));
    if (visual.show) tools.push({tool: visual.show.kind, title: SHOWS[visual.show.kind].title, solves: SHOWS[visual.show.kind].solves,
      limits: SHOWS[visual.show.kind].limits, actors: own.filter(item => /^(token|route|subject|carrier|whole|part|stop|orbit|gallery)-/.test(item.id)).map(item => item.id)});
    if (visual.scene === 'input' && score.camera.some(key => key.frame >= scene.start && key.frame < scene.end && key.zoom >= 104)) {
      add('push-in', own.filter(item => item.id.startsWith('button-')));
    }
    const link = scene.link ?? (index ? {kind: scene.transition?.kind ?? 'cut', why: LINKS[scene.transition?.kind ?? 'cut'].solves} : null);
    const actors = link && ({
      type: [`line-${index - 1}`], carry: ['story-object'], match: [link.anchor, 'story-object'],
      dive: [link.anchor ?? scene.transition?.target], portal: [link.anchor],
    }[link.kind] ?? []).filter(Boolean);
    const settled = Math.max(startsAfter, ...visible.map(settlesAt));
    return {
      id: scene.id, ...(scene.sourceScene && {sourceScene: scene.sourceScene}), scene: visual.scene, frames: [scene.start, scene.end], seconds: Number(((scene.end - scene.start) / score.fps).toFixed(2)),
      understand: beat.purpose, feeling: visual.feeling ?? `energy ${beat.energy}/10`,
      focus: visual.focus ?? visual.keyPhrase ?? visual.label ?? beat.text ?? visual.scene,
      action: beat.action, landing: beat.landing, ground: {role: scene.ground, material: scene.groundStyle},
      text, holdFrames: Math.max(0, endsBefore - settled),
      arrives: link && {link: link.kind, title: LINKS[link.kind].title, why: link.why, intent: previous?.handoff, actors,
        ...(link.asked && link.asked !== link.kind && {asked: link.asked}),
        ...(scene.transition && {frames: scene.transition.frames + (scene.transition.revealFrames ?? 0)})},
      next: beat.handoff || null, tools,
    };
  });
  return {
    version: 1, brand: score.brand, concept: score.concept, artDirection: settings.artDirection ?? 'base',
    ...(selected?.creative && {idea: selected.creative}),
    signatureBeat: treatment.signatureBeat,continuity:causalContinuityContext(treatment,score),
    rhythm: {seconds: score.frames / score.fps, scenes: scenes.map(scene => scene.seconds), energy: treatment.beats.map(beat => beat.energy)},
    links: scenes.flatMap(scene => scene.arrives ? [scene.arrives.link] : []),
    substitutions: scenes.filter(scene => scene.arrives?.asked).map(scene => ({
      scene: scene.id, asked: scene.arrives.asked, used: scene.arrives.link, why: scene.arrives.why,
    })),
    scenes,
  };
}
