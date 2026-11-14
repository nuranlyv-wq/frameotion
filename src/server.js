// HTTP-сервер KADR Studio: минималистичный клиент + API задач генерации.
// По умолчанию слушает только 127.0.0.1. Ключ Anthropic остаётся на сервере и в ответы не попадает.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {isIP} from 'node:net';
import {createAccountStore} from './accounts.js';
import {createDailyBudget} from './daily-budget.js';
import { CONFIG, ROOT, hasApiKey } from './config.js';
import { PROFILES, LENGTHS } from './dynamism.js';
import { listStyles, getStyle, buildCustomStyle } from './styles/presets.js';
import { analyzeReference } from './styles/reference.js';
import { generateVideo, newRunId } from './pipeline.js';
import { generateProduction } from './production/index.js';
import { motionReferences } from './production/references.js';
import { MOTION_SKILLS, TRANSITION_SKILLS } from './production/motion.js';
import { assertPublicUrl } from './import/index.js';
import { soundLibrary } from './production/sound-library.js';
import {motionAssets,motionCurves,motionAssetRoot,resolveMotionAsset} from './production/asset-library.js';
import {brandAssetRoot} from './production/brand-assets.js';
import { CHOREOGRAPHY_RECIPES } from './production/choreography.js';
import { MOTION_CLIPS } from './production/motion-clips.js';
import {generateLaunch as generateKadrLaunch,launchBudgetUSD,validateLaunchRequest as validateKadrRequest} from './kadr-launch/index.js';
import {runtimeStatus as kadrRuntimeStatus} from './kadr-launch/runtime.js';
import {creationRequest} from './kadr-launch/creation-request.js';
import {createStudioPages} from './studio-pages.js';

const PUBLIC = path.join(ROOT, 'public');
const accounts = createAccountStore(process.env.FRAMEOTION_ACCOUNT_DIR || path.join(ROOT, '.account-data'));
const authAttempts = new Map();
function sessionToken(req) { return /(?:^|;\s*)frameotion_session=([A-Za-z0-9_-]+)/.exec(req.headers.cookie || '')?.[1] || ''; }
function sessionCookie(token) { return `frameotion_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000${publicMode ? '; Secure' : ''}`; }
function allowAuthAttempt(ip) { const now=Date.now(), entries=(authAttempts.get(ip)||[]).filter(t=>now-t<15*60*1000); if(entries.length>=15) return false; entries.push(now); authAttempts.set(ip,entries); return true; }
const creationPages = new Set(['/index.html','/home.css','/home.js','/motion.html','/studio-navigation.css','/create.css','/create.js','/frameotion-mark.svg',
  '/studio-previews/podcast.png','/studio-previews/vox-paper.png',
  '/account.html','/account.css','/account.js','/locale.js','/lapa-15s.mp4','/lapa-15s-poster.png',
  '/fonts/comfortaa-bold.ttf','/fonts/fira-sans-medium.woff','/fonts/fira-sans-bold.woff','/fonts/OFL-1.1.txt']);
