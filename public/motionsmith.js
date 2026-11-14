const $=s=>document.querySelector(s),make=(tag,text,cls)=>{const el=document.createElement(tag);if(text)el.textContent=text;if(cls)el.className=cls;return el;};
let data,kind='image',limit=36,loadedFonts=new Set();
function rows(){const q=$('#query').value.toLowerCase(),pack=$('#pack').value;let items=kind==='reference'?data.effects:kind==='curve'?data.curves.map(id=>({id,name:id.replace(/^ms-/,'').replaceAll('-',' ')})):data.assets.filter(a=>a.kind===kind&&a.available);return items.filter(a=>(!pack||a.pack===pack)&&(!q||[a.name,a.pack,...(a.tags||[])].join(' ').toLowerCase().includes(q)));}
function filters(){const select=$('#pack');select.replaceChildren(make('option','Все наборы'));select.firstChild.value='';select.hidden=!['image','font'].includes(kind);for(const p of data.packs.filter(p=>p.category===(kind==='font'?'fonts':'resources'))){const o=make('option',p.name);o.value=p.id;select.append(o);}}
function render(){const all=rows(),grid=$('#grid');grid.replaceChildren();
 $('#explanation').textContent=kind==='reference'?'65 рецептов доступны в вашем MotionSmith. Это каталог идей: сложные приёмы с человеком в кадре или видеоматериалом требуют соответствующих исходников и отдельной реализации.':kind==='curve'?'Эти кривые уже доступны автоматическому режиссёру: они задают разгон, замедление и характер движения.':kind==='font'?'Режиссёр проверяет наличие нужных букв и загружает в ролик только выбранные шрифты.':'Все изображения подключены к автоматическому выбору. Режиссёр получает небольшую подборку подходящих материалов для каждой истории.';
 $('#count').textContent=`${all.length} · ${kind==='reference'?'идей в каталоге':kind==='curve'?'кривых подключено':'доступно режиссёру'}`;
 for(const a of all.slice(0,limit)){
  const c=make('article',null,'card');
  if(kind==='image'){const img=make('img',null,'thumb');img.src='/motion-asset/'+encodeURIComponent(a.id);img.alt=a.name;img.loading='lazy';c.append(img);}
  if(kind==='font'){
   const family='Preview_'+a.id.replaceAll('-','_'),s=make('div',a.scripts.cyrillic?'Смысл становится движением':'Ideas become motion', 'sample');s.style.fontFamily=family+',sans-serif';c.append(s);
   if(!loadedFonts.has(a.id)){const face=new FontFace(family,`url(/motion-asset/${encodeURIComponent(a.id)})`);face.load().then(f=>{document.fonts.add(f);loadedFonts.add(a.id);}).catch(()=>{s.textContent='Шрифт недоступен';});}
  }
  c.append(make('h3',a.name));
  if(a.license)c.append(make('p',a.license,'meta'));
  if(kind==='font')c.append(make('span',a.scripts.cyrillic?'Кириллица + Latin':'Latin / другие алфавиты','tag'));
  if(kind==='reference'){c.append(make('p',a.category,'meta'));for(const t of a.tags.slice(0,4))c.append(make('span',t,'tag'));}
  if(kind==='curve')c.append(make('p',a.id.includes('-vox-')?'Редакционный коллаж':'Продуктовая анимация','meta'));
  grid.append(c);
 }
 $('#more').hidden=all.length<=limit;
}
try{const response=await fetch('/api/motionsmith');if(!response.ok)throw Error('Локальная библиотека недоступна');data=await response.json();
 const counts=[[data.packs.length,'наборов'],[data.assets.filter(a=>a.kind==='font'&&a.available).length,'семейств шрифтов'],[data.assets.filter(a=>a.kind==='image'&&a.available).length,'изображений и SVG'],[data.userSounds,'ваших звуков']];
 for(const [n,label] of counts){const box=make('div');box.append(make('b',String(n)),make('span',label));$('#stats').append(box);}
 $('#tabs').onclick=e=>{const b=e.target.closest('[data-kind]');if(!b)return;kind=b.dataset.kind;limit=36;$('#query').value='';document.querySelectorAll('#tabs button').forEach(x=>x.classList.toggle('active',x===b));filters();render();};
 $('#query').oninput=()=>{limit=36;render();};$('#pack').onchange=()=>{limit=36;render();};$('#more').onclick=()=>{limit+=36;render();};filters();render();
}catch(e){$('#count').textContent=e.message;$('#count').className='error';}
