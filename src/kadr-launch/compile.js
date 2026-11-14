import {isVisualAsset} from './media.js';
import {checkSchema} from '../production/contracts.js';
import {resolveInterfacePalette} from './interface-palette.js';
import {PRODUCT_FLOW_IDS, productSubscriptionLabel} from './product-flow.js';
import {EXPLAINERS_DATA_VIZ, KINETIC_TYPOGRAPHY} from './motion-recipe.js';
import {validateScore} from './score.js';
import {TreatmentSchema, validateTreatment, validateTreatmentScore} from './treatment.js';
import {SCENE_MOVES, compileScenes, sceneIssues, sceneMinimum} from './scenes.js';
import {stageWordClick,WORD_CLICK_ENTRY,wordClickMinimum} from './word-click.js';
import {compileSuperDynamic} from './super-dynamic.js';
import {readingBudget} from './reading.js';
import {fitStagePauses} from './stage-pacing.js';

const {frames: _frames, ...beatProperties} = TreatmentSchema.properties.beats.items.properties;
export const SemanticTreatmentSchema = {
  ...TreatmentSchema,
  properties: {
    ...TreatmentSchema.properties,
    beats: {
      ...TreatmentSchema.properties.beats,
      items: {
        ...TreatmentSchema.properties.beats.items,
        properties: beatProperties,
        required: ['id', 'purpose', 'action', 'landing', 'handoff', 'energy', 'move', 'visual'],
      },
    },
  },
};

// Launch films are staged from composed scenes. Product Demo and the recorded product flow keep the object staging.
export const usesScenes = (settings, source) => settings.style !== 'product-demo' && !source.productFlow;
const sceneBeat = SemanticTreatmentSchema.properties.beats.items;
export const SceneTreatmentSchema = {
  ...SemanticTreatmentSchema,
  properties: {
    ...SemanticTreatmentSchema.properties,
    beats: {
      ...SemanticTreatmentSchema.properties.beats,
      minItems: 2,
      items: {...sceneBeat, properties: {
        ...sceneBeat.properties,
        move: {type: 'string', enum: SCENE_MOVES},
        visual: {...sceneBeat.properties.visual, required: ['scene']},
      }},
    },
  },
};

const words = value => value.trim().split(/\s+/u).length;
const typography = new Set(['spiral','text-ring','word-swap','word-click','word-type','word-lift','kinetic-stretch']);
const box = (x, y, w, h, radius = 0) => ({
  x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), radius: Math.round(radius),
});
const element = (id, kind, start, end, bounds, props) => ({
  id, kind, start, end, box: bounds, fill: 'foreground', enter: 'none', enterFrames: 1,
  sound: 'none', evidenceIds: [], ...props,
});
const pose = (frame, fields = {}) => ({
  frame, x: 0, y: 0, scale: 100, rotate: 0, opacity: 100, ease: 'smooth', ...fields,
});

const calendarCopy = {
  ru: {hook: 'Корм по подписке', title: 'Календарь доставок', interval: 'Пример графика · раз в месяц'},
  en: {hook: 'Pet food by subscription', title: 'Delivery calendar', interval: 'Example schedule · once a month'},
  az: {hook: 'Yem abunəliyi', title: 'Çatdırılma təqvimi', interval: 'Nümunə qrafik · ayda bir dəfə'},
};

function monthlyDeliveryEvidence(settings, source) {
  if (settings.motionRecipe !== EXPLAINERS_DATA_VIZ || source.productFlow?.provenance !== 'recorded-public-shop') return;
  return source.evidence.find(({text}) => /раз в месяц|каждый месяц|once a month|every month|hər ay|ayda bir dəfə/iu.test(text) &&
    /достав|привоз|deliver|çatdır|gətir/iu.test(text));
}

function captionEntry(move, index) {
  if (move === 'word-type') return ['word-type', 16];
  if (move === 'kinetic-stretch') return ['kinetic-stretch', 18];
  if (move === 'spiral') return ['spiral', 22];
  if (move === 'word-lift' || index === 0) return ['word-lift', 12];
  return ['mask-rise', 12];
}

function minimumDuration(beat, index) {
  if (beat.visual.wordClick) return wordClickMinimum(beat.text ?? '');
  if (beat.phrase) {
    const {before, after, words: variants} = beat.phrase;
    return 14 + readingBudget(before + variants[0] + after,{minimum:18}) +
      variants.slice(1).reduce((total, word) => total + 4 + readingBudget(word,{minimum:12}), 0);
  }
  const [, entry] = captionEntry(beat.move, index);
  const labelTime = beat.visual.label ? 6 + readingBudget(beat.visual.label) : 22;
  const action = beat.move === 'roll' ? 36 + labelTime : beat.move === 'interface' ? 67 : 53;
  return Math.max(action, 18 + labelTime,
    beat.text ? entry + readingBudget(beat.text) + 8 : 0);
}

