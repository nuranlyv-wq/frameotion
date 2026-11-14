// What the engine can stage, written for the director: the job each technique does, the objects it needs,
// its limits and what to use when it cannot be staged. The scene compiler resolves links against this
// catalogue, the director's prompt is built from it and the direction plan quotes it.
// status: 'works' is rendered by the scene films; 'limited' works under the stated conditions;
// 'detailed' exists in the renderer but only in the detailed staging or a preset; 'unsupported' is not drawn.

// How a scene arises from the one before it. The order is the general preference when the director names none.
export const LINKS = {
  carry: {
    title: 'Общий объект', principle: 'shared element', status: 'works',
    solves: 'One surface keeps its identity across the cut and changes its role: the field becomes the mark of a feature, then the address.',
    needs: 'Both scenes have a surface: the field of an input, the mark of a feature, the address or rule of the brand close.',
    limits: 'The surface is a rounded plate. Its content is replaced at the cut, not morphed.',
    fallback: ['match', 'wipe', 'cut'],
  },
  type: {
    title: 'Строка становится интерфейсом', principle: 'text transformation', status: 'works',
    solves: 'The hero line is not replaced: it shrinks and settles as the headline of the interface that appears under it.',
    needs: 'A hero scene followed by an input, feature or show scene without a separate headline.',
    limits: 'The line keeps its wrapping, so it works for lines of up to about five words. Both scenes share one ground.',
    fallback: ['wipe', 'cut'],
  },
  dive: {
    title: 'Наезд в деталь', principle: 'zoom into detail', status: 'works',
    solves: 'The camera pushes into a detail until its colour fills the frame; the next scene plays inside that colour.',
    needs: 'The previous scene ends on a solid mark: the pressed button of an input, the mark a clicked word turned into, the token of a show, the last mark of a list.',
    limits: 'The detail gives the next scene its ground colour.',
    fallback: ['match', 'portal', 'wipe', 'cut'],
  },
  match: {
    title: 'Совпадение формы', principle: 'match cut + shape morph', status: 'works',
    solves: 'A hard cut changes everything except one detail, which stays in place and then grows into the main object of the new scene.',
    needs: 'The previous scene ends on a solid mark (pressed button, show token, last mark of a list); the next scene has a surface or a show token.',
    limits: 'The outline morphs between a circle, a plate and a rule. Letters and pictures are not morphed.',
    fallback: ['carry', 'portal', 'cut'],
  },
  portal: {
    title: 'Раскрытие из точки', principle: 'object wipe', status: 'works',
    solves: 'The next scene opens through a growing circle centred on the point of the last action.',
    needs: 'A mark in the previous scene, or a deliberately centered reveal.',
    limits: 'The circle is a mask: nothing of the previous scene continues into the next.',
    fallback: ['wipe', 'cut'],
  },
  wipe: {
    title: 'Плоскость', principle: 'occlusion', status: 'works',
    solves: 'A plane of the incoming colour crosses the frame and the cut hides under it. It marks a new chapter.',
    needs: 'A change of ground between the two scenes.',
    limits: 'It links nothing by content.',
    fallback: ['cut'],
  },
  whip: {
    title: 'Склейка на движении', principle: 'cut on action', status: 'limited',
    solves: 'The camera accelerates out of one scene and brakes into the next, so the cut falls on the fastest frame.',
    needs: 'A change of subject that deserves energy.',
    limits: 'Use when the cut deserves a sudden change of energy.',
    fallback: ['cut'],
  },
  cut: {
    title: 'Склейка', principle: 'plain cut', status: 'works',
    solves: 'Two scenes with nothing in common simply follow each other. Often the clearest join.',
    needs: 'Nothing.', limits: 'None.', fallback: [],
  },
};
export const LINK_KINDS = Object.keys(LINKS);

// What happens inside a scene.
export const ACTIONS = {
  'object-reveal': {title: 'Текст из предмета', status: 'works', solves: 'A subject releases its own label through its visible edge; the copy lands outside the object.',
    needs: 'Plain text and a visible subject in the same coordinate space.', limits: 'The subject must remain visible throughout the reveal.'},
  'word-lift': {title: 'Слова из-под маски', status: 'works', solves: 'A headline arrives word by word and lands readable.', needs: 'A line of two to six words.'},
  'kinetic-stretch': {title: 'Растяжение слов', status: 'works', solves: 'A confident statement stretches into place.', needs: 'A short hero line.'},
  'word-type': {title: 'Набор по словам', status: 'works', solves: 'Shows text being entered: the reveal is the action.', needs: 'A short line or a field value.'},
  'word-click': {title: 'Клик по слову', status: 'works', solves: 'A cursor presses a word; it is replaced, or its letters reshape into a mark (text → shape). The mark can be the detail of a following dive.',
    needs: 'A hero, feature or list headline with the exact word.', limits: 'The mark is a circle, diamond, hexagon, burst or plate with an optional icon.'},
  'key-phrase': {title: 'Ключевая фраза', status: 'works', solves: 'One part of a line carries the point in the strong colour and tells the eye where to land.', needs: 'Consecutive whole words of the line.'},
  press: {title: 'Нажатие и отклик', status: 'works', solves: 'Cause and effect: the cursor presses the button, the button gives way to a confirmation mark.', needs: 'An input scene.'},
  'push-in': {title: 'Наезд на действие', status: 'works', solves: 'The camera closes in while the cursor approaches, so the press is the largest thing in the frame.', needs: 'An input scene that is left through a dive.',
    limits: 'The push stops where the headline would leave the frame.'},
  stagger: {title: 'Строки по очереди', status: 'works', solves: 'Results arrive one after another, each caused by the action before.', needs: 'Two to four list rows.'},
  sequence: {title: 'Маршрут результата', status: 'works', solves: 'A line reaches each step before its label appears, making the order of events visible.', needs: 'Two to four events in a meaningful order.', limits: 'Spacing is illustrative; it does not encode elapsed time.'},
};