const host = process.env.HOST || '127.0.0.1';
const publicMode = process.env.KADR_PUBLIC === '1';
const studioPages = createStudioPages(ROOT, {local: !publicMode});
const accessToken = process.env.KADR_ACCESS_TOKEN || '';
const publicOrigin = process.env.KADR_PUBLIC_ORIGIN || '';
const dailyBudgetCents = Number(process.env.FRAMEOTION_DAILY_BUDGET_CENTS || 0);
const dailyBudget = publicMode && dailyBudgetCents ? createDailyBudget(process.env.FRAMEOTION_ACCOUNT_DIR || path.join(ROOT,'.account-data'), {limitCents:dailyBudgetCents}) : null;
if (!['127.0.0.1','localhost','::1'].includes(host) && !publicMode) throw new Error('Внешний интерфейс требует KADR_PUBLIC=1 и защищённый доступ');
if (publicMode && (accessToken.length < 32 || !/^https:\/\/[^/]+$/.test(publicOrigin))) throw new Error('KADR_PUBLIC требует случайный KADR_ACCESS_TOKEN длиной от 32 символов и HTTPS KADR_PUBLIC_ORIGIN');
function authorized(req){
  const match=/^Basic ([A-Za-z0-9+/=]+)$/.exec(req.headers.authorization||'');if(!match)return false;
  const decoded=Buffer.from(match[1],'base64').toString('utf8'),pos=decoded.indexOf(':');if(pos<0)return false;
  const actual=Buffer.from(decoded.slice(pos+1)),expected=Buffer.from(accessToken);
  return actual.length===expected.length&&crypto.timingSafeEqual(actual,expected);
}
async function legacyRuntimeStatus(){try{return (await import('./motionsmith/runtime.js')).runtimeStatus();}catch{return {available:false,message:'Локальный MotionSmith не установлен'};}}
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.mp4': 'video/mp4', '.wav': 'audio/wav', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.ttf':'font/ttf','.otf':'font/otf','.woff':'font/woff','.woff2':'font/woff2' };
const jobs = new Map();
const refs = new Map();
let running = 0;
const MAX_CONCURRENT = 1;
const hits = new Map(); // простой лимит: не чаще 6 задач в час с адреса

function send(res, code, body, headers = {}) {
  const isObj = typeof body === 'object' && !Buffer.isBuffer(body);
  res.writeHead(code, { 'content-type': isObj ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8', 'x-content-type-options': 'nosniff', ...headers });
  res.end(isObj ? JSON.stringify(body) : body);
}
async function readJson(req, max = 64 * 1024) {
  const chunks = []; let n = 0;
  for await (const c of req) { n += c.length; if (n > max) throw new Error('Слишком большой запрос'); chunks.push(c); }
  try { return JSON.parse(Buffer.concat(chunks).toString() || '{}'); } catch { throw new Error('Некорректный JSON'); }
}

function serveFile(req, res, file) {
  const allowed = [PUBLIC, CONFIG.runsDir, path.join(ROOT, 'assets/sfx'),motionAssetRoot(),brandAssetRoot()];
  if (!allowed.some((root) => file.startsWith(path.resolve(root) + path.sep))) return send(res, 403, 'forbidden');
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, 'not found');
    const type = MIME[path.extname(file)] || 'application/octet-stream';
    const range = req.headers.range;
    if (range && /^bytes=\d*-\d*$/.test(range)) {
      let [s, e] = range.replace('bytes=', '').split('-'); s = s ? Number(s) : 0; e = e ? Number(e) : st.size - 1;
      if (s > e || e >= st.size) return send(res, 416, 'bad range');
      res.writeHead(206, { 'content-type': type, 'content-range': `bytes ${s}-${e}/${st.size}`, 'accept-ranges': 'bytes', 'content-length': e - s + 1 });
      return fs.createReadStream(file, { start: s, end: e }).pipe(res);
    }
    res.writeHead(200, { 'content-type': type, 'content-length': st.size, 'accept-ranges': 'bytes', 'cache-control': 'private, no-cache','x-content-type-options':'nosniff' });
    fs.createReadStream(file).pipe(res);
  });
}

function publicJob(j) { const { id, status, stage, progress, logs, result, error, createdAt, cost } = j; return { id, status, stage, progress, logs: logs.slice(-30), result, error, createdAt, cost }; }

function creationStatus(job) {
  const {id,status,stage,progress,result} = job;
  return {id,status,stage,progress,video:result?.video ?? result?.previousVideo ?? null,
    preview:result?.quality?.technical === 'passed' ? result.draft : null,
    revisionFailed:Boolean(result?.revisionFailed),
    canRevise:Boolean(result?.directionPlan)};
}