export function normalizeSemanticTreatment(plan, settings, source, {fixedTimings} = {}) {
  const staged = usesScenes(settings, source);
  const delivery = monthlyDeliveryEvidence(settings, source);
  // A headline belongs to the beat. Recover the same copy if the director placed it in visual.
  if (staged && Array.isArray(plan?.beats)) {
    plan = {...plan, beats: plan.beats.map(beat => {
      if (typeof beat?.visual?.text !== 'string' || Object.hasOwn(beat, 'text')) return beat;
      const {text, ...visual} = beat.visual;
      return {...beat, text, visual};
    })};
  }
  const issues = checkSchema(staged ? SceneTreatmentSchema : SemanticTreatmentSchema, plan);
  if (issues.length) throw new Error(issues.slice(0, 10).join('\n'));
  if (staged) {
    // Only a feature scene shows a capture. A logo or stray asset reference elsewhere is dropped, not refused:
    // the brand scene already carries the name, and the plan is otherwise usable.
    const shown = new Set(source.assets.filter(isVisualAsset).map(asset => asset.id));
    plan = {...plan, beats: plan.beats.map(beat => {
      const {assetId, ...visual} = beat.visual;
      return {...beat, visual: beat.visual.scene === 'feature' && shown.has(assetId) ? beat.visual : visual};
    })};
    issues.push(...sceneIssues(plan.beats, source));
  } else plan = {...plan, beats: plan.beats.map(beat => ({...beat, visual: {object: 'card', layout: 'center', ...beat.visual}}))};
  if (issues.length) throw new Error(issues.slice(0, 10).join('\n'));
  const evidence = new Set(source.evidence.map(entry => entry.id));
  const images = new Set(source.assets.filter(isVisualAsset).map(asset => asset.id));
  const beats = plan.beats.map((originalBeat, index) => {
    let beat = originalBeat;
    const allotted = fixedTimings?.get(beat.id);
    if (staged && allotted !== undefined && beat.visual.holdSeconds) {
      const {holdSeconds,...visual} = beat.visual;
      const nativeMinimum = sceneMinimum({...beat,visual},plan.beats[index+1]);
      const available = Math.max(.4,(allotted-nativeMinimum+22)/settings.fps);
      if (holdSeconds > available) beat = {...beat,visual:{...visual,holdSeconds:Math.floor(available*100)/100}};
    }
    if (typography.has(beat.move) && beat.move !== 'word-swap' && !beat.text?.trim()) {
      issues.push(`${beat.id}: give the typography its exact on-screen text`);
    }
    if (beat.visual.evidenceId && !evidence.has(beat.visual.evidenceId)) issues.push(`${beat.id}: unknown evidence ID`);
    if (beat.visual.assetId && !images.has(beat.visual.assetId)) issues.push(`${beat.id}: unknown capture ID`);
    const minimum = staged ? sceneMinimum(beat, plan.beats[index + 1]) : minimumDuration(beat, index);
    const required = delivery && index === 3 ? Math.max(96, minimum) : minimum;
    const fixed = fixedTimings?.get(beat.id);
    if (fixed !== undefined && fixed < required) issues.push(`${beat.id}: shorten the revision to fit its ${fixed} frames`);
    return {...beat, frames: fixed ?? required};
  });
  const needed = beats.reduce((sum, beat) => sum + beat.frames, 0);
  if (source.productFlow && (beats.length < 4 || beats[1].move !== 'interface' || beats[3].move !== 'morph')) {
    issues.push('For the recorded product, start with product, toggle (interface), selected status, then cart (morph).');
  }
  // The rapid montage samples a conceptual storyboard; it need not fit the output duration in real time.
  // Its actual rendered shots are bounded separately by auditSuperDynamic.
  const storyboardFrames = settings.pace === 'superdynamic' ? Math.max(settings.frames, needed) : settings.frames;
  if (storyboardFrames > 1800 || (settings.pace !== 'superdynamic' && needed > settings.frames)) {
    issues.push(`The beats need ${needed} frames; the film has ${settings.frames}. Use shorter lines or fewer beats.`);
  }
  if (issues.length) throw new Error(issues.join('\n'));
  const {storyboardFrames: _previousStoryboard, ...story} = plan;
  const storyboard = {...story, ...(storyboardFrames > settings.frames && {storyboardFrames})};
  const validationSettings = {...settings, frames: storyboardFrames};
  if (fixedTimings) return validateTreatment({...storyboard, beats}, validationSettings, {source, requireCreative: true, requireMoves: !staged});
  const rhythmWeights = {quick: 2, steady: 4, hold: 7};
  const weights = beats.map((beat, index) => {
    const requested = staged && beat.visual.seconds && Math.max(0, beat.visual.seconds * settings.fps - beat.frames);
    if (staged && settings.pace === 'dynamic' && index === beats.length - 1 && beat.visual.scene === 'brand' && !requested) return 1;
    return requested || (rhythmWeights[beat.visual.rhythm] ?? 3 + Math.round(beat.energy / 3)) +
      (index === beats.length - 1 ? 2 : 0);
  });
  const weight = weights.reduce((sum, value) => sum + value, 0);
  let cumulative = 0;
  let used = 0;
  for (const [index, beat] of beats.entries()) {
    cumulative += weights[index];
    const allocated = Math.round((storyboardFrames - needed) * cumulative / weight);
    beat.frames += allocated - used;
    used = allocated;
  }
  return validateTreatment({...storyboard, beats}, validationSettings, {source, requireCreative: true, requireMoves: !staged});
}

