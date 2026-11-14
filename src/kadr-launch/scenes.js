// Composed scenes for the semantic director. The model names a scene and supplies its content;
// each scene here owns the framing, type scale, timing and motion. One persistent surface
// ("story-object") carries from scene to scene: the input field becomes the sent request,
// the feature mark, and finally the address.
import {wordHighlightRange} from './kinetic.js';
import {EXPLAINERS_DATA_VIZ} from './motion-recipe.js';
import {lookFor} from './art-direction.js';
import {chroma} from './interface-palette.js';
import {stageWordClick,WORD_CLICK_ENTRY,wordClickMinimum} from './word-click.js';
import {LINK_KINDS, linkWhy, resolveLink} from './techniques.js';
import {clickIntoShow, showIssue, showMinimum, stageShow} from './show.js';
import {isVisualAsset} from './media.js';
import {MAX_READING_SECONDS, readingBudget} from './reading.js';
import {stageIssues,compileStage} from './stage-contract.js';

export const SCENES = ['hero', 'input', 'list', 'feature', 'show', 'brand','composition'];
export const SCENE_MOVES = ['type', 'word-type', 'word-lift', 'kinetic-stretch', 'word-click', 'interface', 'morph', 'keyframes', 'hold'];
const SURFACE = 'story-object';
const DISPLAY = .6, INTER = .55; // average glyph advance in em, used to pre-fit type to its box

const count = value => value.trim().split(/\s+/u).length;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const reading = (value, perWord = 6) => readingBudget(value, {perWord});
const box = (x, y, w, h, radius = 0) => ({
  x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), radius: Math.round(radius),
});
const element = (id, kind, start, end, bounds, props) => ({
  id, kind, start, end, box: bounds, fill: 'foreground', enter: 'none', enterFrames: 1,
  sound: 'none', evidenceIds: [], ...props,
});
const pose = (frame, {x = 0, y = 0, ...fields} = {}) => ({
  frame, x: Math.round(x), y: Math.round(y), scale: 100, rotate: 0, opacity: 100, ease: 'smooth', ...fields,
});

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map(index => {
    const channel = parseInt(hex.slice(index, index + 2), 16) / 255;
    return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
  });
  return .2126 * r + .7152 * g + .0722 * b;
}
const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05);

// Largest size at which the text wraps inside the box. The renderer still fits the final glyphs.
function fitLines(text, width, height, largest, smallest, advance) {
  const parts = text.trim().split(/\s+/u);
  for (let size = Math.round(largest); size > smallest; size -= 2) {
    const perLine = width / (size * advance);
    let lines = 1, line = 0;
    for (const part of parts) {
      if (line && line + 1 + part.length > perLine) { lines++; line = part.length; }
      else line += (line ? 1 : 0) + part.length;
    }
    if (lines * size * 1.2 <= height && parts.every(part => part.length <= perLine)) return {size, lines};
  }
  return {size: Math.round(smallest), lines: Math.max(1, Math.round(height / (smallest * 1.2)))};
}
const fit = (...args) => fitLines(...args).size;

const entryFor = (beat, fallback) => ['word-type', 'word-lift', 'kinetic-stretch'].includes(beat.move) ? beat.move : fallback;
const entryFrames = (entry, text) => entry === 'word-type' ? clamp(10 + count(text) * 4, 10, 36) :
  ['word-lift','kinetic-stretch'].includes(entry) ? clamp(12 + count(text) * 3, 14, 36) : 16;

const clickSupport = ({label,detail}) => [label,detail].filter(Boolean).join('\n');
const clickSupportFrames = copy => 10 + reading(copy) + 8;
const sequenceTail = items => 1 + (items.length - 1) * 18 + 15 + Math.max(22,
  ...items.map(item => reading([item.title, item.subtitle, item.badge].filter(Boolean).join(' '))));

// Frames a scene needs before any spare time is shared out. Every scene but the last also
// leaves room for the transition that carries the viewer out of it.
// A scene the camera leaves through a dive also holds its detail long enough to be seen before the push.
export const sceneMinimum = (beat, next) => sceneContent(beat) + (beat.visual.scene === 'brand' ? 0 : 12) +
  Math.max(0, Math.round((beat.visual.holdSeconds ?? 0) * 30) - reading(beat.text ?? beat.visual.label ?? '')) +
  (next?.visual.link === 'dive' ? 14 : 0);

function sceneContent(beat) {
  const {scene, label = '', items = []} = beat.visual;
  if(scene==='composition')return Math.max(45,Math.round((beat.visual.seconds??2.4)*30)-12);
  const caption = beat.visual.wordClick ? wordClickMinimum(beat.text ?? '') + (scene === 'hero' ? 0 : 2)
    : beat.text ? entryFrames(entryFor(beat, 'word-lift'), beat.text) + reading(beat.text) + 12 : 0;
  if (scene === 'hero') return Math.max(60, caption);
  if (scene === 'show') return Math.max(caption, showMinimum(beat.visual.show));
  // Without its own headline the field may wait for the hero line to settle above it.
  if (scene === 'input') return Math.max(caption, 24 + 2 + clamp(10 + count(label) * 4, 10, 30) + 4 + 26 + 28 + 18 + (beat.text ? 0 : 12)
    - (beat.visual.rhythm === 'quick' ? 24 : 0));
  if (scene === 'list') {
    const longest = Math.max(...items.map(item => reading(`${item.title} ${item.subtitle ?? ''} ${item.badge ?? ''}`,5)));
    const interval = beat.visual.presentation === 'sequence' ? 18 : 14;
    return Math.max(caption, 16 + (items.length - 1) * interval + 18 + longest + 14,
      beat.visual.presentation === 'sequence' && beat.visual.wordClick ? wordClickMinimum(beat.text ?? '', sequenceTail(items)) + 2 : 0);
  }
  if (scene === 'feature' && beat.visual.wordClick && !beat.visual.assetId) {
    return wordClickMinimum(beat.text ?? '',clickSupportFrames(clickSupport(beat.visual)))+2;
  }
  if (scene === 'feature') return Math.max(70, caption, 24 + 9 + reading(`${label} ${beat.visual.detail ?? ''}`, 5) + 16);
  return Math.max(92, 30 + caption);
}