// What a product does, staged with objects in a show scene. One mechanic per kind of capability.
export const SHOWS = {
  orbit: {title:'Орбиты сервисов',status:'works',
    solves:'Recognisable app marks orbit the product, then land readable. Useful for connected tools, channels and an ecosystem.',
    needs:'two to six parts and a central whole. Prefer supplied service-logo assetIds for named apps.'},
  gallery: {title:'Бенто с настоящими изображениями',status:'works',
    solves:'Real source photos fill an asymmetric bento layout, reveal in sequence and move inside their masks.',
    needs:'two to four parts with supplied assetIds. Use product photos, site imagery or real interface captures. Optional mediaMotion=ken-burns|parallax|none.'},
  transform: {title:'Превращение предмета',status:'works',
    solves:'One object changes meaning and form through named stages, including a flat mark, a lit box and the brand logo.',
    needs:'two to four stages, with label, icon and optional form=tile|box|logo.'},
  fold: {title:'Сгибание и раскрытие',status:'works',
    solves:'Hinged paper or package panels fold around a subject or open to reveal it.',
    needs:'subject, whole, material=paper|package and direction=open|close.'},
  assemble: {title:'Сборка из частей',status:'works',
    solves:'Separate parts take their places in a single object, which gains depth when the last piece lands.',
    needs:'parts and whole, with an optional whole.form.'},
  journey: {title: 'Путь', status: 'works',
    solves: 'Something really travels: a parcel to a door, a document to a client, a rider to a place. The subject becomes its carrier, rides a drawn route across a map and arrives.',
    needs: 'show.subject, show.to and usually show.carrier and show.result.', limits: 'The map is schematic: it shows no real streets or addresses.'},
  cycle: {title: 'Круг', status: 'works',
    solves: 'Something comes back on a schedule: a subscription delivery, a reminder, a recurring charge. A token rides a ring and lights each stop it passes.',
    needs: 'show.subject; optional show.marks only for distinct named occasions.', limits: 'Repeating stops are unlabelled unless the source distinguishes them.'},
  gather: {title: 'Сбор', status: 'works',
    solves: 'Several separate things end up in one place: a marketplace, an aggregator, an all-in-one app. The parts fly into one object, which grows with each.',
    needs: 'two to four show.parts and show.whole.', limits: 'The parts are symbols with labels, not product photos.'},
  process: {title: 'Процесс', status: 'works',
    solves: 'One thing is made in stages and is something different at each: beans, roast, bag, cup; brief, design, code, launch. A token hops from stage to stage and its symbol changes on landing.',
    needs: 'three or four show.stages in their real order, each with the icon of what the thing is at that stage.', limits: 'Stages stand in a row; they are not screens or photos.'},
  spread: {title: 'Раздача', status: 'works',
    solves: 'One thing goes out to several places at once: a post to channels, a campaign to audiences, one trigger to many actions. Copies fly out from the centre along rays and become the places they land on.',
    needs: 'show.subject and two to four show.parts, the destinations the source names.', limits: 'Destinations are symbols with labels; no brand logos of other services.'},
};

// In the renderer, outside the scene films. Listed so the director does not promise them there.
export const ELSEWHERE = {
  flood: {status: 'detailed', note: 'Camera floods into a persistent shape and the next scene opens from its outline. Detailed staging and the connected-story preset.'},
  contours: {status: 'detailed', note: 'A persistent shape morphs between plate, ellipse, diamond, hexagon and burst. Detailed staging and continuous-morph.'},
  volume: {status: 'detailed', note: 'A lit box is available in show.transform, show.fold and show.assemble. Arbitrary meshes and perspective keys require detailed staging.'},
  'letter-as-object': {status: 'unsupported', note: 'A single glyph that becomes the object of the next scene. Use word-click with a shape, then dive.'},
  'image-morph': {status: 'unsupported', note: 'One picture morphing into another. Use a carried surface holding the capture.'},
  particles: {status: 'unsupported', note: 'Not drawn. Leave them out.'},
};

