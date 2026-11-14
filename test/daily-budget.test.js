import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {createDailyBudget} from '../src/daily-budget.js';
test('daily reservations persist, prevent concurrent overspend and reset on Baku day',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'frameotion-budget-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));let now=Date.parse('2026-11-10T19:59:00Z');
 const make=()=>createDailyBudget(dir,{limitCents:500,reservationCents:100,now:()=>now});let budget=make();
 const attempts=await Promise.allSettled(Array.from({length:6},()=>budget.reserve()));assert.equal(attempts.filter(x=>x.status==='fulfilled').length,5);assert.equal(attempts.filter(x=>x.status==='rejected').length,1);
 budget=make();await assert.rejects(budget.reserve());now=Date.parse('2026-11-10T20:01:00Z');const id=await budget.reserve();await budget.release(id);await budget.reserve();
});
