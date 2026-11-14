export const POSES=['idle','walk','reach','carry','point','listen','think','celebrate'];
export const ROLES=['paper','ink','soft','accent','support','skin','none'];
export const COLORS=['red','orange','yellow','green','blue','purple','pink','brown','black','white','gray'];
const ANCHORS=['origin','hand-right','hand-left','head','foot'];
const number=(min,max)=>({type:'number',minimum:min,maximum:max});
const text=(max=160)=>({type:'string',maxLength:max});
const obj=(properties,required=Object.keys(properties))=>({type:'object',properties,required,additionalProperties:false});
const array=(items,maxItems=80)=>({type:'array',items,maxItems});
const key=obj({at:number(0,1800),word:text(30),x:number(-1600,3200),y:number(-900,1800),w:number(.1,3200),h:number(.1,2000),rotation:number(-720,720),opacity:number(0,1),pose:{enum:POSES},reveal:number(0,1),parent:text(60),anchor:{enum:['origin','hand-right','hand-left','head','foot']}},['at']);
const part=obj({id:text(50),parent:text(50),kind:{enum:['group','rect','ellipse','path','text']},x:number(-200,300),y:number(-200,300),w:number(.1,400),h:number(.1,400),rotation:number(-360,360),pivotX:number(-100,200),pivotY:number(-100,200),
  fill:{enum:ROLES},stroke:{enum:ROLES},strokeWidth:number(.1,8),d:text(4000),text:text(70),radius:number(0,50),color:{enum:COLORS}},['id','parent','kind','x','y','w','h','fill','stroke']);