export function sceneIssues(beats, source) {
  const issues = [];
  const images = new Set(source.assets.filter(isVisualAsset).map(asset => asset.id));
  for (const [index, beat] of beats.entries()) {
    const {scene, label, action, items, keyPhrase, assetId} = beat.visual;
    const need = (ok, message) => { if (!ok) issues.push(`${beat.id}: ${message}`); };
    need(SCENES.includes(scene), `choose visual.scene from ${SCENES.join(', ')}`);
    need(SCENE_MOVES.includes(beat.move), `scene beats use move ${SCENE_MOVES.join(', ')}`);
    if(scene==='composition'){
      for(const issue of stageIssues(beat.visual.stage,source))need(false,issue);
      if(beat.text){let nodes=[];try{nodes=compileStage(beat.visual.stage,1).nodes;}catch{/* stageIssues reports the invalid fragment */}need(nodes.some(node=>node.text===beat.text),'put beat.text in a stage text node or fragment label too');}
    } else need(!beat.visual.stage,'visual.stage belongs to a composition');
    if (scene === 'hero') need(beat.text, 'a hero scene needs its exact line in text');
    if (beat.visual.wordClick) need(['hero','feature','list'].includes(scene) && !keyPhrase,
      'put wordClick on a hero, feature or list headline without keyPhrase');
    if (scene === 'input') need(label && action, 'an input scene needs visual.label (what the user types) and visual.action (the button)');
    if (scene === 'list') {
      need(items?.length >= 2, 'a list scene needs two to four visual.items, each with a title');
    } else need(!items && !beat.visual.presentation, 'visual.items and visual.presentation belong to a list scene');
    if (scene === 'feature') need(label || images.has(assetId), 'a feature scene needs visual.label or a supplied visual.assetId');
    if (scene === 'show') need(!showIssue(beat.visual.show), showIssue(beat.visual.show));
    else need(!beat.visual.show, 'visual.show belongs to a show scene');
    const show=beat.visual.show;
    for (const prop of [show?.subject,show?.whole,show?.to,...show?.parts??[],...show?.stages??[]].filter(Boolean)) {
      if (prop.assetId) need(images.has(prop.assetId),'a prop image must come from this film’s source assets');
    }
    if (keyPhrase) need(beat.text && wordHighlightRange(beat.text, keyPhrase), 'visual.keyPhrase must repeat consecutive whole words of text');
    if (beat.visual.link) {
      need(!beat.visual.transition || beat.visual.transition === beat.visual.link, 'give visual.link only; visual.transition is its older name');
    }
    if (beat.visual.wipeDirection || beat.visual.wipeFrames || beat.visual.wipeGroup) {
      need(index > 0 && (beat.visual.link ?? beat.visual.transition) === 'wipe', 'wipe controls need an incoming wipe link');
    }
  }
  return issues;
}

