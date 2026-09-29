import {inventoryRoute,shortShareToken} from './inventory.mjs';

export function validateEvents(events) {
 const fail=message=>{throw Object.assign(new Error(message),{status:400});};
 const text=(v,max,required=false)=>{if(typeof v!=='string'||v.length>max||(required&&!v.trim()))fail('필수 항목과 입력 길이를 확인해 주세요.');return v.trim();};
 const date=v=>{if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v)||v<'2000-01-01'||v>'2100-12-31'||!Number.isFinite(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v)fail('유효한 설치일과 철거일을 입력해 주세요.');return v;};
 if(!Array.isArray(events)||events.length>500)fail('일정은 최대 500건까지 저장할 수 있습니다.');
 const ids=new Set();
 return events.map(e=>{
  if(!e || typeof e.id!=='string'||! /^[a-zA-Z0-9_-]{1,80}$/.test(e.id)||ids.has(e.id))fail('일정 번호를 확인해 주세요.');
  ids.add(e.id);const installDate=date(e.installDate),removalDate=date(e.removalDate);
  if(removalDate<installDate)fail('철거일은 설치일보다 빠를 수 없습니다.');
  if(!Array.isArray(e.items)||e.items.length>500)fail('행사별 품목은 최대 500줄입니다.');
  const items=e.items.map(i=>{if(!i||!Number.isSafeInteger(i.quantity)||i.quantity<1||i.quantity>1000000)fail('품목 수량은 1 이상 정수로 입력해 주세요.');return {category:text(i.category,80,true),size:text(i.size,80,true),quantity:i.quantity,thickness:text(i.thickness,80),note:text(i.note,500)};});
  return {id:e.id,title:text(e.title,200,true),installDate,removalDate,note:text(e.note??'',1000),items};
 }).sort((a,b)=>a.installDate.localeCompare(b.installDate)||a.removalDate.localeCompare(b.removalDate)||a.title.localeCompare(b.title,'ko'));
}

export async function scheduleRoute(request,env,helpers) {
 const {session,json,readJSON,fail}=helpers,url=new URL(request.url),admin=url.pathname==='/api/admin/schedule',method=request.method;
 if(admin)await session(request,env,method!=='GET');
 else {
  if(method!=='GET')return json({error:'조회만 가능합니다.'},405);
  // Reuse the same employee audience and revocation as the inventory share link.
  await inventoryRoute(new Request(url.origin+'/api/inventory',{headers:request.headers}),env,helpers);
 }
 if(admin)await env.DB.prepare("INSERT OR IGNORE INTO schedule (id,events_json,revision,updated_at) VALUES (1,'[]',1,?)").bind(Date.now()).run();
 let row=await env.DB.prepare('SELECT * FROM schedule WHERE id=1').first();
 if(!row)fail('일정 준비 중입니다.',503);
 if(admin&&method==='PUT'){
  const data=await readJSON(request);
  if(!Number.isSafeInteger(data.revision)||data.revision!==row.revision)fail('다른 화면에서 일정이 변경되었습니다. 새로고침 후 다시 수정해 주세요.',409);
  const events=validateEvents(data.events),text=JSON.stringify(events),now=Date.now();
  const results=await env.DB.batch([
   env.DB.prepare('INSERT OR IGNORE INTO schedule_history (revision,events_json,actor,updated_at) SELECT revision,events_json,?,updated_at FROM schedule WHERE id=1 AND revision=?').bind(env.ADMIN_USERNAME,data.revision),
   env.DB.prepare('UPDATE schedule SET events_json=?,revision=revision+1,updated_at=? WHERE id=1 AND revision=?').bind(text,now,data.revision)
  ]);
  if(results[1].meta.changes!==1)fail('다른 화면에서 일정이 변경되었습니다. 새로고침 후 다시 수정해 주세요.',409);
  row={...row,events_json:text,revision:data.revision+1,updated_at:now};
 }else if(method!=='GET')return json({error:'지원하지 않는 작업입니다.'},405);
 const result={events:JSON.parse(row.events_json),updatedAt:row.updated_at};
 if(admin){
  const inventory=await env.DB.prepare('SELECT share_token FROM inventory WHERE id=1').first();
  result.revision=row.revision;
  result.shareUrl=inventory?(env.SITE_ORIGIN||url.origin)+'/c/#'+shortShareToken(inventory.share_token):'';
 }
 return json(result,200,{'X-Robots-Tag':'noindex, nofollow','Referrer-Policy':'no-referrer'});
}
