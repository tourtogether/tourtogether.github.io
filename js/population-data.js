// Official public dashboard endpoints, verified with CORS and credentials omitted.
const NAMES={POI068:'성수카페거리',POI101:'서울숲공원'};
const ORIGIN='https://data.seoul.go.kr/SeoulRtd/api/';
const LEVELS=new Set(['여유','보통','약간붐빔','붐빔']);
class PopulationDataError extends Error{constructor(code,message){super(message);this.code=code;}}
const invalid=()=>{throw new PopulationDataError('invalid-schema','Unexpected official population response');};
const koreanTime=date=>date.toISOString().slice(0,19)+'+09:00';
function wallDate(year,month,day,hour=0,minute=0){
 const value=new Date(Date.UTC(year,month-1,day,hour,minute));
 if(value.getUTCFullYear()!==year||value.getUTCMonth()!==month-1||value.getUTCDate()!==day||value.getUTCHours()!==hour||value.getUTCMinutes()!==minute)invalid();
 return value;
}
function level(value){const normalized=typeof value==='string'?value.replace(/\s/g,''):'';if(!LEVELS.has(normalized))invalid();return normalized;}
function range(value){
 if(typeof value!=='string')invalid();
 const match=value.replace(/\s/g,'').match(/^((?:\d+|\d{1,3}(?:[,/]\d{3})+))~((?:\d+|\d{1,3}(?:[,/]\d{3})+))명?$/);if(!match)invalid();
 const min=Number(match[1].replace(/[,/]/g,'')),max=Number(match[2].replace(/[,/]/g,''));if(!Number.isSafeInteger(min)||!Number.isSafeInteger(max)||min<0||max<min)invalid();return {min,max};
}
function parsePopulation(raw,latest,expectedName){
 if(!Array.isArray(raw)||raw.length!==1||raw[0]?.hotspot_nm!==expectedName||!latest||typeof latest!=='object')invalid();
 if(!/^\d{8}$/.test(latest.baseDate)||!/^\d{4}$/.test(latest.timeCd))invalid();
 const year=Number(latest.baseDate.slice(0,4)),month=Number(latest.baseDate.slice(4,6)),day=Number(latest.baseDate.slice(6,8));
 const spatial=wallDate(year,month,day,Number(latest.timeCd.slice(0,2)),Number(latest.timeCd.slice(2)));
 if(latest.text!==spatial.toISOString().slice(0,19).replace('T',' '))invalid();
 const row=raw[0],keys=['time_cd','people_interval','people_value','congestion_label_list','people_text_list'];
 if(keys.some(key=>typeof row[key]!=='string'))invalid();
 const [labels,ranges,values,levels,roles]=keys.map(key=>row[key].split('|'));
 if(labels.length<3||[ranges,values,levels,roles].some(a=>a.length!==labels.length))invalid();
 const current=labels.indexOf('현재');if(current<0||labels.lastIndexOf('현재')!==current||roles[current]!=='인구수')invalid();
 // Interpret the dashboard's explicit midnight date label. No collection minute
 // or separate spatial heatmap minute is substituted for the chart reference.
 const anchorIndex=labels.findIndex(label=>/^\d{1,2}\/\d{1,2}\s+\d{1,2}시$/.test(label));if(anchorIndex<0)invalid();
 const anchorParts=labels[anchorIndex].match(/^(\d{1,2})\/(\d{1,2})\s+(\d{1,2})시$/);
 const anchors=[year-1,year,year+1].flatMap(y=>{try{return [wallDate(y,Number(anchorParts[1]),Number(anchorParts[2]),Number(anchorParts[3]))];}catch{return [];}});if(!anchors.length)invalid();
 anchors.sort((a,b)=>Math.abs(a-spatial)-Math.abs(b-spatial));
 const reference=new Date(+anchors[0]-(anchorIndex-current)*3600000);
 const series=labels.map((label,i)=>{
  const time=new Date(+reference+(i-current)*3600000),numbers=range(ranges[i]),midpoint=Number(values[i]);
  if(!/^\d+(?:\.\d+)?$/.test(values[i])||!Number.isFinite(midpoint)||midpoint<numbers.min||midpoint>numbers.max)invalid();
  if(i!==current){
   const match=label.match(/^(?:(\d{1,2})\/(\d{1,2})\s+)?(\d{1,2})시$/);if(!match||Number(match[3])!==time.getUTCHours())invalid();
   if(match[1]&&(Number(match[1])!==time.getUTCMonth()+1||Number(match[2])!==time.getUTCDate()))invalid();
   if(roles[i]!== (i<current?'과거 인구수':'예상 인구수'))invalid();
  }
  return {time:koreanTime(time),...numbers,congestionLevel:level(levels[i]),sourceLabel:label};
 });
 return {populationMin:series[current].min,populationMax:series[current].max,congestionLevel:series[current].congestionLevel,
  observedAt:koreanTime(reference),chartReferenceAt:koreanTime(reference),observedAtPrecision:'hour',observedAtMeaning:'dashboard_hour_label_not_exact_measurement_time',measurementTime:null,timeReferenceMayBeRounded:true,
  spatialDataObservedAt:koreanTime(spatial),spatialDataTimeMeaning:'separate_heatmap_latest_time_not_population_count_timestamp',
  history:series.slice(0,current),forecast:series.slice(current+1)};
}
async function fetchJson(url,signal){
 const response=await fetch(url,{mode:'cors',credentials:'omit',cache:'no-store',headers:{Accept:'application/json'},signal});
 if(!response.ok)throw new PopulationDataError('http',`Official source returned HTTP ${response.status}`);
 const text=await response.text();if(/^\s*</.test(text))throw new PopulationDataError('waiting-page','Official source returned an HTML waiting page');
 try{return JSON.parse(text);}catch{throw new PopulationDataError('invalid-json','Official source returned invalid JSON');}
}

