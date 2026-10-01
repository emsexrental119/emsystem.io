import {fabricPrice,fabricProducts} from './quotation-pricing.js';
const $=s=>document.querySelector(s),form=$('#quote-form');let csrf,config,busy=false,dirty=false;
const money=n=>new Intl.NumberFormat('ko-KR').format(n)+'원';
const node=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
const get=(row,key)=>row.querySelector('[data-key="'+key+'"]');
function status(message,error=false){$('#status').textContent=message;$('#status').className=error?'error':'';}
function field(root,key,title,type,max,value=''){
 const label=node('label',title),input=node('input');input.dataset.key=key;input.type=type;
 if(type==='number'){input.min=key==='price'?'0':'1';input.max=String(max);input.step='1';}else input.maxLength=max;
 input.value=value;label.append(input);root.append(label);return input;
}
function select(root,key,title,options){
 const label=node('label',title),input=node('select');input.dataset.key=key;
 for(const [value,text]of options){const option=node('option',text);option.value=value;input.append(option);}
 label.append(input);root.append(label);return input;
}
function pricing(row){return {mode:form.elements.pricingMode.value,component:'both',product:get(row,'product').value,printStyle:get(row,'printStyle').value,printSides:Number(get(row,'printSides').value),width:Number(get(row,'width').value),height:Number(get(row,'height').value),thickness:get(row,'thickness').value};}
function sync(row,changeName=false){
 const auto=get(row,'product').value!=='manual',price=get(row,'price'),size=get(row,'size'),detail=row.querySelector('.price-detail');
 row.querySelector('.quote-calculator').hidden=!auto;
 for(const k of ['width','height','thickness','printStyle','printSides']){get(row,k).disabled=!auto;get(row,k).required=auto&&['width','height'].includes(k);}
 price.readOnly=auto;size.readOnly=auto;
 price.setCustomValidity('');get(row,'width').setCustomValidity('');
 get(row,'name').readOnly=auto;
 if(auto)get(row,'name').value=fabricProducts[get(row,'product').value];
 if(changeName&&!auto){get(row,'name').value='';price.value='';size.value='';}
 if(!auto){detail.textContent='직접 입력한 단가를 적용합니다.';return;}
 const input=pricing(row);size.value=input.width&&input.height?input.width+'x'+input.height+(input.thickness?'x'+input.thickness:''):'';
 if(!get(row,'width').value||!get(row,'height').value){price.value='';detail.textContent='가로와 높이를 입력하면 단가가 계산됩니다.';return;}
 try{
  const result=fabricPrice(input,config);price.value=result.price;
  const parts=['본체 '+money(result.frame),'인쇄비 '+money(result.printing)];
  if(input.mode==='contract')parts.push('표시 단가 천 원 미만 버림'+(result.frame+result.printing!==result.price?' · 합산 후 '+money(result.price)+' 적용':''));
  if(input.printSides===2)parts.push('양면인쇄 · 인쇄비 2배');
  if(input.mode==='dispatch')parts.push('본체 가로 '+result.meters+'m 적용');
  parts.push(input.printStyle==='included'?'한 줄에 합산 · 비고에 인쇄비 포함 기재':input.printSides===2?'본체와 인쇄비를 두 줄로 분리 · 인쇄비 수량 2배 적용':'본체와 인쇄비를 두 줄로 분리 · 수량은 동일하게 적용');
  detail.textContent=parts.join(' · ');
 }catch(e){price.value='';get(row,'width').setCustomValidity(e.message);detail.textContent=e.message;}
}
function totals(){let sum=0;for(const row of $('#items').children){const value=get(row,'price').value,amount=Number(get(row,'quantity').value)*Number(value);sum+=amount;row.querySelector('.amount').textContent=value===''?'품목 금액: 단가 입력 대기':'품목 금액 '+money(amount);}$('#subtotal').textContent=money(sum);const vat=Math.round(sum*.1);$('#vat').textContent=money(vat);$('#total').textContent=money(sum+vat);}
function addItem(){
 if(busy)return;if($('#items').children.length>=100){status('품목은 100개까지 입력할 수 있습니다.',true);return;}
 const row=node('div');row.className='quote-item';
 const controls=node('div');controls.className='quote-item-controls';
 select(controls,'product','품명 선택',[...Object.entries(fabricProducts),['manual','기타 · 직접 입력']]);
 select(controls,'printStyle','인쇄비 표시',[['included','인쇄비 포함 · 한 줄로 합산'],['separate','인쇄비 별도 · 두 줄로 분리']]);
 select(controls,'printSides','인쇄 면',[['1','단면 인쇄'],['2','양면 인쇄 · 인쇄비 2배']]);
 const remove=node('button','품목 삭제');remove.type='button';remove.onclick=()=>{if(busy)return;if($('#items').children.length===1){status('품목을 하나 이상 입력해 주세요.',true);return;}row.remove();dirty=true;totals();};controls.append(remove);row.append(controls);
 const calc=node('div');calc.className='quote-calculator';
 field(calc,'width','가로 (mm)','number',100000);
 field(calc,'height','높이 (mm)','number',100000);
 field(calc,'thickness','두께 · 선택','text',30).placeholder='예: T140';row.append(calc);
 for(const [key,title,type,max,value]of [['name','견적서 표시 품명','text',80,'페브릭 백월'],['size','규격','text',100,''],['quantity','수량','number',1000000,'1'],['price','단가 합계 (원)','number',1000000000,''],['note','추가 비고','text',150,'']]){const input=field(row,key,title,type,max,value);input.required=['name','quantity','price'].includes(key);}
 const detail=node('p');detail.className='price-detail';row.append(detail);
 const amount=node('p');amount.className='amount';row.append(amount);$('#items').append(row);sync(row);totals();
}
$('#add-item').onclick=()=>{addItem();dirty=true;};
function changed(event){dirty=true;if(event.target.name==='pricingMode'){for(const row of $('#items').children)sync(row);}else{const row=event.target.closest('.quote-item');if(row)sync(row,event.target.dataset.key==='product');}totals();}
form.addEventListener('input',changed);form.addEventListener('change',event=>{if(event.target.tagName==='SELECT')changed(event);});
form.onsubmit=async event=>{
 event.preventDefault();if(busy)return;
 const data=Object.fromEntries(new FormData(form));data.items=[...$('#items').children].map(row=>{
  const item=Object.fromEntries(['name','size','quantity','price','note'].map(k=>[k,['quantity','price'].includes(k)?Number(get(row,k).value):get(row,k).value]));
  if(get(row,'product').value!=='manual')item.pricing=pricing(row);return item;
 });
 busy=true;form.querySelectorAll('button,input,select').forEach(n=>n.disabled=true);status('엑셀 파일을 만들고 있습니다.');
 try{
  const r=await fetch('/api/admin/quotes/export',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify(data)});
  if(!r.ok){const d=await r.json();throw Error(d.error||'다운로드하지 못했습니다.');}
  const blob=await r.blob(),url=URL.createObjectURL(blob),a=node('a');a.href=url;a.download=(data.customer+'_'+data.date+'_견적서.xlsx').replace(/[\\/:*?"<>|]/g,'_');document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);status('엑셀 다운로드를 시작했습니다. 다운로드 폴더에서 확인해 주세요.');dirty=false;
 }catch(e){status(e.message,true);}finally{busy=false;form.querySelectorAll('button,input,select').forEach(n=>n.disabled=false);for(const row of $('#items').children)sync(row);}
};
window.addEventListener('beforeunload',e=>{if(dirty||busy){e.preventDefault();e.returnValue='';}});
(async()=>{try{
 const r=await fetch('/api/session',{cache:'no-store'}),d=await r.json();if(!r.ok)throw Error(d.error);csrf=d.csrf;
 const pr=await fetch('/api/admin/quotes/pricing',{cache:'no-store'}),pd=await pr.json();if(!pr.ok)throw Error(pd.error);config=pd.config;
 form.elements.date.value=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date());addItem();form.hidden=false;status('관리자 전용 견적서입니다.');
}catch(e){status(e.message||'로그인이 필요합니다.',true);if(!csrf){const a=node('a','관리자 로그인');a.href='/admin/';$('#status').append(document.createTextNode(' '),a);}}})();
