import {icon} from './icons.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const LEVELS={'여유':{key:'crowdRelaxed',color:'#438b70'},'보통':{key:'crowdNormal',color:'#b39339'},'약간 붐빔':{key:'crowdBusy',color:'#c18147'},'약간붐빔':{key:'crowdBusy',color:'#c18147'},'붐빔':{key:'crowdCrowded',color:'#bc675e'}};
const levelFor=value=>typeof value==='string'&&Object.hasOwn(LEVELS,value)?LEVELS[value]:{key:'notChecked',color:'#85958b'};
export function initPopulationUI({map,t,name,getData,onOpen,onClose,onRefresh}){
 let visible=false,busy=false,series='history';const layers=L.layerGroup().addTo(map);
 const stage=document.querySelector('.map-stage');
 stage.insertAdjacentHTML('beforeend',`<section id="population-panel" class="app-panel" hidden aria-labelledby="population-title"><header class="panel-header"><h2 id="population-title" data-i18n="populationOpen"></h2><button id="population-close" class="icon-button" data-i18n-label="close">${icon('close')}</button></header><div class="panel-body"><p class="panel-note" data-i18n="populationMeaning"></p><div class="population-actions"><label class="check-field"><input id="population-layer" type="checkbox"><span data-i18n="populationLayer"></span></label><button id="population-refresh" class="secondary-button" data-i18n="populationRefresh"></button></div><p id="population-status" class="panel-note" role="status"></p><div class="workspace-filters population-series"><button class="chip selected" data-series="history" data-i18n="populationHistory"></button><button class="chip" data-series="forecast" data-i18n="populationForecast"></button></div><div id="population-areas"></div><p class="panel-note" data-i18n="populationScopeNote"></p><a href="https://data.seoul.go.kr/SeoulRtd/" target="_blank" rel="noopener noreferrer" data-i18n="populationOfficial"></a></div></section>`);
 const $=id=>document.getElementById(id);const number=v=>Number.isFinite(v)?v.toLocaleString(document.documentElement.lang):'—';
 const range=(min,max)=>Number.isFinite(min)&&Number.isFinite(max)?`${number(min)}–${number(max)} ${t('peopleUnit')}`:t('populationNoValue');
 function time(value){if(typeof value!=='string'||!value)return t('notChecked');const date=new Date(value);return Number.isFinite(date.valueOf())?new Intl.DateTimeFormat(document.documentElement.lang,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Asia/Seoul'}).format(date):t('notChecked');}
 const areas=()=>Array.isArray(getData()?.areas)?getData().areas:[];
 function chart(area){
  const points=Array.isArray(area[series])?area[series].filter(p=>p&&typeof p==='object'&&typeof p.time==='string'&&Number.isFinite(Date.parse(p.time))&&Number.isFinite(p.min)&&Number.isFinite(p.max)&&p.min>=0&&p.max>=p.min):[];
  if(!points.length)return `<p class="panel-note">${esc(t('populationNoSeries'))}</p>`;
  const max=Math.max(1,...points.map(p=>p.max)),width=296/points.length;
  const bars=points.map((p,i)=>{const y=78-p.max/max*66,h=Math.max(2,(p.max-p.min)/max*66);return `<rect x="${12+i*width}" y="${y}" width="${Math.max(2,width-3)}" height="${h}" fill="${levelFor(p.congestionLevel).color}" opacity="${series==='forecast'?.6:.9}" tabindex="0"><title>${esc(time(p.time))}: ${esc(range(p.min,p.max))}</title></rect>`;}).join('');
  return `<svg class="population-chart" viewBox="0 0 320 94" role="img" aria-label="${esc(t(series==='forecast'?'populationForecast':'populationHistory'))}"><line x1="12" y1="80" x2="308" y2="80" stroke="#d3ded7"/>${bars}</svg><div class="chart-times"><span>${esc(time(points[0].time))}</span><span>${esc(time(points.at(-1).time))}</span></div><details class="population-table"><summary>${esc(t('populationTable'))}</summary><table><thead><tr><th>${esc(t('populationTime'))}</th><th>${esc(t('populationEstimate'))}</th></tr></thead><tbody>${points.map(p=>`<tr><td>${esc(time(p.time))}</td><td>${esc(range(p.min,p.max))}</td></tr>`).join('')}</tbody></table></details>`;
 }
 function draw(){layers.clearLayers();if(!visible)return;
  for(const area of areas()){
   const level=levelFor(area.congestionLevel);if(!area.geometry)continue;
   const polygon=L.geoJSON({type:'Feature',geometry:area.geometry,properties:{}},{interactive:false,style:{color:level.color,weight:2,dashArray:'6 5',fillOpacity:.035}}).addTo(layers);
   const point=polygon.getBounds().getCenter();const marker=L.marker(point,{zIndexOffset:850,title:name(area.names),icon:L.divIcon({className:'population-pin',html:`<div class="population-map-label"><span>${icon('people')}${esc(name(area.names))}</span><strong style="color:${level.color}">${esc(t(level.key))} · ${esc(range(area.populationMin,area.populationMax))}</strong><small>${esc(t('populationChartAt'))} ${esc(time(area.observedAt))}</small></div>`,iconSize:[190,68],iconAnchor:[95,34]})}).addTo(layers);
   marker.on('click',()=>{open();$('population-area-'+area.id)?.scrollIntoView({block:'nearest',behavior:'smooth'});});
  }
 }
 function render(){
  $('population-areas').innerHTML=areas().map(area=>{const level=levelFor(area.congestionLevel);
   return `<article class="population-area" id="population-area-${esc(area.id)}"><div class="population-area-heading"><h3>${esc(name(area.names))}</h3><span class="crowd-level" style="color:${level.color}">${esc(t(level.key))}</span></div><strong class="population-number">${esc(range(area.populationMin,area.populationMax))}</strong><p class="panel-note">${esc(t('populationChartAt'))}: ${esc(time(area.observedAt))} (KST)</p>${area.refreshError?`<p class="population-stale">${esc(t('populationOldData'))}</p>`:''}<button class="text-button" data-population-area="${esc(area.id)}">${esc(t('populationShowArea'))}</button>${chart(area)}<p class="panel-note">${esc(t('populationFetched'))}: ${esc(time(area.fetchedAt||getData()?.fetchedAt))}</p>${typeof area.sourceUrl==='string'&&area.sourceUrl.startsWith('https://')?`<a href="${esc(area.sourceUrl)}" target="_blank" rel="noopener noreferrer">${esc(t('source'))}</a>`:''}</article>`;
  }).join('')||`<p>${esc(t('populationUnavailable'))}</p>`;
  $('population-areas').querySelectorAll('[data-population-area]').forEach(button=>button.onclick=()=>{const area=areas().find(a=>a.id===button.dataset.populationArea);if(area?.geometry){setVisible(true);close();onClose();if(matchMedia('(max-width:760px)').matches){document.querySelector('.sidebar').classList.add('collapsed');document.getElementById('list-toggle').setAttribute('aria-expanded','false');}map.fitBounds(L.geoJSON(area.geometry).getBounds(),{paddingTopLeft:[35,40],paddingBottomRight:[35,110],maxZoom:16});}});
  $('population-layer').checked=visible;$('population-refresh').disabled=busy;$('population-refresh').textContent=t(busy?'populationRefreshing':'populationRefresh');
  $('population-status').textContent=t(busy?'populationRefreshing':getData()?.refreshStatus==='failed'?'populationRefreshFailed':getData()?.refreshStatus==='partial'?'populationRefreshPartial':'populationSnapshotNote');
  document.querySelectorAll('[data-series]').forEach(b=>{const selected=b.dataset.series===series;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));});
 }
 function translate(){const panel=$('population-panel');panel.querySelectorAll('[data-i18n]').forEach(el=>el.textContent=t(el.dataset.i18n));panel.querySelectorAll('[data-i18n-label]').forEach(el=>el.setAttribute('aria-label',t(el.dataset.i18nLabel)));render();draw();}
 function setVisible(value){visible=Boolean(value);$('population-layer').checked=visible;draw();}
 function close(){$('population-panel').hidden=true;}
 function open(){onOpen();$('population-panel').hidden=false;setVisible(true);translate();$('population-title').tabIndex=-1;$('population-title').focus({preventScroll:true});}
 $('population-close').onclick=()=>{close();onClose();};$('population-layer').onchange=e=>setVisible(e.target.checked);
 $('population-refresh').onclick=async()=>{if(busy)return;busy=true;render();try{await onRefresh();}catch{$('population-status').textContent=t('populationRefreshFailed');}finally{busy=false;render();draw();}};
 document.querySelectorAll('[data-series]').forEach(button=>button.onclick=()=>{series=button.dataset.series;render();});
 translate();return {open,close,translate,setVisible};
}
