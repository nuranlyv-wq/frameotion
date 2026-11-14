import { checkSchema } from '../production/contracts.js';
import {minimumMotionBeats,minimumSceneBeats,motionEvents} from './motion-profile.js';
import {WORD_CLICK_MARKS,wordClickIssue,wordClickMinimum,wordClickProperties} from './word-click.js';
import {LINK_KINDS} from './techniques.js';
import {clickIntoShow} from './show.js';
import {MAX_READING_SECONDS} from './reading.js';
import {StageSchema} from './stage-contract.js';

const text = (maxLength, minLength = 1) => ({type: 'string', minLength, maxLength});
const integer = (minimum, maximum) => ({type: 'integer', minimum, maximum});
const choice = (...values) => ({type: 'string', enum: values});
const list = (items, minItems, maxItems) => ({type: 'array', items, minItems, maxItems});
const object = (required, optional = {}) => ({
  type: 'object', properties: {...required, ...optional}, required: Object.keys(required), additionalProperties: false,
});
const id = {type: 'string', pattern: '^[a-zA-Z][a-zA-Z0-9_-]{0,47}$'};
const iconName = choice(...WORD_CLICK_MARKS, 'cursor');
const prop = object({label: text(28)}, {icon: iconName, form: choice('tile', 'box', 'logo'),
  imageFit:choice('contain','cover'),
  assetId:{type:'string',pattern:'^brand-[a-f0-9]{20}$'}});
const {word:clickWord,...clickOutcome} = wordClickProperties;
export const VisualBeatSchema = object({}, {
  object: choice('search', 'card', 'message', 'badge', 'button', 'capture', 'mark'),
  layout: choice('left', 'center', 'right', 'split', 'hero'),
  // A composed scene and its content; see scenes.js.
  scene: choice('hero', 'input', 'list', 'feature', 'show', 'brand','composition'),
  stage:StageSchema,
  // A show scene stages what the product does with objects; see show.js.
  show: object({kind: choice('journey', 'cycle', 'gather', 'process', 'spread', 'transform', 'fold', 'assemble','orbit','gallery')}, {
    stages: list(prop, 2, 4),
    subject: prop, carrier: iconName, to: prop, result: text(28),
    marks: list(text(24), 2, 4), parts: list(prop, 2, 6), whole: prop,
    material: choice('paper', 'package'), direction: choice('open', 'close'),
  }),
  seconds: {type:'number',minimum:1,maximum:30},
  holdSeconds: {type:'number',minimum:.4,maximum:MAX_READING_SECONDS},
  camera: choice('auto', 'locked', 'follow', 'detail'),
  imageFit:choice('contain','cover'), mediaMotion:choice('none','ken-burns','parallax'),
  keyPhrase: text(60), action: text(24), detail: text(80),
  items: list(object({title: text(40)}, {subtitle: text(48), badge: text(16), icon: iconName}), 2, 4),
  presentation: choice('rows', 'sequence'),
  // How a scene arrives; left out, the compiler chooses from what links the two scenes.
  transition: choice('cut', 'wipe', 'portal', 'whip'),
  // The director's scene plan: how this scene arises from the previous one (see techniques.js),
  // where the viewer's eye rests and what the scene should feel like.
  link: choice(...LINK_KINDS), focus: text(80), feeling: text(60), rhythm: choice('quick', 'steady', 'hold'),
  label: text(48), evidenceId: text(48), assetId: text(48),
  interaction: choice('click', 'toggle'), emphasis: choice('quiet', 'accent'),
  result: choice('selection', 'confirmation', 'reveal'),
  backdrop: choice('flat', 'halo', 'aurora', 'grid'),
  ground: choice('background','foreground','surface','accent','onAccent'),
  wipeDirection: choice('left','right'), wipeFrames: integer(6,18), wipeGroup: id,
  icon: iconName,
  wordClick: object({word:clickWord},clickOutcome),
});

export const TreatmentSchema = object({
  directions: list(object({
    id, idea: text(260), opening: text(240), signature: text(260), look: text(200),
    route: choice('continuous', 'montage', 'hybrid'),
  }, {
    creative: object({
      approach: choice('product-action', 'visual-metaphor', 'editorial-contrast', 'spatial-discovery', 'match-cut'),
      subject: text(100), change: text(200), meaning: text(160), evidenceId: text(48),
    }),
  }), 1, 3),
  selected: id,
  rationale: text(280),
  beats: list(object({
    id, frames: integer(45, 1800), purpose: text(160), action: text(240), landing: text(200),
    handoff: text(200, 0), energy: integer(0, 10),
    move: choice('spiral','text-ring','word-swap','word-click','word-type','word-lift','kinetic-stretch','roll','keyframes','morph','interface','type','hold'),
  }, {
    text: text(160),
    phrase: object({before: text(100, 0), after: text(100, 0), words: list(text(48), 2, 6)}),
    visual: VisualBeatSchema,
  }), 3, 12),
}, {signatureBeat: id, brand: text(64), storyboardFrames: integer(1, 1800), palette: object({
  tone: choice('light', 'dark'),
}, {accent: {type: 'string', pattern: '^#[0-9a-fA-F]{6}$'}})});

