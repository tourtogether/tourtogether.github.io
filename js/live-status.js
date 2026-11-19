// 운영시간 원문(한국어)을 현재 시각과 비교해 '지금 이용 가능/닫힘'을 계산한다.
// 원문을 확실히 해석할 수 있을 때만 결과를 내고, 애매하면 null(표시 안 함)을 돌려준다.
const DAY={일:0,월:1,화:2,수:3,목:4,금:5,토:6};
const OSM={Su:0,Mo:1,Tu:2,We:3,Th:4,Fr:5,Sa:6};
const mins=s=>{const [h,m]=s.split(':').map(Number);return h*60+m;};
function inRange(now,from,to){const a=mins(from),b=mins(to);return b>a?now>=a&&now<b:(now>=a||now<b);}
function osmDays(spec){const out=new Set();for(const part of spec.split(',')){const r=part.trim().match(/^(Mo|Tu|We|Th|Fr|Sa|Su)(?:-(Mo|Tu|We|Th|Fr|Sa|Su))?$/);if(!r)return null;let d=OSM[r[1]];const e=r[2]?OSM[r[2]]:d;out.add(d);while(d!==e){d=(d+1)%7;out.add(d);}}return out;}
export function openState(text,date=new Date()){
 if(typeof text!=='string')return null;
 const day=date.getDay(),now=date.getHours()*60+date.getMinutes(),weekend=day===0||day===6;
 const main=text.split(' / ')[0];
 if(/^상시\(24시간\)/.test(main)&&!/기타/.test(main))return 'open';
 let m=main.match(/^정시\((\d{2}:\d{2})~(\d{2}:\d{2})(,평일)?\)(?:\s|$)/);
 if(m){if(m[3]&&weekend)return 'closed';return inRange(now,m[1],m[2])?'open':'closed';}
 m=text.match(/^([일월화수목금토])·([일월화수목금토]) (\d{2}:\d{2})–(\d{2}:\d{2})/);
 if(m){if(![DAY[m[1]],DAY[m[2]]].includes(day))return 'closed';return inRange(now,m[3],m[4])?'open':'closed';}
 const osm=text.replace(/\s*\(지도 기록\)\s*$/,'');
 if(/^(Mo|Tu|We|Th|Fr|Sa|Su)/.test(osm)){
  for(const rule of osm.split(';')){const r=rule.trim().match(/^([A-Za-z,\- ]+?)\s+([\d:,\- ]+)$/);if(!r)return null;const days=osmDays(r[1].replace(/\s/g,''));if(!days)return null;
   if(!days.has(day))continue;
   const spans=r[2].split(',').map(s=>s.trim().split('-'));if(spans.some(s=>s.length!==2||!/^\d{2}:\d{2}$/.test(s[0])||!/^\d{2}:\d{2}$/.test(s[1])))return null;
   return spans.some(([a,b])=>inRange(now,a,b))?'open':'closed';}
  return 'closed';}
 return null;
}
