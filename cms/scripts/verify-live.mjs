// End-to-end verification on the owner's deployed CMS. Uses a supplied real
// portfolio photo to migrate one existing image URL without changing its pixels.
// Password is process-only input; never write it to a file or print it.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const origin=process.argv[2],imagePath=process.argv[3];
if(!origin||!imagePath||!process.env.EMSYSTEM_ADMIN_PASSWORD)throw Error('Origin, photo path and process password are required.');
let cookie,csrf;
async function request(path,method='GET',data,raw=false){
  return fetch(origin+path,{method,headers:{Origin:origin,...(cookie?{Cookie:cookie}:{}),...(csrf?{'X-CSRF-Token':csrf}:{}),...(data?{'Content-Type':raw?'image/jpeg':'application/json'}:{})},...(data?{body:raw?data:JSON.stringify(data)}:{})});
}
async function read(r){if(!r.ok)throw Error(`CMS request failed: ${r.status} ${await r.text()}`);return r.json();}
const before=await read(await request('/api/public/content'));assert.equal(before.works.length,19);assert.equal(before.works.flatMap(w=>w.images).length,77);
assert.equal((await request('/api/admin/content')).status,401);
const login=await request('/api/login','POST',{username:'exrental119',password:process.env.EMSYSTEM_ADMIN_PASSWORD});
const logged=await read(login);cookie=login.headers.get('set-cookie').split(';')[0];csrf=logged.csrf;
const state=await read(await request('/api/admin/content'));
const draft=structuredClone(state.content);
const saved=await read(await request('/api/admin/content','PUT',{content:draft,revision:state.revision}));
assert.deepEqual(await read(await request('/api/public/content')),before);
const bytes=fs.readFileSync(imagePath);const uploaded=await read(await request('/api/admin/upload','POST',bytes,true));
const media=await request(uploaded.src);assert.equal(media.status,200);
assert.equal(createHash('sha256').update(Buffer.from(await media.arrayBuffer())).digest('hex'),createHash('sha256').update(bytes).digest('hex'));
const work=draft.works.find(w=>w.id==='odc26-seoul');assert.ok(work);work.images[0].src=uploaded.src;
await read(await request('/api/admin/publish','POST',{content:draft,revision:saved.revision}));
const published=await read(await request('/api/public/content'));assert.deepEqual(published,draft);
await read(await request('/api/logout','POST'));
assert.equal((await request('/api/session')).status,401);
console.log(JSON.stringify({verified:['login','anonymous-access-blocked','draft-isolation','photo-upload-and-download','publication','logout'],works:published.works.length,photos:published.works.flatMap(w=>w.images).length,migratedImage:uploaded.src}));
