// Реестр компонентов (каталог для режиссёра + движок рендера + валидатор).
import * as kinetic_type from './kinetic_type.js';
import * as search_to_map from './search_to_map.js';
import * as stat_counter from './stat_counter.js';
import * as brand_reveal from './brand_reveal.js';
import * as ui_cards from './ui_cards.js';
import * as cta_end from './cta_end.js';
import * as custom_draw from './custom_draw.js';
import * as ui_morph from './ui_morph.js';

export const COMPONENTS = { kinetic_type, search_to_map, ui_morph, stat_counter, brand_reveal, ui_cards, cta_end, custom_draw };
export const COMPONENT_NAMES = Object.keys(COMPONENTS);

// Компактное описание для системного промпта / инструмента list_components.
export function catalog(only) {
  const names = only ? [only] : COMPONENT_NAMES;
  return names.filter((n) => COMPONENTS[n]).map((n) => {
    const s = COMPONENTS[n].spec;
    const props = Object.entries(s.props).map(([k, v]) => `    ${k}: ${v}`).join('\n');
    const ev = Object.entries(s.events || {}).map(([k, v]) => `    ${k}: ${v}`).join('\n');
    return `## ${s.name}\n${s.summary}\n  props:\n${props}\n  events:\n${ev}`;
  }).join('\n\n');
}

export const TRANSITIONS = {
  cut: 'hard cut (duration 0)',
  crossfade: 'soft dissolve',
  push: 'push; params {dir:"left|right|up|down"}',
  wipe: 'diagonal wipe; params {dir:"left|right|up|down"}',
  zoom_through: 'zoom through the outgoing scene into the next',
  iris: 'circular iris reveal',
  slice: 'horizontal stripes slide in alternately',
  flash_cut: 'cut through a white flash',
  zoom_into: 'ZOOM INTO an object of the previous scene; the next scene is inside it. params {target: anchor name of the PREVIOUS scene (see its anchors) or {x,y,w,h} fractions, variant:"portal"|"open"|"roll", roll: degrees 0..25}. portal = the camera dives in; open = the object splits like doors and opens onto the next scene; roll = the object flips over like a card and the back is the next scene'
};
