import {ACTIONS, LINKS, SHOWS} from './techniques.js';
import {isVisualAsset} from './media.js';
import {MAX_READING_SECONDS} from './reading.js';

const textBindings = {
  'word-lift': {move: 'word-lift', text: 'exact headline'},
  'kinetic-stretch': {move: 'kinetic-stretch', text: 'exact headline'},
  'word-type': {move: 'word-type', text: 'exact short copy'},
  'word-click': {move: 'word-click', fields: ['beat.text','visual.wordClick.word','visual.wordClick.replace or shape/mark']},
  'object-reveal': {visual: {scene: 'show'}, generated: 'Plain labels emerge from their paired visible subject; also supported for list step labels.'},
  'key-phrase': {visual: {keyPhrase: 'consecutive whole words from beat.text'}},
  press: {visual: {scene: 'input', label: 'selection', action: 'button copy'}},
  'push-in': {visual: {scene: 'input'}, nextBeat: {visual: {link: 'dive'}}},
  stagger: {visual: {scene: 'list', presentation: 'rows'}, fields: ['visual.items[].title','visual.items[].icon']},
  sequence: {visual: {scene: 'list', presentation: 'sequence'}, fields: ['visual.items[].title','visual.items[].icon']},
};

const propFields = {
  journey: ['subject','carrier (optional)','to','result (optional)'], cycle: ['subject','result','marks (optional)'],
  gather: ['parts','whole'], assemble: ['parts','whole'], process: ['stages'], transform: ['stages with form=tile|box|logo'],
  spread: ['subject','parts'], fold: ['subject','whole','material','direction'], orbit: ['parts','whole'], gallery: ['parts with assetId'],
};

export function sceneCapabilities(source, settings, {rapid = false} = {}) {
  const assets = (source.assets ?? []).filter(isVisualAsset).map(({id,kind,role,evidenceId,name,caption,service,width,height}) =>
    ({id,kind,role,evidenceId,name,caption,service,width,height}));
  return {
    mode: rapid ? 'superdynamic' : 'ordinary',
    timing: {unit: 'seconds', pace: settings.pace, total: settings.frames / settings.fps,maximumReading:MAX_READING_SECONDS,
      ...(rapid ? {typicalAction: .3, maximumAction: .5, holds: 'Reserve a readable landing after the fast action; copy and continuous subjects may persist.'}
        : {holds: 'Keep the accepted Lapa motion language: smooth object continuity, purposeful camera moves and readable landings. Use the ordinary timing guide.'})},
    materials: {assets, claims: 'Use source.evidence; an image caption or service mark is not evidence for a product claim.'},
    objects: Object.entries(SHOWS).map(([id, entry]) => ({id, title: entry.title, useWhen: entry.solves,
      available: id !== 'gallery' || assets.length >= 2, binding: {visual: {scene: 'show', show: {kind: id}}},
      propFields: propFields[id], acceptsSourceAssets: true,
      ...(id === 'gallery' && {requires: 'Two to four supplied image assetIds.'}),
      ...(entry.limits && !['gather','spread','process'].includes(id) && {limits: entry.limits})})),
    textAndInteraction: Object.entries(ACTIONS).filter(([id]) => rapid || id !== 'object-reveal').map(([id, entry]) => ({id, useWhen: entry.solves, binding: textBindings[id],
      ...(entry.limits && {limits: entry.limits})})),
    camera: {binding: 'visual.camera', choices: {locked: 'Keep the subject and reading landing stable.',
      follow: 'Follow a moving subject.', detail: 'Reveal a meaningful product detail.', auto: 'Use the native mechanic framing.'}},
    handoffs: Object.entries(LINKS).map(([id, entry]) => ({id, useWhen: entry.solves, requires: entry.needs,
      binding: {visual: {link: id}}, fallback: entry.fallback,
      ...(id === 'wipe' && {controls: {wipeDirection: ['left','right'], wipeFrames: '6–18 score frames per half-pass',
        wipeGroup: 'Give adjacent incoming wipes the same group name; the band reverses left/right on each pass and reveals a new scene.'},
        useSequenceFor: 'A short burst of distinct supported features, product states or cause/result images. Preserve readable landings.'})})),
    composition: {binding: ['visual.layout','visual.focus','visual.emphasis','visual.backdrop','visual.ground','visual.rhythm','visual.seconds','visual.holdSeconds'],
      authored:{scene:'composition',binding:'visual.stage',coordinates:{width:1000,height:1000*settings.height/settings.width,origin:'top left; each x,y is its node centre'},
        nodes:['group','text','image','logo','plane','icon','glow','path','counter'],
        tracks:['x','y','z','rx','ry','rz','scale','opacity','blur','w','h','radius','reveal','value','glassStrength'],
        materials:['solid','glass','liquid-glass','phone','none','matte'],
        opticalGlass:{binding:'node.material=glass or liquid-glass; node.glass',controls:{blur:'0–24',refraction:'0–80',dispersion:'0–5',tint:'0–0.5',edge:'2–100',shine:'0–1'},strength:'Animate glassStrength 0–2; zero is optically neutral',use:'glass is frosted; liquid-glass has a clearer centre with rounded refractive edges, dispersion and a light rim. It samples the real painted background. Keep text as children above the surface so glyphs stay sharp. Use textured/graphic content behind glass; do not place glass over a flat empty ground or use several nested optical panes.'},
        camera:'Independent projected camera track; normalized t=0..1 within the scene',
        fragments:{binding:'visual.stage.fragments',choices:['control','orbit-ring','focus-reel','hinge'],note:'Compact native building blocks expand to editable nodes; free authored geometry remains available.'},
        typography:{fonts:['brand','heading','body','inter','display','comfortaa','fira-sans'],inline:'Measured baseline and advance; reserve=group prevents lifetime-driven jumps',centering:'Measured painted glyph bounds',coverage:'Whole-run bundled font coverage, reported fallback'},
        controls:{binding:'node.control; node.dock; node.pointer',checks:['label coverage and containment','parent and frame containment','actual cursor tip at click']},
        parenting:'Group transforms and optional projected parent masks',sound:'Explicit events tied to real nodes'},
      principle: 'One dominant action, purposeful scale changes, readable result; art direction controls appearance.'},
    sound: {source: 'User ZIP recordings only', sync: 'Actual native click, transformation and landing events; unmatched events stay silent.'},
    unavailable: ['arbitrary particles','single-glyph deformation','photographic image morphs','invented show kinds','arbitrary detailed meshes in this automatic mode'],
  };
}

// The schema and source already contain the complete fields and asset metadata.
// Keep the full developer catalogue above, but send one compact capability map.
export function compactDirectorCapabilities(c){
  return {mode:c.mode,timing:c.timing,materials:{claims:c.materials.claims},
    objects:c.objects.map(({id,available,binding,propFields,requires})=>({id,available,binding,propFields,...(requires?{requires}:{})})),
    textAndInteraction:c.textAndInteraction.map(({id,binding})=>({id,binding})),camera:c.camera,
    handoffs:c.handoffs.map(({id,binding,requires,fallback,controls})=>({id,binding,requires,fallback,...(controls?{controls}:{})})),
    composition:{binding:c.composition.binding,authored:c.composition.authored},sound:c.sound,unavailable:c.unavailable};
}