const normalized = value => value.trim().replace(/\s+/g, ' ').normalize('NFC');

export function validateTreatment(treatment, settings, {source, requireCreative = false, requireMoves = true} = {}) {
  const schema = requireMoves ? TreatmentSchema : {...TreatmentSchema, properties: {
    ...TreatmentSchema.properties,
    beats: {...TreatmentSchema.properties.beats, minItems: 2},
  }};
  const issues = checkSchema(schema, treatment);
  if (issues.length) throw new Error(issues.slice(0, 12).join('\n'));

  const {directions, selected, beats} = treatment;
  if (requireCreative && settings.pace === 'dynamic' && !source?.productFlow) {
    const minimum = (requireMoves ? minimumMotionBeats : minimumSceneBeats)(settings.frames);
    if (beats.length < minimum) issues.push(`Dynamic pace needs at least ${minimum} distinct beats`);
    if (requireMoves && (!beats.some(beat => beat.move === 'morph' || beat.visual?.wordClick?.shape) || !beats.some(beat => beat.move === 'roll'))) {
      issues.push('Dynamic pace must plan at least one morph beat and one object roll beat');
    }
  }
  if (new Set(directions.map(direction => direction.id)).size !== directions.length || !directions.some(direction => direction.id === selected)) {
    issues.push('Use distinct direction IDs and select one of them');
  }
  if (directions.length > 1 && normalized(directions[0].signature) === normalized(directions[1].signature)) {
    issues.push('Give the directions different signature actions');
  }
  if (requireCreative || directions.some(direction => direction.creative)) {
    const ideas = directions.map(direction => direction.creative);
    if (ideas.some(idea => !idea)) issues.push('Both directions require a creative proposal');
    else if (ideas.length > 1 && (ideas[0].approach === ideas[1].approach || normalized(ideas[0].change) === normalized(ideas[1].change))) {
      issues.push('The directions must use different approaches and different visible changes');
    }
    if (source) {
      const evidence = new Set(source.evidence.map(entry => entry.id));
      if (ideas.some(idea => idea && !evidence.has(idea.evidenceId))) issues.push('Ground each direction in a known source evidence ID');
    }
  }
  if (requireCreative || treatment.signatureBeat) {
    const peak = beats.find(beat => beat.id === treatment.signatureBeat);
    if (!peak || peak.move === 'hold') issues.push('signatureBeat must identify a beat with an active visual payoff');
  }
  if (beats.reduce((total, beat) => total + beat.frames, 0) !== settings.frames) {
    issues.push(`Beat lengths must add up to ${settings.frames} frames`);
  }
  if (new Set(beats.map(beat => beat.id)).size !== beats.length) issues.push('Use distinct beat IDs');
  for (const [index, beat] of beats.entries()) {
    if (index < beats.length - 1 && !beat.handoff.trim()) issues.push(`${beat.id}: describe the visual handoff to the next beat`);
    if (beat.move === 'word-swap') {
      if (!beat.phrase || beat.text) {
        issues.push(`${beat.id}: give word-swap its phrase and ordered words instead of text`);
        continue;
      }
      const words = beat.phrase.words.map(normalized);
      if (new Set(words).size !== words.length) issues.push(`${beat.id}: the changing words must be distinct`);
      const firstPhrase = normalized(beat.phrase.before + words[0] + beat.phrase.after);
      const firstHold = Math.max(18, firstPhrase.split(' ').length * 6);
      const laterHolds = words.slice(1).reduce((total, word) => total + Math.max(12, word.split(' ').length * 6), 0);
      if (beat.frames < firstHold + laterHolds + 14 + (words.length - 1) * 4) {
        issues.push(`${beat.id}: give each phrase time to enter, change and be read`);
      }
    } else if (beat.phrase) issues.push(`${beat.id}: phrase belongs to a word-swap beat`);
    if (beat.move === 'word-click' && !beat.visual?.wordClick) issues.push(`${beat.id}: specify the word and outcome in visual.wordClick`);
    if (beat.visual?.wordClick) {
      const issue=wordClickIssue(beat.text,beat.visual.wordClick);
      if (issue) issues.push(`${beat.id}: ${issue}`);
      if (beat.move !== 'word-click' || beat.frames < wordClickMinimum(beat.text ?? '')) {
        issues.push(`${beat.id}: use move=word-click and leave time for both states`);
      }
    }
    if (beat.move === 'spiral' && beat.frames < 52) issues.push(`${beat.id}: reserve at least 52 frames for a spiral and its readable landing`);
  }
  if (issues.length) throw new Error(issues.join('\n'));
  return treatment;
}

export function selectedTreatment(treatment) {
  return {
    direction: treatment.directions.find(direction => direction.id === treatment.selected),
    rationale: treatment.rationale,
    signatureBeat: treatment.signatureBeat,
    beats: treatment.beats,
  };
}