async function savedLaunchJob(id){
  if(!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(id))return null;
  try{
    const file=path.join(CONFIG.runsDir,id,'report.json'),report=JSON.parse(await fs.promises.readFile(file,'utf8'));
    if(!['motionsmith','kadr-launch'].includes(report.renderer))return null;
    const media=f=>f?`/media/${id}/${f}`:null,done=report.status==='completed';
    const cost=report.cost||await fs.promises.readFile(path.join(CONFIG.runsDir,id,'cost.json'),'utf8').then(JSON.parse).catch(()=>({calls:0,tokens:{input:0,output:0,cacheRead:0,cacheWrite:0},usd:0,pricing:''}));
    return {id,status:done?'done':report.status==='running'?'interrupted':report.status,stage:'finished',progress:done?1:0,logs:[],
      createdAt:(await fs.promises.stat(file)).mtimeMs,error:report.error?.message||(!done?'Запуск не завершён. Его можно продолжить.':undefined),
      result:{ok:done,runId:id,renderer:report.renderer,video:media(report.video),previousVideo:media(report.previousVideo),draft:media(report.draft),report:media('report.json'),inspection:media(report.inspection),treatment:media(report.artifacts?.treatment),directionPlan:media(report.artifacts?.directionPlan),score:media(report.artifacts?.score),contactSheet:media(report.artifacts?.contactSheet),preflight:media(report.artifacts?.preflight),canReformat:report.canReformat,cost,quality:report.quality,revisionFailed:Boolean(report.sceneRevision && !done),importVia:report.renderer}};
  }catch{return null;}
}

