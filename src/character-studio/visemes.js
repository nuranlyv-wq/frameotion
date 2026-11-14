const clamp=v=>Math.max(0,Math.min(1,v));
const smooth=v=>{v=clamp(v);return v*v*(3-2*v);};
export const MOUTH_SHAPES=Object.freeze({
  rest:{open:0,width:.8,round:0,teeth:0,tongue:0},
  closed:{open:0,width:1,round:0,teeth:0,tongue:0},
  labiodental:{open:.16,width:1.05,round:0,teeth:1,tongue:0},
  dental:{open:.26,width:1.08,round:0,teeth:.65,tongue:.8},
  alveolar:{open:.30,width:1.04,round:0,teeth:.45,tongue:.75},
  postalveolar:{open:.31,width:.8,round:.55,teeth:.35,tongue:0},
  open:{open:.95,width:1.05,round:.05,teeth:.15,tongue:.25},
  wide:{open:.48,width:1.3,round:0,teeth:.65,tongue:.1},
  round:{open:.62,width:.78,round:.9,teeth:0,tongue:0},
  pucker:{open:.32,width:.56,round:1,teeth:0,tongue:0},
  consonant:{open:.36,width:.94,round:0,teeth:.1,tongue:0},
});
export function phoneToViseme(phone){
  const p=String(phone).normalize('NFD').replace(/[\u0300-\u036fːˑʲʰʼˈˌ]/gu,'');
  if(!p||/^<|^sil$|^sp$/u.test(p))return 'rest';
  if(/^[pbmɓɱ]/u.test(p))return 'closed';
  if(/^[fvɸβʋ]/u.test(p))return 'labiodental';
  if(/^[θð]/u.test(p))return 'dental';
  if(/^(tʃ|dʒ|ʃ|ʒ|ɕ|ʑ|tɕ|dʑ)/u.test(p))return 'postalveolar';
  if(/^[uʊywɥʉ]/u.test(p))return 'pucker';
  if(/^[oɔœøɒ]/u.test(p))return 'round';
  if(/^[aɑɐæɜɞ]/u.test(p))return 'open';
  if(/^[iɪeɛɨɯɤəɚɝ]/u.test(p))return 'wide';
  if(/^[tdnlszɾrɹɺɽɻɳɲʎ]/u.test(p))return 'alveolar';
  return 'consonant';
}
export function sampleViseme(track,time,level=1){
  if(!Number.isFinite(time))throw new TypeError('Finite articulation time required');
  if(!track?.length)return {kind:'rest',...MOUTH_SHAPES.rest,confidence:0};
  let low=0,high=track.length;
  while(low<high){const mid=(low+high)>>1;if(track[mid].start<=time)low=mid+1;else high=mid;}
  const index=low-1,event=track[index];
  if(!event||time>=event.end)return {kind:'rest',...MOUTH_SHAPES.rest,confidence:0};
  const kind=event.viseme??phoneToViseme(event.phone),target=MOUTH_SHAPES[kind]??MOUTH_SHAPES.rest;
  const result={kind,...target,confidence:event.confidence??1,phone:event.phone};
  const next=track[index+1],nextKind=next?.viseme??phoneToViseme(next?.phone??'');
  // Preserve complete bilabial closure. Other shapes anticipate a neighbouring phone slightly.
  if(kind!=='closed'&&next&&next.start-event.end<.035&&nextKind!=='closed'){
    const p=smooth((time-(event.end-.035))/.035)*.6,other=MOUTH_SHAPES[nextKind]??MOUTH_SHAPES.rest;
    for(const key of ['open','width','round','teeth','tongue'])result[key]+=(other[key]-result[key])*p;
  }
  const loudness=clamp(level);
  // Phonetic geometry remains primary; measured energy only changes articulation strength.
  result.open*=loudness<.025?0:.65+.35*Math.sqrt(loudness);
  return result;
}
export function applySpeechResult(score,result){
  if(!result||!Array.isArray(result.turns)||!Array.isArray(result.phones)||!Array.isArray(result.speakers))throw new TypeError('Invalid speech analysis result');
  if(result.speakers.length>score.cast.length)throw new RangeError('The analysis contains more speakers than the available cast');
  const cast=result.speakers.length?score.cast.slice(0,result.speakers.length):score.cast;
  const assignment=new Map(result.speakers.map((speaker,i)=>[speaker.id,cast[i].id]));
  const duration=score.duration,tracks=Object.fromEntries(cast.map(person=>[person.id,[]]));
  const validRange=e=>Number.isFinite(e.start)&&Number.isFinite(e.end)&&e.start>=0&&e.end>e.start&&e.end<=duration+.1;
  const turns=result.turns.map(turn=>{
    const speaker=assignment.get(turn.speaker);if(!speaker||!validRange(turn))throw new RangeError('Invalid detected speaker interval');
    return {speaker,start:turn.start,end:Math.min(duration,turn.end)};
  });
  for(const event of result.phones){
    const speaker=assignment.get(event.speaker);if(!speaker||!validRange(event)||typeof event.phone!=='string')throw new RangeError('Invalid phonetic interval');
    tracks[speaker].push({...event,end:Math.min(duration,event.end),speaker,viseme:phoneToViseme(event.phone)});
  }
  for(const track of Object.values(tracks))track.sort((a,b)=>a.start-b.start||a.end-b.end);
  return {...score,cast,turns,speech:{tracks,speakers:result.speakers.map((s,i)=>({...s,character:cast[i].id})),
    engine:result.engine,warnings:result.warnings??[],timing:'acoustic-ctc'}};
}
