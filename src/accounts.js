import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
export function createAccountStore(directory) {
  const file = path.join(directory, 'accounts.json');
  fs.mkdirSync(directory, {recursive:true, mode:0o700});
  let data = {users:[], sessions:[], generations:[]};
  if (fs.existsSync(file)) data = JSON.parse(fs.readFileSync(file, 'utf8'));
  let queue = Promise.resolve();
  const save = () => { const tmp = `${file}.${process.pid}.tmp`; fs.writeFileSync(tmp, JSON.stringify(data), {mode:0o600}); fs.renameSync(tmp,file); };
  const mutate = fn => { const result = queue.then(async () => { const value = await fn(); save(); return value; }); queue = result.catch(() => {}); return result; };
  const cleanEmail = value => String(value || '').trim().toLowerCase();
  const validPassword = value => typeof value === 'string' && value.length >= 10 && Buffer.byteLength(value) <= 256;
  const hashPassword = async password => { const salt=crypto.randomBytes(16).toString('hex'); return `${salt}:${(await scrypt(password,salt,64)).toString('hex')}`; };
  const checkPassword = async (password, stored) => { if(typeof password!=='string'||Buffer.byteLength(password)>256) return false; const [salt,hash]=stored.split(':'); const actual=await scrypt(password,salt,64); const expected=Buffer.from(hash,'hex'); return expected.length===actual.length && crypto.timingSafeEqual(actual,expected); };
  const publicUser = u => ({id:u.id,email:u.email,name:u.name,createdAt:u.createdAt});
  const tokenHash = token => crypto.createHash('sha256').update(token).digest('hex');
  function newSession(user) { const token=crypto.randomBytes(32).toString('base64url'); data.sessions=data.sessions.filter(s=>s.expiresAt>Date.now()); data.sessions.push({tokenHash:tokenHash(token),userId:user.id,expiresAt:Date.now()+SESSION_MS}); return token; }
  return {
    async register({email,name,password}) { return mutate(async()=> { email=cleanEmail(email); name=String(name||'').trim(); if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254) throw new Error('Укажите корректный email.'); if(name.length<2||name.length>60) throw new Error('Имя должно содержать от 2 до 60 символов.'); if(!validPassword(password)) throw new Error('Пароль должен содержать не менее 10 символов.'); if(data.users.some(u=>u.email===email)) throw new Error('Не удалось создать аккаунт. Проверьте данные или войдите.'); const user={id:crypto.randomUUID(),email,name,passwordHash:await hashPassword(password),createdAt:Date.now()}; data.users.push(user); return {user:publicUser(user),token:newSession(user)}; }); },
    async login({email,password}) { return mutate(async()=> { const user=data.users.find(u=>u.email===cleanEmail(email)); if(!user || !await checkPassword(password,user.passwordHash)) throw new Error('Неверный email или пароль.'); return {user:publicUser(user),token:newSession(user)}; }); },
    getUser(token) { if(!token) return null; const session=data.sessions.find(s=>s.tokenHash===tokenHash(token)&&s.expiresAt>Date.now()); const user=session&&data.users.find(u=>u.id===session.userId); return user?publicUser(user):null; },
    async logout(token) { return mutate(()=> { if(token) data.sessions=data.sessions.filter(s=>s.tokenHash!==tokenHash(token)); }); },
    async updateName(id,name) { return mutate(()=> { name=String(name||'').trim(); if(name.length<2||name.length>60) throw new Error('Имя должно содержать от 2 до 60 символов.'); const user=data.users.find(u=>u.id===id); if(!user) throw new Error('Аккаунт не найден.'); user.name=name; return publicUser(user); }); },
    async updatePassword(id,current,password,token) { return mutate(async()=> { const user=data.users.find(u=>u.id===id); if(!user||!await checkPassword(current,user.passwordHash)) throw new Error('Текущий пароль указан неверно.'); if(!validPassword(password)) throw new Error('Новый пароль должен содержать не менее 10 символов.'); user.passwordHash=await hashPassword(password); data.sessions=data.sessions.filter(s=>s.userId!==id || (token && s.tokenHash===tokenHash(token))); }); },
    async addGeneration(userId,job,mode,input) { return mutate(()=> { data.generations.push({userId,id:job.id,mode,input:input.slice(0,3200),createdAt:job.createdAt}); }); },
    listGenerations(userId) { return data.generations.filter(g=>g.userId===userId).sort((a,b)=>b.createdAt-a.createdAt); },
    owner(id) { return data.generations.find(g=>g.id===id)?.userId || null; },
  };
}