/** Manually refresh two fixed official areas; geometry and names always come from the base snapshot. */
export async function refreshPopulation(baseSnapshot,{signal}={}){
 if(baseSnapshot?.schemaVersion!==1||!Array.isArray(baseSnapshot.areas)||!baseSnapshot.areas.length||baseSnapshot.areas.some(a=>!a||typeof a.id!=='string')||new Set(baseSnapshot.areas.map(a=>a.id)).size!==baseSnapshot.areas.length)throw new PopulationDataError('invalid-snapshot','A valid base snapshot with unique area IDs is required');
 if(signal?.aborted)throw new DOMException('Population refresh cancelled','AbortError');
 const controller=new AbortController();let timedOut=false;
 const cancel=()=>controller.abort();signal?.addEventListener('abort',cancel,{once:true});
 const timeout=setTimeout(()=>{timedOut=true;controller.abort();},15000);
 try{
  const areas=await Promise.all(baseSnapshot.areas.map(async area=>{
   const officialName=NAMES[area.id];if(!officialName)return {...area,refreshError:{code:'unsupported-area',message:'No fixed official source for this area'}};
   const query='?hotspotNm='+encodeURIComponent(officialName);
   try{
    const [raw,latest]=await Promise.all([fetchJson(ORIGIN+'ppltn_congest'+query,controller.signal),fetchJson(ORIGIN+'getLatestDate'+query,controller.signal)]);
    const data=parsePopulation(raw,latest,officialName);
    const refreshed={...area,...data,fetchedAt:new Date().toISOString()};delete refreshed.refreshError;return refreshed;
   }catch(error){
    if(signal?.aborted)throw new DOMException('Population refresh cancelled','AbortError');
    return {...area,refreshError:{code:timedOut?'timeout':error.code||'network',message:timedOut?'Official refresh exceeded 15 seconds':error.message||'Official source unavailable'}};
   }
  }));
  const succeeded=areas.filter(area=>!area.refreshError).length,attemptedAt=new Date().toISOString();
  return {...baseSnapshot,areas,snapshot:true,refreshStatus:succeeded===areas.length?'ok':succeeded?'partial':'failed',lastRefreshAttemptAt:attemptedAt,
   fetchedAt:succeeded===areas.length?attemptedAt:baseSnapshot.fetchedAt};
 }finally{clearTimeout(timeout);signal?.removeEventListener('abort',cancel);}
}