export function reviewBeatIds(notes, treatment) {
  const known = new Set(treatment.beats.map(beat => beat.id));
  return new Set(notes.map(note => /^\[([\w-]+)\]/u.exec(note)?.[1]).filter(id => known.has(id)));
}

export function reviseSceneTreatment(previous, draft, allowed, settings, source) {
  const issues = checkSchema(SceneTreatmentSchema, draft);
  if (issues.length) throw new Error(issues.slice(0, 10).join('\n'));
  if (draft.beats.length !== previous.beats.length || draft.beats.some((beat, index) => beat.id !== previous.beats[index].id)) {
    throw new Error('Keep the original scene IDs and order when revising individual beats');
  }
  const {beats, ...direction} = previous;
  const fixedTimings = new Map(beats.map(beat => [beat.id, beat.frames]));
  const merged = beats.map(({frames, ...beat}, index) => allowed.has(beat.id) ? draft.beats[index] : beat);
  return normalizeSemanticTreatment({...direction, beats: merged}, settings, source, {fixedTimings});
}

export function recordedProductTreatment(source, settings) {
  const flow = source.productFlow;
  if (settings.style !== 'product-demo' || flow?.provenance !== 'recorded-public-shop' ||
      !source.assets.some(asset => asset.kind === 'screenshot' && asset.id === flow.photoAssetId) ||
      ![flow.shelfEvidenceId, flow.cartEvidenceId].every(id => source.evidence.some(item => item.id === id))) return null;

  const kinetic = settings.motionRecipe === KINETIC_TYPOGRAPHY;
  const delivery = monthlyDeliveryEvidence(settings, source);
  const copy = calendarCopy[settings.language ?? 'ru'];
  const beat = (id, move, purpose, action, landing, handoff, energy, visual = {}) => ({
    id, move, purpose, action, landing, handoff, energy,
    visual: {object: 'card', layout: 'center', evidenceId: flow.shelfEvidenceId, ...visual},
  });
  return normalizeSemanticTreatment({
    directions: [
      {id: 'subscription', idea: delivery ? 'Выбор подписки и календарь ежемесячных доставок' : 'Выбор подписки и переход в корзину',
        opening: kinetic ? 'Крупное слово над карточкой товара' : 'Фото, название и цена на одной карточке',
        signature: delivery ? 'Под выбранным товаром раскрывается календарь' : 'Карточка товара разворачивается в строку корзины',
        look: 'Цвета магазина, крупный товар и спокойная камера',
        route: 'continuous', creative: {approach: 'product-action', subject: 'Карточка товара',
          change: delivery ? 'Карточка освобождает место для трёх месяцев' : 'Карточка становится строкой корзины',
          meaning: delivery ? 'Корм доставляют раз в месяц' : 'В корзине остаётся тот же товар',
          evidenceId: delivery?.id ?? flow.cartEvidenceId}},
      {id: 'selection', idea: 'Результат нажатия на переключатель', opening: 'Товар рядом с выключенным переключателем',
        signature: 'После включения появляется статус', look: 'Акцент на переключателе и читаемом статусе',
        route: 'montage', creative: {approach: 'editorial-contrast', subject: 'Переключатель подписки',
          change: 'Выключенный переключатель становится активным', meaning: 'Подписка выбрана', evidenceId: flow.shelfEvidenceId}},
    ],
    selected: 'subscription', signatureBeat: delivery ? 'calendar' : 'cart',
    rationale: 'Постановка показывает действие и сохраняет товар до финала',
    beats: [
      {...beat('product', 'keyframes', 'Показ товара', kinetic ? 'Поднять слово из-под маски и уменьшить его к карточке' : 'Подвести камеру',
        'Видны фото и цена', kinetic ? 'То же слово становится меткой карточки' : 'Подвести к переключателю', 3,
        {assetId: flow.photoAssetId, ...(delivery && {evidenceId: delivery.id})}), ...(delivery && {text: copy.hook})},
      beat('switch', 'interface', 'Выбор подписки', 'Нажать переключатель', 'Переключатель активен', 'Дождаться статуса', 5,
        {interaction: 'toggle'}),
      beat('selected', 'hold', 'Статус подписки', 'Показать подтверждение', 'Статус можно прочитать',
        delivery ? 'Освободить место для календаря' : 'Перенести карточку в корзину', 1),
      delivery
        ? beat('calendar', 'morph', 'Календарь доставок', 'Раскрыть панель и по очереди показать три месяца',
          'Виден ежемесячный ритм доставки', '', 4, {evidenceId: delivery.id})
        : beat('cart', 'morph', 'Корзина', 'Развернуть карточку в строку', 'Видны товар и цена', '', 4,
          {evidenceId: flow.cartEvidenceId}),
    ],
  }, settings, source);
}

