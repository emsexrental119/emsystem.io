import seed from './seed.json' with { type: 'json' };
import serviceDefaults from './services-defaults.json' with { type: 'json' };
import servicePageDefaults from './service-page-defaults.json' with { type: 'json' };

const withServices = data => ({...data, services:data.services ?? structuredClone(serviceDefaults), servicePage:data.servicePage ?? structuredClone(servicePageDefaults)});

const encoder = new TextEncoder();
const cookieName = '__Host-ems-admin';
const sessionSeconds = 8 * 60 * 60;
const headers = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
  'Cache-Control': 'no-store',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https://emsystem.co.kr blob: data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
};
const json = (data, status = 200, extra = {}) => new Response(JSON.stringify(data), {status, headers: {...headers, 'Content-Type': 'application/json; charset=utf-8', ...extra}});
const fail = (message, status = 400) => { throw Object.assign(new Error(message), {status}); };
const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
const random = () => hex(crypto.getRandomValues(new Uint8Array(32)));
const digest = async s => hex(await crypto.subtle.digest('SHA-256', encoder.encode(s)));
const equal = (a, b) => { let d = a.length ^ b.length; for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0); return d === 0; };

// Small portfolio uploads use D1 without a separate metered storage subscription.
// R2 remains a compatible option if the media library later outgrows this setup.
function images(env) {
  if (env.IMAGES) return env.IMAGES;
  return {
    async put(name,bytes,metadata) {
      await env.DB.prepare('INSERT INTO media (name,bytes,content_type,created_at) VALUES (?,?,?,?)').bind(name,bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),metadata.httpMetadata.contentType,Date.now()).run();
    },
    async head(name) { return env.DB.prepare('SELECT name FROM media WHERE name=?').bind(name).first(); },
    async get(name) {
      const row=await env.DB.prepare('SELECT bytes,content_type FROM media WHERE name=?').bind(name).first();
      return row ? {body:new Uint8Array(row.bytes),httpMetadata:{contentType:row.content_type}} : null;
    },
  };
}

