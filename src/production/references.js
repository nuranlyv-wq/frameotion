import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../config.js';
let index;
export function motionReferences() {
  return index ||= JSON.parse(fs.readFileSync(path.join(ROOT, 'library/motion-reference-index.json'), 'utf8')).entries;
}
export function searchMotionReferences(query, limit = 4) {
  const words = query.toLowerCase().match(/[\p{L}]+/gu) || [];
  const scored = motionReferences().map((entry) => ({ entry, score: words.reduce((n, word) => n + (entry.tags.some((tag) => tag.includes(word)) ? 1 : 0), 0) }));
  return scored.filter(({ score }) => score > 0).sort((a, b) => b.score - a.score).slice(0, limit).map(({ entry }) => ({
    title: entry.title, purpose: entry.description, source: entry.url, license: entry.license,
    status: 'reference-only; translate the intent to allowed scene objects and catalog skills',
  }));
}
