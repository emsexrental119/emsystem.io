'use strict';
let printSnapshotOpen=false;
function prepareSchedulePrint(){
  if(!state)return false;
  const events=selectedEvents(),month=$('#month').value,query=$('#search').value.trim();
  const root=$('#print-report');root.replaceChildren();
  const tools=node('div',undefined,'print-tools');
  tools.append(button('← 일정으로 돌아가기',closeSchedulePrint),button('인쇄 / PDF 저장',()=>window.print(),'primary'));
  tools.append(node('p','A4 세로에 맞춰 정리했습니다. 인쇄 설정에서 머리글·바닥글을 끄면 공유 주소가 종이에 표시되지 않습니다.'));
  root.append(tools);
  const title=node('div',undefined,'print-title');
  title.append(node('p','EMSYSTEM · 행사 일정표','print-brand'),node('h1',month.replace('-','년 ')+'월 행사 일정 · 날짜 미정 포함'));
  title.append(node('p','행사 '+events.length+'건 · 품목 '+events.reduce((n,e)=>n+e.items.length,0)+'줄 · 수량 합계 '+events.reduce((n,e)=>n+e.items.reduce((s,i)=>s+i.quantity,0),0)+'개'));
  if(query)title.append(node('p','검색 조건: '+query));
  title.append(node('p','출력 기준 '+new Date().toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})+' · 최근 수정 '+new Date(state.updatedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}),'print-meta'));
  root.append(title);
  if(!events.length){root.append(node('p','선택한 월과 검색 조건에 해당하는 일정이 없습니다.'));return true;}
  root.append(node('h2','일정 한눈에 보기'));
  const table=node('table',undefined,'print-overview'),head=node('thead'),hr=node('tr');
  for(const text of ['설치일','철거일','행사명','수량'])hr.append(node('th',text));
  head.append(hr);table.append(head);
  const body=node('tbody');
  for(const e of events){const row=node('tr');for(const text of [e.installDate||'미정',e.removalDate||'미정',e.title,e.items.reduce((n,i)=>n+i.quantity,0)+'개'])row.append(node('td',text));body.append(row);}
  table.append(body);root.append(table,node('h2','행사별 품목'));
  for(const card of $('#events').children){
    const copy=card.cloneNode(true);copy.removeAttribute('id');
    copy.querySelectorAll('.actions,button,[id]').forEach(el=>{if(el.matches('.actions,button'))el.remove();else el.removeAttribute('id');});
    root.append(copy);
  }
  return true;
}
function closeSchedulePrint(){document.body.classList.remove('print-preview');printSnapshotOpen=false;$('#print-schedule').focus();}
function openSchedulePrint(){if(busy||!prepareSchedulePrint())return;printSnapshotOpen=true;document.body.classList.add('print-preview');window.scrollTo(0,0);$('#print-report button').focus();}
const report=node('section',undefined,'print-report');report.id='print-report';report.setAttribute('aria-label','일정 인쇄 미리보기');document.body.append(report);
$('#print-schedule').onclick=openSchedulePrint;
window.addEventListener('beforeprint',()=>{if(!printSnapshotOpen)prepareSchedulePrint();});
window.addEventListener('keydown',event=>{if(event.key==='Escape'&&printSnapshotOpen)closeSchedulePrint();});