async function body(request, limit = 512 * 1024) {
  if (!request.body) fail('입력 내용이 없습니다.');
  const reader = request.body.getReader();
  let length = 0; const parts = [];
  while (true) {
    const {value, done} = await reader.read(); if (done) break;
    length += value.byteLength;
    if (length > limit) { await reader.cancel(); fail('업로드 용량이 너무 큽니다.', 413); }
    parts.push(value);
  }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.length; }
  return bytes;
}
async function readJSON(request, limit) {
  try { return JSON.parse(new TextDecoder().decode(await body(request, limit))); }
  catch (e) { if (e.status) throw e; fail('입력 형식을 확인해 주세요.'); }
}
export async function passwordMatches(password, setting) {
  if (typeof password !== 'string' || password.length > 256 || !setting) return false;
  const [iterations, salt, expected] = setting.split(':');
  if (iterations !== '100000' || !/^[a-f0-9]{32,64}$/.test(salt || '') || !/^[a-f0-9]{64}$/.test(expected || '')) return false;
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({name:'PBKDF2', hash:'SHA-256', salt:encoder.encode(salt), iterations:100000}, key, 256);
  return equal(hex(bits), expected);
}
function sameOrigin(request) {
  if (request.headers.get('Origin') !== new URL(request.url).origin) fail('허용되지 않은 요청입니다.', 403);
}
async function session(request, env, mutate = false) {
  const token = (request.headers.get('Cookie') || '').split(';').map(s => s.trim()).find(s => s.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) fail('로그인이 필요합니다.', 401);
  const tokenHash = await digest(token);
  const record = await env.DB.prepare('SELECT csrf, expires_at FROM sessions WHERE token_hash = ?').bind(tokenHash).first();
  if (!record || record.expires_at <= Date.now()) fail('로그인이 만료되었습니다. 다시 로그인해 주세요.', 401);
  if (mutate) {
    sameOrigin(request);
    if (!equal(request.headers.get('X-CSRF-Token') || '', record.csrf)) fail('다시 로그인해 주세요.', 403);
  }
  return {...record, tokenHash};
}
function validImage(value) {
  if (typeof value !== 'string') fail('사진 주소를 확인해 주세요.');
  if (/^\/media\/[a-f0-9-]{36}\.(jpg|png|webp)$/.test(value)) return value;
  if (/^https:\/\/emsystem\.co\.kr\/images\/[a-zA-Z0-9_./-]+\.(jpg|jpeg|png|webp)$/i.test(value) && !value.includes('..')) return value;
  fail('사진 주소를 확인해 주세요.');
}
const field = (s, max, required = false) => {
  if (typeof s !== 'string' || s.length > max || (required && !s.trim())) fail('내용의 길이 또는 필수 항목을 확인해 주세요.');
  return s.trim();
};
export function validateContent(data) {
  if (!data || !Array.isArray(data.works) || data.works.length > 300 || !data.hero || !Array.isArray(data.hero.images)) fail('저장할 내용을 확인해 주세요.');
  const ids = new Set();
  const works = data.works.map(w => {
    const id = field(w.id, 80, true);
    if (!/^[a-zA-Z0-9_-]+$/.test(id) || ids.has(id)) fail('시공사례 번호가 중복되었습니다.'); ids.add(id);
    if (!Array.isArray(w.images) || w.images.length < 1 || w.images.length > 50 || typeof w.visible !== 'boolean') fail('사례별 사진은 1~50장까지 등록할 수 있습니다.');
    return {id, title:field(w.title, 120, true), venue:field(w.venue,120,true), date:field(w.date,80), visible:w.visible, images:w.images.map(i => ({src:validImage(i.src), alt:field(i.alt,200)}))};
  });
  if (data.hero.images.length < 1 || data.hero.images.length > 20) fail('메인 배경 사진은 1~20장까지 등록할 수 있습니다.');
  const entries = data.services ?? serviceDefaults;
  if (!Array.isArray(entries) || entries.length !== 8) fail('메인 소개는 8개 항목으로 구성됩니다.');
  const services = entries.map((s,i) => ({num:serviceDefaults[i].num, title:field(s.title,120,true), subtitle:field(s.subtitle,200), desc:field(s.desc,1500), btn:field(s.btn,80,true), to:serviceDefaults[i].to, img:validImage(s.img)}));
  const p=data.servicePage ?? servicePageDefaults;
  if(!Array.isArray(p.items)||p.items.length!==3||!Array.isArray(p.steps)||p.steps.length!==6)fail('서비스 3개와 진행 과정 6개를 확인해 주세요.');
  const servicePage={label:field(p.label,80),title:field(p.title,120,true),intro:field(p.intro,1500),processLabel:field(p.processLabel,80),processTitle:field(p.processTitle,120,true),ctaTitle:field(p.ctaTitle,120,true),ctaDesc:field(p.ctaDesc,500),ctaButton:field(p.ctaButton,80,true),
    items:p.items.map((s,i)=>{if(!Array.isArray(s.features)||s.features.length>12)fail('서비스 특징은 최대 12개까지 입력할 수 있습니다.');return {num:servicePageDefaults.items[i].num,title:field(s.title,120,true),subtitle:field(s.subtitle,200),desc:field(s.desc,1500),features:s.features.map(f=>field(f,200,true)),img:validImage(s.img),btn:field(s.btn,80,true)};}),
    steps:p.steps.map((s,i)=>({step:servicePageDefaults.steps[i].step,title:field(s.title,120,true),desc:field(s.desc,500)}))};
  return {works, services, servicePage, hero:{title:field(data.hero.title,120,true), description:field(data.hero.description,500), images:data.hero.images.map(i => ({src:validImage(i.src), alt:field(i.alt,200)}))}};
}
async function ensureContent(env) {
  const text = JSON.stringify(seed); const now = Date.now();
  await env.DB.prepare('INSERT OR IGNORE INTO content (id,draft_json,published_json,revision,updated_at,published_at) VALUES (1,?,?,1,?,?)').bind(text,text,now,now).run();
}
async function login(request, env) {
  sameOrigin(request);
  if (!env.ADMIN_PASSWORD_HASH || !env.ADMIN_USERNAME) fail('관리자 계정 연결을 완료해 주세요.',503);
  const now = Date.now(), window = Math.floor(now / 900000);
  const ip = request.headers.get('CF-Connecting-IP') || 'local';
  for (const [key, limit] of [[await digest(ip),10],['global',150]]) {
    const row = await env.DB.prepare('INSERT INTO login_attempts (bucket,count,expires_at) VALUES (?,1,?) ON CONFLICT(bucket) DO UPDATE SET count = count + 1 RETURNING count').bind(`${window}:${key}`,now + 900000).first();
    if (row.count > limit) fail('로그인 시도가 많습니다. 15분 뒤 다시 시도해 주세요.',429);
  }
  const data = await readJSON(request, 4096);
  const ok = await passwordMatches(data.password, env.ADMIN_PASSWORD_HASH);
  if (!ok || data.username !== env.ADMIN_USERNAME) fail('아이디 또는 비밀번호를 확인해 주세요.',401);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now),
    env.DB.prepare('DELETE FROM login_attempts WHERE expires_at < ?').bind(now),
  ]);
  const token = random(), csrf = random();
  await env.DB.prepare('INSERT INTO sessions (token_hash,csrf,expires_at) VALUES (?,?,?)').bind(await digest(token),csrf,now + sessionSeconds * 1000).run();
  return json({csrf,username:env.ADMIN_USERNAME},200,{'Set-Cookie':`${cookieName}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${sessionSeconds}`});
}
async function route(request, env) {
  const url = new URL(request.url), path = url.pathname, method = request.method;
  if (path === '/api/public/content' && method === 'GET') {
    await ensureContent(env);
    const row = await env.DB.prepare('SELECT published_json FROM content WHERE id=1').first();
    const data = JSON.parse(row.published_json); data.works = data.works.filter(w => w.visible);
    return json(withServices(data),200,{'Access-Control-Allow-Origin':'*'});
  }
  if (path.startsWith('/media/') && (method === 'GET' || method === 'HEAD')) {
    validImage(path);
    const obj = await images(env).get(path.slice(7));
    if (!obj) return json({error:'사진을 찾을 수 없습니다.'},404);
    return new Response(method === 'HEAD' ? null : obj.body,{headers:{...headers,'Content-Type':obj.httpMetadata.contentType,'Cache-Control':'public,max-age=31536000,immutable','Access-Control-Allow-Origin':'*'}});
  }
  if (path === '/api/login' && method === 'POST') return login(request,env);
  if (path === '/api/session' && method === 'GET') {
    const s = await session(request,env); return json({csrf:s.csrf,username:env.ADMIN_USERNAME});
  }
  if (path === '/api/logout' && method === 'POST') {
    const s = await session(request,env,true);
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(s.tokenHash).run();
    return json({ok:true},200,{'Set-Cookie':`${cookieName}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`});
  }
  if (path.startsWith('/api/admin/')) {
    await session(request,env,method !== 'GET');
    if (path === '/api/admin/content' && method === 'GET') {
      await ensureContent(env);
      const r = await env.DB.prepare('SELECT draft_json, revision, updated_at, published_at FROM content WHERE id=1').first();
      return json({content:withServices(JSON.parse(r.draft_json)),revision:r.revision,updatedAt:r.updated_at,publishedAt:r.published_at});
    }
    if ((path === '/api/admin/content' && method === 'PUT') || (path === '/api/admin/publish' && method === 'POST')) {
      const data = await readJSON(request);
      // Older open admin tabs must preserve the newly editable section when saving.
      if (data.content && (data.content.services === undefined || data.content.servicePage === undefined)) {
        const previous = await env.DB.prepare('SELECT draft_json FROM content WHERE id=1').first();
        const old=withServices(previous ? JSON.parse(previous.draft_json) : seed);
        if(data.content.services===undefined)data.content.services=old.services;
        if(data.content.servicePage===undefined)data.content.servicePage=old.servicePage;
      }
      const content = validateContent(data.content);
      if (!Number.isSafeInteger(data.revision)) fail('새로고침 후 다시 시도해 주세요.');
      // Verify uploaded media before saving, so failed uploads can never enter a published record.
      const media = [...new Set([...content.hero.images,...content.works.flatMap(w => w.images),...content.services.map(s=>({src:s.img})),...content.servicePage.items.map(s=>({src:s.img}))].map(i=>i.src).filter(s=>s.startsWith('/media/')))];
      if (env.IMAGES) {
        for (const src of media) if (!await images(env).head(src.slice(7))) fail('업로드가 완료되지 않은 사진이 있습니다.');
      } else if (media.length) {
        const row=await env.DB.prepare('SELECT count(*) AS total FROM media WHERE name IN (SELECT value FROM json_each(?))').bind(JSON.stringify(media.map(src=>src.slice(7)))).first();
        if(row.total!==media.length)fail('업로드가 완료되지 않은 사진이 있습니다.');
      }
      const text = JSON.stringify(content), now = Date.now();
      const publish = path.endsWith('/publish');
      const sql = publish
        ? 'UPDATE content SET draft_json=?,published_json=?,revision=revision+1,updated_at=?,published_at=? WHERE id=1 AND revision=?'
        : 'UPDATE content SET draft_json=?,revision=revision+1,updated_at=? WHERE id=1 AND revision=?';
      const result = await env.DB.prepare(sql).bind(...(publish ? [text,text,now,now,data.revision] : [text,now,data.revision])).run();
      if (result.meta.changes !== 1) fail('다른 화면에서 내용이 변경되었습니다. 새로고침 후 다시 수정해 주세요.',409);
      return json({revision:data.revision + 1,updatedAt:now,publishedAt:publish ? now : null});
    }
    if (path === '/api/admin/upload' && method === 'POST') {
      const bytes = await body(request,1500 * 1024);
      const type = bytes[0]===255 && bytes[1]===216 && bytes[2]===255 ? ['jpg','image/jpeg']
        : hex(bytes.slice(0,8))==='89504e470d0a1a0a' ? ['png','image/png']
        : new TextDecoder().decode(bytes.slice(0,4))==='RIFF' && new TextDecoder().decode(bytes.slice(8,12))==='WEBP' ? ['webp','image/webp'] : null;
      if (!type || bytes.length < 32) fail('JPG, PNG, WebP 사진을 선택해 주세요.');
      const key = `${crypto.randomUUID()}.${type[0]}`;
      await images(env).put(key,bytes,{httpMetadata:{contentType:type[1]}});
      return json({src:`/media/${key}`},201);
    }
    return json({error:'지원하지 않는 작업입니다.'},405);
  }
  if (path.startsWith('/api/')) return json({error:'요청을 찾을 수 없습니다.'},404);
  if (path === '/') return Response.redirect(url.origin + '/admin/',302);
  const asset = await env.ASSETS.fetch(request);
  const response = new Response(asset.body,asset); for (const [k,v] of Object.entries(headers)) response.headers.set(k,v);
  return response;
}
export default {
  async fetch(request,env) {
    try { return await route(request,env); }
    catch (e) { return json({error:e.status ? e.message : '처리하지 못했습니다. 잠시 후 다시 시도해 주세요.'},e.status || 500); }
  },
};
