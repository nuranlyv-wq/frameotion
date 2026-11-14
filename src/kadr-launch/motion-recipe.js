export const PRODUCT_UI_PROMO = 'product-ui-promo';
export const KINETIC_TYPOGRAPHY = 'kinetic-typography';
export const EXPLAINERS_DATA_VIZ = 'explainers-data-viz';
export const CONNECTED_STORY = 'connected-story';
export const CONTINUOUS_MORPH = 'continuous-morph';
export const OBJECT_TRANSFORM = 'object-transform';

export const usesConnectedStory = recipe => [CONNECTED_STORY, CONTINUOUS_MORPH, OBJECT_TRANSFORM].includes(recipe);

const credit = (title, file, adaptation) => ({
  title, author: 'HiAPIAI',
  source: `https://github.com/HiAPIAI/awesome-opus-5-5-video-styles/blob/main/styles/${file}.md#style-recipe`,
  license: 'https://creativecommons.org/licenses/by/4.0/', adaptation,
});

export const MOTION_RECIPES = {
  [CONNECTED_STORY]: {},
  [OBJECT_TRANSFORM]: {},
  [CONTINUOUS_MORPH]: {
    credit: {
      title: 'Hello Claude', author: 'Ishu Agrawal',
      source: 'https://claudevideo.org/videos/coral-starburst-morphs-into-a-task-list-and-a-cursor',
      adaptation: 'Original KADR geometry and timing inspired by the control, dot, burst and response marker in the opening sequence.',
    },
  },
  [PRODUCT_UI_PROMO]: {
    style: 'product-demo',
    credit: credit('Product UI Promo', 'productui', 'Native KADR choreography and easing for product UI surfaces, attached layers, cursor and camera.'),
    direction: 'Stage one recognizable UI action in a continuous view. Let a visible cursor motivate the change, keep the same surface and its identifying content through the handoff, and let the result settle before the next message. Move the camera to clarify the action and use the product’s own colours and UI evidence.',
  },
  [KINETIC_TYPOGRAPHY]: {
    credit: credit('Kinetic Typography', 'typography', 'Large masked type and an animated handoff from headline to interface, with reading holds and the product palette.'),
    direction: 'Open with a short, oversized line that uses kinetic-stretch or word-lift. Use scale, staggered masks and one brand accent to make the key word carry the action. Give the line a readable hold. When staging an interface, carry a word into its next role as a label where the score permits it. Preserve exact copy, product evidence, and the requested pace.',
  },
  [EXPLAINERS_DATA_VIZ]: {
    credit: credit('Explainers & Data Viz', 'explainer', 'Sequential reveals, one accent for the result, and an illustrative delivery calendar built from native KADR actors.'),
    direction: 'Explain one concrete relationship at a time. Show the cause first and reveal the result in order. In composed scenes use a list for sequential steps; in a detailed score use native strokes, cards and adjacent labels to build a diagram. Give the result a readable hold and use one brand accent to mark it. Ground all dates, quantities and intervals in the source. Label illustrative schedules as examples.',
  },
};

export function applyMotionRecipe(score, recipe) {
  if (recipe === KINETIC_TYPOGRAPHY) {
    const opener = score.elements.find(element => ['word-lift','kinetic-stretch'].includes(element.enter) &&
      !element.motion && !element.attachTo && element.start < score.scenes[0].end);
    if (!opener) return score;
    const pose = (frame, scale) => ({frame, scale, x: 0, y: 0, rotate: 0, opacity: 100, ease: 'fluid'});
    return {...score, elements: score.elements.map(element => element === opener
      ? {...element, motion: [pose(element.start, 92), pose(element.start + element.enterFrames, 100)]}
      : element)};
  }
  if (recipe !== PRODUCT_UI_PROMO) return score;
  const easeMotion = key => key.ease === 'smooth' ? {...key, ease: 'fluid'} : key;
  const easeSurface = key => key.ease === undefined || key.ease === 'spring'
    ? {...key, ease: 'fluid'} : easeMotion(key);
  return {
    ...score,
    shapes: score.shapes.map(shape => ({
      ...shape, states: shape.states.map((state, index) => index ? easeSurface(state) : state),
    })),
    elements: score.elements.map(element =>
      element.motion && (element.attachTo || element.icon === 'cursor' || element.kind === 'card')
        ? {...element, motion: element.motion.map((key, index) => index ? easeMotion(key) : key)}
        : element),
    camera: score.camera.map(key => key.ease === undefined ? {...key, ease: 'fluid'} : easeMotion(key)),
  };
}
