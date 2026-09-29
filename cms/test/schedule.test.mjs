import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import worker from '../worker.mjs';
import {validateEvents} from '../schedule.mjs';
const event=()=>({id:'event-1',title:'행사',installDate:'2026-09-30',removalDate:'2026-10-02',note:'안내',items:[{category:'페브릭',size:'970x3000',quantity:3,thickness:'100T',note:'윙'}]});
function setup(){
 const db=new DatabaseSync(':memory:');for(const f of ['0001_content.sql','0002_media.sql','0003_inventory.sql','0004_schedule.sql'])db.exec(readFileSync(new URL('../migrations/'+f,import.meta.url),'utf8'));
 const statement=(sql,p=[])=>({bind:(...p)=>statement(sql,p),first:async()=>db.prepare(sql).get(...p)||null,run:async()=>({meta:db.prepare(sql).run(...p)})});
 const token='a'.repeat(64),csrf='b'.repeat(64);
 db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(createHash('sha256').update(token).digest('hex'),csrf,Date.now()+60000);
 const env={ADMIN_USERNAME:'test',SITE_ORIGIN:'https://site.test',DB:{prepare:statement,batch:async list=>{db.exec('BEGIN');try{const out=[];for(const s of list)out.push(await s.run());db.exec('COMMIT');return out;}catch(e){db.exec('ROLLBACK');throw e;}}}};
 const headers={Cookie:'__Host-ems-admin='+token,'X-CSRF-Token':csrf,Origin:'https://cms.test'};
 const req=(path,options={})=>worker.fetch(new Request('https://cms.test'+path,options),env);
 return {db,headers,req};
}
test('schedule authenticates readers and writers, saves independently, and rejects stale edits',async()=>{
 const s=setup(),h=s.headers;
 assert.equal((await s.req('/api/schedule')).status,403);
 assert.equal((await s.req('/api/admin/schedule')).status,401);
 const inventory=await(await s.req('/api/admin/inventory',{headers:h})).json();
 const token=inventory.shareUrl.split('#')[1],viewer={Authorization:'Bearer '+token};
 let state=await(await s.req('/api/admin/schedule',{headers:h})).json();
 assert.equal(state.shareUrl,'https://site.test/c/#'+token);
 const payload=JSON.stringify({revision:state.revision,events:[event()]});
 assert.equal((await s.req('/api/admin/schedule',{method:'PUT',headers:viewer,body:payload})).status,401);
 assert.equal((await s.req('/api/admin/schedule',{method:'PUT',headers:{Cookie:h.Cookie,Origin:h.Origin},body:payload})).status,403);
 assert.equal((await s.req('/api/admin/schedule',{method:'PUT',headers:{...h,Origin:'https://other.test'},body:payload})).status,403);
 assert.equal((await s.req('/api/schedule',{method:'PUT',headers:viewer,body:payload})).status,405);
 let r=await s.req('/api/admin/schedule',{method:'PUT',headers:h,body:payload});assert.equal(r.status,200);state=await r.json();
 assert.deepEqual(state.events,[event()]);
 assert.equal((await s.req('/api/admin/schedule',{method:'PUT',headers:h,body:payload})).status,409);
 r=await s.req('/api/schedule',{headers:viewer});assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');
 const data=await r.json();assert.deepEqual(data.events,state.events);assert.equal(data.shareUrl,undefined);assert.equal(data.revision,undefined);
 assert.deepEqual(await(await s.req('/api/admin/inventory',{headers:h})).json(),inventory);
 const changed=event();changed.items[0].quantity=5;changed.removalDate='2026-10-03';
 r=await s.req('/api/admin/schedule',{method:'PUT',headers:h,body:JSON.stringify({revision:state.revision,events:[changed]})});assert.equal(r.status,200);state=await r.json();
 assert.equal(state.events[0].items[0].quantity,5);
 r=await s.req('/api/admin/schedule',{method:'PUT',headers:h,body:JSON.stringify({revision:state.revision,events:[]})});assert.equal(r.status,200);
 const history=s.db.prepare('SELECT events_json FROM schedule_history WHERE revision=?').get(state.revision);assert.deepEqual(JSON.parse(history.events_json),[changed]);
 await s.req('/api/admin/inventory/link',{method:'POST',headers:h,body:'{}'});
 assert.equal((await s.req('/api/schedule',{headers:viewer})).status,403);
 s.db.prepare('UPDATE sessions SET expires_at=0').run();
 assert.equal((await s.req('/api/admin/schedule',{headers:h})).status,401);
});
test('schedule validation rejects impossible dates and malformed items while keeping real-world size text',()=>{
 for(const changes of [{installDate:'2026-02-30'},{removalDate:'2026-09-01'},{title:''},{id:'x<script>'},{items:[{...event().items[0],quantity:0}]},{items:[{...event().items[0],quantity:1.5}]}])assert.throws(()=>validateEvents([{...event(),...changes}]));
 assert.throws(()=>validateEvents([event(),event()]));
 assert.throws(()=>validateEvents([null]));
 const e=event();e.items[0].size='-';e.items[0].thickness='-';assert.equal(validateEvents([e])[0].items[0].size,'-');
 const leap={...event(),installDate:'2028-02-29',removalDate:'2028-03-01'};assert.equal(validateEvents([leap])[0].installDate,'2028-02-29');
});