async function startProductionJob(body, ip, ownerRecord = null) {
  if(body.resume!==undefined&&typeof body.resume!=='string')throw new Error('ID сохранённого запуска должен быть строкой');
  const own=body.engine==='kadr-launch',native=body.engine==='motionsmith'||own;
  if (body.renderOnly !== undefined && typeof body.renderOnly !== 'boolean') throw new Error('Некорректный режим экспорта');
  if (body.renderOnly && (!own || !body.resume)) throw new Error('Повторный экспорт требует сохранённый план KADR');
  if (body.exportFormat !== undefined && (!body.renderOnly || !['landscape','portrait','square'].includes(body.exportFormat))) {
    throw new Error('Некорректный формат повторного экспорта');
  }
  if(native){
    if(!own&&!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(ip))throw new Error('MotionSmith доступен из локальной установки владельца');
    const runtime=own?kadrRuntimeStatus():await legacyRuntimeStatus();if(!runtime.available)throw new Error(runtime.message);
    if(own)launchBudgetUSD(body.budgetUSD);
    if(!body.resume){if(own)validateKadrRequest({...body,style:body.launchStyle,pace:body.launchPace});else (await import('./motionsmith/index.js')).validateLaunchRequest(body);}
  }
  const motionMode = native?'saas-launch':typeof body.url === 'string' && body.url.trim() ? 'website' : 'cinematic';
  if (!own && motionMode !== 'website' && !body.resume && !hasApiKey()) throw new Error('На сервере не настроен ключ Anthropic');
  if (running >= MAX_CONCURRENT) throw new Error('Сервер занят другой генерацией');
  const now = Date.now(), recent = (hits.get(ip) || []).filter((t) => now - t < 3600e3);
  if (recent.length >= 6) throw new Error('Слишком много запросов, попробуйте позже');
  const id = body.resume || newRunId(native?'web-launch':'web-react');
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(id)) throw new Error('Недопустимый ID');
  if (jobs.get(id)?.status === 'running') throw new Error('Запуск уже выполняется');
  const controller = new AbortController();
  const job = { id, status: 'running', stage: 'research', progress: 0, logs: [], createdAt: now, controller };
  running++;
  try { if (ownerRecord) await accounts.addGeneration(ownerRecord.userId, job, ownerRecord.mode, ownerRecord.input); }
  catch (error) { running--; throw error; }
  jobs.set(id, job); recent.push(now); hits.set(ip, recent);
  const generate=own?generateKadrLaunch:native?(await import('./motionsmith/index.js')).generateLaunch:generateProduction;
  generate({ description: body.description, url: body.url, brief: body.brief,language:body.language,
    motionMode, websitePace:body.websitePace, style:own ? body.launchStyle : undefined, pace:own ? body.launchPace : undefined,
    budgetUSD:own?body.budgetUSD:undefined, directionMode:own?body.directionMode:undefined, visualReview:own?body.visualReview:undefined,
    motionRecipe:own?body.motionRecipe:undefined, artDirection:own?body.artDirection:undefined,
    objectStory:own?body.objectStory:undefined, sceneRevision:own?body.sceneRevision:undefined,
    renderOnly:body.renderOnly, exportFormat:body.exportFormat,
    seconds: body.seconds ?? (native?25:12), format: body.format ?? (native?'landscape':'portrait'), runId: id, resume: Boolean(body.resume),
    fromStage: body.fromStage, sceneId: body.sceneId, signal: controller.signal,
    onEvent: (e) => { if (e.type === 'stage') { job.stage = e.name; job.progress = 0; job.logs.push(({treatment: 'Режиссёр выбирает постановку', palette: 'Сверяем цвета видимого интерфейса', compile: 'Движок собирает сцены', preflight: 'Проверяем и правим композицию локально'})[e.name] || `этап: ${e.name}`); }
      if (e.type === 'render') job.progress = e.progress;
      if (e.type === 'cost') job.cost={usd:e.usd,budgetUSD:e.budgetUSD};
    },
  }).then((r) => {
    job.status = r.ok ? 'done' : r.report.status;
    const media = (file) => file ? `/media/${r.runId}/${file}` : null;
    job.result = { ok: r.ok, runId: r.runId, video: media(r.report.video), previousVideo: media(r.report.previousVideo), draft: media(r.report.draft),
      report: media('report.json'), inspection: media(r.report.inspection), cost: r.report.cost,
      quality: r.report.quality, revisionFailed:Boolean(r.report.sceneRevision && !r.ok), renderer:r.report.renderer,treatment:media(r.report.artifacts?.treatment),directionPlan:media(r.report.artifacts?.directionPlan),score:media(r.report.artifacts?.score),contactSheet:media(r.report.artifacts?.contactSheet),preflight:media(r.report.artifacts?.preflight),canReformat:r.report.canReformat,
      importVia: native?body.engine:r.report.modelMode === 'website' ? 'website' : 'source', timings: r.report.timings };
    if (!r.ok&&r.report.status!=='needs_review') job.error = r.report.error?.message || 'Черновик требует правок. Подробности в отчёте.';
  }).catch((e) => { job.status = 'failed'; job.error = e.message; }).finally(() => { running--; job.stage = 'finished'; });
  return job;
}

