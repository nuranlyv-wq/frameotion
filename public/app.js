const $ = (s) => document.querySelector(s);
const state = { engine: 'kadr-launch', jobId: null, dynamism: 'medium', length: 'standard', paletteMode: 'brand', styleId: 'clean', mode: 'silent', referenceId: null, cfg: null };
const formatCost = cost => `$${cost.usd.toFixed(4)}${Number.isFinite(cost.budgetUSD) ? ` из $${cost.budgetUSD.toFixed(2)}` : ''}`;

const DYN_HINT = {
  calm: 'Меньше событий, длинные сцены, мягкие переходы, спокойный ритм.',
  medium: 'Ориентир: плотность и темп ролика Google v2.',
  high: 'Больше событий, короткие сцены, резкие переходы, быстрый бит.',
};

function seg(el, items, key, onPick) {
  el.innerHTML = '';
  for (const it of items) {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = it.label; b.dataset.v = it.id;
    if (state[key] === it.id) b.classList.add('on');
    b.setAttribute('aria-pressed', String(state[key] === it.id));
    b.onclick = () => {
      state[key] = it.id;
      for (const child of el.children) {
        child.classList.toggle('on', child === b);
        child.setAttribute('aria-pressed', String(child === b));
      }
      onPick?.(it.id);
    };
    el.appendChild(b);
  }
}