const sizes = {
  search: [.68, .105], card: [.61, .28], message: [.53, .215],
  badge: [.29, .14], button: [.44, .12], capture: [.63, .32], mark: [.25, .17],
};

// A portrait frame has no room for two columns, so split falls back to the centred stack.
const frameLayout = (beat, {width, height}) =>
  beat.visual.layout === 'split' && width <= height ? 'center' : beat.visual.layout;

function objectBox(beat, {width, height}, size) {
  let [wide, tall] = size;
  const layout = frameLayout(beat, {width, height});
  // split keeps the object in the right column beside the copy; hero leaves the frame to the type and
  // seats a compact object beneath it.
  if (layout === 'split') wide = Math.min(wide, .42);
  if (layout === 'hero') [wide, tall] = [Math.min(wide, .36), Math.min(tall, .14)];
  const w = width * wide, h = height * tall;
  const x = {left: .40, center: .50, right: .60, split: .72, hero: .50}[layout];
  const y = {split: .52, hero: .80}[layout] ?? .635;
  return box(width * x - w / 2, height * y - h / 2, w, h,
    Math.min(h * (['badge','search','button'].includes(beat.visual.object) ? .45 : .15), 70));
}

function sameSize(a, b) {
  return Math.max(a.w / b.w, b.w / a.w, a.h / b.h, b.h / a.h) < 1.28;
}

function compileCaption(beat, scene, index, settings, evidenceIds) {
  const {width, height, frames} = settings;
  const {start, end} = scene;
  const edge = Math.min(width, height);
  if (!beat.text && !beat.phrase) return null;
  const layout = frameLayout(beat, settings);
  const alignment = {split: 'left', hero: 'center'}[layout] ?? layout;
  const headline = layout === 'split' ? box(width * .085, height * .30, width * .42, height * .44) :
    layout === 'hero' ? box(width * .06, height * .18, width * .88, height * .46) :
    box(width * .085, height * .125, width * .83, height * .245);
  const length = (beat.text ?? '').length;
  const size = Math.round(layout === 'split' ? edge * .085 :
    layout === 'hero' ? Math.min(edge * .24, headline.w / (Math.max(6, length) * .5)) :
    Math.min(edge * (width > height ? .09 : .078), headline.w / (Math.max(11, length) * .42)));
  const fontSize = Math.max(Math.round(edge * .041), size);
  const base = {fontSize, align: alignment, space: 'screen', evidenceIds,
    ...(layout === 'hero' && {font: 'display', weight: 800})};
  if (beat.visual.wordClick) {
    return element(`text-${index}`,'text',start,end,headline,{
      ...base,text:beat.text,enter:'resolve',enterFrames:WORD_CLICK_ENTRY,
      wordClick:stageWordClick(beat.visual.wordClick,beat.text,start,end),
    });
  }
  if (beat.move === 'text-ring') {
    const diameter = edge * .76;
    const ring = box((width - diameter) / 2, height * .54 - diameter / 2, diameter, diameter);
    return element(`text-${index}`, 'text', start, end, ring, {
      ...base, text: beat.text, fontSize: Math.round(edge * .055),
      textRing: {direction: 'clockwise', speed: 14, phase: 0, repeats: 1, style: 'solid', tracking: 1},
    });
  }
  if (beat.phrase) {
    const {before, after, words: variants} = beat.phrase;
    let frame = start;
    const entries = variants.map((text, i) => {
      const variant = {frame, text};
      frame += i ? 4 + readingBudget(text,{minimum:12}) : 6 + readingBudget(before + text + after,{minimum:18});
      return variant;
    });
    return element(`text-${index}`, 'text', start, end, headline, {
      ...base, enter: 'resolve', enterFrames: 6, sound: 'click',
      wordSwap: {before, after, variants: entries, fill: 'onAccent', plate: 'accent',
        layout: width < height ? 'stacked' : 'inline', style: 'roll', transitionFrames: 4},
    });
  }
  const [enter, enterFrames] = captionEntry(beat.move, index);
  const bounds = enter === 'spiral' ? box(headline.x, height * .07, headline.w, height * .30) : headline;
  return element(`text-${index}`, 'text', start, end, bounds, {
    ...base, text: beat.text, enter, enterFrames,
    ...(enter === 'word-type' && {wordType: {caret: 'blink'}}),
    ...(end === frames && {sound: 'ding'}),
  });
}

