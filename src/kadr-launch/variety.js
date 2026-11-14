// Every generation draws a variation and remembers earlier creative directions: a way into the story for the director, a layout
// variant for the compiler and, when the user chose none, a look. The draw favours whatever has been used
// least for the same product, and the director is told what earlier films of that product looked like.
// History is keyed by the product, not by the account, so two people filming the same site get different films.
import crypto from 'node:crypto';
import path from 'node:path';
import {mkdir, readFile, rename, writeFile} from 'node:fs/promises';
import {ART_DIRECTIONS} from './art-direction.js';

// How the film begins. Each angle leads to a different order of scenes for the same product.
export const ANGLES = {
  promise: 'Open on a short hero line that states the outcome for the customer, then show how it happens.',
  action: 'Open on the product in use: an input scene comes first, with no hero line before it.',
  'show-first': 'Open on the show scene itself, with a short headline over it, and explain it afterwards.',
  question: 'Open on a hero line that is the customer\'s own problem or question, as the source words it, and answer it with the product.',
  word: 'Open on a hero line in which a clicked word turns into a mark (wordClick with a shape), and enter the next scene through that mark.',
};
export const LAYOUTS = [0, 1, 2, 3];
const LOOKS = [null, ...Object.keys(ART_DIRECTIONS)];
const KEEP = 24;

export function sourceKey({url, description}) {
  let subject = (description ?? '').trim().toLowerCase().replace(/\s+/gu, ' ');
  try { if (url) subject = new URL(url).hostname.replace(/^www\./, ''); } catch { /* an unparsable address is keyed by its text */ }
  return crypto.createHash('sha256').update(subject || 'empty').digest('hex').slice(0, 24);
}

const file = (runsDir, key) => path.join(runsDir, '_variety', key + '.json');

export async function readHistory(runsDir, key) {
  try { return JSON.parse(await readFile(file(runsDir, key), 'utf8')); } catch { return []; }
}

export async function recordFilm(runsDir, key, entry) {
  const history = [...(await readHistory(runsDir, key)).filter(item => item.runId !== entry.runId), entry].slice(-KEEP);
  await mkdir(path.dirname(file(runsDir, key)), {recursive: true});
  await writeFile(file(runsDir, key) + '.tmp', JSON.stringify(history, null, 2));
  await rename(file(runsDir, key) + '.tmp', file(runsDir, key));
  return history;
}

// The option used least so far; a random one among equals.
function fresh(options, used, random) {
  const counts = options.map(option => used.filter(value => value === option).length);
  const least = options.filter((_, index) => counts[index] === Math.min(...counts));
  return least[Math.floor(random() * least.length)];
}

export function planVariation(history = [], {artDirection, random = Math.random} = {}) {
  const used = name => history.map(entry => entry[name] ?? null);
  return {
    seed: Math.floor(random() * 2 ** 31),
    angle: fresh(Object.keys(ANGLES), used('angle'), random),
    layout: fresh(LAYOUTS, used('layout'), random),
    // A look the user picked is theirs; otherwise the film takes one this product has not had.
    ...(!artDirection && {artDirection: fresh(LOOKS, used('artDirection'), random) ?? undefined}),
    avoid: history.slice(-4).map(entry => entry.summary).filter(Boolean),
    ...(history.some(entry => entry.creative) && {creativeHistory: history.slice(-4).filter(entry => entry.creative)
      .map(({pace,creative}) => ({pace, ...creative}))}),
  };
}

// Remember the idea and staging, not just the palette or the first few labels.
// Old history entries without this field remain usable through their summary.
export function creativeProfile(treatment) {
  const direction = treatment.directions?.find(item => item.id === treatment.selected);
  const peak = treatment.beats.find(beat => beat.id === treatment.signatureBeat);
  return {
    idea: direction?.idea, subject: direction?.creative?.subject, change: direction?.creative?.change,
    route: direction?.route,
    opening: {scene: treatment.beats[0]?.visual?.scene, text: treatment.beats[0]?.text,
      action: treatment.beats[0]?.action},
    sequence: treatment.beats.map(({move,visual = {}}) => ({scene: visual.scene, mechanic: visual.show?.kind,
      move, camera: visual.camera ?? 'auto', link: visual.link})),
    signature: {scene: peak?.visual?.scene, mechanic: peak?.visual?.show?.kind, action: peak?.action, landing: peak?.landing},
  };
}

const normalized = value => String(value ?? '').normalize('NFC').trim().replace(/\s+/gu, ' ').toLowerCase();
function creativeKey(profile) {
  if (!profile?.subject || !profile.change || !profile.sequence?.length) return null;
  return JSON.stringify([normalized(profile.subject), normalized(profile.change),
    profile.sequence.map(item => [item.scene, item.mechanic ?? item.move])]);
}

export function repeatedCreativeDirection(treatment, history = []) {
  const profile = creativeProfile(treatment), key = creativeKey(profile);
  if (!key || !history.some(previous => creativeKey(previous) === key)) return null;
  return 'This repeats an earlier film\'s focal subject, central before-to-after change and scene mechanics in the same order. Choose a different visual idea or causal staging; changing colours, layout or wording alone is insufficient. Preserve source facts and exact requested copy.';
}

// One line that lets the director tell this film from the next: how it opens and what each scene is.
export function filmSummary(treatment) {
  const scenes = treatment.beats.map(({visual = {}}) => visual.scene === 'show' ?
    `show(${visual.show.kind}: ${visual.show.subject?.label ?? visual.show.whole?.label ?? visual.show.stages?.[0].label})` :
    visual.scene === 'list' ? `list(${visual.presentation ?? 'rows'})` : visual.scene ?? 'object');
  const opening = treatment.beats[0];
  return `opens on ${scenes[0]}${opening.text ? ` «${opening.text}»` : ''}; scenes: ${scenes.join(' → ')}`.slice(0, 240);
}

// What the director is told about this generation.
export const variationBrief = variation => variation && {
  suggestedOpening: ANGLES[variation.angle], ...(variation.avoid?.length && {earlierFilmsOfThisProduct: variation.avoid}),
  ...(variation.creativeHistory?.length && {earlierCreativeDirections: variation.creativeHistory}),
};
