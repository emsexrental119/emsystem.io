import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {pbkdf2Sync,randomBytes} from 'node:crypto';
import worker from '../worker.mjs';
import seed from '../seed.json' with {type:'json'};

function setup() {
  const db=new DatabaseSync(':memory:');for(const name of ['0001_content.sql','0002_media.sql'])db.exec(readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
  const stmt=(sql,params=[])=>({bind:(...values)=>stmt(sql,values.map(v=>v instanceof ArrayBuffer?new Uint8Array(v):v)),first:async()=>db.prepare(sql).get(...params)||null,run:async()=>({meta:db.prepare(sql).run(...params)})});
  const password=randomBytes(24).toString('hex'),salt=randomBytes(16).toString('hex');const objects=new Map();
  const env={ADMIN_USERNAME:'exrental119',ADMIN_PASSWORD_HASH:`100000:${salt}:${pbkdf2Sync(password,salt,100000,32,'sha256').toString('hex')}`,DB:{prepare:stmt,batch:async list=>Promise.all(list.map(s=>s.run()))},IMAGES:{put:async(k,bytes,options)=>objects.set(k,{body:bytes,...options}),head:async k=>objects.get(k)||null,get:async k=>objects.get(k)||null}};
  const request=(path,options={})=>worker.fetch(new Request('https://cms.test'+path,{...options,headers:{Origin:'https://cms.test',...options.headers}}),env);
  const login=async()=>{const r=await request('/api/login',{method:'POST',body:JSON.stringify({username:'exrental119',password})});assert.equal(r.status,200);const cookie=r.headers.get('set-cookie');assert.match(cookie,/HttpOnly; Secure; SameSite=Strict/);const data=await r.json();return {Cookie:cookie.split(';')[0],'X-CSRF-Token':data.csrf};};
  return {env,db,request,login,password};
}
test('anonymous writes, cross-origin login, invalid passwords and CSRF are rejected; logout revokes session',async()=>{
  const s=setup();assert.equal((await s.request('/api/admin/content')).status,401);
  assert.equal((await s.request('/api/login',{method:'POST',headers:{Origin:'https://other.test'},body:'{}'})).status,403);
  assert.equal((await s.request('/api/login',{method:'POST',body:JSON.stringify({username:'exrental119',password:'wrong'})})).status,401);
  const h=await s.login();assert.equal((await s.request('/api/session',{headers:h})).status,200);
  assert.equal((await s.request('/api/admin/content',{method:'PUT',headers:{Cookie:h.Cookie},body:'{}'})).status,403);
  assert.equal((await s.request('/api/logout',{method:'POST',headers:h})).status,200);
  assert.equal((await s.request('/api/session',{headers:h})).status,401);
});
test('drafts stay private; publish persists additions, edits, deletions, ordering and hero; stale saves cannot overwrite',async()=>{
  const s=setup(),headers=await s.login();const before=await (await s.request('/api/public/content')).json();assert.equal(before.works.length,19);assert.equal(before.works.flatMap(w=>w.images).length,77);
  const state=await (await s.request('/api/admin/content',{headers})).json();const data=structuredClone(state.content);
  const removed=data.works.shift();data.works.reverse();data.works[0].title='수정한 행사';data.works[1].visible=false;
  data.works.push({...removed,id:'new-case',title:'새 행사'});data.hero.title='새로운\n메인 문구';data.hero.description='메인 설명';data.hero.images.reverse();
  const r=await s.request('/api/admin/content',{method:'PUT',headers,body:JSON.stringify({revision:state.revision,content:data})});assert.equal(r.status,200);
  assert.deepEqual(await (await s.request('/api/public/content')).json(),before);
  assert.equal((await s.request('/api/admin/publish',{method:'POST',headers,body:JSON.stringify({revision:state.revision,content:data})})).status,409);
  const rev=(await r.json()).revision;assert.equal((await s.request('/api/admin/publish',{method:'POST',headers,body:JSON.stringify({revision:rev,content:data})})).status,200);
  const published=await (await s.request('/api/public/content')).json();assert.deepEqual(published.works,data.works.filter(w=>w.visible));assert.deepEqual(published.hero,data.hero);
  const freshHeaders=await s.login();const fresh=await (await s.request('/api/admin/content',{headers:freshHeaders})).json();assert.deepEqual(fresh.content,data);
});
test('uploads require authentication, reject executable files, and published image paths must exist',async()=>{
  const s=setup(),headers=await s.login();await s.request('/api/admin/content',{headers});
  assert.equal((await s.request('/api/admin/upload',{method:'POST',body:'fake'})).status,401);
  assert.equal((await s.request('/api/admin/upload',{method:'POST',headers,body:'<svg onload="alert(1)"></svg>'})).status,400);
  const bytes=new Uint8Array(100);bytes.set([255,216,255]);const r=await s.request('/api/admin/upload',{method:'POST',headers,body:bytes});assert.equal(r.status,201);const {src}=await r.json();assert.equal((await s.request(src)).status,200);
  const content=structuredClone(seed);content.hero.images=[{src,alt:'업로드'}];assert.equal((await s.request('/api/admin/publish',{method:'POST',headers,body:JSON.stringify({revision:1,content})})).status,200);
  content.hero.images[0].src='/media/00000000-0000-0000-0000-000000000000.jpg';assert.equal((await s.request('/api/admin/publish',{method:'POST',headers,body:JSON.stringify({revision:2,content})})).status,400);
  content.hero.images[0].src='javascript:alert(1)';assert.equal((await s.request('/api/admin/publish',{method:'POST',headers,body:JSON.stringify({revision:2,content})})).status,400);
});
test('session expiry and persistent per-IP throttling are enforced',async()=>{
  const s=setup(),headers=await s.login();s.db.exec('UPDATE sessions SET expires_at=1');assert.equal((await s.request('/api/session',{headers})).status,401);
  for(let i=0;i<9;i++)assert.equal((await s.request('/api/login',{method:'POST',body:'{"username":"no","password":"wrong"}'})).status,401);
  assert.equal((await s.request('/api/login',{method:'POST',body:JSON.stringify({username:'exrental119',password:s.password})})).status,429);
});
test('D1 media storage roundtrips binary uploads and validates more than 50 photos in one query',async()=>{
  const s=setup();delete s.env.IMAGES;const headers=await s.login();await s.request('/api/admin/content',{headers});
  const bytes=new Uint8Array(100);bytes.set([255,216,255]);const upload=await s.request('/api/admin/upload',{method:'POST',headers,body:bytes});assert.equal(upload.status,201);const {src}=await upload.json();
  const served=await s.request(src);assert.deepEqual(new Uint8Array(await served.arrayBuffer()),bytes);
  const data=structuredClone(seed);data.hero.images=[{src,alt:''}];assert.equal((await s.request('/api/admin/publish',{method:'POST',headers,body:JSON.stringify({revision:1,content:data})})).status,200);
  const photos=[];for(let i=0;i<55;i++){const name=`00000000-0000-0000-0000-${String(i).padStart(12,'0')}.jpg`;s.db.prepare('INSERT INTO media VALUES (?,?,?,?)').run(name,bytes,'image/jpeg',Date.now());photos.push({src:'/media/'+name,alt:''});}
  data.works[0].images=photos.slice(0,30);data.works[1].images=photos.slice(30);
  assert.equal((await s.request('/api/admin/publish',{method:'POST',headers,body:JSON.stringify({revision:2,content:data})})).status,200);
});
