import {unzipSync,zipSync,strFromU8,strToU8} from 'fflate';
import {fabricPrice,fabricProducts} from './public/admin/quotation-pricing.js';
const invalid=message=>{throw Object.assign(new Error(message),{status:400});};
const text=(value,max,required=false)=>{if(typeof value!=='string'||value.length>max||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value)||(required&&!value.trim()))invalid('필수 항목과 입력 길이를 확인해 주세요.');return value.trim();};
export function validateQuote(data,config){
 if(!data||!Array.isArray(data.items)||data.items.length<1||data.items.length>100)invalid('품목은 1~100개까지 입력해 주세요.');
 const q={};for(const [key,max,required]of [['date',10,true],['customer',80,true],['project',100,false],['period',80,false],['contact',80,false],['person',80,false],['email',120,false]])q[key]=text(data[key]??'',max,required);
 if(!/^20\d\d-\d\d-\d\d$/.test(q.date)||!Number.isFinite(Date.parse(q.date))||new Date(q.date).toISOString().slice(0,10)!==q.date)invalid('견적일을 확인해 주세요.');
 const modes=[...new Set(data.items.filter(i=>i?.pricing).map(i=>i.pricing.mode))];
 const pricingMode=data.pricingMode??(modes.length===1?modes[0]:undefined);
 if((data.pricingMode!==undefined||modes.length)&&!['general','contract','dispatch'].includes(pricingMode))invalid('견적서 전체에 적용할 단가 종류를 하나 선택해 주세요.');
 const expanded=data.items.flatMap(original=>{
  const i=original?.pricing?{...original,pricing:{...original.pricing,mode:pricingMode}}:original;
  if(i?.pricing?.product===undefined)return [i];
  const p=i.pricing;
  if(!Object.hasOwn(fabricProducts,p.product)||!['included','separate'].includes(p.printStyle))invalid('페브릭 품명과 인쇄비 표시 방법을 선택해 주세요.');
  const name=fabricProducts[p.product],note=text(i.note??'',150);
  if(p.printStyle==='included')return [{...i,name,note:note.includes('인쇄비 포함')?note:[note,'인쇄비 포함'].filter(Boolean).join(' / '),pricing:{...p,component:'both'}}];
  return [{...i,name,note,pricing:{...p,component:'frame'}},{...i,name:'인쇄비',note:'',pricing:{...p,component:'print'}}];
 });
 if(expanded.length>100)invalid('인쇄비 별도 줄을 포함해 견적 품목은 100줄까지 가능합니다.');
 q.items=expanded.map(i=>{
  if(!i)invalid('품목을 확인해 주세요.');
  let price=i.price,size=i.size??'';
  if(i.pricing!==undefined){
   try{price=fabricPrice(i.pricing,config).price;}catch(e){invalid(e.message);}
   const thickness=text(i.pricing.thickness??'',30);
   size=i.pricing.width+'x'+i.pricing.height+(thickness?'x'+thickness:'');
  }
  if(!Number.isSafeInteger(i.quantity)||i.quantity<1||i.quantity>1000000||!Number.isSafeInteger(price)||price<0||price>1000000000)invalid('수량과 단가는 범위 내 정수로 입력해 주세요.');
  return {name:text(i.name,80,true),size:text(size,100),quantity:i.quantity,price,note:text(i.note??'',150)};
 });
 const subtotal=q.items.reduce((s,i)=>s+i.quantity*i.price,0);if(!Number.isSafeInteger(subtotal)||subtotal>1000000000000)invalid('견적 금액이 허용 범위를 초과했습니다.');
 return q;
}
const xml=value=>String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
function setCell(sheet,address,value,formula){
 const pattern=new RegExp('<x:c\\b(?=[^>]* r="'+address+'")[^>]*?(?:/>|>[\\s\\S]*?</x:c>)');
 let found=false;
 sheet=sheet.replace(pattern,old=>{found=true;const style=old.match(/ s="([^"]+)"/)?.[1];const start='<x:c r="'+address+'"'+(style?' s="'+style+'"':'');
 if(formula)return start+'><x:f>'+xml(formula)+'</x:f><x:v>'+value+'</x:v></x:c>';
 if(typeof value==='number')return start+'><x:v>'+value+'</x:v></x:c>';
 // An empty inline string is text in Excel arithmetic; emit a genuinely blank cell.
 if(value==='')return start+' />';
 return start+' t="inlineStr"><x:is><x:t xml:space="preserve">'+xml(value)+'</x:t></x:is></x:c>';});
 if(!found)throw Error('Template cell missing: '+address);
 return sheet;
}
export function exportQuote(template,q){
 const files=unzipSync(template),path='xl/worksheets/sheet1.xml';let sheet=strFromU8(files[path]);
 const extra=Math.max(0,q.items.length-13),end=25+extra,summary=26+extra,total=27+extra;
 if(extra){
  const row=sheet.match(/<x:row r="25"[^>]*>[\s\S]*?<\/x:row>/)[0];
  sheet=sheet.replace(/(<x:row r="|<x:c r="[A-Z]+)(\d+)"/g,(m,p,n)=>p+(+n>=26?+n+extra:+n)+'"');
  const rows=Array.from({length:extra},(_,i)=>row.replace(/(<x:row r="|<x:c r="[A-Z]+)25"/g,(_,p)=>p+(26+i)+'"')).join('');
  sheet=sheet.replace('</x:sheetData>',rows+'</x:sheetData>');
  sheet=sheet.replace(/<x:sheetData>([\s\S]*?)<\/x:sheetData>/,(_,body)=>'<x:sheetData>'+[...body.matchAll(/<x:row\b[^>]*>[\s\S]*?<\/x:row>/g)].map(m=>m[0]).sort((a,b)=>+a.match(/r="(\d+)"/)[1]-+b.match(/r="(\d+)"/)[1]).join('')+'</x:sheetData>');
  sheet=sheet.replace(/<x:mergeCell ref="([^"]+)"\s*\/>/g,(_,range)=>'<x:mergeCell ref="'+range.replace(/([A-Z]+)(\d+)/g,(_,c,r)=>c+(+r>=26?+r+extra:+r))+'" />');
  sheet=sheet.replace('</x:mergeCells>',Array.from({length:extra},(_,i)=>'<x:mergeCell ref="C'+(26+i)+':D'+(26+i)+'" />').join('')+'</x:mergeCells>');
  sheet=sheet.replace(/(<x:mergeCells count=")(\d+)"/,(_,p,n)=>p+(+n+extra)+'"');
 }
 sheet=setCell(sheet,'B2',Date.parse(q.date)/86400000+25569);
 for(const [cell,key]of [['B4','customer'],['B5','project'],['B6','period'],['B7','contact'],['B8','person'],['B9','email']]){
  sheet=setCell(sheet,cell,q[key]);
 }
 let subtotal=0;
 for(let r=13;r<=end;r++){
  const i=q.items[r-13];const amount=i?i.quantity*i.price:0;subtotal+=amount;
  for(const [c,value]of [['A',i?r-12:''],['B',i?.name||''],['C',i?.size||''],['E',i?.quantity??''],['F',i?.price??''],['H',i?.note||'']])sheet=setCell(sheet,c+r,value);
  sheet=setCell(sheet,'G'+r,amount,'E'+r+'*F'+r);
 }
 const vat=Math.round(subtotal*0.1),grand=subtotal+vat;
 sheet=setCell(sheet,'G'+summary,subtotal,'SUM(G13:G'+end+')');sheet=setCell(sheet,'H'+summary,vat,'ROUND(G'+summary+'*10%,0)');sheet=setCell(sheet,'G'+total,grand,'G'+summary+'+H'+summary);sheet=setCell(sheet,'B10',grand,'G'+total);
 // Keep the company's template dimensions, styles and print settings unchanged.
 files[path]=strToU8(sheet);
 let workbook=strFromU8(files['xl/workbook.xml']);
 workbook=workbook.replace('</x:workbook>',"<x:definedNames><x:definedName name=\"_xlnm.Print_Area\" localSheetId=\"0\">'장치 견적서'!$A$1:$H$"+(37+extra)+'</x:definedName></x:definedNames><x:calcPr fullCalcOnLoad="1"/></x:workbook>');
 files['xl/workbook.xml']=strToU8(workbook);
 return zipSync(files,{level:6});
}
export async function quoteRoute(request,env,helpers){
 const {session,readJSON,fail,json}=helpers;const method=request.method,path=new URL(request.url).pathname;
 await session(request,env,method!=='GET'&&method!=='HEAD');
 if(path==='/api/admin/quotes/pricing'){
  if(method!=='GET')fail('지원하지 않는 작업입니다.',405);
  const r=await env.DB.prepare('SELECT config_json FROM quote_pricing WHERE id=1').first();
  if(!r)fail('단가 기준을 준비하고 있습니다.',503);
  return json({config:JSON.parse(r.config_json)},200,{'Cache-Control':'private, no-store'});
 }
 if(method!=='POST')fail('지원하지 않는 작업입니다.',405);
 const data=await readJSON(request,128*1024);
 let config;
 if(Array.isArray(data?.items)&&data.items.some(i=>i?.pricing!==undefined)){
  const r=await env.DB.prepare('SELECT config_json FROM quote_pricing WHERE id=1').first();
  if(!r)fail('단가 기준을 준비하고 있습니다.',503);
  config=JSON.parse(r.config_json);
 }
 const q=validateQuote(data,config);
 const record=await env.DB.prepare('SELECT xlsx_base64 FROM quote_template WHERE id=1').first();if(!record)fail('견적서 양식을 준비하고 있습니다.',503);
 const bytes=Uint8Array.from(atob(record.xlsx_base64),c=>c.charCodeAt(0)),file=exportQuote(bytes,q);
 const name=(q.customer+'_'+q.date+'_견적서.xlsx').replace(/[\\/:*?"<>|\r\n]/g,'_');
 return new Response(file,{headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':"attachment; filename=quotation.xlsx; filename*=UTF-8''"+encodeURIComponent(name),'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow','Referrer-Policy':'no-referrer'}});
}
