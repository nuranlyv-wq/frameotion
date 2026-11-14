// Конфигурация KADR Studio: загрузка .env, пути, тарифы.
// Ключ API читается ТОЛЬКО из окружения / .env и нигде не логируется.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadDotEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i < 1) continue;
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(k in process.env)) process.env[k] = v;
  }
}
loadDotEnv(path.join(ROOT, '.env'));
const model = process.env.KADR_MODEL || 'claude-opus-5-5';

export const CONFIG = {
  port: Number(process.env.PORT || 4177),
  model,
  launchBuildModel: process.env.KADR_LAUNCH_BUILD_MODEL || (model.startsWith('claude-opus-') ? 'claude-sonnet-5-5' : model),
  effort: process.env.KADR_EFFORT || 'medium',
  maxTurns: Number(process.env.KADR_MAX_TURNS || 14),
  // Жёсткий потолок расхода одного прогона режиссёра (USD).
  // Потолок расхода прогона (USD). Если не задан в окружении, берётся из LENGTHS[length].maxRunUSD.
  maxRunCostUSD: process.env.KADR_MAX_RUN_COST ? Number(process.env.KADR_MAX_RUN_COST) : null,
  maxOutputTokens: Number(process.env.KADR_MAX_OUTPUT_TOKENS || 32000),
  useFallback: process.env.KADR_FALLBACK !== '0',
  elevenLabsKey: process.env.ELEVENLABS_API_KEY || '',
  elevenLabsVoice: process.env.ELEVENLABS_VOICE_ID || '',
  runsDir: path.join(ROOT, 'runs'),
  cacheDir: path.join(ROOT, 'runs', '_cache'),
  chromePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  video: { width: 1080, height: 1920, fps: 30 },
};

export function hasApiKey() {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

// Тарифы Anthropic, USD за 1 млн токенов.
// Источник: https://platform.claude.com/docs/en/about-claude/pricing (сверено 2026-11-07).
export const PRICING = {
  'claude-opus-5-5': { input: 4, cacheWrite5m: 5, cacheWrite1h: 8, cacheRead: 0.2, output: 20 },
  'claude-opus-5': { input: 5, cacheWrite5m: 6.25, cacheWrite1h: 10, cacheRead: 0.5, output: 25 },
  'claude-sonnet-5-5': { input: 2, cacheWrite5m: 2.5, cacheWrite1h: 4, cacheRead: 0.1, output: 10 },
  'claude-haiku-5-5': { input: 0.1, cacheWrite5m: 0.125, cacheWrite1h: 0.2, cacheRead: 0.01, output: 0.5 },
};
export const PRICING_SOURCE = 'https://platform.claude.com/docs/en/about-claude/pricing';
