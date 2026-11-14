// Подмножество JSON Schema, общее для ответа модели и локальной проверки.
const object = (properties, optional = {}) => ({
  type: 'object', properties: { ...properties, ...optional }, required: Object.keys(properties), additionalProperties: false,
});
const list = (items, maxItems, minItems = 0) => ({ type: 'array', items, minItems, maxItems });
const string = (maxLength, minLength = 1) => ({ type: 'string', minLength, maxLength });
const integer = (minimum, maximum) => ({ type: 'integer', minimum, maximum });
const choice = (...values) => ({ type: 'string', enum: values });
const id = { type: 'string', pattern: '^[a-zA-Z][a-zA-Z0-9_-]{0,47}$' };
const color = { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' };
const versioned = (properties, optional) => object({ version: { type: 'integer', enum: [1] }, ...properties }, optional);

const evidence = object({ id, source: string(2048), text: string(3200) });
const feature = object({ id, claim: string(240), evidenceIds: list(id, 6, 1) });
export const ProductBlueprint = versioned({
  name: string(64), audience: string(240), valueProposition: string(240),
  evidence: list(evidence, 40, 1), features: list(feature, 12),
  workflows: list(object({ label: string(100), steps: list(string(160), 8, 1), featureIds: list(id, 8, 1) }), 6),
  brand: object({ colors: list(color, 8), fonts: list(string(50), 5) }),
  assets: list(object({ id, kind: choice('logo', 'screenshot'), source: string(2048) }), 4),
  unknowns: list(object({ subject: string(100), reason: string(240) }), 10),
  confidence: choice('low', 'medium', 'high'),
});

export const ArtDirection = object({
  concept: string(240), visualLanguage: string(240),
  palette: object({ background: color, foreground: color, surface: color, muted: color, accent: color, onAccent: color }),
  typography: choice('sans', 'serif', 'mono'), grid: integer(2, 40), safeArea: integer(30, 120),
  radius: integer(0, 60), layering: string(180), density: choice('sparse', 'balanced', 'dense'),
  motion: string(180), transitions: string(180), camera: choice('fixed', 'motivated'), forbidden: list(string(100), 10),
});
export const NarrativeBlueprint = versioned({
  message: string(200), callToAction: string(80), artDirection: ArtDirection,
  scenes: list(object({
    id, frames: integer(24, 900), objective: string(200), headline: string(84), copy: string(144, 0),
    featureIds: list(id, 8), requiredStates: list(id, 6), handoff: string(180, 0),
  }, { action: string(200), result: string(200), focus: string(100),
    claims: list(object({ text: string(240), evidenceIds: list(id, 6, 1) }), 8) }), 12, 1),
}, {
  creative: object({ brief: string(400), selected: id, rationale: string(300),
    directions: list(object({ id, artDirection: ArtDirection,
      keyframe: object({ headline: string(84), object: string(100), composition: choice('split', 'centered') }) }), 2, 2) }),
  continuity: object({
    id, kind: choice('badge', 'pin'), role: choice('accent', 'foreground'),
    label: string(28, 0), purpose: string(180),
  }),
});

export const ROLES = ['background', 'foreground', 'surface', 'muted', 'accent', 'onAccent'];
const rect = object({ x: integer(0, 1000), y: integer(0, 1000), w: integer(1, 1000), h: integer(1, 1000) });
export const InterfaceSceneKit = versioned({
  components: list(object({
    id, fidelity: choice('conceptual', 'reconstruction'), evidenceIds: list(id, 8),
    layout: choice('relative'), elements: list(object({
      id, kind: choice('panel', 'text', 'badge', 'progress', 'cursor', 'check', 'pin', 'number'), bounds: rect,
      fontSize: integer(12, 250), align: choice('left', 'center', 'right'),
    }, { finish: choice('flat', 'outline', 'raised'), font: choice('sans', 'serif', 'mono') }), 32, 1),
    states: list(object({
      id, props: list(object({
        target: id, text: string(140, 0), value: integer(0, 100), visible: { type: 'boolean' }, role: choice(...ROLES),
      }), 32, 1),
    }), 12, 1),
  }), 12, 1),
});

export const MotionTimeline = versioned({
  fps: integer(1, 60), width: integer(320, 1920), height: integer(320, 1920), frames: integer(24, 3600),
  scenes: list(object({
    id, start: integer(0, 3599), end: integer(1, 3600), componentId: string(48, 0), bounds: rect,
    states: list(object({ at: integer(0, 899), id }), 12),
    headline: rect, copy: rect,
    transition: object({ type: choice('cut', 'shared', 'match', 'morph', 'zoom-through'), frames: integer(0, 60), target: string(48, 0) }, { sourceTarget: id }),
    effects: list(object({
      skill: id, target: id, from: integer(0, 899), frames: integer(1, 180),
      amount: integer(0, 120), easing: choice('linear', 'out-cubic', 'in-out-cubic'),
    }), 24),
  }, {
    camera: list(object({ at: integer(0, 3599), frames: integer(2, 300), target: id,
      scale: integer(50, 500), rotation: integer(-30, 30), easing: choice('linear', 'out-cubic', 'in-out-cubic') }), 12),
    poses: list(object({ target: id, at: integer(0, 3599), frames: integer(2, 300),
      x: integer(-1500, 1500), y: integer(-1500, 1500), scale: integer(10, 500), rotation: integer(-360, 360), opacity: integer(0, 100),
      easing: choice('linear', 'out-cubic', 'in-out-cubic') }), 48),
    treatment: object({
      field: choice('base', 'inverse', 'accent'), texture: choice('plain', 'grid', 'dots'),
      headlineSize: integer(40, 240), headlineFont: choice('sans', 'serif', 'mono'),
      headlineAlign: choice('left', 'center', 'right'), headlineColor: choice('ink', 'accent'),
      copyAlign: choice('left', 'center', 'right'),
    }),
  }), 12, 1),
}, {
  choreography: object({ recipe: choice('kinetic-workbench'), brand: string(5), lead: string(9), emphasis: string(6), prompt: string(28), endline: string(35) }),
  audio: object({
    bpm: integer(68, 144), mood: choice('warm', 'bright'), intensity: choice('calm', 'medium', 'high'),
    key: choice('A', 'B', 'C', 'D', 'E', 'F', 'G'),
    cues: list(object({ frame: integer(0, 3599), kind: choice('tick', 'pop', 'whoosh', 'hit', 'ding', 'click', 'swish', 'riser', 'gear', 'data', 'money','typing'), gain: integer(5, 100) }, {
      assetId: string(100), sync: choice('start', 'onset', 'peak','end'), durationFrames: integer(1, 1800),rate:integer(90,110),leadFrames:integer(-12,12),
    }), 48),
  },{mode:choice('sfx-only','score')}),
});

// Persistent actors in one world. No model code, HTML, external URLs or fixed film recipe.
const pose = {
  x: integer(-4000,5000), y: integer(-4000,5000), w: integer(1,6000), h: integer(1,6000),
  scale: integer(1,1200), rotate: integer(-720,720), opacity: integer(0,100), radius: integer(0,1000),
};
const detailPose={blur:integer(0,100),rotateX:integer(-180,180),rotateY:integer(-180,180),originX:integer(0,1000),originY:integer(0,1000),draw:integer(0,100),characters:integer(0,140),tracking:integer(-100,200),maskSize:integer(0,200),depth:integer(0,160)};
const keyedPose = object({at:integer(0,3599), easing:choice('linear','out-cubic','in-out-cubic')},
  {...pose,...detailPose,curveId:string(80), fill:choice(...ROLES), reveal:integer(0,100)});
export const DirectedFilm = versioned({
  fps:integer(1,60),width:integer(320,1920),height:integer(320,1920),frames:integer(24,3600),
  scenes:list(object({id,start:integer(0,3599),end:integer(1,3600),focus:id,action:string(240)}),12,1),
  world:object({
    background:choice(...ROLES),
    nodes:list(object({id,kind:choice('group','rect','ellipse','ring','text','symbol','cursor','component','brackets','image','path'),parent:string(48,0),
      pose:object(pose,detailPose),fill:choice(...ROLES),keys:list(keyedPose,24)}, {
      text:string(140,0),font:choice('sans','serif','mono'),fontSize:integer(12,300),fontWeight:integer(100,900),align:choice('left','center','right'),
      stroke:integer(0,40),symbol:choice('arrow','play','check','plus','spark','lock','door','calendar'),clip:{type:'boolean'},shadow:{type:'boolean'},
      componentId:id,states:list(object({at:integer(0,3599),id}),12,1),
      assetId:string(100),fontId:string(100),fit:choice('contain','cover'),tint:{type:'boolean'},
      blend:choice('normal','multiply','screen','overlay'),mask:choice('circle','wipe','none'),step:integer(1,4),
      rolls:list(object({from:integer(0,3598),to:integer(1,3599)},{settleFrames:integer(1,60)}),6),
      points:list(object({x:integer(-1000,2000),y:integer(-1000,2000)}),32,2),
    }),64,3),
    camera:list(object({at:integer(0,3599),x:integer(-4000,5000),y:integer(-4000,5000),zoom:integer(30,800),rotate:integer(-90,90),easing:choice('linear','out-cubic','in-out-cubic')},{curveId:string(80)}),24,1),
  }, {demonstrations:list(object({componentId:id,stateId:id,start:integer(0,3599),end:integer(1,3600),actors:list(id,16,2)}),24)}),
  audio:MotionTimeline.properties.audio,
});

export function checkSchema(schema, value, path = '$') {
  const matches = {
    object: () => value !== null && typeof value === 'object' && !Array.isArray(value),
    array: () => Array.isArray(value),
    integer: () => Number.isInteger(value),
    number: () => typeof value === 'number' && Number.isFinite(value),
    string: () => typeof value === 'string',
    boolean: () => typeof value === 'boolean',
  };
  if (!matches[schema.type]()) return [`${path}: expected ${schema.type}`];
  if (schema.enum && !schema.enum.includes(value)) return [`${path}: expected ${schema.enum.join(' or ')}`];
  switch (schema.type) {
    case 'object': {
      const extra = Object.keys(value).filter((key) => !Object.hasOwn(schema.properties, key));
      return [
        ...extra.map((key) => `${path}.${key}: unknown field`),
        ...Object.entries(schema.properties).flatMap(([key, sub]) =>
          Object.hasOwn(value, key) || schema.required.includes(key) ? checkSchema(sub, value[key], `${path}.${key}`) : []),
      ];
    }
    case 'array':
      if (value.length < schema.minItems || value.length > schema.maxItems) return [`${path}: expected ${schema.minItems}–${schema.maxItems} items`];
      return value.flatMap((item, i) => checkSchema(schema.items, item, `${path}[${i}]`));
    case 'string':
      if (value.length < (schema.minLength ?? 0) || value.length > (schema.maxLength ?? Infinity) ||
          (schema.minLength && !value.trim()) || (schema.pattern && !new RegExp(schema.pattern).test(value))) {
        return [`${path}: invalid text length or format`];
      }
      break;
    case 'integer':
    case 'number':
      if (value < schema.minimum || value > schema.maximum) return [`${path}: expected ${schema.minimum}–${schema.maximum}`];
      break;
  }
  return [];
}
