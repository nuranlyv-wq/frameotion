// Parse the public creation form into the existing KADR request contract.
export function creationRequest(body) {
  if (!['url','prompt'].includes(body?.mode) || typeof body.input !== 'string' || !body.input.trim()) {
    throw new Error('Вставьте ссылку или опишите ролик.');
  }
  const input = body.input.trim();
  const selectedLanguage = ['ru','az','en'].includes(body.language) ? body.language : null;
  const pace = body.pace ?? 'dynamic';
  if (!['calm','dynamic','superdynamic'].includes(pace)) throw new Error('Выберите доступный ритм ролика.');
  const settings = {engine:'kadr-launch',seconds:15,format:'landscape',launchPace:pace,language:selectedLanguage || 'ru'};
  if (body.mode === 'prompt') {
    if (input.length > 3200) throw new Error('Сократите описание до 3200 знаков.');
    const language = selectedLanguage || (/[А-Яа-яЁё]/u.test(input) ? 'ru' : /[əğışöüç]/iu.test(input) ? 'az' : 'en');
    return {...settings,language,description:input,brief:input.slice(0,1600)};
  }
  let url;
  try { url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(input) ? input : `https://${input}`); }
  catch { throw new Error('Укажите действительную ссылку на сайт.'); }
  if (!['http:','https:'].includes(url.protocol) || url.username || url.password || !url.hostname.includes('.') || url.href.length > 2048) {
    throw new Error('Укажите действительную ссылку на сайт.');
  }
  return {...settings,url:url.href};
}