function movesDuring(keys, fields, start, end) {
  return keys?.some((key, index) => index > 0 && keys[index - 1].frame < end && key.frame > start &&
    fields.some(field => key[field] !== keys[index - 1][field]));
}

export function validateTreatmentScore(score,treatment,{requireMorph=false}={}) {
  const issues = [];
  const events = motionEvents(score);
  let start = 0;
  if (score.staging === 'scenes') requireMorph = false;
  if (score.scenes.length !== treatment.beats.length) issues.push('Use one score scene per treatment beat');
  for (const [index, beat] of treatment.beats.entries()) {
    const end = start + beat.frames;
    const scene = score.scenes[index];
    if (!scene || scene.id !== beat.id || scene.start !== start || scene.end !== end) {
      issues.push(`${beat.id}: expected scene ${start}–${end}`);
    }
    if(beat.visual?.scene==='composition'){start=end;continue;}
    // In a scene film a hero line may stay on screen as the next scene's headline, so it only has to begin in its beat.
    const elements = score.elements.filter(el => el.start >= start && (score.staging === 'scenes' ? el.start < end : el.end <= end));
    if (beat.move === 'word-swap') {
      const phrase = beat.phrase;
      const expected = phrase.words.map(word => normalized(phrase.before + word + phrase.after));
      const matches = elements.some(({wordSwap}) => wordSwap &&
        normalized(wordSwap.before) === normalized(phrase.before) &&
        normalized(wordSwap.after) === normalized(phrase.after) &&
        wordSwap.variants.length === expected.length && wordSwap.variants.every((variant, i) =>
          normalized(variant.text) === normalized(phrase.words[i]) &&
          normalized(wordSwap.before + variant.text + wordSwap.after) === expected[i]));
      if (!matches) issues.push(`${beat.id}: use one wordSwap element with the exact phrase and ordered variants from the treatment`);
    }
    const matchingText = el => ['text', 'pill'].includes(el.kind) && el.text &&
      (!beat.text || normalized(el.text) === normalized(beat.text));
    if (beat.move === 'word-click') {
      const click = score.staging === 'scenes' ? clickIntoShow(beat.visual?.wordClick,
        treatment.beats[index + 1]?.visual?.show, score.scenes[index + 1]?.link?.kind) : beat.visual?.wordClick;
      if (!click || !elements.some(el => matchingText(el) && el.wordClick &&
          ['word','replace','shape','mark','fill'].every(key=>el.wordClick[key]===click[key]) &&
          (el.wordClick.occurrence ?? 1)===(click.occurrence ?? 1))) {
        issues.push(`${beat.id}: render the planned wordClick and its outcome on the intended text`);
      }
    }
    if (beat.move === 'text-ring' && !elements.some(el => el.textRing && matchingText(el))) {
      issues.push(`${beat.id}: render the planned text ring on the intended text`);
    } else if (['spiral', 'word-type','word-lift','kinetic-stretch'].includes(beat.move) && !elements.some(el => el.enter === beat.move && matchingText(el))) {
      issues.push(`${beat.id}: render the planned ${beat.move} on the intended text`);
    } else if (beat.text && !score.elements.some(el => el.start >= start && el.start + el.enterFrames < end && matchingText(el))) {
      issues.push(`${beat.id}: keep the treatment's exact on-screen text`);
    }
    if (beat.move === 'keyframes') {
      const actorMoves = score.elements.some(el => movesDuring(el.motion, ['x', 'y', 'scale', 'rotate', 'opacity'], start, end));
      const cameraMoves = movesDuring(score.camera, ['x', 'y', 'zoom', 'rotate', 'target'], start, end);
      const volumeMoves = score.elements.some(el => movesDuring(el.mesh?.keys, ['rx','ry'], start, end) ||
        movesDuring(el.formTrack?.keys, ['form','mark','assetId','rx','ry'], start, end) ||
        el.fold && el.fold.at < end && el.fold.at+el.fold.frames > start);
      const floodMoves = score.scenes.some(scene => scene.flood && scene.start - scene.flood.frames < end &&
        scene.start + scene.flood.revealFrames > start);
      const mediaMoves = score.elements.some(el=>el.kind==='image' && el.start<end && el.end>start &&
        (el.mediaMotion && el.mediaMotion!=='none' || el.imageReveal && el.imageReveal!=='none'));
      if (!actorMoves && !cameraMoves && !volumeMoves && !floodMoves && !mediaMoves) {
        issues.push(`${beat.id}: animate a visible actor or the camera with motion keys`);
      }
    }
    if ((beat.move==='roll' || (requireMorph && beat.move==='morph')) &&
        !events.some(event => event.kind===beat.move && event.frame>=start && event.frame<end)) {
      issues.push(`${beat.id}: stage the planned ${beat.move} on a visible object in this beat`);
    }
    start = end;
  }
  if (issues.length) throw new Error(issues.join('\n'));
  return score;
}