const entity=obj({id:text(60),label:text(90),kind:{enum:['character','prop']},appearance:{type:'integer',minimum:0,maximum:6},voice:text(40),evidence:array(text(40),12),parts:array(part,32),outfit:{enum:COLORS}},['id','label','kind','appearance','voice','evidence','parts']);
const node=obj({id:text(60),entity:text(60),parent:text(60),anchor:{enum:['origin','hand-right','hand-left','head','foot']},x:number(-1600,3200),y:number(-900,1800),w:number(.1,3200),h:number(.1,1800),rotation:number(-720,720),opacity:number(0,1),pose:{enum:POSES},lookAt:text(60),keys:array(key,24),parts:array(obj({target:text(50),keys:array(key,16)}),12)},['id','entity','parent','anchor','x','y','w','h','rotation','opacity','pose','lookAt','keys','parts']);
const scene=obj({id:text(60),startWord:text(40),sourceSegments:array(text(40),14),quote:text(600),title:text(70),action:text(260),nodes:array(node,30),camera:array(obj({at:number(0,1800),word:text(40),x:number(-1600,3200),y:number(-900,1800),zoom:number(.55,2.8)},['at','x','y','zoom']),12),transition:obj({kind:{enum:['cut','pan','match','wipe']},duration:number(0,1.2),anchor:text(60),direction:{enum:['left','right']}})},['id','startWord','sourceSegments','quote','title','action','nodes','camera','transition']);
export const STORY_SCHEMA=obj({version:{const:1},title:text(100),summary:text(450),entities:array(entity,35),scenes:array(scene,16)});
export class StoryError extends Error{constructor(issues){super(issues.join('; '));this.name='StoryError';this.issues=issues;}}
const finite=(v,min,max)=>Number.isFinite(v)&&v>=min&&v<=max;
const norm=s=>String(s??'').toLocaleLowerCase().replace(/[\s\p{P}]+/gu,' ').trim();
const validId=s=>typeof s==='string'&&/^[a-zA-Z][a-zA-Z0-9_-]{0,59}$/.test(s);
function checkTree(items,label,issues){
  const ids=new Set(items.map(i=>i.id));
  for(const item of items){
    if(item.parent&&!ids.has(item.parent))issues.push(`${label}/${item.id}: unknown parent`);
    let current=item,seen=new Set();
    while(current?.parent){if(seen.has(current.id)){issues.push(`${label}/${item.id}: parent cycle`);break;}seen.add(current.id);current=items.find(i=>i.id===current.parent);}
  }
}
export function validateStoryWindow(value,{transcript,start=0,end,existingEntities=[],priorScene=null}={}){
  const issues=[],check=(ok,message)=>{if(!ok)issues.push(message);};
  if(!value||!Array.isArray(value.entities)||!Array.isArray(value.scenes))throw new StoryError(['Story must contain entities and scenes']);
  const segments=new Map(transcript.segments.map(s=>[s.id,s])),words=new Map(transcript.words.map(w=>[w.id,w]));
  const voices=new Set(transcript.segments.map(s=>s.speaker).filter(Boolean)),entityMap=new Map(existingEntities.map(e=>[e.id,e]));
  check(value.version===1,'Unsupported story version');check(typeof value.title==='string'&&value.title.length<=100,'Invalid title');
  check(value.entities.length<=35,'Too many entities');check(value.scenes.length>0&&value.scenes.length<=16,'Use one to sixteen scenes per window');
  const addIds=new Set();
  for(const e of value.entities){
    check(validId(e.id)&&!addIds.has(e.id),`Invalid/duplicate entity ${e.id}`);addIds.add(e.id);
    check(['character','prop'].includes(e.kind),`${e.id}: invalid kind`);
    check(Number.isInteger(e.appearance)&&e.appearance>=0&&e.appearance<=6,`${e.id}: invalid appearance`);
    check(!e.voice||voices.has(e.voice),`${e.id}: voice must exist in the audio`);
    check(e.outfit===undefined||COLORS.includes(e.outfit),`${e.id}: invalid outfit color`);
    check(Array.isArray(e.evidence)&&e.evidence.length>0&&e.evidence.every(id=>segments.has(id)),`${e.id}: evidence must reference transcript segments`);
    if(entityMap.has(e.id)){check(JSON.stringify(entityMap.get(e.id))===JSON.stringify(e),`${e.id}: reuse existing entity without changing its drawing`);continue;}
    check(Array.isArray(e.parts)&&e.parts.length<=32,`${e.id}: invalid parts`);
    if(e.kind==='prop')check(e.parts?.length>0,`${e.id}: a prop needs actual vector geometry`);
    const parts=e.parts??[],partIds=new Set();
    for(const p of parts){
      check(validId(p.id)&&!partIds.has(p.id),`${e.id}: invalid/duplicate part id`);partIds.add(p.id);
      check(['group','rect','ellipse','path','text'].includes(p.kind),`${e.id}/${p.id}: invalid geometry`);
      for(const f of ['x','y'])check(finite(p[f],-200,300),`${e.id}/${p.id}: invalid ${f}`);
      for(const f of ['w','h'])check(finite(p[f],.1,400),`${e.id}/${p.id}: invalid ${f}`);
      check(ROLES.includes(p.fill)&&ROLES.includes(p.stroke),`${e.id}/${p.id}: invalid material role`);
      check(p.color===undefined||COLORS.includes(p.color),`${e.id}/${p.id}: invalid color`);
      if(p.kind==='path')check(typeof p.d==='string'&&p.d.length<=4000&&/^[MmLlHhVvCcSsQqTtAaZz\d\s.,+eE-]+$/.test(p.d),`${e.id}/${p.id}: invalid SVG path`);
      if(p.kind==='text'){
        check(typeof p.text==='string'&&p.text.trim().length>0&&p.text.length<=70,`${e.id}/${p.id}: invalid text`);
        check(norm(transcript.text).includes(norm(p.text)),`${e.id}/${p.id}: on-screen text must occur in the transcript`);
      }
    }
    checkTree(parts,e.id,issues);entityMap.set(e.id,e);
  }
  let lastStart=start,previous=priorScene;
  const compiled=[];
  for(let i=0;i<value.scenes.length;i++){
    const s=value.scenes[i],word=words.get(s.startWord),sceneStart=i===0?start:word?.start;
    check(validId(s.id),`Invalid scene id ${s.id}`);
    check(!!word&&word.start>=start-.05&&word.start<end,`${s.id}: startWord must reference a word in this audio window`);
    check(finite(sceneStart,start,end)&&(!i||sceneStart>lastStart+.25),`${s.id}: scene starts must be ordered and separated`);lastStart=sceneStart;
    const source=(s.sourceSegments??[]).map(id=>segments.get(id));
    check(source.length>0&&source.every(item=>item&&item.start<end&&item.end>start),`${s.id}: missing source segments in this audio window`);
    check(typeof s.quote==='string'&&norm(s.quote).length>0&&norm(source.filter(Boolean).map(s=>s.text).join(' ')).includes(norm(s.quote)),`${s.id}: quote must be an exact excerpt of its source`);
    check(typeof s.action==='string'&&s.action.trim().length>=8,`${s.id}: explain a concrete visible action`);
    const nodes=s.nodes??[],ids=new Set();
    check(nodes.length>0&&nodes.length<=30,`${s.id}: one to thirty nodes required`);
    for(const n of nodes){
      check(validId(n.id)&&!ids.has(n.id),`${s.id}: invalid/duplicate node id`);ids.add(n.id);
      check(entityMap.has(n.entity),`${s.id}/${n.id}: unknown entity`);
      for(const f of ['x','y'])check(finite(n[f],f==='x'?-1600:-900,f==='x'?3200:1800),`${s.id}/${n.id}: invalid ${f}`);
      for(const f of ['w','h'])check(finite(n[f],.1,f==='w'?3200:1800),`${s.id}/${n.id}: invalid ${f}`);
      check(finite(n.opacity,0,1)&&finite(n.rotation,-720,720)&&POSES.includes(n.pose),`${s.id}/${n.id}: invalid pose`);
      check(ANCHORS.includes(n.anchor),`${s.id}/${n.id}: invalid attachment anchor`);
      const allTracks=[n.keys??[],...(n.parts??[]).map(p=>p.keys??[])];
      for(const track of allTracks){
        let prior=-1;
        for(const k of track){
          const at=k.word?words.get(k.word)?.start:k.at;
          check(finite(at,sceneStart-.05,end)&&at>=prior,`${s.id}/${n.id}: keys must have valid ordered audio times`);prior=at;
          for(const f of ['x','y','w','h','rotation','opacity','reveal'])if(k[f]!==undefined)check(Number.isFinite(k[f]),`${s.id}/${n.id}: invalid key ${f}`);
          if(k.opacity!==undefined)check(finite(k.opacity,0,1),`${s.id}/${n.id}: key opacity out of range`);
          if(k.reveal!==undefined)check(finite(k.reveal,0,1),`${s.id}/${n.id}: key reveal out of range`);
          for(const f of ['w','h'])if(k[f]!==undefined)check(finite(k[f],.1,3200),`${s.id}/${n.id}: key size out of range`);
          if(k.pose!==undefined)check(POSES.includes(k.pose),`${s.id}/${n.id}: invalid key pose`);
          if(k.anchor!==undefined)check(ANCHORS.includes(k.anchor),`${s.id}/${n.id}: invalid key anchor`);
        }
      }
      const entity=entityMap.get(n.entity);
      for(const track of n.parts??[])check(entity?.parts?.some(p=>p.id===track.target),`${s.id}/${n.id}: unknown animated part`);
      const partTimes=(n.parts??[]).flatMap(p=>(p.keys??[]).map(k=>k.word?words.get(k.word)?.start:k.at)).filter(Number.isFinite);
      for(const at of new Set(partTimes)){
        const animatedParts=(entity?.parts??[]).map(p=>({...p,parent:(n.parts?.find(t=>t.target===p.id)?.keys??[]).filter(k=>(k.word?words.get(k.word)?.start:k.at)<=at&&k.parent!==undefined).at(-1)?.parent??p.parent}));
        checkTree(animatedParts,`${s.id}/${n.id}/parts`,issues);
      }
    }
    checkTree(nodes,s.id,issues);
    for(const at of [...new Set(nodes.flatMap(n=>(n.keys??[]).map(k=>k.word?words.get(k.word)?.start:k.at)))].filter(Number.isFinite)){
      const parents=nodes.map(n=>({...n,parent:(n.keys??[]).filter(k=>(k.word?words.get(k.word)?.start:k.at)<=at&&k.parent!==undefined).at(-1)?.parent??n.parent}));
      checkTree(parents,s.id,issues);
    }
    for(const n of nodes){if(n.lookAt)check(ids.has(n.lookAt),`${s.id}/${n.id}: lookAt target missing`);if(n.parent&&n.anchor!=='origin')check(entityMap.get(nodes.find(p=>p.id===n.parent)?.entity)?.kind==='character',`${s.id}/${n.id}: hand/head anchor requires a character parent`);}
    check(Array.isArray(s.camera)&&s.camera.length>0,`${s.id}: camera required`);
    let cameraAt=-1;for(const k of s.camera??[]){const at=k.word?words.get(k.word)?.start:k.at;check(finite(at,sceneStart-.05,end)&&at>=cameraAt&&finite(k.x,-1600,3200)&&finite(k.y,-900,1800)&&finite(k.zoom,.55,2.8),`${s.id}: invalid camera`);cameraAt=at;}
    check(['cut','pan','match','wipe'].includes(s.transition?.kind),`${s.id}: invalid transition`);
    check(finite(s.transition?.duration,0,1.2),`${s.id}: invalid transition time`);
    if(s.transition?.kind==='match'){
      const current=nodes.find(n=>n.id===s.transition.anchor),old=previous?.nodes?.find(n=>n.id===s.transition.anchor);
      check(!!current&&!!old&&current.entity===old.entity,`${s.id}: match transition must carry the same object/character`);
    }
    const resolve=keys=>(keys??[]).map(k=>({...k,at:k.word?words.get(k.word)?.start:k.at}));
    compiled.push({...s,start:sceneStart,nodes:nodes.map(n=>({...n,keys:resolve(n.keys),parts:(n.parts??[]).map(p=>({...p,keys:resolve(p.keys)}))})),camera:resolve(s.camera)});previous=s;
  }
  if(issues.length)throw new StoryError(issues.slice(0,24));
  const scenes=compiled.map((s,i)=>({...s,end:compiled[i+1]?.start??end}));
  for(const s of scenes)for(const n of s.nodes)for(const track of [n.keys,...n.parts.map(p=>p.keys)])for(const key of track)if(key.at>s.end+.02)throw new StoryError([`${s.id}/${n.id}: action extends past the next scene; land it before the handoff`]);
  return {entities:[...entityMap.values()],scenes,title:value.title,summary:value.summary};
}
