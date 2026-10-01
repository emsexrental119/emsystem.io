export function fabricPrice(input,config){
 if(!input||!['general','contract','dispatch'].includes(input.mode)||!['frame','print','both'].includes(input.component))throw Error('패브릭 단가 종류와 품명을 선택해 주세요.');
 const {width,height,mode,component}=input;
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>100000||height>100000)throw Error('가로·높이를 1~100,000mm 정수로 입력해 주세요.');
 const rule=config?.[mode];if(!rule)throw Error('해당 단가 기준이 등록되지 않았습니다.');
 const area=width*height,meters=Math.ceil(width/1000);
 const rate=(value,r)=>{if(!Number.isSafeInteger(r?.numerator)||r.numerator<0||!Number.isSafeInteger(r?.denominator)||r.denominator<1)throw Error('단가 기준을 확인해 주세요.');const n=value*r.numerator;if(!Number.isSafeInteger(n))throw Error('계산 범위를 초과했습니다.');return n/r.denominator;};
 let frame=0,printing=0;
 if(component!=='print'){
  if(mode==='dispatch'){
   if(!Number.isSafeInteger(rule.perMeter)||rule.perMeter<0)throw Error('출고 단가를 확인해 주세요.');
   frame=meters*rule.perMeter;
  }else frame=rate(area,rule.frame);
 }
 if(component!=='frame')printing=rate(area,rule.print);
 // Round each separately quoted component to the nearest won.
 frame=Math.round(frame);printing=Math.round(printing);
 const price=frame+printing;if(!Number.isSafeInteger(price)||price>1000000000)throw Error('품목 단가가 허용 범위를 초과했습니다.');
 return {frame,printing,price,meters,area:area/1000000};
}
