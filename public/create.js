import './locale.js';
const get = id => document.getElementById(id);
const form = get('create-form');
const input = {url:get('url'), prompt:get('prompt')};
const paceLabels = {
  ru: ['Динамичный', 'Супердинамично · до 0,5 с', 'Спокойный'],
  en: ['Dynamic', 'Super dynamic · up to 0.5 s', 'Calm'],
  az: ['Dinamik', 'Superdinamik · 0,5 s-ə qədər', 'Sakit'],
};
function updatePaceLabels() {
  const labels = paceLabels[document.documentElement.lang] ?? paceLabels.ru;
  [...get('pace').options].forEach((option, index) => { option.textContent = labels[index]; });
}
document.addEventListener('languagechange', updatePaceLabels);
updatePaceLabels();
const panels = ['create','progress','result'];
const runIdPattern = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/;
let activeRun = null;
let pollTimer;
let resultRun;
let previewFrom;

function show(panel) {
  for (const id of panels) get(id).hidden = id !== panel;
  get('overview').hidden = panel !== 'create';
  get('use-cases').hidden = panel !== 'create';
}

function setError(message = '') {
  get('error').hidden = !message;
  get('error').textContent = message;
  get('login-prompt').hidden = message !== 'Войдите в аккаунт, чтобы создать видео.';
}

function selectInput() {
  const mode = form.elements.mode.value;
  for (const [type, control] of Object.entries(input)) {
    const selected = type === mode;
    get(`${type}-field`).hidden = !selected;
    control.disabled = !selected;
    control.required = selected;
  }
  get('generate-label').textContent = mode === 'url' ? 'Создать видео из ссылки' : 'Создать видео по описанию';
  setError();
}

async function request(url, options) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || 'Не удалось связаться с Frameotion. Попробуйте ещё раз.');
    error.status = response.status;
    throw error;
  }
  return data;
}

function showProgress() {
  get('stage').textContent = 'Начинаем сборку ролика';
  get('progress-bar').value = 0;
  get('cancel').hidden = true;
  get('cancel').disabled = false;
  show('progress');
  get('progress-title').focus();
}

function backToForm(message = '') {
  clearTimeout(pollTimer);
  activeRun = null;
  resultRun = null;
  previewFrom = undefined;
  history.replaceState(null,'','/motion.html');
  get('generate').disabled = false;
  show('create');
  setError(message);
  input[form.elements.mode.value].focus();
}

function showVideo(file, isPreview, job) {
  resultRun = job?.id;
  get('edit-video').hidden = !job?.canRevise;
  get('edit-form').hidden = true;
  const position = previewFrom;
  previewFrom = undefined;
  if (position !== undefined) get('video').addEventListener('loadedmetadata',()=>{
    get('video').currentTime = position;
  },{once:true});
  get('video').src = file;
  get('download').href = file;
  get('result-title').textContent = isPreview ? 'Предпросмотр ролика' : 'Видео готово';
  get('result-note').hidden = !isPreview && !job?.revisionFailed;
  get('result-note').textContent = job?.revisionFailed ? 'Правка не применилась. Показана предыдущая версия.' : isPreview ? 'Доступен черновик. Финальная версия не была собрана.' : '';
  show('result');
  get('result-title').focus();
}

const preparation = new Set(['research','capture','palette']);
const editing = new Set(['treatment','compile','director','preflight']);

async function poll(runId, failures = 0) {
  if (runId !== activeRun) return;
  try {
    const job = await request(`/api/create/${encodeURIComponent(runId)}`);
    if (runId !== activeRun) return;
    if (job.status === 'running') {
      const [label, percent] = preparation.has(job.stage) ? ['Изучаем материалы', 12] :
        editing.has(job.stage) ? ['Собираем сцены', 30] :
        job.stage === 'render' ? ['Собираем финальную версию', 68 + Math.round(29*(job.progress || 0))] :
        job.stage === 'inspect' ? ['Проверяем готовое видео', 98] : ['Собираем и проверяем ролик', 55];
      const stage = get('stage');
      if (stage.textContent !== label) stage.textContent = label;
      const bar = get('progress-bar');
      bar.value = Math.max(bar.value, percent);
      pollTimer = setTimeout(() => poll(runId), 1000);
      return;
    }
    activeRun = null;
    if (job.video) showVideo(job.video, false, job);
    else if (job.preview) showVideo(job.preview, true, job);
    else if (job.status === 'cancelled') backToForm('Создание видео отменено.');
    else backToForm('Не удалось собрать видео. Проверьте ссылку или уточните описание и попробуйте ещё раз.');
  } catch (error) {
    if (runId !== activeRun) return;
    if (error.status !== 404 && failures < 3) {
      pollTimer = setTimeout(() => poll(runId, failures + 1), 1600);
    } else {
      backToForm(error.message);
    }
  }
}

get('modes').addEventListener('change', selectInput);
form.addEventListener('submit', async event => {
  event.preventDefault();
  const mode = form.elements.mode.value;
  const text = input[mode].value.trim();
  if (!text) {
    setError(mode === 'url' ? 'Вставьте ссылку на сайт.' : 'Опишите, какой ролик хотите получить.');
    input[mode].focus();
    return;
  }
  get('generate').disabled = true;
  setError();
  showProgress();
  try {
    const {id} = await request('/api/create', {method:'POST', headers:{'content-type':'application/json'},
      body:JSON.stringify({mode,input:text,language:document.documentElement.lang,pace:form.elements.pace.value})});
    if (!runIdPattern.test(id ?? '')) throw new Error('Не удалось начать создание видео.');
    activeRun = id;
    history.replaceState(null,'',`/motion.html?run=${encodeURIComponent(id)}`);
    get('cancel').hidden = false;
    poll(id);
  } catch (error) {
    backToForm(error.message);
  }
});

get('cancel').addEventListener('click', async () => {
  const id = activeRun;
  if (!id) return;
  get('cancel').disabled = true;
  try {
    await request(`/api/jobs/${encodeURIComponent(id)}/cancel`, {method:'POST'});
  } catch (error) {
    if (id === activeRun && error.status !== 409) get('cancel').disabled = false;
  }
});

get('new-video').addEventListener('click', () => {
  const video = get('video');
  video.pause();
  video.removeAttribute('src');
  video.load();
  form.reset();
  selectInput();
  backToForm();
});

get('edit-video').addEventListener('click',()=>{
  get('video').pause();
  get('edit-form').hidden = false;
  get('edit-instruction').focus();
});
get('edit-form').addEventListener('submit',async event=>{
  event.preventDefault();
  const button = event.submitter;
  if (button?.disabled) return;
  if (button) button.disabled = true;
  const atSeconds = get('video').currentTime;
  get('video').pause();
  get('edit-error').hidden = true;
  try {
    const response = await request(`/api/create/${encodeURIComponent(resultRun)}/revise`,{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({atSeconds,instruction:get('edit-instruction').value.trim()}),
    });
    activeRun = response.id;
    previewFrom = response.previewFrom;
    showProgress();
    get('cancel').hidden = false;
    poll(activeRun);
  } catch (error) {
    get('edit-error').textContent = error.message;
    get('edit-error').hidden = false;
  } finally {
    if (button) button.disabled = false;
  }
});

selectInput();
const savedRun = new URLSearchParams(location.search).get('run');
if (savedRun && runIdPattern.test(savedRun)) {
  activeRun = savedRun;
  showProgress();
  get('cancel').hidden = false;
  poll(savedRun);
}
