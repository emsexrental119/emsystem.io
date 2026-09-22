'use strict';
const $ = s => document.querySelector(s);
let content, revision, csrf, dirty = false, editing = null, activeTab = 'works', busy = false;
const el = (tag, text, className) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (className) n.className = className; return n; };
const button = (text, action, className) => { const n = el('button',text,className); n.type='button'; n.onclick=action; return n; };
const photo = (src,alt) => { const n=el('img');n.src=src;n.alt=alt;n.loading='lazy';return n; };
function toast(text) { $('#toast').textContent=text; $('#toast').hidden=false; clearTimeout(toast.timer); toast.timer=setTimeout(()=>$('#toast').hidden=true,5000); }
function change() { dirty=true; $('#change-status').textContent='아직 저장하지 않은 변경사항이 있습니다.'; $('#save-status').textContent='수정 중'; }
function lock(on) { busy=on; document.querySelectorAll('button,input,textarea').forEach(n=>n.disabled=on); }
async function api(path,options={}) {
  const response=await fetch(path,{...options,credentials:'same-origin',headers:{...(options.body && typeof options.body==='string'?{'Content-Type':'application/json'}:{}),...(csrf?{'X-CSRF-Token':csrf}:{}),...options.headers}});
  const data=await response.json();
  if (!response.ok) { const e=new Error(data.error||'요청을 처리하지 못했습니다.');e.status=response.status;throw e; }
  return data;
}
async function run(action) { if(busy)return;lock(true);try{await action();}catch(e){toast(e.message);}finally{lock(false);} }
function showEditor() { $('#login-view').hidden=true;$('#editor-view').hidden=false; }
function showLogin() { $('#editor-view').hidden=true;$('#login-view').hidden=false;$('#login-error').textContent=''; }
async function loadContent() {
  const result=await api('/api/admin/content');content=result.content;revision=result.revision;dirty=false;render();
  $('#save-status').textContent='최근 저장 '+new Date(result.updatedAt).toLocaleString('ko-KR');
  $('#change-status').textContent='임시 저장과 사이트 적용을 선택할 수 있습니다.';
}
$('#login-form').onsubmit=async event=>{
  event.preventDefault();$('#login-error').textContent='';
  const form=new FormData(event.target);
  await run(async()=>{try{
    const r=await api('/api/login',{method:'POST',body:JSON.stringify({username:form.get('username'),password:form.get('password')})});csrf=r.csrf;event.target.elements.password.value='';
    if(!content)await loadContent();showEditor();
  }catch(e){$('#login-error').textContent=e.message;}});
};
$('#logout').onclick=()=>run(async()=>{if(dirty&&!confirm('저장하지 않은 변경사항이 있습니다. 로그아웃할까요?'))return;await api('/api/logout',{method:'POST'});csrf=null;content=null;dirty=false;showLogin();});
function render() { renderWorks();$('#hero-title').value=content.hero.title;$('#hero-description').value=content.hero.description;renderHero();renderServices(); }
function renderWorks() {
  $('#work-count').textContent=content.works.length;const list=$('#work-list');list.replaceChildren();
  if(!content.works.length)list.append(el('div','첫 번째 시공사례를 추가해 보세요.','empty'));
  content.works.forEach((w,index)=>{
    const card=el('article',undefined,'work-card');
    const handle=button('⠿',()=>{},'handle');handle.setAttribute('aria-label',w.title+' 순서 이동');handle.draggable=true;
    handle.ondragstart=e=>{e.dataTransfer.setData('text/plain',w.id);e.dataTransfer.effectAllowed='move';};
    card.ondragover=e=>{e.preventDefault();card.classList.add('drag-over');};card.ondragleave=()=>card.classList.remove('drag-over');
    card.ondrop=e=>{e.preventDefault();const from=content.works.findIndex(item=>item.id===e.dataTransfer.getData('text/plain'));if(from>=0)moveWork(from,index);};
    handle.ondragend=()=>document.querySelectorAll('.drag-over').forEach(n=>n.classList.remove('drag-over'));
    card.append(handle,photo(w.images[0].src,w.title));const info=el('div',undefined,'work-info');info.append(el('span',String(index+1).padStart(2,'0'),'number'));
    const title=el('h3',w.title);title.append(el('span',w.visible?'공개':'비공개','badge'+(w.visible?'':' hidden')));info.append(title,el('p',`${w.venue} · 사진 ${w.images.length}장${w.date?' · '+w.date:''}`));card.append(info);
    const actions=el('div',undefined,'card-actions');const up=button('↑',()=>moveWork(index,index-1));up.setAttribute('aria-label',w.title+' 위로');const down=button('↓',()=>moveWork(index,index+1));down.setAttribute('aria-label',w.title+' 아래로');
    actions.append(up,down,button('수정',()=>openWork(w)),button('삭제',()=>{if(confirm(`‘${w.title}’ 사례를 삭제할까요? 사이트에는 ‘사이트에 적용’ 후 반영됩니다.`)){content.works.splice(index,1);change();renderWorks();}},'danger'));card.append(actions);list.append(card);
  });
}
function moveWork(from,to) { if(to<0||to>=content.works.length||from===to)return;const [w]=content.works.splice(from,1);content.works.splice(to,0,w);change();renderWorks(); }
function setTab(tab) {activeTab=tab;for(const name of ['works','hero','services']){$(`#${name}-panel`).hidden=name!==tab;$(`#tab-${name}`).classList.toggle('active',name===tab);$(`#tab-${name}`).setAttribute('aria-pressed',String(name===tab));}}
$('#tab-services').onclick=()=>setTab('services');
function renderServices() {
  const list=$('#service-list');list.replaceChildren();
  content.services.forEach((s,i)=>{
    const card=el('article',undefined,'panel service-editor');card.append(el('h3',`${s.num} · ${s.title}`));
    const grid=el('div',undefined,'hero-grid'),fields=el('div');
    for(const [key,label,max,rows] of [['title','제목',120,0],['subtitle','보조 제목',200,0],['desc','설명',1500,5],['btn','버튼 문구',80,0]]){
      const wrap=el('label',label),input=el(rows?'textarea':'input');input.id=`service-${i}-${key}`;input.maxLength=max;if(rows)input.rows=rows;input.value=s[key];
      input.oninput=()=>{s[key]=input.value;change();};wrap.append(input);fields.append(wrap);
    }
    const media=el('div'),img=photo(s.img,`${s.num}번 소개 이미지`);img.className='service-photo';media.append(img);
    const label=el('label','사진 교체','button'),input=el('input');input.type='file';input.accept='image/jpeg,image/png,image/webp';input.hidden=true;input.setAttribute('aria-label',`${s.num}번 소개 사진 교체`);
    input.onchange=()=>{const file=input.files[0];input.value='';if(file)run(async()=>{const src=await upload(file);s.img=src;img.src=src;change();toast(`${s.num}번 사진을 교체했습니다. 사이트에 적용하면 공개됩니다.`);});};
    label.append(input);media.append(label,el('p','사진과 문구 수정 후 아래 ‘사이트에 적용’을 눌러주세요.','muted'));grid.append(fields,media);card.append(grid);list.append(card);
  });
}
$('#tab-works').onclick=()=>setTab('works');$('#tab-hero').onclick=()=>setTab('hero');
$('#hero-title').oninput=e=>{content.hero.title=e.target.value;change();};$('#hero-description').oninput=e=>{content.hero.description=e.target.value;change();};
function imageGrid(target,images,onChange) {
  const grid=$(target);grid.replaceChildren();
  images.forEach((i,index)=>{
    const card=el('div',undefined,'image-card');card.append(photo(i.src,i.alt));const tools=el('div',undefined,'image-tools');tools.append(el('span',String(index+1)));
    const shift=delta=>{const to=index+delta;if(to<0||to>=images.length)return;[images[index],images[to]]=[images[to],images[index]];onChange();};
    tools.append(button('↑',()=>shift(-1)),button('↓',()=>shift(1)));
    const replace=el('label','교체');const input=el('input');input.type='file';input.accept='image/jpeg,image/png,image/webp';input.hidden=true;
    input.onchange=()=>run(async()=>{if(!input.files[0])return;const replacement=await upload(input.files[0]);images[index]={src:replacement,alt:i.alt};onChange();toast('사진을 교체했습니다.');});replace.append(input);tools.append(replace);
    tools.append(button('×',()=>{if(confirm('이 사진을 목록에서 뺄까요?')){images.splice(index,1);onChange();}},'danger'));tools.lastChild.setAttribute('aria-label',`${index+1}번 사진 삭제`);card.append(tools);grid.append(card);
  });
  if(!images.length)grid.append(el('p','사진을 추가해 주세요.','empty'));
}
function renderHero(){ $('#hero-count').textContent=content.hero.images.length+'장';imageGrid('#hero-images',content.hero.images,()=>{change();renderHero();}); }
function renderWorkImages(){imageGrid('#work-images',editing.images,renderWorkImages);}
function openWork(work) {
  editing=work?structuredClone(work):{id:crypto.randomUUID(),title:'',venue:'',date:'',visible:true,images:[]};
  $('#work-dialog-title').textContent=work?'시공사례 수정':'시공사례 추가';$('#work-title').value=editing.title;$('#work-venue').value=editing.venue;$('#work-date').value=editing.date;$('#work-visible').checked=editing.visible;renderWorkImages();$('#work-dialog').showModal();
}
$('#add-work').onclick=()=>openWork();
function closeWork(){if(!busy){$('#work-dialog').close();editing=null;}}
$('#close-work').onclick=closeWork;$('#cancel-work').onclick=closeWork;
$('#work-dialog').addEventListener('cancel',e=>{if(busy)e.preventDefault();});
$('#work-form').onsubmit=event=>{event.preventDefault();if(busy)return;if(!editing.images.length)return alert('사진을 한 장 이상 추가해 주세요.');Object.assign(editing,{title:$('#work-title').value.trim(),venue:$('#work-venue').value.trim(),date:$('#work-date').value.trim(),visible:$('#work-visible').checked});if(!editing.title||!editing.venue)return;const i=content.works.findIndex(w=>w.id===editing.id);if(i<0)content.works.push(editing);else content.works[i]=editing;change();renderWorks();closeWork();};
async function upload(file) {
  if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('JPG, PNG, WebP 사진을 선택해 주세요.');
  if(file.size>30*1024*1024)throw new Error('사진 한 장은 30MB 이하로 선택해 주세요.');
  const bitmap=await createImageBitmap(file);const ratio=Math.min(1,2000/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*ratio);canvas.height=Math.round(bitmap.height*ratio);const context=canvas.getContext('2d');context.fillStyle='#ffffff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
  let blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.88));if(!blob)throw new Error('사진을 읽지 못했습니다.');
  for(const quality of [.78,.65,.5]){if(blob.size<=1500*1024)break;blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));}
  if(!blob || blob.size>1500*1024)throw new Error('사진 용량이 큽니다. 조금 작은 사진으로 다시 선택해 주세요.');
  const r=await api('/api/admin/upload',{method:'POST',headers:{'Content-Type':'image/jpeg'},body:blob});return r.src;
}
async function addImages(input,images,max,onChange){
  const files=[...input.files];input.value='';if(files.length+images.length>max)throw new Error(`사진은 최대 ${max}장까지 등록할 수 있습니다.`);
  for(let i=0;i<files.length;i++){toast(`사진 업로드 중 ${i+1} / ${files.length}`);const src=await upload(files[i]);images.push({src,alt:''});onChange();}
  toast(`사진 ${files.length}장을 추가했습니다.`);
}
$('#hero-upload').onchange=e=>run(()=>addImages(e.target,content.hero.images,20,()=>{change();renderHero();}));
$('#work-upload').onchange=e=>run(()=>addImages(e.target,editing.images,50,renderWorkImages));
async function save(publish) {
  if(!content.hero.title.trim()||!content.hero.images.length)throw new Error('메인 제목과 배경 사진을 한 장 이상 입력해 주세요.');
  if(publish&&!confirm('현재 내용과 순서를 홈페이지에 적용할까요?'))return;
  try{
    const r=await api(publish?'/api/admin/publish':'/api/admin/content',{method:publish?'POST':'PUT',body:JSON.stringify({content,revision})});revision=r.revision;dirty=false;
    $('#save-status').textContent=(publish?'사이트 적용 완료 · ':'임시 저장 완료 · ')+new Date().toLocaleTimeString('ko-KR');$('#change-status').textContent=publish?'홈페이지를 새로 열면 변경된 내용을 볼 수 있습니다.':'임시 저장했습니다. 홈페이지에 공개하려면 사이트에 적용을 누르세요.';toast(publish?'홈페이지에 적용했습니다.':'임시 저장했습니다.');
  }catch(e){if(e.status===401){showLogin();$('#login-error').textContent='로그인이 만료되었습니다. 다시 로그인하면 수정 내용을 이어갈 수 있습니다.';}throw e;}
}
$('#save').onclick=()=>run(()=>save(false));$('#publish').onclick=()=>run(()=>save(true));
function previewCarousel(images,node) {let i=0;const img=node.querySelector('img');const controls=el('div',undefined,'preview-tools');const count=el('span',`1 / ${images.length}`);const step=delta=>{i=(i+delta+images.length)%images.length;img.src=images[i].src;count.textContent=`${i+1} / ${images.length}`;};controls.append(button('←',()=>step(-1)),count,button('→',()=>step(1)));return controls;}
$('#preview').onclick=()=>{
  const target=$('#preview-body');target.replaceChildren();
  if(activeTab==='hero'){
    const hero=el('div',undefined,'hero-preview');if(content.hero.images.length)hero.append(photo(content.hero.images[0].src,''));hero.append(el('h2',content.hero.title),el('p',content.hero.description));target.append(hero);if(content.hero.images.length)target.append(previewCarousel(content.hero.images,hero));
  }else if(activeTab==='services'){
    for(const s of content.services){const card=el('article',undefined,'preview-work');card.append(el('h3',`${s.num} · ${s.title}`),el('p',s.subtitle),el('p',s.desc),photo(s.img,s.title),el('p',s.btn));target.append(card);}
  }else{
    const works=content.works.filter(w=>w.visible);if(!works.length)target.append(el('p','공개할 시공사례가 없습니다.','empty'));
    for(const w of works){const card=el('article',undefined,'preview-work');card.append(el('h3',`${w.venue} · ${w.title}`),photo(w.images[0].src,w.title));target.append(card,previewCarousel(w.images,card));}
  }
  $('#preview-dialog').showModal();
};
$('#close-preview').onclick=()=>$('#preview-dialog').close();
window.addEventListener('beforeunload',e=>{if(dirty||busy){e.preventDefault();e.returnValue='';}});
document.addEventListener('click',e=>{if(busy){e.preventDefault();e.stopImmediatePropagation();}},true);
(async()=>{try{const r=await api('/api/session');csrf=r.csrf;await loadContent();showEditor();}catch(e){showLogin();if(e.status!==401)$('#login-error').textContent=e.message;}})();