// A mark with a known place in the frame: the pressed button, the token of a show, the last mark of a list.
const solid = anchor => ['button', 'node'].includes(anchor?.kind);
const conditions = (asked, {anchor, surface, matchSurface = surface, before, typeCarry, groundChanges, last}) => ({
  carry: before?.surface && surface ? null : 'both scenes need a surface',
  type: typeCarry ? null : 'needs a hero line followed by an input, feature or show without its own headline',
  dive: anchor && !anchor.plain ? null : 'the previous scene ends on no product action or meaningful detail to zoom into',
  match: solid(anchor) && matchSurface ? null : !solid(anchor) ? 'the previous scene ends on no solid mark' : 'the next scene has no surface to grow into',
  portal: asked === 'portal' || solid(anchor) || last ? null : 'there is no point of action to open from',
  wipe: asked === 'wipe' || groundChanges ? null : 'the ground does not change',
  whip: asked === 'whip' ? null : 'a whip is used only when asked for',
  cut: null,
});

// Chooses the link into a scene. `asked` is the director's choice; `prefer` the art direction's order.
// Returns the link that can be staged with the geometry at hand and, if it differs from what was asked, why.
export function resolveLink(asked, context, prefer = LINK_KINDS) {
  const blocked = conditions(asked, context);
  const spent = kind => kind === 'dive' && context.dives >= 1 && asked !== 'dive' ? 'one dive per film' : null;
  const reason = kind => blocked[kind] ?? spent(kind);
  if (asked && !reason(asked)) return {kind: asked, asked};
  const order = asked ? LINKS[asked].fallback : prefer;
  const kind = order.find(candidate => !reason(candidate)) ?? 'cut';
  return {kind, ...(asked && {asked, substituted: reason(asked)})};
}

export const linkWhy = ({kind, asked, substituted}, anchor) => {
  const detail = {button: 'the pressed button', word: 'the mark the clicked word became', node: 'the mark the scene ended on'}[anchor?.kind];
  const told = {
    carry: 'The surface of the previous scene moves into this one and takes a new role.',
    type: 'The hero line stays on screen and becomes this scene\'s headline.',
    dive: `The camera pushes into ${detail ?? 'the detail'}; its colour becomes this scene's ground.`,
    match: `${detail ? detail[0].toUpperCase() + detail.slice(1) : 'The detail'} holds its place across the cut and grows into this scene's surface.`,
    portal: solid(anchor) ? `The scene opens from ${detail}.` : 'The scene opens from the centre of the frame.',
    wipe: 'A plane of the new ground marks the new chapter.',
    whip: 'The cut falls on the fastest frame of a camera whip.',
    cut: 'Nothing links the two scenes, so they simply cut.',
  }[kind];
  return substituted ? `${told} Asked for ${asked}: ${substituted}.` : told;
};

// Which link two neighbouring scenes can support, stated per pair so the director asks for one that can be staged.
// It restates `conditions` above in the director's terms; keep the two in step.
export const PAIRING = [
  'hero without wordClick, of up to five words → input, feature or show whose text is omitted: type. The line stays and becomes the headline.',
  'input → feature, another input or brand: match (the pressed button grows into the next mark) or carry.',
  'input → show or list: dive into the pressed button, so what follows plays as the consequence of the press.',
  'show → feature, input or brand: match. The token of the show stays in place across the cut and becomes the next mark, the address or the rule under the name.',
  'list → feature, input or brand: match from the mark of its last row or step.',
  'feature → input, feature or brand: carry.',
  'a headline whose wordClick has a shape → any scene: dive into that mark.',
  'a plain hero line → an input, feature or brand that already has its own copy: choose a cut or wipe unless there is a meaningful shared object; do not invent a decorative mark for the transition.',
  'only when none of these fits: wipe when the ground and the mood change, otherwise cut.',
];

// The catalogue as the director reads it.
export function catalogueBrief() {
  const links = Object.entries(LINKS).map(([id, link]) =>
    `- ${id}: ${link.solves} Requires: ${link.needs}`);
  const shows = Object.entries(SHOWS).map(([id, show]) =>
    `- ${id}: ${show.solves} Requires: ${show.needs}${show.limits ? ` ${show.limits}` : ''}`);
  return `Handoffs (choose what serves the idea):\n${links.join('\n')}\nShow mechanics:\n${shows.join('\n')}\nThe native renderer supports typography, clicks, object trajectories, connected paths, projected boxes, hinged panels and assemblies. A show can flow into another show through match. Layout reflows for portrait. Photographic image morphs, arbitrary particles and single-glyph deformation are not supported; express those ideas with the supplied object vocabulary. Only the user's imported ZIP recordings are used for sound.`;
}
