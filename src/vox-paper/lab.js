import * as THREE from '/azerbaijan-startups-vox/paper-transitions-demo/node_modules/three/build/three.module.js';
import {createPaperStage, PAPER_TECHNIQUES, technique,VOX_LOOKS,voxLook} from './index.js';
import {loadPaperAssets, makePaperPrints} from './print.js';
import {clamp, phase} from './math.js';

const query = new URLSearchParams(location.search), capture = query.has('capture');
if (capture) document.documentElement.classList.add('capture');
const assets = await loadPaperAssets(), canvas = document.querySelector('#paper');
const width = Number(query.get('width')) || 1280, height = Math.round(width * 9 / 16);
const status = document.querySelector('#status'), title = document.querySelector('#title'), purpose = document.querySelector('#purpose');
const scrub = document.querySelector('#scrub'), play = document.querySelector('#play');
let stage, prints, selected, action, progress = 0, playing = false, showcase = false, reverse = false, last = 0, showTime = 0;
let look=voxLook(query.get('look')||'paper');
for(const value of VOX_LOOKS){
  const button=document.createElement('button');button.type='button';button.dataset.look=value.id;button.setAttribute('aria-pressed',String(look.id===value.id));
  const swatches=document.createElement('span');swatches.className='look-swatches';swatches.setAttribute('aria-hidden','true');
  for(const color of value.colors){const swatch=document.createElement('i');swatch.style.background=color;swatches.append(swatch);}
  const name=document.createElement('strong'),detail=document.createElement('small');name.textContent=value.name;detail.textContent=value.detail;button.append(swatches,name,detail);
  button.onclick=()=>selectLook(value.id);document.querySelector('#looks').append(button);
}
const familyNames = {sheet:'Живой лист', fold:'Сгибы и раскрытие', tear:'Отрыв и разделение', cut:'Вырезы', type:'Текст на бумаге', collage:'Вырезки и коллаж', detail:'Бумажные крепления', print:'Печать и выделение'};
const nav = document.querySelector('nav');
for (const item of PAPER_TECHNIQUES) {
  const button = document.createElement('button'); button.textContent = item.name; button.dataset.id = item.id;
  button.onclick = () => { showcase = false; reverse = false; document.querySelector('#reverse').textContent = 'Обратный ход'; select(item.id); progress = 0; playing = true; };
  nav.append(button);
}
function select(id) {
  selected = technique(id); progress = 0;
  prints = makePaperPrints(id, assets,11,look.id);
  // One renderer/context for the lifetime of the lab, even when cycling the catalogue.
  if (!stage) stage = createPaperStage({THREE, canvas, width, height, ...prints});
  else for (const key of ['before', 'after', 'back', 'scrap', 'replacement', 'tape', 'stamp']) stage.updateTexture(key, prints[key]);
  action = {technique: id, start: 0, duration: selected.duration};
  if (id === 'marker') action.region = prints.markerRegion??[-6.22, -.74, -6.22 + (prints.headlineMetrics.width + 16) / 1600 * 14.4, .43];
  stage.setAction(action);
  title.textContent = selected.name; purpose.textContent = selected.purpose;
  document.querySelector('#family').textContent = familyNames[selected.family];
  for (const button of nav.children) button.setAttribute('aria-current', String(button.dataset.id === id));
  render(0);
}
function selectLook(id){
  look=voxLook(id);const saved=progress;select(selected?.id||'page-turn');render(saved);
  for(const button of document.querySelectorAll('[data-look]'))button.setAttribute('aria-pressed',String(button.dataset.look===look.id));
  document.querySelector('#look-description').textContent=look.description;
  if(!capture){const url=new URL(location.href);url.searchParams.set('look',look.id);history.replaceState(null,'',url);}
}
function render(p) {
  progress = clamp(p); scrub.value = progress;
  stage.render(progress * action.duration);
  return stage.inspect();
}
const total = PAPER_TECHNIQUES.reduce((sum, item) => sum + item.duration, 0);
function renderShowcase(time) {
  let remaining = clamp(time, 0, total - .00001), item;
  for (const current of PAPER_TECHNIQUES) {
    item = current;
    if (remaining < current.duration) break;
    remaining -= current.duration;
  }
  if (selected.id !== item.id) select(item.id);
  let p = remaining / item.duration;
  // The folding study includes reopening, using the very same geometry in reverse.
  if (item.family === 'fold' || ['roll', 'scroll'].includes(item.id)) p = p < .5 ? phase(p, .04, .44) : 1 - phase(p, .56, .96);
  return render(p);
}
play.onclick = () => {
  playing = !playing;
  if (playing && (reverse ? progress <= 0 : progress >= 1)) progress = reverse ? 1 : 0;
  play.textContent = playing ? 'Пауза' : 'Воспроизвести';
};
scrub.oninput = () => { playing = false; showcase = false; play.textContent = 'Воспроизвести'; render(Number(scrub.value)); };
document.querySelector('#reverse').onclick = () => {
  showcase = false; reverse = !reverse; playing = true;
  document.querySelector('#reverse').textContent = reverse ? 'Прямой ход' : 'Обратный ход';
  if (progress <= 0 && reverse) progress = 1;
  if (progress >= 1 && !reverse) progress = 0;
};
document.querySelector('#showcase').onclick = () => { showTime = 0; showcase = true; playing = true; reverse = false; document.querySelector('#reverse').textContent = 'Обратный ход'; play.textContent = 'Пауза'; };
select(query.get('technique') || 'page-turn');
document.querySelector('#look-description').textContent=look.description;
window.paperLab = {select,selectLook,looks:VOX_LOOKS,render,renderShowcase,catalog:PAPER_TECHNIQUES,duration:total,inspect:()=>({...stage.inspect(),look:look.id,progress}),dispose:()=>stage.dispose()};
window.__ready = true;
status.textContent = 'Материал готов. Можно воспроизводить и перематывать.';
function tick(now) {
  const dt = last ? Math.min(.08, (now - last) / 1000) : 0; last = now;
  if (playing && !capture) {
    if (showcase) { showTime += dt; renderShowcase(showTime); if (showTime >= total) playing = false; }
    else { render(progress + dt / action.duration * (reverse ? -1 : 1)); if (progress >= 1 || progress <= 0) playing = false; }
    play.textContent = playing ? 'Пауза' : 'Воспроизвести';
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