function compileObject(beat, scene, index, bounds, asset, showRoll, evidenceIds, delay) {
  const {start, end} = scene;
  const {object, interaction, result, label, emphasis} = beat.visual;
  const items = [];
  const fill = emphasis === 'accent' ? 'onAccent' : 'foreground';
  const startAt = start + delay;
  const visible = end - startAt;
  const {w, h} = bounds;
  const attached = {attachTo: 'story-object', fill, evidenceIds};
  const icons = {search: 'search', message: 'arrow', badge: 'check', button: 'arrow', card: 'lock', mark: 'check', capture: 'cursor'};
  if (beat.visual.icon) icons[object] = beat.visual.icon;
  // A labelled object without a capture becomes one content row that fills its surface;
  // the row's type scales with the surface height. Small or narrow surfaces keep the icon and label.
  const asCard = !asset && label && icons[object] !== 'cursor' && h >= scene.edge * .09 && w >= h * 2.5 &&
    visible >= 9 + Math.max(22, words(label) * 6);
  if (asCard) {
    items.push(element(`card-${index}`, 'card', startAt, end, box(0, 0, w, h, bounds.radius), {
      attachTo: 'story-object', evidenceIds, fill: emphasis === 'accent' ? 'accent' : 'surface', elevation: 0,
      enter: 'resolve', enterFrames: 9, card: {title: label, icon: icons[object]},
    }));
  } else if (asset) {
    items.push(element(`capture-${index}`, 'image', startAt, end, box(w * .06, h * .08, w * .88, h * (label ? .61 : .84)), {
      ...attached, assetId: asset.id, enter: 'resolve', enterFrames: 9,
    }));
  } else {
    const icon = Math.min(h * .46, w * .18, 92);
    const offset = label ? w * .10 : (w - icon) / 2;
    items.push(element(`icon-${index}`, 'icon', startAt, end, box(offset, (h - icon) / 2, icon, icon), {
      ...attached, icon: icons[object], enter: 'pop', enterFrames: 9,
    }));
  }
  if (!asCard && label && visible >= 6 + Math.max(22, words(label) * 6)) {
    const size = Math.max(31, Math.min(52, Math.round(h * (asset ? .15 : .31))));
    const labelBox = asset ? box(w * .08, h * .73, w * .84, h * .22) : box(w * .35, h * .18, w * .59, h * .66);
    items.push(element(`label-${index}`, 'text', startAt, end, labelBox, {
      ...attached, text: label, fontSize: size, align: asset ? 'center' : 'left', enter: 'resolve', enterFrames: 6,
    }));
  }
  if (showRoll) {
    const size = Math.round(Math.max(50, Math.min(w * .11, h * .55, 83)));
    const x = Math.min(bounds.x + w * .89, scene.width - size * 2.2), y = bounds.y + h * .5;
    items.push(element(`roll-${index}`, 'rect', start + 3, end, box(x, y, size, size, size * .24), {
      fill: 'accent', enter: 'roll-in', enterFrames: 18, rollFrom: 'right', sound: 'whoosh',
      motion: [pose(start + 3), pose(start + 24, {opacity: 100}), pose(start + 34, {opacity: 0})],
    }));
  }
  if (beat.move === 'interface') {
    const height = Math.max(41, h * .43), width = height * 1.65;
    const control = box(bounds.x + w / 2 - width / 2, bounds.y + h + 16, width, height, height / 2);
    if (interaction === 'toggle') {
      items.push(element(`control-${index}`, 'toggle', startAt, end, control, {
        fill: 'accent', enter: 'pop', enterFrames: 8, on: true, changeAt: startAt + 12,
      }));
    } else {
      items.push(element(`control-${index}`, 'rect', startAt, end, control, {
        fill: 'accent', enter: 'pop', enterFrames: 8, sound: 'click', elevation: 1,
        motion: [pose(startAt), pose(startAt + 9), pose(startAt + 12, {scale: 86}), pose(startAt + 17)],
      }));
      if (result === 'confirmation' || result === 'reveal') {
        const checkAt = startAt + 16;
        items.push(element(`response-${index}`, 'icon', checkAt, end, control, {
          icon: result === 'confirmation' ? 'check' : 'arrow',
          fill: 'onAccent', enter: 'resolve', enterFrames: 8, sound: 'ding',
        }));
      }
    }
  }
  return items;
}