async function init() {
  function selectEngine(id){
    $('#canvasOptions').hidden = id !== 'canvas'; $('#productionOptions').hidden = id === 'canvas';
    $('#descriptionField').hidden = id === 'canvas'; $('#url').required = id === 'canvas';
    $('#websiteOptions').hidden=id!=='react';$('#launchOptions').hidden=id!=='kadr-launch';
    $('#launchBudget').disabled = id !== 'kadr-launch';
    $('#seconds').min=id==='kadr-launch'?'12':'3';$('#seconds').value=id==='kadr-launch'?'25':'12';
    $('#brief').maxLength = id === 'canvas' ? 400 : 1600;
    $('#brief').placeholder = id === 'kadr-launch'
      ? 'Например, курсор нажимает на «Подписка», и слово превращается в календарь'
      : 'Например, сделайте упор на скорость поиска';
    $('#sourceHint').textContent=id==='kadr-launch'?'Frameotion берёт цвета с видимых элементов сайта. Описание может дополнить или заменить ссылку.':'По ссылке ролик собирается из захваченных элементов страницы.';
    if(state.cfg){
      const msg=id==='kadr-launch'&&!state.cfg.kadrLaunch?.available?state.cfg.kadrLaunch?.message:
        !state.cfg.hasApiKey?(id==='kadr-launch'?'Типовые демо доступны без ключа. Для остальных роликов нужен Anthropic.':'Анимация сайта по ссылке доступна. Для генерации по описанию нужен ключ Anthropic.') : '';
      $('#keyWarn').hidden=!msg;$('#keyWarn').textContent=msg||'';
    }
    $('#motionRecipe').onchange?.();
  }
  seg($('#engine'), [{ id: 'kadr-launch', label: 'Моушн-видео' }, { id: 'react', label: 'Сайт в движении' }, { id: 'canvas', label: 'Прежний режим' }], 'engine',selectEngine);
  state.cfg = await (await fetch('/api/config')).json();
  if (Number.isFinite(state.cfg.kadrBudgetUSD)) $('#launchBudget').value=state.cfg.kadrBudgetUSD.toFixed(2);
  if (Number.isFinite(state.cfg.kadrBudgetCapUSD)) $('#launchBudget').max=state.cfg.kadrBudgetCapUSD;
  if (state.cfg.publicMode) {
    for (const button of [...$('#engine').children]) if (button.dataset.v !== 'kadr-launch') button.remove();
  } else {
    for (const element of document.querySelectorAll('[data-local-only]')) element.hidden = false;
  }
  selectEngine(state.engine);
  function updateDirection() {
    const recipe = $('#motionRecipe').value;
    const objectRecipe = state.engine === 'kadr-launch' && recipe === 'object-transform';
    $('#connectedStoryHint').hidden = !['connected-story', 'continuous-morph'].includes(recipe);
    $('#objectStoryHint').hidden = !objectRecipe;
    $('#manualDirection').hidden = $('#manualDirection').disabled = !objectRecipe;
    if (state.engine === 'kadr-launch' && !objectRecipe && $('#directionMode').value === 'manual') $('#directionMode').value = 'semantic';
    const rapid = $('#superdynamicPace');
    rapid.disabled = $('#launchStyle').value !== 'saas-launch' || $('#directionMode').value !== 'semantic' || Boolean(recipe);
    if (rapid.disabled && rapid.selected) $('#launchPace').value = 'dynamic';
    const manual = objectRecipe && $('#directionMode').value === 'manual';
    $('#objectStoryFields').hidden = !manual;
    for (const input of $('#objectStoryFields').querySelectorAll('input,textarea')) input.disabled = !manual;
    $('#visualReview').disabled = manual;
    $('#launchBudget').disabled = state.engine !== 'kadr-launch' || manual;
  }
  $('#motionRecipe').onchange = $('#directionMode').onchange = updateDirection;
  $('#launchStyle').onchange = () => {
    const option = $('#productUiPromoRecipe');
    option.hidden = option.disabled = $('#launchStyle').value !== 'product-demo';
    if (option.disabled && option.selected) $('#motionRecipe').value = '';
    $('#motionRecipe').onchange();
  };
  $('#launchStyle').onchange();
  seg($('#dynamism'), state.cfg.dynamism, 'dynamism', (id) => { $('#dynHint').textContent = DYN_HINT[id]; });
  $('#dynHint').textContent = DYN_HINT[state.dynamism];
  const lenHint = (id) => { const l = state.cfg.lengths.find((x) => x.id === id); $('#lenHint').textContent = `Оценка расхода Opus: $${l.estUSD} за ролик, жёсткий потолок $${l.maxRunUSD.toFixed(2)}. Чем длиннее ролик, тем больше сцен рисует код.`; };
  seg($('#length'), state.cfg.lengths, 'length', lenHint); lenHint(state.length);
  seg($('#palette'), [{ id: 'brand', label: 'Бренд сайта' }, { id: 'style', label: 'Из стиля' }], 'paletteMode');

  const box = $('#styles');
  const items = [...state.cfg.styles, { id: 'custom', name: 'Свой стиль', description: 'Опишите словами и, если есть, приложите видеореференс.', palette: null }];
  for (const s of items) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'style' + (s.id === state.styleId ? ' on' : ''); b.dataset.id = s.id;
    const sw = s.palette ? `<div class="sw">${Object.values(s.palette).slice(0, 4).map((c) => `<i style="background:${c}"></i>`).join('')}</div>` : '<div class="sw"><i></i><i></i><i></i></div>';
    b.innerHTML = `<b>${s.name}</b>${sw}<p>${s.description}</p>${s.status === 'placeholder' ? '<span class="tag">временный пресет</span>' : s.status === 'draft' ? '<span class="tag">черновик из референса</span>' : ''}`;
    b.onclick = () => { state.styleId = s.id; box.querySelectorAll('.style').forEach((x) => x.classList.toggle('on', x === b)); $('#customBox').hidden = s.id !== 'custom'; };
    box.appendChild(b);
  }

  document.querySelectorAll('#mode button').forEach((b) => { b.onclick = () => { if (b.disabled) return; state.mode = b.dataset.v; document.querySelectorAll('#mode button').forEach((x) => x.classList.toggle('on', x === b)); }; });
  if (!state.cfg.voiceAvailable) { $('#voiceBtn').disabled = true; $('#voiceHint').textContent = 'Озвучка недоступна: ElevenLabs не подключён. Ролик получит музыку и звуковые акценты.'; }

  $('#refFile').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    $('#refInfo').textContent = 'Разбираю референс…';
    try {
      const r = await fetch('/api/reference', { method: 'POST', body: f, headers: { 'content-type': 'application/octet-stream' } });
      const j = await r.json(); if (!r.ok) throw new Error(j.error);
      state.referenceId = j.referenceId; const fp = j.fingerprint;
      $('#refInfo').textContent = `Референс: ${fp.durationSec} с, ${fp.cutsPerSec} склеек/с, темп «${fp.suggestedDynamism}». Палитра учтена.`;
    } catch (err) { state.referenceId = null; $('#refInfo').textContent = err.message; }
  };
  const savedRun=new URLSearchParams(location.search).get('run');
  if(savedRun&&/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(savedRun)){
    state.jobId=savedRun;state.jobEngine='kadr-launch';$('#progress').hidden=false;$('#go').disabled=true;await poll(savedRun);
  }
}

function setProgress(percent) {
  $('#barFill').style.width = `${percent}%`;
  $('#jobProgress').setAttribute('aria-valuenow', String(Math.round(percent)));
}

$('#form').addEventListener('invalid', event => {
  const details = event.target.closest('details');
  if (details) details.open = true;
}, true);

