import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// Reservations are conservative application-side estimates, not a provider billing cap.
export function createDailyBudget(directory, {limitCents, reservationCents=100, timeZone='Asia/Baku', now=()=>Date.now()}={}) {
  if (!Number.isSafeInteger(limitCents) || limitCents <= 0 || !Number.isSafeInteger(reservationCents) || reservationCents <= 0 || reservationCents > limitCents) throw new Error('Некорректный дневной бюджет.');
  const file=path.join(directory,'daily-budget.json'); fs.mkdirSync(directory,{recursive:true,mode:0o700});
  let data=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{reservations:[]};
  if(!Array.isArray(data.reservations)) throw new Error('Некорректный журнал дневного бюджета.');
  let queue=Promise.resolve();
  const date=()=>new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now()));
  const save=()=>{const tmp=`${file}.${process.pid}.tmp`;fs.writeFileSync(tmp,JSON.stringify(data),{mode:0o600});fs.renameSync(tmp,file);};
  return {
    reserve(){const next=queue.then(()=>{const today=date(); const used=data.reservations.filter(r=>r.day===today).reduce((sum,r)=>sum+r.cents,0);if(used+reservationCents>limitCents)throw new Error('Дневной лимит генераций исчерпан. Попробуйте завтра.');const item={id:crypto.randomUUID(),day:today,cents:reservationCents};data.reservations.push(item);save();return item.id;});queue=next.catch(()=>{});return next;},
    release(id){const next=queue.then(()=>{data.reservations=data.reservations.filter(r=>r.id!==id);save();});queue=next.catch(()=>{});return next;},
  };
}
