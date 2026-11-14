import {sampleViseme} from './visemes.js';
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const smooth = x => { x = clamp(x); return x*x*(3-2*x); };
const lerp = (a,b,t) => a+(b-a)*t;
export const DEFAULT_CAST = [
  {id:'anna', name:'Анна', color:'#507acc', skin:'#e7b691', hair:'#473a35', shape:'circle'},
  {id:'lev', name:'Лев', color:'#c67553', skin:'#b7795b', hair:'#353035', shape:'triangle'},
  {id:'mira', name:'Мира', color:'#6e8c72', skin:'#efc99c', hair:'#704b37', shape:'square'},
];
export function validateScore(score) {
  if (!score || !Number.isFinite(score.duration) || score.duration <= 0) throw new RangeError('Positive duration required');
  if (!Array.isArray(score.cast) || score.cast.length < 1 || score.cast.length > 3) throw new RangeError('Cast must contain one to three characters');
  const ids = new Set(score.cast.map(c => c.id));
  if (ids.size !== score.cast.length || score.cast.some(c => typeof c.id !== 'string' || !c.id || typeof c.name !== 'string' || !c.name)) throw new TypeError('Unique character ids and names required');
  if (!Array.isArray(score.turns)) throw new TypeError('Turns required');
  for (const turn of score.turns) {
    if (!ids.has(turn.speaker) || !Number.isFinite(turn.start) || !Number.isFinite(turn.end)
      || turn.start < 0 || turn.end <= turn.start || turn.end > score.duration + 1e-8) throw new RangeError('Invalid speaker turn');
  }
  return score;
}
export function assignTurn(score, {speaker, start, end, overlap = false}) {
  validateScore(score);
  const replacement = {speaker, start, end};
  validateScore({...score, turns:[replacement]});
  const turns = overlap ? [...score.turns] : score.turns.flatMap(turn => {
    if (turn.end <= start || turn.start >= end) return [turn];
    return [...(turn.start < start ? [{...turn,end:start}] : []), ...(turn.end > end ? [{...turn,start:end}] : [])];
  });
  turns.push(replacement); turns.sort((a,b) => a.start-b.start || a.end-b.end);
  let speech=score.speech;
  if(speech){
    const tracks=Object.fromEntries(score.cast.map(p=>[p.id,[]]));
    for(const [id,track]of Object.entries(speech.tracks))for(const phone of track){
      if(phone.end<=start||phone.start>=end){tracks[id].push(phone);continue;}
      if(overlap&&id!==speaker)tracks[id].push(phone);
      else{
        if(phone.start<start)tracks[id].push({...phone,end:start});
        if(phone.end>end)tracks[id].push({...phone,start:end});
      }
      tracks[speaker].push({...phone,speaker,start:Math.max(start,phone.start),end:Math.min(end,phone.end)});
    }
    for(const track of Object.values(tracks))track.sort((a,b)=>a.start-b.start||a.end-b.end);
    speech={...speech,tracks};
  }
  return {...score, turns,...(speech?{speech}: {})};
}
export function planCamera(score) {
  validateScore(score);
  const boundaries = [...new Set([0, ...score.turns.flatMap(t => [t.start, t.end, ...(t.end-t.start>4 ? [t.start+2] : [])])])].sort((a,b) => a-b);
  const shots = [{at:0, kind:'wide', subject:null}];
  let previous = 'wide';
  for (let i = 0; i < boundaries.length; i++) {
    const at = boundaries[i], end = boundaries[i+1] ?? score.duration;
    if (end-at < .8) continue;
    const active = score.turns.filter(t => t.start <= at && t.end > at);
    const subject = active.length === 1 ? active[0].speaker : null;
    const kind = subject && at >= 1.7 ? 'speaker' : 'wide';
    const key = kind === 'wide' ? 'wide' : subject;
    const minimum = active.length > 1 ? .85 : 1.4;
    if (key !== previous && at - shots[shots.length-1].at >= minimum) {
      shots.push({at, kind, subject}); previous = key;
    }
  }
  return shots;
}
export function castPosition(index, count) {
  if (count === 1) return 800;
  if (count === 2) return 800 + (index ? 330 : -330);
  return 800 + (index-1)*440;
}
export function sampleScene(score, time, {level = 0, demonstration = false, camera = 'auto', shots = planCamera(score)} = {}) {
  if(!Number.isFinite(time)||!Number.isFinite(level))throw new TypeError('Finite scene time and audio level required');
  const t = clamp(time, 0, score.duration), active = score.turns.filter(turn => turn.start <= t && turn.end > t);
  const lead = active[active.length-1]?.speaker ?? null;
  const characters = score.cast.map((person, i) => {
    const turn = active.find(turn => turn.speaker === person.id), speaking = !!turn;
    const edge = turn ? smooth((t-turn.start)/.16)*smooth((turn.end-t)/.16) : 0;
    const articulation = demonstration ? (.25+.75*Math.abs(Math.sin(t*11+i)*Math.cos(t*4.6))) : level;
    // Demonstration movement is visibly labelled; real audio uses only its measured level.
    const viseme=score.speech&&!demonstration?sampleViseme(score.speech.tracks?.[person.id],t,level):null;
    const mouth = speaking ? (viseme?viseme.open:clamp(articulation))*edge : 0;
    const gesture = speaking ? Math.sin((t-(turn?.start ?? 0))*2.5)*edge*Math.min(1,articulation*2) : 0;
    const blinkPhase = ((t + i*1.7) % 4.9);
    return {...person, x:castPosition(i,score.cast.length), speaking, mouth, viseme,gesture,
      blink:blinkPhase > 4.70 ? Math.sin((blinkPhase-4.70)/.20*Math.PI) : 0,
      breathe:Math.sin(t*1.55+i*.8), nod:Math.sin(t*2.3+i)* (speaking ? .6 : .12),
      gaze:lead && lead!==person.id ? Math.sign(castPosition(score.cast.findIndex(p=>p.id===lead),score.cast.length)-castPosition(i,score.cast.length)) : 0};
  });
  function shotPose(shot) {
    const index = score.cast.findIndex(p => p.id===shot.subject);
    return shot.kind==='wide' || index<0 ? {x:800,y:450,zoom:1} : {x:castPosition(index,score.cast.length),y:455,zoom:1.42};
  }
  let lens = {x:800,y:450,zoom:1};
  if (camera !== 'wide') {
    if (camera !== 'auto') lens = shotPose({kind:'speaker',subject:camera});
    else {
      const index = Math.max(0, shots.findLastIndex(s=>s.at<=t)), shot = shots[index];
      const from = shotPose(shots[Math.max(0,index-1)]), to=shotPose(shot), p=smooth((t-shot.at)/.85);
      lens={x:lerp(from.x,to.x,p),y:lerp(from.y,to.y,p),zoom:lerp(from.zoom,to.zoom,p)};
    }
  }
  return {time:t, characters, camera:lens, lead};
}
export function demoScore() {
  return {duration:18, cast:DEFAULT_CAST.map(p=>({...p})), turns:[
    {speaker:'anna',start:.15,end:3.8}, {speaker:'lev',start:4.15,end:7.7},
    {speaker:'mira',start:8,end:11.9}, {speaker:'anna',start:12.25,end:15.2},
    {speaker:'lev',start:15.45,end:17.7},
  ]};
}