$('#form').onsubmit = async (e) => {
  e.preventDefault();
  state.jobId=null;
  state.jobBudgetUSD=undefined;
  state.savedScore=false;
  $('#exportControls').hidden=true;
  $('#exportFormat').value='';
  $('#liveCost').hidden=true;
  $('#error').hidden = true; $('#result').hidden = true; $('#progress').hidden = false; $('#go').disabled = true; $('#logs').replaceChildren(); setProgress(4);
  try {
    const budgetUSD=!$('#launchBudget').disabled && $('#launchBudget').value ? $('#launchBudget').valueAsNumber : undefined;
    const motionRecipe = state.engine === 'kadr-launch' ? $('#motionRecipe').value || undefined : undefined;
    const artDirection = state.engine === 'kadr-launch' ? $('#artDirection').value || undefined : undefined;
    const objectStory = $('#objectStoryFields').hidden ? undefined : {
      brand: $('#objectBrand').value, hook: $('#objectHook').value, route: $('#objectRoute').value,
      steps: $('#objectSteps').value.split(/\r?\n/).map(line => line.trim()).filter(Boolean),
      benefit: $('#objectBenefit').value, qualifier: $('#objectQualifier').value,
    };
    const r = await fetch('/api/jobs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ engine: state.engine, budgetUSD, motionRecipe, artDirection, objectStory, language: $('#language').value, description: $('#description').value, seconds: Number($('#seconds').value), format: $('#format').value, websitePace: $('#websitePace').value, launchStyle: $('#launchStyle').value, launchPace: $('#launchPace').value, directionMode: $('#directionMode').value, visualReview: $('#visualReview').checked, url: $('#url').value, dynamism: state.dynamism, length: state.length, paletteMode: state.paletteMode, styleId: state.styleId, styleDescription: $('#styleDesc').value, referenceId: state.referenceId, mode: state.mode, brief: $('#brief').value }) });
    const j = await r.json(); if (!r.ok) throw new Error(j.error);
    state.jobId = j.id; state.jobEngine = state.engine;
    if(state.engine==='kadr-launch')history.replaceState(null,'','/studio.html?run='+encodeURIComponent(j.id));
    $('#resume').hidden = true;
    $('#progress').scrollIntoView({block: 'nearest'});
    poll(j.id).catch((err) => fail(err.message));
  } catch (err) { fail(err.message); }
};

function fail(msg) { $('#resume').hidden = !state.jobId || state.jobEngine === 'canvas'; $('#exportControls').hidden = !state.savedScore; $('#go').disabled = false; $('#progress').hidden = true; $('#error').hidden = false; $('#error').textContent = msg; }

async function poll(id) {
  const response=await fetch(`/api/jobs/${id}`),j=await response.json();if(!response.ok)throw new Error(j.error||'Запуск недоступен');
  if(j.result?.renderer&&['kadr-launch','motionsmith'].includes(j.result.renderer))state.jobEngine=j.result.renderer;
  $('#logs').replaceChildren(...j.logs.map((l) => { const item = document.createElement('li'); item.textContent = l; return item; }));
  const base = { research: 6, capture: 10, palette: 12, treatment: 14, compile: 32, preflight: 46, product: 12, narrative: 22, interface: 35, motion: 45, keyframes: 50, draft: 55, 'draft-inspect': 65, 'visual-review':67, repair: 68, inspect: 97, import: 8, director: 20, render: 40, voice: 95, finished: 100 }[j.stage] ?? 8;
  setProgress(j.stage === 'render' ? 72 + j.progress * 24 : base);
  if (j.cost && Number.isFinite(j.cost.usd)) {
    $('#liveCost').hidden=false;
    $('#liveCost').textContent=`Расход API — ${formatCost(j.cost)}`;
  }
  if (j.status === 'running') return setTimeout(() => poll(id).catch((err) => fail(err.message)), 800);
  state.savedScore = state.jobEngine === 'kadr-launch' && Boolean(j.result?.score);
  $('#exportControls').hidden = !state.savedScore;
  $('#exportFormatField').hidden = !j.result?.canReformat;
  const cost=j.result?.cost;
  if (state.jobEngine==='kadr-launch' && Number.isFinite(cost?.budgetUSD)) {
    state.jobBudgetUSD=cost.budgetUSD;
    $('#launchBudget').value=cost.budgetUSD.toFixed(2);
  }
  $('#go').disabled = false;
  if (j.status !== 'done' && !j.result?.video && !j.result?.draft && !j.result?.previousVideo) {
    const error=j.error || 'Не удалось создать ролик';
    return fail(cost && state.jobEngine==='kadr-launch' ? `${error} Расход API — ${formatCost(cost)}.` : error);
  }
  $('#progress').hidden = true; $('#result').hidden = false;
  $('#resume').hidden = ['done','needs_review'].includes(j.status) || state.jobEngine === 'canvas';
  $('#quality').textContent = ['done','needs_review'].includes(j.status) ? 'Файл прошёл технические проверки. Оцените ритм и читаемость при просмотре.' : j.error;
  $('#artifacts').replaceChildren(...['draft', 'previousVideo', 'inspection', 'preflight', 'report','treatment','directionPlan','score','contactSheet'].filter((key) => j.result[key]).map((key) => { const a = document.createElement('a'); a.href = j.result[key]; a.textContent = ({draft:'Черновик ',previousVideo:'Предыдущий экспорт ',inspection:'Проверка ',preflight:'Автоправки ',report:'Отчёт ',treatment:'Замысел ',directionPlan:'Режиссура по кадрам ',score:'План сцен ',contactSheet:'Кадры '})[key]; a.target = '_blank'; return a; }));
  if(state.engine==='react'&&j.result.runId){const a=document.createElement('a');a.href='/generated.html?run='+encodeURIComponent(j.result.runId);a.textContent='Описание, происхождение и мои звуки';a.target='_blank';$('#artifacts').append(a);}
  $('#video').src = (j.result.video || j.result.draft || j.result.previousVideo)+'?v='+encodeURIComponent(j.createdAt); $('#video').play().catch(() => {});
  const c = j.result.cost, f = (n) => n.toLocaleString('ru-RU');
  $('#cost').innerHTML = `<table>
    <tr><td>Вызовов модели</td><td>${c.calls}</td></tr>
    <tr><td>Вход / выход (токены)</td><td>${f(c.tokens.input)} / ${f(c.tokens.output)}</td></tr>
    <tr><td>Кэш: чтение / запись</td><td>${f(c.tokens.cacheRead)} / ${f(c.tokens.cacheWrite)}</td></tr>
    <tr class="tot"><td>Стоимость API</td><td>${formatCost(c)}</td></tr></table>
    <small>${j.result.importVia === 'kadr-launch' ? 'Frameotion. План и рендер сохранены.' : j.result.importVia === 'website' ? 'Слои захвачены с исходной страницы.' : 'Тариф: ' + c.pricing.replace('https://', '') + '. Импорт: ' + (j.result.importVia === 'browser' ? 'браузерный захват' : 'прямой fetch') + '.'}${j.result.voice ? ' Озвучка: ' + (j.result.voice.reason || j.result.voice.status) + '.' : ''}</small>`;
  $('#metrics').textContent = JSON.stringify(j.result.renderer==='kadr-launch'?{движок:'Frameotion',стиль:'saas-launch',проверка:j.result.quality}:{ план: j.result.metrics, движение: j.result.render?.metrics }, null, 2);
  $('#result').scrollIntoView({block: 'start'});
}

$('#cancel').onclick = async () => {
  if (!state.jobId) return;
  await fetch(`/api/jobs/${state.jobId}/cancel`, { method: 'POST' });
};
$('#resume').onclick = async () => {
  try {
    const engine=state.jobEngine||state.engine;
    let budgetUSD;
    if (engine==='kadr-launch' && $('#launchBudget').value) {
      const field=$('#launchBudget');
      if (!field.reportValidity()) return;
      const saved=state.jobBudgetUSD ?? state.cfg.kadrBudgetUSD;
      if (Number(field.value)!==Number(saved?.toFixed(2))) budgetUSD=field.valueAsNumber;
    }
    const response = await fetch('/api/jobs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ engine, resume: state.jobId, budgetUSD }) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error);
    $('#progress').hidden = false; $('#go').disabled = true; $('#resume').hidden = true; $('#exportControls').hidden = true;
    $('#error').hidden = true;
    await poll(data.id);
  } catch (error) { fail(error.message); }
};
$('#exportAgain').onclick = async () => {
  $('#exportAgain').disabled = true;
  try {
    const exportFormat = $('#exportFormatField').hidden ? undefined : $('#exportFormat').value || undefined;
    const response = await fetch('/api/jobs', {method: 'POST', headers: {'content-type': 'application/json'},
      body: JSON.stringify({engine: 'kadr-launch', resume: state.jobId, renderOnly: true, exportFormat})});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    $('#exportControls').hidden = true;
    $('#resume').hidden = true;
    $('#error').hidden = true;
    $('#progress').hidden = false;
    $('#go').disabled = true;
    await poll(data.id);
  } catch (error) { fail(error.message); }
  finally { $('#exportAgain').disabled = false; }
};
init().catch((error) => fail(error.message));