function compileDeliveryCalendar(score, start, settings, evidenceId) {
  const {width, height, frames} = settings;
  const edge = Math.min(width, height);
  const copy = calendarCopy[settings.language ?? 'ru'];
  const panel = box(width * .10, height * .515, width * .80, height * .40, edge * .036);
  const panelId = 'delivery-calendar';
  score.shapes.push({id: panelId, elevation: 2, states: [
    {frame: 0, duration: 1, box: {...panel, h: 12, radius: 6}, fill: 'surface', opacity: 0},
    {frame: start + 22, duration: 20, box: panel, fill: 'surface', opacity: 100, ease: 'fluid'},
  ]});
  const attached = {attachTo: panelId, evidenceIds: [evidenceId]};
  const title = { ...attached, align: 'center', enter: 'mask-rise', enterFrames: 12 };
  score.elements.push(
    element('calendar-title', 'text', start + 33, frames, box(panel.w * .04, panel.h * .08, panel.w * .92, panel.h * .20), {
      ...title, text: copy.title, fontSize: Math.round(edge * .053), font: 'display', weight: 800,
    }),
    element('calendar-interval', 'text', start + 40, frames, box(panel.w * .04, panel.h * .28, panel.w * .92, panel.h * .14), {
      ...title, text: copy.interval, fontSize: Math.round(edge * .030), fill: 'muted',
    }),
  );
  const gap = panel.w * .024, tileWidth = (panel.w * .92 - 2 * gap) / 3;
  const tileHeight = Math.min(panel.h * .38, edge * .21);
  const iconSize = Math.min(tileWidth, tileHeight, edge * .13) * .62;
  for (let i = 0; i < 3; i++) {
    const month = i + 1;
    const at = start + 49 + i * 8;
    const x = panel.w * .04 + i * (tileWidth + gap), y = panel.h * .49;
    const entry = {...attached, enter: 'resolve', enterFrames: 9};
    score.elements.push(
      element(`calendar-tile-${month}`, 'rect', at, frames, box(x, y, tileWidth, tileHeight, edge * .022), {
        ...entry, fill: 'background',
      }),
      element(`calendar-icon-${month}`, 'icon', at, frames,
        box(x + (tileWidth - iconSize) / 2, y + (tileHeight - iconSize) / 2, iconSize, iconSize), {
          ...entry, icon: 'calendar', fill: 'accent', sound: 'pop',
        }),
    );
  }
}

function compileRecordedProduct(score, treatment, settings, source) {
  const flow = source.productFlow;
  const {width, height, frames} = settings;
  const edge = Math.min(width, height);
  const {card, photo, price, toggle, status, cart} = PRODUCT_FLOW_IDS;
  const scenes = score.scenes;
  let start = 0;
  for (const [index, beat] of treatment.beats.entries()) {
    const end = start + beat.frames;
    scenes.push({id: beat.id, start, end, purpose: beat.purpose, groundStyle: index === 3 ? 'halo' : 'flat'});
    const builtInCopy = index === 2 ? flow.labels.status : index === 3 ? flow.labels.cart : undefined;
    if (!builtInCopy || builtInCopy.trim().normalize('NFC') !== beat.text?.trim().normalize('NFC')) {
      const caption = compileCaption(beat, scenes.at(-1), index, settings, [beat.visual.evidenceId || flow.shelfEvidenceId]);
      if (caption) score.elements.push(caption);
    }
    start = end;
  }
  const action = scenes[1].start, selected = scenes[2].start, handoff = scenes[3].start;
  const delivery = monthlyDeliveryEvidence(settings, source);
  const kinetic = settings.motionRecipe === KINETIC_TYPOGRAPHY && !treatment.beats[0].text && !treatment.beats[0].phrase;
  const w = Math.round(width * (width >= height ? .51 : .72));
  const h = Math.round(height * .29);
  const x = (width - w) / 2;
  const y = height * .41;
  const open = box(x, y, w, h + edge * .10, edge * .034);
  const row = box(width * .10, delivery ? height * .17 : y + height * .05, width * .80, h, edge * .028);
  score.shapes = [{id: card, elevation: 2, states: [
    {frame: 0, duration: 1, box: box(x, y, w, h, edge * .034), fill: 'surface'},
    {frame: action, duration: 16, box: open, fill: 'surface'},
    {frame: handoff, duration: 22, box: row, fill: 'surface'},
  ]}];
  const attached = {attachTo: card, evidenceIds: [flow.shelfEvidenceId]};
  const control = box(w * .69, h + edge * .018, w * .21, edge * .064, edge * .032);
  const clickAt = action + 33;
  const cursorStart = clickAt - 12;
  const cursor = Math.round(edge * .042);
  const priceBox = box(w * .44, h * (kinetic ? .67 : .62), w * .43, h * .28);
  score.elements.push(element(photo, 'image', 0, frames,
    box(w * .06, h * (kinetic ? .24 : .09), w * .33, h * (kinetic ? .69 : .82)), {
    ...attached, assetId: flow.photoAssetId,
  }));
  if (flow.ids?.name) {
    score.elements.push(element(flow.ids.name, 'text', 0, frames, box(w * .44, h * (kinetic ? .30 : .20), w * .51, h * .35), {
      ...attached, text: flow.name, fontSize: Math.round(edge * .045),
    }));
  }
  if (kinetic) {
    const text = productSubscriptionLabel(settings.language);
    const fontSize = Math.round(Math.min(edge * .17, w / (text.length * .67)));
    const bounds = box(0, 0, w, fontSize * 1.30);
    const heroY = Math.round(height * .225 - y - bounds.h / 2);
    const startMove = Math.max(38, action - 22);
    const scale = Math.round(edge * .034 / fontSize * 100);
    score.elements.push(element('subscription-heading', 'text', 0, handoff, bounds, {
      ...attached, text, fontSize, font: 'display', weight: 800, align: 'center',
      enter: 'word-lift', enterFrames: 16, sound: 'pop',
      motion: [
        pose(0, {y: heroY, scale: 90, ease: 'fluid'}),
        pose(16, {y: heroY, ease: 'fluid'}),
        pose(startMove, {y: heroY, ease: 'fluid'}),
        pose(action + 16, {
          x: Math.round(w * -.22), y: Math.round(h * .115 - bounds.h / 2), scale, ease: 'fluid',
        }),
      ],
    }));
  }
  score.elements.push(
    element(price, 'text', 0, frames, priceBox, {
      ...attached, text: flow.price, fontSize: Math.round(edge * .049),
      motion: [pose(0), pose(handoff), pose(handoff + 22, {x: Math.round(row.w - w * .09 - priceBox.x - priceBox.w)})],
    }),
    element(toggle, 'toggle', action + 16, handoff - 7, control, {
      ...attached, fill: 'accent', enter: 'pop', enterFrames: 10, changeAt: clickAt, on: true,
    }),
    element('product-cursor', 'icon', cursorStart, clickAt + 16,
      box(control.x + control.w * .77, control.y + control.h * .40, cursor, cursor), {
        ...attached, icon: 'cursor', motion: [pose(cursorStart, {x: 20, y: 24, opacity: 0}),
          pose(clickAt - 1), pose(clickAt + 2, {scale: 88}), pose(clickAt + 8)],
    }),
    element(status, 'text', selected, handoff, box(width * .12, height * .865, width * .76, height * .10), {
      space: 'screen', fill: 'foreground', align: 'center', fontSize: Math.round(edge * .042),
      text: flow.labels.status, enter: 'mask-rise', enterFrames: 12, sound: 'ding', evidenceIds: [flow.shelfEvidenceId],
    }),
    element(cart, 'text', handoff + 1, frames, box(width * .13, height * (delivery ? .09 : .31), width * .74, height * .103), {
      space: 'screen', align: 'center', fontSize: Math.round(edge * (delivery ? .034 : .054)), text: flow.labels.cart,
      enter: 'mask-rise', enterFrames: 24, evidenceIds: [flow.cartEvidenceId],
    }),
  );
  if (delivery) compileDeliveryCalendar(score, handoff, settings, delivery.id);
  if (source.assets.some(asset => asset.kind === 'logo')) {
    score.elements.push(element('product-logo', 'logo', 0, frames, box(width * .055, height * .048, edge * .12, edge * .055), {
      space: 'screen',
    }));
  }
  const center = {x: Math.round(width / 2), y: Math.round(height / 2)};
  for (const [index, scene] of scenes.entries()) {
    const key = {frame: scene.start, ...center, zoom: 100, rotate: 0};
    score.camera.push(key);
    if (index === 1) {
      score.camera.push({...key, frame: action + 26, target: card, zoom: 110,
        x: Math.round(center.x - open.x - open.w / 2),
        y: Math.round(center.y - open.y - open.h / 2)});
    } else if (treatment.beats[index].move === 'keyframes') {
      score.camera.push({...key, frame: scene.start + 24, zoom: 104});
    }
  }
}

