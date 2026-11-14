// Ракурсы содержания: каждый прогон выбирает ДРУГУЮ историю о том же сервисе и не повторяет прошлые ролики сайта.
// История хранится по хосту в runs/_history/<host>.json: ракурсы, концепции, зачины, использованные факты.
import fs from 'node:fs';
import path from 'node:path';
import { CONFIG } from '../config.js';
import { hashStr } from '../util.js';

export const ANGLES = [
  { id: 'one-feature-deep', brief: 'Pick ONE concrete feature or product from the FACTS and go deep: what it does, how it works, why it matters. Ignore everything else.' },
  { id: 'how-it-works', brief: 'Show the mechanism step by step (input -> process -> result) with the product\'s own terms from the FACTS.' },
  { id: 'numbers', brief: 'Build the film around one to three concrete numbers or units from the FACTS; the numbers are the characters.' },
  { id: 'old-way-vs-new', brief: 'Contrast the old way of doing the job with this product\'s way, using only what the FACTS support (no invented statistics).' },
  { id: 'user-question', brief: 'Follow one realistic user question from the moment it is asked to the moment the product answers it, inside the product\'s real UI.' },
  { id: 'inside-the-interface', brief: 'Take the viewer inside the interface: peel layers, zoom into specific controls and explain what each one does.' },
  { id: 'myth-busting', brief: 'Name a common misconception that the FACTS contradict and correct it with the specific facts.' },
  { id: 'less-known', brief: 'A fast sequence of 4-5 less obvious capabilities, each one a specific fact from the FACTS, each with its own visual.' },
  { id: 'one-day', brief: 'A short day in the life of one specific type of user who needs 2-3 of the product\'s features, with each feature named in the product\'s own words.' },
  { id: 'manifesto', brief: 'The product\'s stated mission or approach from the FACTS as a confident typographic manifesto with one strong visual anchor.' },
];

const dir = () => path.join(CONFIG.runsDir, '_history');
const file = (host) => path.join(dir(), `${String(host).replace(/[^a-z0-9.-]/gi, '_')}.json`);

export function loadHistory(host) {
  try { return JSON.parse(fs.readFileSync(file(host), 'utf8')); } catch { return { runs: [] }; }
}
export function recordRun(host, entry) {
  fs.mkdirSync(dir(), { recursive: true });
  const h = loadHistory(host); h.runs.push({ at: new Date().toISOString(), ...entry }); h.runs = h.runs.slice(-20);
  fs.writeFileSync(file(host), JSON.stringify(h, null, 2));
}

// Ракурс: явно заданный, иначе детерминированно по хосту и счётчику, не из последних использованных.
export function pickAngle(host, { preferred, seed } = {}) {
  if (preferred && ANGLES.some((a) => a.id === preferred)) return ANGLES.find((a) => a.id === preferred);
  const h = loadHistory(host), recent = new Set(h.runs.slice(-6).map((r) => r.angle));
  const pool = ANGLES.filter((a) => !recent.has(a.id));
  const list = pool.length ? pool : ANGLES;
  return list[(hashStr(`${host}:${seed ?? h.runs.length}`) + h.runs.length) % list.length];
}

// Что НЕЛЬЗЯ повторять: недавние концепции, зачины и ракурсы.
export function avoidBrief(host) {
  const r = loadHistory(host).runs.slice(-6);
  if (!r.length) return null;
  return {
    angles: [...new Set(r.map((x) => x.angle))],
    concepts: r.map((x) => x.concept).filter(Boolean).slice(-5),
    openers: r.flatMap((x) => x.openers || []).slice(-10),
  };
}
