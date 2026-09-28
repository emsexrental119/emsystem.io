// Preserve existing links while offering a 128-bit, URL-safe compact alias.
export const shortShareToken = token => btoa(String.fromCharCode(...token.slice(0,32).match(/../g).map(byte=>parseInt(byte,16)))).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');

export function validateItems(items) {
  const invalid = message => { throw Object.assign(new Error(message), {status:400}); };
  if (!Array.isArray(items) || items.length > 2000) invalid('품목은 최대 2,000개까지 저장할 수 있습니다.');
  const seen = new Set();
  return items.map(item => {
    if (!item || !Number.isSafeInteger(item.width) || !Number.isSafeInteger(item.height) || item.width < 1 || item.height < 1 || item.width > 1000000 || item.height > 1000000) invalid('가로와 세로를 1 이상 정수(mm)로 입력해 주세요.');
    if (!Number.isSafeInteger(item.quantity) || item.quantity < 0 || item.quantity > 1000000) invalid('수량은 0 이상 정수로 입력해 주세요.');
    if (typeof item.note !== 'string' || item.note.length > 500) invalid('비고는 500자 이내로 입력해 주세요.');
    const key = `${item.width}x${item.height}`;
    if (seen.has(key)) invalid('같은 사이즈가 중복되었습니다. 기존 품목의 수량을 수정해 주세요.');
    seen.add(key);
    return {width:item.width,height:item.height,quantity:item.quantity,note:item.note.trim()};
  }).sort((a,b)=>a.width-b.width || a.height-b.height);
}

export async function inventoryRoute(request, env, helpers) {
  const {json,fail,random,equal,session,readJSON} = helpers;
  const url = new URL(request.url), path=url.pathname, method=request.method;
  const admin=path.startsWith('/api/admin/inventory');
  if (admin) await session(request,env,method!=='GET');
  else if (method!=='GET') return json({error:'조회만 가능합니다.'},405);
  if (admin) await env.DB.prepare('INSERT OR IGNORE INTO inventory (id,items_json,revision,share_token,updated_at) VALUES (1,?,1,?,?)').bind('[]',random(),Date.now()).run();
  let row=await env.DB.prepare('SELECT * FROM inventory WHERE id=1').first();
  if (!admin) {
    const token=(request.headers.get('Authorization')||'').replace(/^Bearer /,'');
    if (!row || !((/^[a-f0-9]{64}$/.test(token) && equal(token,row.share_token)) || (/^[A-Za-z0-9_-]{22}$/.test(token) && equal(token,shortShareToken(row.share_token))))) fail('공유 링크를 확인해 주세요. 링크가 변경되었을 수 있습니다.',403);
  }
  if (path==='/api/admin/inventory/link' && method==='POST') {
    const token=random();
    await env.DB.prepare('UPDATE inventory SET share_token=? WHERE id=1').bind(token).run();
    return json({shareUrl:(env.SITE_ORIGIN || url.origin)+'/s/#'+shortShareToken(token)});
  }
  if (method==='PUT' && path==='/api/admin/inventory') {
    const data=await readJSON(request);
    const items=validateItems(data.items);
    if (!Number.isSafeInteger(data.revision) || data.revision!==row.revision) fail('다른 화면에서 재고가 변경되었습니다. 새로고침 후 다시 수정해 주세요.',409);
    const text=JSON.stringify(items), now=Date.now();
    const results=await env.DB.batch([
      env.DB.prepare('INSERT OR IGNORE INTO inventory_history (revision,items_json,actor,updated_at) SELECT revision,items_json,?,updated_at FROM inventory WHERE id=1 AND revision=?').bind(env.ADMIN_USERNAME,data.revision),
      env.DB.prepare('UPDATE inventory SET items_json=?,revision=revision+1,updated_at=? WHERE id=1 AND revision=?').bind(text,now,data.revision),
    ]);
    if (results[1].meta.changes!==1) fail('다른 화면에서 재고가 변경되었습니다. 새로고침 후 다시 수정해 주세요.',409);
    row={...row,items_json:text,revision:data.revision+1,updated_at:now};
  } else if (method!=='GET' || !['/api/inventory','/api/admin/inventory'].includes(path)) return json({error:'지원하지 않는 작업입니다.'},405);
  const result={items:JSON.parse(row.items_json),updatedAt:row.updated_at};
  if(admin) Object.assign(result,{revision:row.revision,shareUrl:(env.SITE_ORIGIN || url.origin)+'/s/#'+shortShareToken(row.share_token)});
  return json(result,200,{'X-Robots-Tag':'noindex, nofollow','Referrer-Policy':'no-referrer'});
}
