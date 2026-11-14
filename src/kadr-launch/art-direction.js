// Art direction for scene films. A motion recipe says how things move; an art direction says how the
// film looks: type, grounds, contrast between scenes, surfaces and the temper of the easing.
// The six directions follow the "Motion Atlas" reference (references/motion-atlas): technique ≠ style.
// Colours always come from the product's own palette; a direction only chooses how its roles are used.

const base = {
  // Type
  display: true,            // bundled display face for headlines; false keeps the text face
  weight: 600,              // headline weight when display is off
  hero: [.2, .2],           // hero line size as a share of the short edge: [landscape, portrait]
  heroAlign: 'left',        // landscape alignment of the hero line
  heroEntry: 'word-lift',   // how a headline arrives unless the beat's move names an entrance
  headline: 1,              // scale of the other headlines
  // Grounds
  inverse: ['input', 'brand'],   // scenes set on the contrasting ground; 'alternate' flips every scene
  inverseGround: 'foreground',   // palette role of the contrasting ground
  ground: {hero: 'aurora', input: 'grid', list: 'aurora', feature: 'halo', brand: 'aurora'},
  // Surfaces
  elevation: 2,             // depth of the carried surface
  radius: 1,                // corner radius multiplier
  rules: false,             // thin drawn rules that organise the frame
  // Motion
  ease: 'spring',           // how the shared surface lands
  stagger: 12,              // frames between list rows
  drift: 103,               // subtle scale change of the hero line, in percent
  // Staging: how scenes grow out of each other and how close the camera comes to an action.
  // The first link in this order that the two scenes can support is used when the director names none.
  links: ['type', 'carry', 'match', 'portal', 'wipe', 'cut'],
  push: 112,                // camera zoom on the button before a dive, in percent; 100 keeps the camera still
  dive: 22,                 // frames the camera takes to push into a detail
};

const direction = (title, summary, brief, look) => ({title, summary, brief, look: {...base, ...look, ground: {...base.ground, ...look.ground}}});

export const ART_DIRECTIONS = {
  clean: direction('Чистый продуктовый',
    'Белое поле, один объект, аккуратные тени, мало слов.',
    'Clean product look: a white field, one object at a time, very few words. Prefer an input and a single feature over long lists. Keep every line plain and literal.',
    {display: false, weight: 650, hero: [.15, .15], heroEntry: 'mask-rise', inverse: [], elevation: 3,
      links: ['carry', 'type', 'match', 'wipe', 'cut'], push: 106, dive: 18,
      ground: {hero: 'halo', input: 'halo', list: 'halo', feature: 'halo', brand: 'halo'}, ease: 'fluid', stagger: 14, drift: 102}),
  editorial: direction('Редакционный и типографический',
    'Крупные слова, смелый контраст, плотная композиция.',
    'Kinetic typography look: short, confident statements set very large. Lead with a hero line of two to four words and give list rows one or two words each. The rhythm of the phrases carries the film.',
    {hero: [.26, .22], heroEntry: 'kinetic-stretch', headline: 1.15, inverse: 'alternate', elevation: 0, radius: .35,
      links: ['type', 'match', 'wipe', 'cut'], push: 100, dive: 16,
      ground: {hero: 'flat', input: 'flat', list: 'flat', feature: 'flat', brand: 'flat'}, ease: 'expo', stagger: 8}),
  spatial: direction('Мягкий пространственный',
    'Плоскости с глубиной и мягкий свет; предметы лёгкие, но материальные.',
    'Soft spatial look: calm surfaces floating in soft light. Let a large symbol or a carried surface tell the story. Keep copy gentle and short.',
    {display: false, weight: 600, hero: [.14, .14], heroAlign: 'center', heroEntry: 'word-blur', inverse: ['brand'],
      elevation: 3, radius: 1.35, ground: {input: 'aurora', feature: 'aurora'}, ease: 'fluid', stagger: 14, drift: 105,
      links: ['carry', 'type', 'match', 'dive', 'wipe', 'cut'], push: 110, dive: 26}),
  playful: direction('Игривый геометрический',
    'Яркие цветовые поля, упругость; характер задаёт тайминг.',
    'Playful geometric look: bright colour fields and springy arrivals. Write light, direct lines and let one short word be the key phrase.',
    {hero: [.2, .2], heroAlign: 'center', inverse: ['input', 'brand'], inverseGround: 'accent', elevation: 1, radius: 1.6,
      links: ['match', 'dive', 'carry', 'portal', 'type', 'cut'], push: 108, dive: 18,
      ground: {hero: 'flat', input: 'flat', list: 'flat', feature: 'flat', brand: 'flat'}, stagger: 8}),
  ambient: direction('Атмосферный генеративный',
    'Тёмное поле, медленный пластичный свет; ощущение процесса.',
    'Cinematic atmospheric look: a dark field with slow light, close-ups and pauses. Use few, quiet lines that suggest a process rather than list features, and keep rows to two or three.',
    {display: false, weight: 500, hero: [.125, .13], heroAlign: 'center', heroEntry: 'word-blur', headline: .9,
      inverse: 'all', elevation: 1, radius: 1.2, links: ['carry', 'type', 'match', 'cut'], push: 116, dive: 30,
      ground: {hero: 'aurora', input: 'aurora', list: 'aurora', feature: 'aurora', brand: 'aurora'}, ease: 'fluid', stagger: 14, drift: 105}),
  technical: direction('Точный технический',
    'Сетка, тонкие линии, сдержанная палитра; движение объясняет структуру.',
    'Precise technical look: a grid, thin rules and exact wording. Name things as the product names them and use list rows for steps or parts in their real order.',
    {display: false, weight: 600, hero: [.13, .13], heroEntry: 'word-type', headline: .9, inverse: ['brand'], elevation: 0, radius: .3, rules: true,
      links: ['carry', 'type', 'match', 'wipe', 'cut'], push: 100, dive: 18,
      ground: {hero: 'grid', input: 'grid', list: 'grid', feature: 'grid', brand: 'grid'}, ease: 'expo', stagger: 6, drift: 101}),
};

export const DEFAULT_LOOK = base;
export const lookFor = id => ART_DIRECTIONS[id]?.look ?? base;
