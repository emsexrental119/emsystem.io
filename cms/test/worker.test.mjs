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

test('service edits remain draft until publication, validate images, and survive older admin saves',async()=>{
  const s=setup(),headers=await s.login();const before=await (await s.request('/api/public/content')).json();assert.equal(before.services.length,8);
  const state=await (await s.request('/api/admin/content',{headers})).json();const data=structuredClone(state.content);
  const bytes=new Uint8Array(100);bytes.set([255,216,255]);const {src}=await (await s.request('/api/admin/upload',{method:'POST',headers,body:bytes})).json();
  data.services[0]={...data.services[0],title:'새 소개',subtitle:'보조 문구',desc:'설명 수정',btn:'자세히 보기',img:src};
  const save=await s.request('/api/admin/content',{method:'PUT',headers,body:JSON.stringify({revision:state.revision,content:data})});assert.equal(save.status,200);
  assert.deepEqual((await (await s.request('/api/public/content')).json()).services,before.services);
  let rev=(await save.json()).revision;
  const invalid=structuredClone(data);invalid.services[0].img='/media/00000000-0000-0000-0000-000000000000.jpg';assert.equal((await s.request('/api/admin/publish',{method:'POST',headers,body:JSON.stringify({revision:rev,content:invalid})})).status,400);
  invalid.services.pop();assert.equal((await s.request('/api/admin/publish',{method:'POST',headers,body:JSON.stringify({revision:rev,content:invalid})})).status,400);
  const pub=await s.request('/api/admin/publish',{method:'POST',headers,body:JSON.stringify({revision:rev,content:data})});assert.equal(pub.status,200);rev=(await pub.json()).revision;
  const after=await (await s.request('/api/public/content')).json();assert.deepEqual(after.services,data.services);assert.deepEqual(after.works,before.works);assert.deepEqual(after.hero,before.hero);
  const old=structuredClone(data);delete old.services;
  assert.equal((await s.request('/api/admin/publish',{method:'POST',headers,body:JSON.stringify({revision:rev,content:old})})).status,200);
  assert.deepEqual((await (await s.request('/api/public/content')).json()).services,data.services);
});

test('service page drafts, publishing, uploaded images and legacy saves preserve other content',async()=>{
 const s=setup(),headers=await s.login();const before=await (await s.request('/api/public/content')).json();assert.equal(before.servicePage.items.length,3);assert.equal(before.servicePage.steps.length,6);
 const state=await (await s.request('/api/admin/content',{headers})).json(),data=structuredClone(state.content);
 const bytes=new Uint8Array(100);bytes.set([255,216,255]);const {src}=await (await s.request('/api/admin/upload',{method:'POST',headers,body:bytes})).json();
 data.servicePage.title='변경 서비스';data.servicePage.items[0].img=src;data.servicePage.items[0].features=['새 특징'];data.servicePage.steps[0].desc='과정 수정';data.servicePage.ctaButton='상담하기';
 const draft=await s.request('/api/admin/content',{method:'PUT',headers,body:JSON.stringify({revision:state.revision,content:data})});assert.equal(draft.status,200);let revision=(await draft.json()).revision;assert.deepEqual(await (await s.request('/api/public/content')).json(),before);
 const invalid=structuredClone(data);invalid.servicePage.items[0].img='/media/00000000-0000-0000-0000-000000000000.jpg';assert.equal((await s.request('/api/admin/publish',{method:'POST',headers,body:JSON.stringify({revision,content:invalid})})).status,400);
 invalid.servicePage.items[0].img=src;invalid.servicePage.items[0].features=Array(13).fill('많음');assert.equal((await s.request('/api/admin/publish',{method:'POST',headers,body:JSON.stringify({revision,content:invalid})})).status,400);
 const published=await s.request('/api/admin/publish',{method:'POST',headers,body:JSON.stringify({revision,content:data})});assert.equal(published.status,200);revision=(await published.json()).revision;
 const after=await (await s.request('/api/public/content')).json();assert.deepEqual(after.servicePage,data.servicePage);assert.deepEqual(after.services,before.services);assert.deepEqual(after.works,before.works);assert.deepEqual(after.hero,before.hero);
 delete data.servicePage;assert.equal((await s.request('/api/admin/publish',{method:'POST',headers,body:JSON.stringify({revision,content:data})})).status,200);assert.deepEqual((await (await s.request('/api/public/content')).json()).servicePage,after.servicePage);
});

test('case descriptions stay private until publish and survive older admin saves',async()=>{
 const s=setup(),headers=await s.login();const state=await (await s.request('/api/admin/content',{headers})).json();const data=structuredClone(state.content);data.works[0].description='행사 공간 안내\n설치 현장 사진';
 const save=await s.request('/api/admin/content',{method:'PUT',headers,body:JSON.stringify({revision:state.revision,content:data})});assert.equal(save.status,200);let revision=(await save.json()).revision;assert.equal((await (await s.request('/api/public/content')).json()).works[0].description,undefined);
 const pub=await s.request('/api/admin/publish',{method:'POST',headers,body:JSON.stringify({revision,content:data})});assert.equal(pub.status,200);revision=(await pub.json()).revision;assert.equal((await (await s.request('/api/public/content')).json()).works[0].description,data.works[0].description);
 const legacy=structuredClone(data);delete legacy.works[0].description;const old=await s.request('/api/admin/content',{method:'PUT',headers,body:JSON.stringify({revision,content:legacy})});assert.equal(old.status,200);revision=(await old.json()).revision;assert.equal((await (await s.request('/api/admin/content',{headers})).json()).content.works[0].description,data.works[0].description);
 data.works[0].description='x'.repeat(2001);assert.equal((await s.request('/api/admin/content',{method:'PUT',headers,body:JSON.stringify({revision,content:data})})).status,400);data.works[0].description='';assert.equal((await s.request('/api/admin/publish',{method:'POST',headers,body:JSON.stringify({revision,content:data})})).status,200);assert.equal((await (await s.request('/api/public/content')).json()).works[0].description,undefined);
});