async function startJob(body, ip) {
  if(body.engine!==undefined&&!['canvas','react','motionsmith','kadr-launch'].includes(body.engine))throw new Error('Неизвестный движок');
  if (body.engine === 'canvas' && (body.renderOnly || body.exportFormat !== undefined)) throw new Error('Повторный экспорт требует сохранённый план KADR');
  if (body.engine !== 'canvas') return startProductionJob(body, ip);
  const url = String(body.url || '').trim().slice(0, 300);
  if (!url) throw new Error('Укажите ссылку на сайт');
  await assertPublicUrl(url);
  const dynamism = PROFILES[body.dynamism] ? body.dynamism : 'medium';
  const mode = body.mode === 'voice' ? 'voice' : 'silent';
  const length = LENGTHS[body.length] ? body.length : 'standard';
  const paletteMode = body.paletteMode === 'style' ? 'style' : 'brand';
  const brief = String(body.brief || '').slice(0, 400);
  if (!hasApiKey()) throw new Error('На сервере не настроен ключ Anthropic (ANTHROPIC_API_KEY в .env)');
  const now = Date.now(), arr = (hits.get(ip) || []).filter((t) => now - t < 3600e3);
  if (arr.length >= 6) throw new Error('Слишком много запросов, попробуйте позже');
  if (running >= MAX_CONCURRENT) throw new Error('Сервер занят другой генерацией, повторите через минуту');
  let style;
  if (body.styleId === 'custom') {
    const fp = body.referenceId && refs.get(body.referenceId)?.fingerprint;
    style = buildCustomStyle({ description: String(body.styleDescription || '').slice(0, 600), fingerprint: fp || null });
  } else style = getStyle(body.styleId || 'clean');
  arr.push(now); hits.set(ip, arr);
  const id = newRunId('web');
  const job = { id, status: 'running', stage: 'import', progress: 0, logs: [], createdAt: now };
  jobs.set(id, job); running++;
  generateVideo({ url, dynamism, mode, brief, length, paletteMode, style, runId: id, onEvent: (e) => {
    if (e.type === 'stage') { job.stage = e.name; job.logs.push(`этап: ${e.name}`); }
    if (e.type === 'turn') job.logs.push(`режиссёр, ход ${e.turn}: ${e.tools.join(', ') || '—'} · $${e.usd.toFixed(4)}`);
    if (e.type === 'render') job.progress = e.progress;
  } }).then((r) => {
    job.status = r.ok ? 'done' : 'failed';
    job.result = { ok: r.ok, runId: r.runId, video: r.ok ? `/media/${r.runId}/video.mp4` : null, cost: r.report.cost, metrics: r.report.validation.metrics, render: r.report.render || null, voice: r.report.voice || null, importVia: r.report.import.via, errors: r.ok ? [] : r.report.validation.errors.slice(0, 8), stopReason: r.report.stopReason, timings: r.report.timings };
    if (!r.ok) job.error = r.report.error || `План не прошёл проверку (${r.report.stopReason})`;
  }).catch((e) => { job.status = 'failed'; job.error = e.message; }).finally(() => { running--; job.stage = 'finished'; });
  return job;
}

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, 'http://x');
    if (publicMode && !authorized(req)) return send(res,401,'Authentication required',{'www-authenticate':'Basic realm="KADR private preview", charset="UTF-8"'});
    if (['POST','PUT','PATCH','DELETE'].includes(req.method) && req.headers.origin && req.headers.origin !== (publicMode?publicOrigin:`http://${req.headers.host}`)) return send(res, 403, { error: 'Чужой источник запроса' });
    if (req.method === 'GET' && u.pathname === '/api/mcp/config') {
      const localHost=/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(req.headers.host || '');
      const remote=req.socket.remoteAddress;
      if(publicMode || !localHost || !['127.0.0.1','::1','::ffff:127.0.0.1'].includes(remote) || (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) || req.headers['sec-fetch-site']==='cross-site') return send(res,403,{error:'Local connection only'});
      return send(res,200,{mcpServers:{frameotion:{command:process.execPath,args:[path.join(ROOT,'scripts/frameotion-mcp.mjs')]}}},{'cache-control':'no-store'});
    }
    if (await studioPages.handle(req, res, u)) return;
    // The authenticated Pages gateway sets this header; direct clients cannot use it without the origin token.
    const forwardedIp = req.headers['x-frameotion-client-ip'];
    const ip = publicMode && typeof forwardedIp === 'string' && isIP(forwardedIp) ? forwardedIp : (req.socket.remoteAddress || 'local');
    if (req.method === 'POST' && u.pathname.startsWith('/api/account/') && !/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) return send(res,415,{error:'Требуется JSON.'});
    const token = sessionToken(req), user = accounts.getUser(token);
    const owns = id => { const owner=accounts.owner(id); return publicMode ? Boolean(user && owner && owner===user.id) : (!owner || owner===user?.id); };
    if (req.method === 'GET' && u.pathname === '/api/account') return send(res,200,{user},{'cache-control':'no-store'});
    if (req.method === 'POST' && ['/api/account/register','/api/account/login'].includes(u.pathname)) {
      if (!allowAuthAttempt(ip)) return send(res,429,{error:'Слишком много попыток. Попробуйте позже.'});
      try { const body=await readJson(req), result=await (u.pathname.endsWith('register')?accounts.register(body):accounts.login(body)); return send(res,200,{user:result.user},{'set-cookie':sessionCookie(result.token),'cache-control':'no-store'}); }
      catch(e) { return send(res,400,{error:e.message}); }
    }
    if (req.method === 'POST' && u.pathname === '/api/account/logout') { await accounts.logout(token); return send(res,200,{ok:true},{'set-cookie':'frameotion_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0'}); }
    if (u.pathname.startsWith('/api/account/')) {
      if(!user) return send(res,401,{error:'Войдите в аккаунт.'});
      if(req.method==='GET' && u.pathname==='/api/account/generations') { const generations=await Promise.all(accounts.listGenerations(user.id).map(async item=> { const job=jobs.get(item.id) ?? await savedLaunchJob(item.id); return {...item,...(job?creationStatus(job):{status:'interrupted'})}; })); return send(res,200,{generations},{'cache-control':'no-store'}); }
      if(req.method==='POST' && u.pathname==='/api/account/profile') return send(res,200,{user:await accounts.updateName(user.id,(await readJson(req)).name)});
      if(req.method==='POST' && u.pathname==='/api/account/password') { const body=await readJson(req); await accounts.updatePassword(user.id,body.currentPassword,body.password,token); return send(res,200,{ok:true}); }
      return send(res,404,{error:'Не найдено.'});
    }
    if (req.method === 'GET' && u.pathname === '/api/config') {
      return send(res, 200, {
        hasApiKey: hasApiKey(), voiceAvailable: Boolean(CONFIG.elevenLabsKey && CONFIG.elevenLabsVoice), model: CONFIG.model,
        motionSmith:publicMode?{available:false}:await legacyRuntimeStatus(),kadrLaunch:kadrRuntimeStatus(),publicMode,
        kadrBudgetUSD:launchBudgetUSD(),kadrBudgetCapUSD:CONFIG.maxRunCostUSD,
        dynamism: Object.values(PROFILES).map((p) => ({ id: p.id, label: p.label, bpm: p.bpm, sceneSec: p.sceneSec })),
        lengths: Object.values(LENGTHS).map((l) => ({ id: l.id, label: l.label, estUSD: l.estUSD, maxRunUSD: l.maxRunUSD })),
        styles: listStyles().map((s) => ({ id: s.id, name: s.name, description: s.description, status: s.status, palette: s.palette, source: s.source })),
      });
    }
    if (req.method === 'GET' && u.pathname === '/api/motion-catalog') {
      if(publicMode)return send(res,403,{error:'Каталог недоступен в публичном предпросмотре'});
      const clips = MOTION_CLIPS.map(({ phases, ...clip }) => {
        const example = `short-motion/${clip.id}.mp4`;
        return { ...clip, example: fs.existsSync(path.join(CONFIG.runsDir, example)) ? example : null };
      });
      return send(res, 200, { clips, effects: MOTION_SKILLS, transitions: TRANSITION_SKILLS, recipes: CHOREOGRAPHY_RECIPES, references: motionReferences() });
    }
    if (req.method === 'GET' && u.pathname === '/api/sounds') return publicMode?send(res,403,{error:'Локальная библиотека недоступна'}):send(res, 200, soundLibrary());
    if(req.method==='GET'&&(u.pathname==='/api/motionsmith'||u.pathname.startsWith('/motion-asset/'))){
      if(publicMode)return send(res,403,'Local library only');
      if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(ip)||req.headers['sec-fetch-site']==='cross-site')return send(res,403,'Local library only');
      if(u.pathname.startsWith('/motion-asset/')){
        try{const {file}=resolveMotionAsset(decodeURIComponent(u.pathname.slice(14)));return serveFile(req,res,file);}catch{return send(res,404,'asset not found');}
      }
      const catalog=motionAssets(),effects=JSON.parse(fs.readFileSync(path.join(ROOT,'library/motionsmith-effects.json'),'utf8'));
      const assets=catalog.assets.map(({file,codepoints,faces,...a})=>({...a,available:fs.existsSync(path.join(motionAssetRoot(),file))}));
      return send(res,200,{provider:'MotionSmith',localOnly:true,packs:catalog.packs.map(({credits,...p})=>p),assets,curves:Object.keys(motionCurves()),effects:effects.effects,userSounds:soundLibrary().sounds.length});
    }
    if (req.method === 'GET' && u.pathname.startsWith('/sound/')) {
      if (publicMode) return send(res,404,'not found');
      const asset = soundLibrary().sounds.find((s) => s.id === decodeURIComponent(u.pathname.slice(7)));
      if (!asset) return send(res, 404, 'sound not found');
      return serveFile(req, res, path.join(ROOT, 'assets', asset.file));
    }
    if (req.method === 'POST' && u.pathname === '/api/create') {
      if (publicMode && !user) return send(res,401,{error:'Войдите в аккаунт, чтобы создать видео.'});
      const requestBody = await readJson(req);
      const body = await creationRequest(requestBody);
      if (!hasApiKey()) return send(res,503,{error:'Создание видео временно недоступно.'});
      const ownerRecord = user ? {userId:user.id, mode:requestBody.mode, input:requestBody.input} : null;
      if (publicMode && !dailyBudget) return send(res,503,{error:'Создание видео временно недоступно.'});
      const reservation = dailyBudget && await dailyBudget.reserve();
      let job;
      try { job = await startProductionJob(body,ip,ownerRecord); } catch (error) { if (reservation) await dailyBudget.release(reservation); throw error; }
      return send(res,202,{id:job.id});
    }
    if (req.method === 'POST' && /^\/api\/create\/[\w-]{1,80}\/revise$/.test(u.pathname)) {
      const id = u.pathname.split('/')[3];
      if (!owns(id)) return send(res,404,{error:'Видео не найдено.'});
      const body = await readJson(req);
      if (typeof body.instruction !== 'string' || !body.instruction.trim() || body.instruction.length > 800 ||
          !Number.isFinite(body.atSeconds) || body.atSeconds < 0) {
        return send(res,400,{error:'Остановите видео на фрагменте и опишите правку.'});
      }
      const dir = path.join(CONFIG.runsDir,id);
      const report = JSON.parse(await fs.promises.readFile(path.join(dir,'report.json'),'utf8'));
      if (!report.artifacts?.directionPlan) return send(res,400,{error:'Для этого ролика правка фрагмента недоступна.'});
      const score = JSON.parse(await fs.promises.readFile(path.join(dir,report.artifacts.score),'utf8'));
      const scene = score.scenes.find(item=>body.atSeconds*score.fps >= item.start && body.atSeconds*score.fps < item.end);
      if (!scene) return send(res,400,{error:'Выберите фрагмент внутри ролика.'});
      if (publicMode && !dailyBudget) return send(res,503,{error:'Создание видео временно недоступно.'});
      const reservation = dailyBudget && await dailyBudget.reserve();
      let job;
      try { job = await startProductionJob({engine:'kadr-launch',resume:id,
        sceneRevision:{sceneId:scene.id,instruction:body.instruction.trim()}},ip); } catch (error) { if (reservation) await dailyBudget.release(reservation); throw error; }
      return send(res,202,{id:job.id,previewFrom:Math.max(0,scene.start/score.fps-1)});
    }
    if (req.method === 'GET' && /^\/api\/create\/[\w-]{1,80}$/.test(u.pathname)) {
      const id = u.pathname.split('/').pop();
      if(!owns(id)) return send(res,404,{error:'Видео по этой ссылке не найдено.'});
      const job = jobs.get(id) ?? await savedLaunchJob(id);
      return job ? send(res,200,creationStatus(job)) : send(res,404,{error:'Видео по этой ссылке не найдено.'});
    }
    if (req.method === 'POST' && /^\/api\/jobs\/[^/]+\/cancel$/.test(u.pathname)) {
      const id=u.pathname.split('/')[3];
      if(!owns(id)) return send(res,404,{error:'Задача не найдена.'});
      const job = jobs.get(id);
      if (!job?.controller || job.status !== 'running') return send(res, 409, { error: 'Нет активной задачи для отмены' });
      job.controller.abort(new Error('Генерация отменена пользователем'));
      return send(res, 202, { id: job.id, status: 'cancelling' });
    }
    if (req.method === 'POST' && u.pathname === '/api/jobs') { if(publicMode)return send(res,404,{error:'Не найдено.'}); const body=await readJson(req);if(body.resume && !owns(body.resume))return send(res,404,{error:'нет такой задачи'});if(publicMode&&body.engine!=='kadr-launch')return send(res,403,{error:'В публичном предпросмотре доступен только KADR Launch'});const job = await startJob(body, ip); return send(res, 202, { id: job.id }); }
    if (req.method === 'GET' && u.pathname.startsWith('/api/jobs/')) { const id=u.pathname.split('/').pop(); if(!owns(id))return send(res,404,{error:'нет такой задачи'}); const j = jobs.get(id)||await savedLaunchJob(id); return j ? send(res, 200, publicJob(j)) : send(res, 404, { error: 'нет такой задачи' }); }
    if (req.method === 'POST' && u.pathname === '/api/reference') {
      if(publicMode)return send(res,403,{error:'Загрузка референсов отключена'});
      const id = crypto.randomBytes(6).toString('hex'), dir = path.join(CONFIG.runsDir, '_refs'); fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, `${id}.mp4`); let n = 0; const max = 150 * 1024 * 1024; const ws = fs.createWriteStream(file);
      for await (const c of req) { n += c.length; if (n > max) { ws.destroy(); fs.rmSync(file, { force: true }); return send(res, 413, { error: 'Файл больше 150 МБ' }); } ws.write(c); }
      await new Promise((r) => ws.end(r));
      try { const fingerprint = await analyzeReference(file); refs.set(id, { fingerprint, file }); return send(res, 200, { referenceId: id, fingerprint }); }
      catch (e) { fs.rmSync(file, { force: true }); return send(res, 422, { error: `Не удалось разобрать видео: ${e.message}` }); }
    }
    if (req.method === 'GET' && u.pathname.startsWith('/media/')) {
      const rel = path.normalize(decodeURIComponent(u.pathname.replace('/media/', '')));
      if (rel.startsWith('..') || path.isAbsolute(rel) || rel.startsWith('_')) return send(res, 403, 'forbidden');
      if (!owns(rel.split(path.sep)[0])) return send(res,404,'not found');
      return serveFile(req, res, path.join(CONFIG.runsDir, rel));
    }
    if (req.method === 'GET') {
      const file = u.pathname === '/' ? '/index.html' : path.normalize(u.pathname);
      if (publicMode && !creationPages.has(file)) return send(res,404,'not found');
      return serveFile(req, res, path.join(PUBLIC,file));
    }
    send(res, 405, 'method not allowed');
  } catch (e) { send(res, 400, { error: e.message }); }
});

server.on('close', () => studioPages.close());
server.listen(CONFIG.port, host, () => console.log(`KADR Studio: http://${host}:${CONFIG.port}  (ключ Anthropic: ${hasApiKey() ? 'настроен' : 'НЕ настроен — добавьте в .env'})`));