export function compileScenes(treatment, settings, source, {brand: known, palette}) {
  // The director's spelling of the name wins over a lower-cased hint from the address.
  const brand = known && treatment.brand?.toLowerCase() === known.toLowerCase() ? treatment.brand : known;
  const {width: W, height: H, frames} = settings;
  const explainer = settings.motionRecipe === EXPLAINERS_DATA_VIZ;
  const look = lookFor(settings.artDirection);
  // Preserve the reading budget and the length of the shot. In a dynamic film
  // the action resolves sooner, with a clearer contrast between motion and hold.
  let motionRate = settings.pace === 'dynamic' ? .75 : 1;
  const motionFrames = frames => Math.round(frames * motionRate);
  const sequenceInterval = motionFrames(18), rowInterval = motionFrames(look.stagger);
  const edge = Math.min(W, H), portrait = W <= H, m = Math.round(W * .0625);
  const lightGround = luminance(palette.background) > .35;
  // The accent can mark a key phrase only when it reads on the ground and differs from the body ink.
  const accentOn = role => contrast(palette.accent, palette[role]) >= 3 &&
    contrast(palette.accent, palette[role === 'background' ? 'foreground' : 'background']) >= 1.6;
  // A coloured contrast ground needs an accent that carries its own ink and differs from both neutral grounds.
  const contrastGround = look.inverseGround === 'accent' && contrast(palette.accent, palette.onAccent) >= 4.5 &&
    chroma(palette.accent) >= 60 ? 'accent' : 'foreground';
  // A brand colour reads as a fill beside the page colour by hue even when their lightness is close.
  const accentFill = contrast(palette.accent, palette.background) >= 3 || chroma(palette.accent) >= 60 ? 'accent' : 'foreground';
  // A dive can set a scene on any role a detail was painted in, so every ground has its ink.
  const inkOn = {background: 'foreground', foreground: 'background', accent: 'onAccent', onAccent: 'accent', surface: 'foreground', muted: 'background'};
  // A randomly drawn look may not replace the captured site's whole visual
  // identity with one button colour. Explicit scene grounds remain authorable;
  // meaningful dives still inherit the actual outgoing detail's fill.
  const brandGround = source.brand?.paletteSource === 'rendered-interface';
  const inverted = (scene, index) => (look.inverse === 'all' && !brandGround) ||
    (look.inverse === 'alternate' ? index % 2 === 1 : look.inverse.includes(scene));
  const corner = value => value * look.radius;
  // Fits a line to a region and returns a box that hugs it, so every entrance sits where the layout intends.
  const place = (text, region, largest, display = look.display, centred = true) => {
    const {size, lines} = fitLines(text, region.w, region.h, largest, edge * .045, display ? DISPLAY : INTER);
    const height = Math.min(region.h, lines * size * 1.2 + size * .3);
    return {size, bounds: box(region.x, centred ? region.y + (region.h - height) / 2 : region.y, region.w, height)};
  };
  const rule = (id, at, end, x, y, length, vertical = false, fill = accentOn('background') ? 'accent' : 'muted', drawFrames = 18) => element(id, 'stroke', at, end,
    vertical ? box(x, y, 4, length) : box(x, y, length, 4), {
      fill, enter: 'draw', enterFrames: drawFrames,
      curve: {width: 4, points: [0, 333, 667, 1000].map(step => vertical ? {x: 500, y: step} : {x: step, y: 500})},
    });
  const selected = treatment.directions.find(direction => direction.id === treatment.selected);
  const logo = source.assets.some(asset => asset.kind === 'logo');
  const captures = new Map(source.assets.filter(isVisualAsset).map(asset => [asset.id, asset]));
  const host = source.url ? new URL(source.url).hostname.replace(/^www\./, '') : '';
  const scenes = [], elements = [], camera = [], states = [], wipeGroups = new Map();
  let shown = false, last = null, start = 0, wipes = 0;

  const surfaced = beat => {
    const {scene, wordClick, assetId} = beat.visual;
    // The close always has one: the address, or the rule under the name.
    return scene === 'input' || (scene === 'feature' && !(wordClick && !captures.has(assetId))) || scene === 'brand';
  };
  // The detail a scene ends on, which the next scene can grow from. A mark formed by a click
  // on a word is measured by the renderer.
  const anchorOf = (beat, index, ground) => {
    const {scene, wordClick} = beat.visual;
    if (scene === 'input') return {kind: 'button', id: `sent-mark-${index}`, fill: accentFill};
    // A show ends on its token: the thing that arrived, came round or took everything in.
    if (scene === 'show') return beat.visual.show.kind==='gallery'
      ? {kind:'image',id:`gallery-image-${index}-0`,fill:inkOn[ground],plain:true}
      : {kind: 'node', id: `token-${index}`, fill: accentOn(ground) ? 'accent' : inkOn[ground]};
    if (scene === 'feature' && !wordClick && !captures.has(beat.visual.assetId)) {
      return {kind:'node', id:SURFACE, fill:accentOn(ground) ? 'accent' : inkOn[ground]};
    }
    if (wordClick?.shape && ['hero', 'feature', 'list'].includes(scene)) return {kind: 'word', id: `line-${index}`, fill:wordClick.fill ?? inkOn[ground]};
    // A list ends on the mark of its last row or step. Letters are never an anchor: a camera pushed into
    // part of a word shows the viewer nothing.
    if (scene === 'list') return {kind: 'node', id: `${beat.visual.presentation === 'sequence' ? 'node' : 'item'}-${index}-${beat.visual.items.length - 1}`,
      fill: accentOn(ground) ? 'accent' : inkOn[ground]};
    return null;
  };
  // Meaning → anchor → motion → next frame. Every join is decided before anything is laid out, because a link
  // shapes both scenes: a dive gives the incoming scene its ground and the outgoing one a push-in, a carried
  // line keeps the ground and takes the place of the incoming headline.
  const staging = [];
  for (const [index, beat] of treatment.beats.entries()) {
    const {scene} = beat.visual, before = staging[index - 1], previous = treatment.beats[index - 1];
    const automaticGround = brandGround && (look.inverse === 'all' || look.inverseGround === 'accent')
      ? 'background' : inverted(scene, index) ? contrastGround : 'background';
    const usual = beat.visual.ground ?? automaticGround;
    const surface = surfaced(beat);
    // Honour an explicit cut; infer a compatible connection only when none was chosen.
    const asked = beat.visual.link ?? beat.visual.transition;
    const link = before ? resolveLink(asked, {
      anchor: before.anchor, surface, matchSurface: surface || scene === 'show' && beat.visual.show.kind!=='gallery', before,
      last: scene === 'brand', groundChanges: before.ground !== usual,
      dives: staging.filter(item => item.link?.kind === 'dive').length,
      typeCarry: previous.visual.scene === 'hero' && !previous.visual.wordClick && !beat.text && !beat.visual.wordClick &&
        (scene === 'input' || scene === 'show' || (scene === 'feature' && surface)) && count(previous.text) <= 5,
    }, look.links) : null;
    const ground = link?.kind === 'dive' ? before.anchor.fill : link?.kind === 'type' ? before.ground :
      link?.kind === 'match' && scene === 'show' ? before.ground : usual;
    staging.push({link, ground, surface, anchor: anchorOf(beat, index, ground)});
  }

  function join(index, at) {
    const scene = scenes[index], before = scenes[index - 1], {link} = staging[index];
    if (!link) return;
    const anchor = staging[index - 1].anchor;
    scene.link = {kind: link.kind, why: linkWhy(link, anchor).slice(0, 320), ...(link.asked && {asked: link.asked}),
      ...(anchor && (['dive', 'match'].includes(link.kind) || link.kind === 'portal' && (anchor.point || anchor.box)) && {anchor: anchor.id})};
    const {kind} = link;
    if (['carry', 'type', 'cut', 'match'].includes(kind)) {
      for (const item of elements) if (item.end === at && item.start < at) item.exit = 'cut';
      return;
    }
    const centre = {x: Math.round(W / 2), y: Math.round(H * (portrait ? .4 : .41))};
    const sameGround = before.ground === scene.ground;
    let direction = portrait ? 'up' : wipes++ % 2 ? 'right' : 'left';
    const visual = treatment.beats[index].visual;
    let group;
    if (kind === 'wipe' && visual.wipeGroup) {
      group = wipeGroups.get(visual.wipeGroup);
      direction = group?.direction === 'left' ? 'right' : 'left';
    }
    if (kind === 'wipe' && visual.wipeDirection) direction = visual.wipeDirection;
    if (kind === 'dive') {
      const frames = clamp(at - (anchor.settled ?? at - look.dive), 12, look.dive);
      scene.transition = {kind, frames: Math.min(frames, Math.floor((before.end - before.start) / 2)), revealFrames: 14, target: anchor.id, fill: anchor.fill};
    } else if (kind === 'portal') scene.transition = {kind, frames: 20, ...(anchor?.point ??
      (anchor?.box ? {x: Math.round(anchor.box.x + anchor.box.w / 2), y: Math.round(anchor.box.y + anchor.box.h / 2)} : centre))};
    else if (kind === 'whip') scene.transition = {kind, frames: 8, revealFrames: 12, direction};
    else {
      const duration = visual.wipeFrames ?? (visual.wipeGroup ? 8 : 14);
      const fill = group?.fill ?? (contrast(palette.accent, palette[scene.ground]) >= 3 ? 'accent'
        : scene.ground === 'background' ? 'foreground' : 'background');
      scene.transition = {kind, frames: duration, direction, ...((sameGround || visual.wipeGroup) && {revealFrames: duration, fill})};
      if (visual.wipeGroup) wipeGroups.set(visual.wipeGroup, {direction,fill});
    }
    // The outgoing scene stays whole until the transition has hidden it.
    for (const item of elements) if (item.end === at && item.start < at) item.exit = 'cut';
  }

  // Moves the shared surface to this scene's box, or retires it when the scene has none. `link` says how the
  // scene is entered: only a carry lets the surface travel; a match starts it on the previous scene's detail.
  function surface(at, target, link) {
    const travels = shown && (!link || link.kind === 'carry');
    // A carried line clears the space first; the surface arrives under it.
    const wait = link?.kind === 'type' ? motionFrames(12) : 0;
    if (target) {
      const {x, y, w, h, radius} = target.box;
      if (link?.kind === 'match') {
        // A mark painted in the colour of the new ground would vanish on the cut; it takes the colour it is growing into.
        const {box: detail} = link.anchor, fill = link.anchor.fill === link.ground ? target.fill : link.anchor.fill;
        // Hand off on the cut itself, so the outgoing mark and the new surface never coexist.
        states.push({frame: at, duration: 0, box: detail, fill, opacity: 100, contour: 'ellipse'});
        states.push({frame: at + 7, duration: 22, box: target.box, fill: target.fill, contour: 'roundRect', ease: 'glide'});
        if (!link.anchor.plain) elements.push(element(`match-mark-${at}`, 'icon', at, at + 16, box(detail.w * .24, detail.h * .24, detail.w * .52, detail.h * .52), {
          attachTo: SURFACE, icon: link.anchor.icon ?? 'circle-check', fill: inkOn[fill] ?? 'background',
          motion: [pose(at), pose(at + 7), pose(at + 15, {opacity: 0})],
        }));
      } else if (!travels) {
        if (shown && wait) states.push({frame: at, duration: 0, box: last.box, fill: last.fill, opacity: 0});
        states.push({frame: at + wait, duration: 0, box: box(x + w * .09, y + h * .09, w * .82, h * .82, radius * .82), fill: target.fill, opacity: 0});
        states.push({frame: at + wait + 2, duration: motionFrames(16), box: target.box, fill: target.fill, opacity: 100, ease: look.ease});
      } else states.push({frame: at, duration: motionFrames(22), box: target.box, fill: target.fill, ease: 'glide'});
      last = target;
    } else if (shown) states.push(travels ? {frame: at, duration: 8, box: last.box, fill: last.fill, opacity: 0} :
      {frame: at, duration: 0, box: last.box, fill: last.fill, opacity: 0});
    const carried = travels || link?.kind === 'match';
    shown = Boolean(target);
    if (!target) return at;
    if (link?.kind === 'match') return at + 31;
    return at + wait + (carried ? motionFrames(22) : 2 + motionFrames(16)) + 2;
  }

  function headline(id, beat, at, end, bounds, largest, props = {}) {
    const click = beat.visual.wordClick;
    const entry = entryFor(beat, props.enter ?? look.heroEntry);
    const display = props.font !== undefined ? props.font === 'display' : look.display;
    const size = fit(beat.text, bounds.w, bounds.h, largest, edge * .045, display ? DISPLAY : INTER);
    const {keyPhrase} = beat.visual, ground = props.ground ?? 'background';
    const ink = inkOn[ground];
    // A key phrase is set against a dimmed line on the light ground, or in the accent where the accent reads.
    const marked = keyPhrase && entry !== 'word-type' && (ground === 'background' || accentOn(ground));
    const accent = marked && accentOn(ground);
    const {font: _font, ground: _ground, clickTail, ...rest} = props;
    const duration = entryFrames(entry, beat.text);
    const entrance = entry === 'word-type' ? duration : Math.max(12, motionFrames(duration));
    return element(id, 'text', at, end, bounds, {
      text: beat.text, fontSize: Math.max(24, size), ...(display && {font: 'display'}),
      weight: display ? 800 : props.font === 'text' ? 500 : look.weight,
      fill: marked && !accent ? 'muted' : ink, ...rest,
      ...(click ? {enter:'resolve',enterFrames:WORD_CLICK_ENTRY,wordClick:stageWordClick(click,beat.text,at,end,clickTail)}
        : {enter:entry,enterFrames:entrance}),
      ...(!click && entry === 'word-type' && {wordType: {caret: 'blink'}}),
      ...(marked && {emphasis: {text: keyPhrase, fill: accent ? 'accent' : ink}}),
    });
  }

  for (const [index, original] of treatment.beats.entries()) {
    motionRate = (settings.pace === 'dynamic' ? .75 : 1) *
      (original.visual.rhythm === 'quick' ? .85 : original.visual.rhythm === 'hold' ? 1.1 : 1);
    const leaving = staging[index + 1]?.link?.kind;
    const nextShow = treatment.beats[index + 1]?.visual.show;
    // Infer an omitted mark from the next action; preserve the director's explicit choice.
    const wordClick = clickIntoShow(original.visual.wordClick, nextShow, leaving);
    const beat = wordClick === original.visual.wordClick ? original : {...original, visual: {...original.visual, wordClick}};
    const end = start + beat.frames;
    const {scene, label, detail, action, items, icon, assetId, backdrop, emphasis} = beat.visual;
    const previous = treatment.beats[index - 1]?.visual;
    const evidenceIds = [beat.visual.evidenceId ?? selected.creative?.evidenceId].filter(Boolean);
    const {ground, anchor} = staging[index];
    const entering = staging[index].link && {...staging[index].link, anchor: staging[index - 1].anchor, ground};
    const inverse = ground !== 'background';
    scenes.push({id: beat.id, start, end, purpose: beat.purpose, ground,
      groundStyle: backdrop ?? (entering?.kind === 'type' ? scenes.at(-1).groundStyle :
        scene === 'feature' && emphasis === 'accent' ? 'aurora' : look.ground[scene] ?? look.ground.list)});
    const centred = {x: Math.round(W / 2), y: Math.round(H / 2), rotate: 0};
    camera.push({frame: start, ...centred, zoom: 100});
    // Keep the framing still unless the scene stages a specific action for the camera to follow.
    let closing = {frame: end - 1, ...centred, zoom: 100, ease: 'linear'};
    // What must stay inside the frame if the camera pushes in.
    const content = [];

    if (scene!=='composition' && brand && (!inverse || index === treatment.beats.length - 1 && scene !== 'brand')) {
      const size = Math.max(24, Math.round(edge * .032)), mark = Math.round(edge * .044);
      // The masthead belongs to the frame, not the world, in a scene whose camera pushes in.
      const fixed = (scene === 'show' || scene === 'input' && leaving === 'dive' && look.push > 100) && {space: 'screen'};
      if (logo) elements.push(element(`mast-mark-${index}`, 'logo', start, end, box(m, H * .06, mark, mark), {exit: 'cut', ...fixed}));
      elements.push(element(`mast-${index}`, 'text', start, end, box(m + (logo ? mark * 1.3 : 0), H * .062, W * .5, size * 1.4), {
        text: brand, fontSize: size, fill: inverse ? inkOn[ground] : 'muted', exit: 'cut', ...fixed,
      }));
    }

    // The hero line of the previous scene stays and becomes this scene's headline above `top`.
    const carryLine = (top, left, fixed = false) => {
      const line = elements.find(item => item.id === `line-${index - 1}`);
      // Over a scene whose camera moves, the line belongs to the frame. The hero's camera was held still for it.
      if (fixed) line.space = 'screen';
      const scale = Math.min(.5, (top - H * .1) / (line.box.h * 1.15));
      const height = line.box.h * scale, width = line.box.w * scale;
      const x = line.align === 'center' ? (W - width) / 2 : left;
      const y = top - height - line.fontSize * scale * .35;
      line.end = end;
      line.motion = [line.motion[0], {...line.motion[1], scale: look.drift}, pose(start + motionFrames(22), {
        x: x + width / 2 - (line.box.x + line.box.w / 2), y: y + height / 2 - (line.box.y + line.box.h / 2),
        scale: Math.round(scale * 100), ease: 'glide'})];
      content.push(box(x, y, width, height));
    };

    if(scene==='composition') {
      surface(start,null,entering);
      const authoredStage=compileStage(beat.visual.stage,beat.frames/settings.fps,settings.pace==='superdynamic');
      for(const handoff of authoredStage.handoffs??[]){const prior=treatment.beats.findIndex(b=>b.id===handoff.fromElement);if(prior>=0&&treatment.beats[prior].visual.scene==='composition')handoff.fromElement=`stage-${prior}`;}
      elements.push(element(`stage-${index}`,'stage',start,end,box(0,0,W,H),{
        stage:authoredStage,space:'screen',exit:'cut',evidenceIds,
      }));
    }
    if (scene === 'show') {
      surface(start, null, entering);
      // The headline belongs to the frame: the camera is free to close in on the objects under it.
      if (beat.text) {
        const title = place(beat.text, box(m, H * .08, W - 2 * m, H * .17), edge * .09 * look.headline);
        elements.push(headline(`line-${index}`, beat, start + 2, end, title.bounds, title.size, {align: 'center', ground, evidenceIds, space: 'screen'}));
      }
      const strong = accentOn(ground) ? 'accent' : inkOn[ground];
      if (entering?.kind === 'type') carryLine(H * .25, m, true);
      const staged = stageShow({beat, index, start, end, W, H, portrait, ground, ink: inkOn[ground], strong,
        sourceAssets:source.assets,
        strongInk: strong === 'accent' ? 'onAccent' : ground, entering, motionFrames, evidenceIds,
        layout: ({left:0,right:1,split:2,center:0,hero:0})[beat.visual.layout] ?? settings.variation?.layout ?? 0,
        titled: Boolean(beat.text) || entering?.kind === 'type', steady: leaving === 'match'});
      elements.push(...staged.elements);
      // The show directs its own camera, from a close-up of the subject to the whole picture.
      camera.pop();
      camera.push(...staged.camera);
      closing = null;
      Object.assign(anchor, {settled: staged.settled, box: staged.anchorBox, icon: staged.anchorIcon, form:staged.anchorForm});
    }

    if (scene === 'hero') {
      surface(start, null, entering);
      const height = H * (portrait ? .5 : .6);
      const region = box(m, (H - height) / 2 + H * .02, W - 2 * m, height);
      const align = portrait ? 'center' : look.heroAlign;
      // A word-click line keeps its roomy region; other entrances get a box that hugs the type.
      const {size, bounds} = beat.visual.wordClick ? {size: edge * look.hero[portrait ? 1 : 0], bounds: region} :
        place(beat.text, region, edge * look.hero[portrait ? 1 : 0]);
      const line = headline(`line-${index}`, beat, start, end, bounds, size, {align, ground, evidenceIds,
        motion: [pose(start), pose(end - 1, {scale: look.drift, ease: 'linear'})]});
      if (!index && ['word-lift', 'kinetic-stretch'].includes(line.enter) && count(beat.text) > 1) line.leadWord = true;
      if (!index && line.wordClick) line.enter = 'none';
      elements.push(line);
      if (anchor) anchor.settled = beat.visual.wordClick ? elements.at(-1).wordClick.at + elements.at(-1).wordClick.frames + 8 :
        start + elements.at(-1).enterFrames + reading(beat.text);
      if (look.rules && !inverse && !beat.visual.wordClick) {
        const length = W * .2;
        elements.push(rule(`rule-${index}`, start + 12, end, align === 'center' ? (W - length) / 2 : m, bounds.y + bounds.h + size * .2, length));
      }
    }

    if (scene === 'input') {
      const bw = W * (portrait ? .88 : .73), bh = edge * (portrait ? .24 : .2);
      const titled = beat.text || entering?.kind === 'type';
      const bar = box((W - bw) / 2, H * (titled ? (portrait ? .49 : .47) : .5) - (titled ? 0 : bh / 2), bw, bh, corner(bh * .3));
      content.push(bar);
      // On its own ground colour the field reads by its shadow; a flat direction gives it the surface tone instead.
      const ready = surface(start, {box: bar, fill: inverse || look.elevation >= 2 ? 'background' : 'surface'}, entering);
      if (entering?.kind === 'type') carryLine(bar.y, bar.x);
      if (beat.text) {
        const {size, lines} = fitLines(beat.text, W - 2 * m, H * .24, edge * (portrait ? .11 : .12) * look.headline, edge * .045, look.display ? DISPLAY : INTER);
        elements.push(headline(`line-${index}`, beat, start + 4, end, box(m, bar.y - size * (lines * 1.2 + .7), W - 2 * m, size * (lines * 1.2 + .1)),
          size, {align: 'center', ground, enter: 'mask-rise', evidenceIds}));
        content.push(elements.at(-1).box);
      }
      const pad = bh * .3, attach = {attachTo: SURFACE, evidenceIds};
      if (detail) {
        elements.push(element(`field-${index}`, 'text', ready, end, box(pad, bh * .15, bw * .5, bh * .24), {
          ...attach, text: detail, fontSize: Math.max(24, Math.round(bh * .17)), fill: 'muted', enter: 'rise', enterFrames: 8,
        }));
      }
      const pw = bw * (portrait ? .3 : .2), ph = bh * .46;
      const typed = box(pad, bh * (detail ? .36 : .2), bw - pad * 2.4 - pw, bh * (detail ? .5 : .6));
      const typing = clamp(10 + count(label) * 4, 10, 30);
      elements.push(element(`query-${index}`, 'text', ready + 2, end, typed, {
        ...attach, text: label, fontSize: Math.max(24, fit(label, typed.w, typed.h, bh * .38, 24, INTER)), weight: 650,
        enter: 'word-type', enterFrames: typing, wordType: {caret: 'blink'},
      }));
      const buttonAt = ready + 2 + typing + 4, cursorTravel = motionFrames(20), press = buttonAt + cursorTravel + 6;
      const button = box(bw - pad * .75 - pw, (bh - ph) / 2, pw, ph, ph / 2);
      // The press has a visible outcome: the button gives way to a confirmation mark in the same place.
      const mark = box(bw - pad * .75 - ph, (bh - ph) / 2, ph, ph, ph / 2);
      const buttonFill = accentFill;
      elements.push(element(`button-${index}`, 'pill', buttonAt, press + 16, button, {
        ...attach, text: action, fontSize: Math.max(24, Math.round(ph * .4)), weight: 650,
        fill: buttonFill, enter: 'pop', enterFrames: motionFrames(14), sound: 'pop', elevation: 1,
        motion: [pose(buttonAt), pose(press), pose(press + 4, {scale: 91, ease: 'snap'}), pose(press + 9)],
      }));
      elements.push(element(`sent-mark-${index}`, 'rect', press + 16, end, mark, {
        ...attach, fill: buttonFill, enter: 'pop', enterFrames: 12, sound: 'ding', elevation: 1,
      }));
      elements.push(element(`sent-check-${index}`, 'icon', press + 16, end, box(mark.x + ph * .24, mark.y + ph * .24, ph * .52, ph * .52), {
        ...attach, icon: 'circle-check', fill: buttonFill === 'accent' ? 'onAccent' : 'background', enter: 'draw', enterFrames: 12,
      }));
      const tip = {x: bar.x + button.x + pw * .88, y: bar.y + button.y + ph * .82};
      Object.assign(anchor, {box: box(bar.x + mark.x, bar.y + mark.y, ph, ph, ph / 2), settled: press + 28,
        point: {x: clamp(Math.round(bar.x + mark.x + ph / 2), 0, W), y: clamp(Math.round(bar.y + mark.y + ph / 2), 0, H)}});
      // Anticipation: while the cursor travels the camera closes in on the button it is about to press,
      // as far as the headline and the field allow, and holds there for the dive.
      if (leaving === 'dive' && look.push > 100 && beat.visual.camera !== 'locked') {
        const left = Math.min(...content.map(item => item.x)), right = Math.max(...content.map(item => item.x + item.w));
        const top = Math.min(...content.map(item => item.y)), bottom = Math.max(...content.map(item => item.y + item.h));
        const x = W / 2 + (anchor.point.x - W / 2) * .12, y = (H / 2 + (top + bottom) / 2) / 2;
        const room = Math.min((W * .47) / Math.max(x - left, right - x), (H * .47) / Math.max(y - top, bottom - y));
        const zoom = Math.floor(Math.min(look.push, room * 100));
        if (zoom >= 104) {
          camera.push({frame: buttonAt, ...centred, zoom: 100});
          camera.push({frame: press + 10, x: Math.round(x), y: Math.round(y), rotate: 0, zoom, ease: 'glide'});
          closing = {...camera.at(-1), frame: end - 1, ease: 'linear'};
        }
      }
      const pointer = bh * .3, from = {x: -bw * .1, y: bh * .9};
      const pointerLanded = {x: -from.x, y: -from.y};
      elements.push(element(`cursor-${index}`, 'icon', buttonAt + 4, Math.min(end, press + 25),
        box(tip.x - pointer * 5 / 36 + from.x, tip.y - pointer * 1.16 * 4 / 42 + from.y, pointer, pointer * 1.16), {
          icon: 'cursor', clickAt: press, fill: 'muted', enter: 'resolve', enterFrames: 6,
          motion: [pose(buttonAt + 4), pose(buttonAt + 4 + cursorTravel, {...pointerLanded, ease: 'glide'}),
            pose(press + 13, pointerLanded), pose(press + 24, {...pointerLanded, opacity: 0})],
        }));
    }

    if (scene === 'list' && beat.visual.presentation === 'sequence') {
      surface(start, null, entering);
      const titleRegion = box(m, H * .14, W - 2 * m, H * .24);
      const title = !beat.text ? null : beat.visual.wordClick ? {size: edge * .1 * look.headline, bounds: titleRegion} :
        place(beat.text, titleRegion, edge * .115 * look.headline);
      const line = title ? headline(`line-${index}`, beat, start + 2, end, title.bounds, title.size, {
        align: 'center', ground, evidenceIds, ...(beat.visual.wordClick && {clickTail: sequenceTail(items)}),
      }) : {};
      if (title) elements.push(line);
      const step = portrait ? H * .44 / (items.length - 1) : (W - 2 * m) / items.length;
      const marker = Math.round(edge * .09), stroke = accentOn(ground) ? 'accent' : inkOn[ground];
      // The labels are the content of this scene, so they are set at headline-supporting size and may take two lines.
      // Every stop reserves the height of the tallest title, which keeps the supporting lines on one level.
      const labelWidth = portrait ? W * .65 : step * .92;
      // A vertical route stacks its stops, so there a title keeps to one line.
      const titles = items.map(item => fitLines(item.title, labelWidth, edge * (portrait ? .075 : .16), edge * .06, edge * .04, INTER));
      const titleSize = Math.min(...titles.map(title => title.size));
      const titleLines = Math.max(...titles.map(title => title.size === titleSize ? title.lines : 1), 1);
      const titleHeight = titleLines * titleSize * 1.2 + titleSize * .25;
      const first = line.wordClick ? line.wordClick.at + line.wordClick.frames + 1 : start + (entering?.kind === 'dive' ? 6 : 16);
      for (const [row, item] of items.entries()) {
        const at = first + row * sequenceInterval;
        const x = portrait ? W * .17 : m + step * (row + .5);
        const y = portrait ? H * .42 + step * row : H * .53;
        if (row) elements.push(rule(`path-${index}-${row}`, at - sequenceInterval, end,
          portrait ? x - 2 : x - step, portrait ? y - step : y - 2, step, portrait, stroke, sequenceInterval));
        elements.push(element(`node-${index}-${row}`, 'rect', at, end, box(x - marker / 2, y - marker / 2, marker, marker, marker / 2), {
          fill: stroke, enter: 'resolve', enterFrames: 8, sound: 'pop',
        }));
        elements.push(element(`step-icon-${index}-${row}`, 'icon', at, end, box(x - marker * .26, y - marker * .26, marker * .52, marker * .52), {
          fill: stroke === 'accent' ? 'onAccent' : ground, icon: item.icon === 'cursor' ? 'check' : item.icon ?? 'check',
          enter: 'resolve', enterFrames: 8,
        }));
        const w = labelWidth, left = portrait ? W * .24 : x - w / 2;
        const top = portrait ? y - titleSize * .6 : y + marker * .8;
        const textAt = (id, text, y, h, size, weight, start) => element(id, 'text', start, end, box(left, y, w, h), {
          text, weight, fontSize: fit(text, w, h, size, 24, INTER), align: portrait ? 'left' : 'center',
          fill: inkOn[ground], enter: 'resolve', enterFrames: 10, evidenceIds,
          motion: [pose(start, {x: edge * .034}), pose(start + motionFrames(12), {ease: 'spring'})],
        });
        elements.push(textAt(`step-title-${index}-${row}`, item.title, top, titleHeight, titleSize, 650, at + 3));
        if (item.subtitle || item.badge) {
          elements.push(textAt(`step-detail-${index}-${row}`, [item.subtitle, item.badge].filter(Boolean).join(' · '),
            top + titleHeight, edge * .052, edge * .038, 450, at + 5));
        }
      }
      const final = items.length - 1, fx = portrait ? W * .17 : m + step * (final + .5), fy = portrait ? H * .42 + step * final : H * .53;
      Object.assign(anchor, {settled: first + final * sequenceInterval + 5 + Math.max(10, motionFrames(12)),
        box: box(fx - marker / 2, fy - marker / 2, marker, marker, marker / 2), icon: items[final].icon === 'cursor' ? 'check' : items[final].icon ?? 'check'});
    } else if (scene === 'list') {
      surface(start, null, entering);
      const column = portrait ? box(m, H * .13, W - 2 * m, H * .22) : box(m, H * .2, W * .4, H * .6);
      const title = !beat.text ? null : beat.visual.wordClick ? {size: edge * .105 * look.headline, bounds: column} :
        place(beat.text, column, edge * .105 * look.headline);
      if (title) elements.push(headline(`line-${index}`, beat, start + 2, end, title.bounds, title.size,
        {align: portrait ? 'center' : 'left', ground, evidenceIds}));
      if (look.rules && !inverse && !portrait) elements.push(rule(`rule-${index}`, start + 8, end, W * .44, H * .2, H * .6, true));
      // Rows stand in the open: a mark, a name and one supporting line. No plate is drawn behind them.
      const gap = H * (portrait ? .03 : .045), rows = items.length;
      const cw = portrait ? W - 2 * m : W * .46, x = portrait ? m : beat.text ? W * .49 : (W-cw)/2;
      const region = portrait ? H * .5 : H * .7;
      const ch = Math.min(H * (portrait ? .11 : .17), (region - (rows - 1) * gap) / rows);
      const top = portrait && beat.text ? H * .4 : (H - rows * ch - (rows - 1) * gap) / 2;
      const strong = accentOn(ground) ? 'accent' : inkOn[ground], mark = Math.round(ch * .78);
      const nameSize = Math.round(Math.min(ch * .4, edge * .062)), noteSize = Math.round(Math.min(ch * .27, edge * .04));
      const lastRead = Math.max(22, ...items.map(item => reading([item.title,item.subtitle,item.badge].filter(Boolean).join(' '))));
      const rowGap = settings.pace === 'dynamic' ? Math.max(rowInterval, Math.min(30,
        Math.floor((end - start - 16 - motionFrames(18) - lastRead - 14) / Math.max(1, rows - 1)))) : rowInterval;
      for (const [row, item] of items.entries()) {
        const at = start + 16 + row * rowGap, y = top + row * (ch + gap), note = [item.subtitle, item.badge].filter(Boolean).join(' · ');
        // A springing row may travel in from the side; a slower ease rises from below so it never leaves the frame.
        const arrive = [pose(at, explainer ? {y: edge * .02} : portrait || look.ease !== 'spring' ? {y: H * .04} : {x: W * .08}),
          pose(at + motionFrames(18), {ease: explainer ? 'fluid' : look.ease})];
        const symbol = item.icon && item.icon !== 'cursor' ? item.icon : ['bolt', 'box', 'check', 'heart'][row];
        const side = x + mark * 1.3, width = cw - mark * 1.3;
        elements.push(element(`item-${index}-${row}`, 'rect', at, end, box(x, y + (ch - mark) / 2, mark, mark, mark / 2), {
          fill: strong, enter: 'pop', enterFrames: 10, sound: 'pop', motion: arrive}));
        elements.push(element(`item-icon-${index}-${row}`, 'icon', at, end, box(x + mark * .24, y + (ch - mark) / 2 + mark * .24, mark * .52, mark * .52), {
          icon: symbol, fill: strong === 'accent' ? 'onAccent' : ground, enter: 'pop', enterFrames: 10, motion: arrive}));
        elements.push(element(`item-name-${index}-${row}`, 'text', at + 2, end, box(side, y + (note ? ch * .08 : (ch - nameSize * 1.3) / 2), width, nameSize * 1.35), {
          text: item.title, fontSize: Math.max(24, fit(item.title, width, nameSize * 1.35, nameSize, 24, INTER)), weight: 650, fill: inkOn[ground],
          enter: 'resolve', enterFrames: 8, evidenceIds, motion: [pose(at + 2, {x: arrive[0].x, y: arrive[0].y}), pose(at + 2 + motionFrames(18), {ease: explainer ? 'fluid' : look.ease})]}));
        if (note) elements.push(element(`item-note-${index}-${row}`, 'text', at + 4, end, box(side, y + ch * .08 + nameSize * 1.4, width, noteSize * 1.4), {
          text: note, fontSize: Math.max(24, fit(note, width, noteSize * 1.4, noteSize, 24, INTER)), weight: 450, fill: inkOn[ground],
          enter: 'resolve', enterFrames: 8, evidenceIds, motion: [pose(at + 4, {x: arrive[0].x, y: arrive[0].y, opacity: 72}), pose(at + 4 + motionFrames(18), {opacity: 72, ease: explainer ? 'fluid' : look.ease})]}));
      }
      const finalRow = top + (rows - 1) * (ch + gap);
      Object.assign(anchor, {settled: beat.visual.wordClick ? elements.find(item => item.id === `line-${index}`).wordClick.at + 30 : start + 16 + (rows - 1) * rowGap + 30,
        box: box(x, finalRow + (ch - mark) / 2, mark, mark, mark / 2),
        icon: items[rows - 1].icon && items[rows - 1].icon !== 'cursor' ? items[rows - 1].icon : ['bolt', 'box', 'check', 'heart'][rows - 1]});
    }

    if (scene === 'feature' && beat.visual.wordClick && !captures.has(assetId)) {
      surface(start,null,entering);
      const copy=clickSupport(beat.visual);
      const line=headline(`line-${index}`,beat,start+2,end,box(m,H*.16,W-2*m,H*.47),edge*.165,{
        align:'center',ground,evidenceIds,clickTail:clickSupportFrames(copy),
      });
      elements.push(line);
      const click=line.wordClick;
      if (anchor) anchor.settled=click.at+click.frames+8;
      elements.push(element(`click-result-${index}`,'text',click.at+click.frames+1,end,box(m,H*.65,W-2*m,H*.21),{
        text:copy,fontSize:Math.round(edge*.048),align:'center',fill:inkOn[ground],enter:'mask-rise',enterFrames:10,evidenceIds,
      }));
    } else if (scene === 'feature') {
      const asset = captures.get(assetId);
      // A capture sits in a frame. A capability without one is a mark with its name set in the open: no card.
      const strong = accentOn(ground) ? 'accent' : inkOn[ground], markTop = H * (portrait ? .36 : beat.text || entering?.kind === 'type' ? .3 : .22);
      const note = [detail, action].filter(Boolean).join(' · ');
      // The mark, its name and the supporting line are one stack; it is scaled down as a whole when the frame is short.
      const stack = share => {
        const d = Math.round(edge * (portrait ? .3 : .27) * share), nameSize = Math.round(edge * .125 * look.headline * share), noteSize = Math.round(edge * .058 * share);
        const name = label ? fitLines(label, W - 2 * m, nameSize * 2.5, nameSize, edge * .05, look.display ? DISPLAY : INTER) : {size: nameSize, lines: 1};
        const nameHeight = name.lines * name.size * 1.2 + name.size * .2, noteHeight = note ? noteSize * 2.6 : 0;
        return {d, name, nameHeight, noteSize, noteHeight, height: d + edge * .035 + nameHeight + (note ? name.size * .3 + noteHeight : 0)};
      };
      let laid = stack(1);
      if (!asset && laid.height > H * .95 - markTop) laid = stack((H * .95 - markTop) / laid.height);
      const {d} = laid;
      const panel = asset ? (portrait ? box(m, H * .36, W - 2 * m, H * .46, edge * .03) : box(W * .2, H * .34, W * .6, H * .56, edge * .03)) :
        box((W - d) / 2, markTop, d, d, d / 2);
      if (asset) panel.radius = Math.round(corner(panel.radius));
      const ready = surface(start, {box: panel, fill: asset ? 'surface' : strong}, entering);
      if (anchor) Object.assign(anchor, {box:panel, icon:icon ?? 'check', settled:ready + 22});
      if (entering?.kind === 'type') carryLine(panel.y, m);
      if (beat.text) {
        const {size, lines} = fitLines(beat.text, W - 2 * m, H * .2, edge * .09 * look.headline, edge * .045, look.display ? DISPLAY : INTER);
        elements.push(headline(`line-${index}`, beat, start + 2, end, box(m, panel.y - size * (lines * 1.2 + .7), W - 2 * m, size * (lines * 1.2 + .1)),
          size, {align: 'center', ground, enter: 'mask-rise', evidenceIds}));
      }
      if (asset) {
        const copy = [label,note].filter(Boolean).join('\n');
        const photo = !copy ? box(panel.w * .04, panel.h * .05, panel.w * .92, panel.h * .9) : portrait
          ? box(panel.w * .08, panel.h * .04, panel.w * .84, panel.h * .55)
          : box(panel.w * .04, panel.h * .08, panel.w * .42, panel.h * .84);
        elements.push(element(`capture-${index}`, 'image', ready, end, photo, {
          attachTo: SURFACE, assetId: asset.id, enter: 'resolve', enterFrames: 9, evidenceIds,
          ...(beat.visual.imageFit && {imageFit:beat.visual.imageFit}),
          ...(beat.visual.mediaMotion && {mediaMotion:beat.visual.mediaMotion}),
        }));
        if (copy) elements.push(element(`capture-label-${index}`, 'text', ready + 10, end,
          portrait ? box(panel.w * .06,panel.h * .65,panel.w * .88,panel.h * .3)
            : box(panel.w * .51,panel.h * .2,panel.w * .43,panel.h * .6), {
            attachTo:SURFACE,text:copy,fontSize:Math.round(edge * .045),weight:650,fill:'foreground',
            enter:'mask-rise',enterFrames:10,evidenceIds,
          }));
      } else {
        elements.push(element(`mark-${index}`, 'icon', ready, end, box(d * .24, d * .24, d * .52, d * .52), {
          attachTo: SURFACE, icon: icon && icon !== 'cursor' ? icon : 'check', fill: strong === 'accent' ? 'onAccent' : ground, enter: 'pop', enterFrames: 10,
        }));
        const {name, nameHeight, noteSize, noteHeight} = laid, under = panel.y + d + edge * .035;
        elements.push(element(`label-${index}`, 'text', ready + 2, end, box(m, under, W - 2 * m, nameHeight), {
          text: label, fontSize: Math.max(24, name.size), ...(look.display && {font: 'display'}), weight: look.display ? 800 : look.weight, align: 'center',
          fill: inkOn[ground], enter: 'mask-rise', enterFrames: 12, sound: 'pop', evidenceIds}));
        if (note) elements.push(element(`detail-${index}`, 'text', ready + 10, end, box(m, under + nameHeight + name.size * .3, W - 2 * m, noteHeight), {
          text: note, fontSize: Math.max(24, noteSize), weight: 500, align: 'center', fill: inkOn[ground], enter: 'rise', enterFrames: 10, evidenceIds,
          motion: [pose(ready + 10, {opacity: 78}), pose(end - 1, {opacity: 78})]}));
      }
    }

    if (scene === 'brand') {
      const named = beat.text && [brand, treatment.brand].some(name => name && name.toLowerCase() === beat.text.trim().toLowerCase());
      const mark = named ? beat.text.trim() : brand || beat.text?.trim() || treatment.brand || 'Frameotion';
      const size = fit(mark, W - 2 * m, H * .34, edge * (portrait ? .28 : .3), edge * .08, look.display ? DISPLAY : INTER);
      const centre = H * (portrait ? .4 : .41);
      const wordmark = {...beat, text: mark, visual: {}, move: named ? beat.move : 'type'};
      // A carried surface is still travelling to the address pill; the wordmark waits for it to clear.
      const instant = entering?.kind === 'cut' && ['type', 'hold'].includes(wordmark.move);
      // The name waits until the mark arriving from the previous scene has crossed and settled.
      const opens = start + (instant ? 0 : entering?.kind === 'match' ? 31 : shown ? 18 : 4);
      const title = headline(`wordmark-${index}`, wordmark, opens, end, box(m, centre - size * .78, W - 2 * m, size * 1.3), size,
        {align: 'center', ground, enter: 'mask-rise', sound: 'ding'});
      if (instant) Object.assign(title, {enter: 'none', enterFrames: 1});
      elements.push(title);
      if (beat.text && !named) {
        elements.push(headline(`line-${index}`, {...beat, visual: {}}, opens + 12, end, box(m * 2, centre + size * .62, W - 4 * m, H * .13),
          edge * (portrait ? .065 : .055), {align: 'center', ground, font: 'text', evidenceIds}));
      }
      if (host) {
        const ph = edge * (portrait ? .095 : .08), pw = Math.min(W * .7, host.length * ph * .33 + ph * 1.5);
        const pill = box((W - pw) / 2, H * (portrait ? .7 : .8), pw, ph, ph / 2);
        const pillFill = inverse ? 'background' : 'foreground';
        const ready = surface(start, {box: pill, fill: pillFill}, entering);
        const message = elements.find(item => item.id === `line-${index}`) ?? title;
        // Let the last useful piece of information arrive after the promise:
        // brand → message → destination, with a complete reading window for all.
        const addressAt = Math.max(ready, end - 8 - Math.floor(MAX_READING_SECONDS*30),
          settings.pace === 'dynamic' ? Math.min(end - 12 - reading(host),
            message.start + message.enterFrames + reading(message.text)) : ready);
        elements.push(element(`address-${index}`, 'pill', addressAt, end, box(0, 0, pw, ph, ph / 2), {
          attachTo: SURFACE, text: host, fontSize: Math.max(24, Math.round(ph * .42)), weight: 600, fill: pillFill,
          enter: 'resolve', enterFrames: 8,
        }));
      } else {
        // Without an address the close still has a surface for the previous scene to arrive in: a rule under the name.
        const length = W * .14, thick = Math.max(8, Math.round(edge * .012));
        surface(start, {box: box((W - length) / 2, centre + size * .55, length, thick, thick / 2), fill: accentOn(ground) ? 'accent' : inkOn[ground]}, entering);
      }
    }
    if (closing) camera.push(closing);
    join(index, start);
    start = end;
  }
  if (!states.length || states[0].frame !== 0) {
    const first = states[0]?.box ?? box(W * .4, H * .45, W * .2, H * .1, 20);
    states.unshift({frame: 0, duration: 1, box: first, fill: states[0]?.fill ?? 'surface', opacity: 0});
  }
  const shapes = states.length > 1 ? [{id: SURFACE, elevation: Math.min(3, look.elevation + 1), states}] : [];
  return {scenes, shapes, elements, camera, frames};
}
