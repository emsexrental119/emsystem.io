import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import worker from '../worker.mjs';
import {validateItems} from '../inventory.mjs';
function setup(){
 const db=new DatabaseSync(':memory:');
 for(const f of ['0001_content.sql','0002_media.sql','0003_inventory.sql'])db.exec(readFileSync(new URL('../migrations/'+f,import.meta.url),'utf8'));
 const stmt=(sql,p=[])=>({bind:(...p)=>stmt(sql,p),first:async()=>db.prepare(sql).get(...p)||null,run:async()=>({meta:db.prepare(sql).run(...p)})});
 const token='a'.repeat(64),csrf='b'.repeat(64);
 db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(createHash('sha256').update(token).digest('hex'),csrf,Date.now()+60000);
 const env={ADMIN_USERNAME:'test',SITE_ORIGIN:'https://site.test',DB:{prepare:stmt,batch:async list=>{db.exec('BEGIN');try{const out=[];for(const s of list)out.push(await s.run());db.exec('COMMIT');return out;}catch(e){db.exec('ROLLBACK');throw e;}}}};
 const headers={Cookie:'__Host-ems-admin='+token,'X-CSRF-Token':csrf,Origin:'https://cms.test'};
 const req=(path,options={})=>worker.fetch(new Request('https://cms.test'+path,options),env);
 return {db,headers,req};
}
test('inventory is private; link grants read only and rotation revokes old link',async()=>{
 const s=setup();
 assert.equal((await s.req('/api/inventory')).status,403);
 assert.equal((await s.req('/api/admin/inventory')).status,401);
 let r=await s.req('/api/admin/inventory',{headers:s.headers});assert.equal(r.status,200);
 const initial=await r.json(),token=initial.shareUrl.split('#')[1];
 assert.match(initial.shareUrl,/^https:\/\/site\.test\/s\/#[A-Za-z0-9_-]{22}$/);
 const legacy=s.db.prepare('SELECT share_token FROM inventory WHERE id=1').get().share_token;
 assert.equal((await s.req('/api/inventory',{headers:{Authorization:'Bearer '+legacy}})).status,200);
 assert.equal((await s.req('/api/inventory',{headers:{Authorization:'Bearer '+token.slice(0,-1)}})).status,403);
 const viewer={Authorization:'Bearer '+token};
 r=await s.req('/api/inventory',{headers:viewer});assert.equal(r.status,200);
 assert.equal(r.headers.get('cache-control'),'no-store');
 const v=await r.json();assert.equal(v.shareUrl,undefined);assert.equal(v.revision,undefined);
 assert.equal((await s.req('/api/inventory',{method:'PUT',headers:viewer,body:'{}'})).status,405);
 assert.equal((await s.req('/api/admin/inventory',{method:'PUT',headers:viewer,body:'{}'})).status,401);
 assert.equal((await s.req('/api/admin/inventory/link',{method:'POST',headers:viewer,body:'{}'})).status,401);
 const rotated=await (await s.req('/api/admin/inventory/link',{method:'POST',headers:s.headers,body:'{}'})).json();
 assert.notEqual(rotated.shareUrl,initial.shareUrl);
 assert.equal((await s.req('/api/inventory',{headers:viewer})).status,403);
 assert.equal((await s.req('/api/inventory',{headers:{Authorization:'Bearer '+legacy}})).status,403);
 assert.equal((await s.req('/api/inventory',{headers:{Authorization:'Bearer '+rotated.shareUrl.split('#')[1]}})).status,200);
});
test('admin edits validate stock, preserve revisions, reject CSRF, and retain history',async()=>{
 const s=setup(),h=s.headers;
 const initial=await (await s.req('/api/admin/inventory',{headers:h})).json();
 const items=[{width:10000,height:3000,quantity:1,note:''},{width:600,height:6000,quantity:2,note:'녹색'},{width:600,height:2500,quantity:8,note:''}];
 const data=JSON.stringify({revision:initial.revision,items});
 assert.equal((await s.req('/api/admin/inventory',{method:'PUT',headers:{Cookie:h.Cookie,Origin:h.Origin},body:data})).status,403);
 assert.equal((await s.req('/api/admin/inventory',{method:'PUT',headers:{...h,Origin:'https://evil.test'},body:data})).status,403);
 const saved=await s.req('/api/admin/inventory',{method:'PUT',headers:h,body:data});assert.equal(saved.status,200);
 const state=await saved.json();assert.deepEqual(state.items.map(i=>i.width+'x'+i.height),['600x2500','600x6000','10000x3000']);
 assert.equal((await s.req('/api/admin/inventory',{method:'PUT',headers:h,body:data})).status,409);
 assert.equal(s.db.prepare('SELECT count(*) AS n FROM inventory_history').get().n,1);
 for(const bad of [[{...items[0],quantity:-1}],[{...items[0],quantity:1.5}],[items[0],items[0]],[{...items[0],width:0}]]){
 assert.equal((await s.req('/api/admin/inventory',{method:'PUT',headers:h,body:JSON.stringify({revision:state.revision,items:bad})})).status,400);
 }
 const read=await (await s.req('/api/inventory',{headers:{Authorization:'Bearer '+initial.shareUrl.split('#')[1]}})).json();
 assert.deepEqual(read.items,state.items);
 s.db.prepare('UPDATE sessions SET expires_at=0').run();
 assert.equal((await s.req('/api/admin/inventory',{headers:h})).status,401);
});
test('sizes and quantities reject malformed data',()=>{
 for(const input of [null,[null],[{width:970,height:3000,quantity:'1',note:''}]])assert.throws(()=>validateItems(input));
});