export function compileLaunch(treatment, settings, source) {
  const {width, height, fps, frames, style, pace} = settings;
  const {beats} = treatment;
  const palette = source.brand?.interfacePalette ?? resolveInterfacePalette().palette;
  const named = treatment.brand && source.evidence.some(entry => entry.text.toLowerCase().normalize('NFC')
    .includes(treatment.brand.toLowerCase().normalize('NFC')));
  const knownBrand = source.nameHint || (named && treatment.brand) || (source.url && new URL(source.url).hostname);
  const brand = String(knownBrand || 'KADR').slice(0, 64);
  const score = {
    version: 1, style, brand, width, height, fps, frames, palette,
    concept: treatment.directions.find(direction => direction.id === treatment.selected).idea,
    scenes: [], shapes: [{id: 'story-object', states: []}], elements: [], camera: [],
  };
  if (!source.productFlow && beats.every(beat => beat.visual?.scene)) {
    const storyboardSettings = pace === 'superdynamic' && treatment.storyboardFrames ? {...settings, frames: treatment.storyboardFrames} : settings;
    const {scenes, shapes, elements, camera} = compileScenes(treatment, storyboardSettings, source, {brand: knownBrand && brand, palette});
    Object.assign(score, {scenes, shapes, elements, camera, staging: 'scenes'});
    if (pace === 'superdynamic') {
      const rapid = fitStagePauses(compileSuperDynamic(score));
      validateScore(rapid, settings, source);
      return rapid;
    }
    const composed=fitStagePauses(score);
    validateScore(composed, settings, source);
    return validateTreatmentScore(composed, treatment);
  }
  if (source.productFlow) {
    compileRecordedProduct(score, treatment, settings, source);
    validateScore(score, settings, source);
    return validateTreatmentScore(score, treatment);
  }
  const morphs = new Set(beats.flatMap((beat, index) => beat.move === 'morph' ? [index] : []));
  const rolls = new Set(beats.flatMap((beat, index) => beat.move === 'roll' ? [index] : []));
  if (pace === 'dynamic') {
    for (const index of [1, beats.length - 1]) {
      if (morphs.size < 2) morphs.add(index);
      if (rolls.size < 2) rolls.add(index);
    }
  }
  const captures = source.assets.filter(asset => ['screenshot','illustration'].includes(asset.kind));
  const requiredCapture = style === 'product-demo' && captures.find(asset => asset.kind === 'screenshot');
  const captureBeat = Math.max(0, beats.findIndex(beat => ['capture','interface'].includes(beat.visual.object) || beat.move === 'interface'));
  const states = score.shapes[0].states;
  const mark = source.assets.some(asset => asset.kind === 'logo');
  const edge = Math.min(width, height);
  let start = 0;
  for (const [index, beat] of beats.entries()) {
    const end = start + beat.frames;
    const scene = {id: beat.id, start, end, purpose: beat.purpose, ground: 'background',
      groundStyle: beat.visual.backdrop ?? (beat.visual.emphasis === 'accent' ? 'aurora' : 'halo')};
    score.scenes.push(scene);
    const asset = (index === captureBeat && requiredCapture) ||
      captures.find(candidate => candidate.id === beat.visual.assetId) ||
      (beat.visual.object === 'capture' ? captures[0] : undefined);
    const [wide, tall] = sizes[beat.visual.object];
    const preferred = asset ? [Math.max(wide, .61), Math.max(tall, .28)] : [wide, tall];
    let bounds = objectBox(beat, settings, preferred);
    if (morphs.has(index) && states.length && sameSize(states.at(-1).box, bounds)) {
      bounds = objectBox(beat, settings, [preferred[0], preferred[1] * (preferred[1] > .18 ? .62 : 1.60)]);
    }
    const fill = beat.visual.emphasis === 'accent' ? 'accent' : 'surface';
    const plannedRoll = beat.move === 'roll';
    if (plannedRoll) {
      const compact = objectBox(beat, settings, [Math.min(.35 * edge / width, preferred[0]),
        Math.min(.17 * edge / height, preferred[1])]);
      states.push({frame: start, duration: index ? 9 : 1, box: compact, fill, rotate: index ? 0 : -38});
      states.push({frame: start + 9, duration: 12, box: compact, fill, rotate: index ? 38 : 0});
      states.push({frame: start + 21, duration: 13, box: bounds, fill, rotate: 0});
    } else {
      if (!index && morphs.has(index)) {
        states.push({frame: 0, duration: 1, box: objectBox(beat, settings, [preferred[0], preferred[1] * .65]), fill});
      }
      states.push({frame: index ? start : morphs.has(index) ? 2 : 0,
        duration: index || morphs.has(index) ? 16 : 1, box: bounds, fill, ...(index ? {ease: 'spring'} : {})});
    }
    const evidenceIds = [beat.visual.evidenceId ??
      treatment.directions.find(direction => direction.id === treatment.selected).creative?.evidenceId].filter(Boolean);
    const caption = compileCaption(beat, scene, index, settings, evidenceIds);
    if (caption) score.elements.push(caption);
    score.elements.push(...compileObject(beat, {...scene, width, edge}, index,
      bounds, asset, rolls.has(index) && !plannedRoll, evidenceIds, plannedRoll ? 36 : index || morphs.has(0) ? 18 : 0));
    const focus = style === 'product-demo' && beat.move === 'interface';
    const center = {x: Math.round(width / 2), y: Math.round(height / 2)};
    const camera = {frame: start, ...center, zoom: 100, rotate: 0};
    score.camera.push(camera);
    if (focus || beat.move === 'keyframes') {
      score.camera.push({...camera, frame: start + 24, zoom: 104, ease: 'glide',
        ...(focus && {target: 'story-object', x: center.x - bounds.x - Math.round(bounds.w / 2),
          y: center.y - bounds.y - Math.round(bounds.h / 2)})});
    }
    start = end;
  }
  if (style === 'product-demo' && !score.camera.some(key => key.target)) {
    const key = score.camera[0];
    const b = states[0].box;
    Object.assign(key, {target: 'story-object', x: key.x - b.x - Math.round(b.w / 2), y: key.y - b.y - Math.round(b.h / 2)});
  }
  const markSize = edge * .044;
  if (mark) {
    score.elements.push(element('brand-mark', 'logo', 0, frames, box(width * .085, height * .055, markSize, markSize), {space: 'screen'}));
  }
  if (knownBrand) {
    score.elements.push(element('brand-name', 'text', 0, frames,
      box(width * .085 + (mark ? markSize * 1.25 : 0), height * .059, width * .62, height * .062), {
        space: 'screen', text: brand, fontSize: Math.round(edge * .032), fill: 'muted',
      }));
  }
  validateScore(score, settings, source);
  return validateTreatmentScore(score, treatment, {requireMorph: pace === 'dynamic'});
}
