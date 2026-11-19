import {icon,fillIcons} from './icons.js';
import {GeofenceEngine,DEFAULT_GEOFENCE_CONFIG} from './geofence.js';
import {MAP_CONFIG} from './config.js';
import {sanitizeCollection,validGeometry} from './resources.js';
import {pointInPolygon} from './geofence.js';
import {initWorkspace} from './workspace.js';
import {initRouteUI} from './route-ui.js';
import {parseTeamBundle,emptyTeamBundle} from './team-data.js';
import {SPACE_CATEGORIES,spaceCategory,spaceStyle,spaceTranslations} from './categories.js';
import {initPopulationUI} from './population-ui.js';
import {refreshPopulation} from './population-data.js';
import {openState} from './live-status.js';

const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const locales=['ko','en','ja','zh'];
const state={mode:'live',category:'all',query:'',selected:null,lang:'ko',statusKey:'locationIntro',scene:0,auto:null,watch:null,generation:0,position:null,nav:'map',legendExpanded:true};
let dictionaries={},collections={},map,tiles,zoneLayer,markerLayer,locationLayer,engine,trace,scopeLayer,issueLayer,workspace,routeUI,populationUI;
let teamData={places:{features:[]},zones:{features:[]},issues:{features:[]}},livePlaces=[],liveZones=[],liveIssues=[],demoPlaces=[],demoZones=[],network=null,coverage={},scope={features:[]},dataRevision=0,renderedZoneKey='';
let publishedTeamData=emptyTeamBundle();
let landcover={features:[]},landcoverLines={features:[]},landcoverCoverage={},populationData={schemaVersion:1,areas:[]};
const visibleKinds=new Set([...SPACE_CATEGORIES.map(c=>c.id),'no_smoking']);
function mergeFeatures(base,edits){return [...new Map([...base,...edits].map(f=>[f.properties.id,f])).values()];}
function refreshData(){livePlaces=mergeFeatures(mergeFeatures(collections.officialPlaces.features,publishedTeamData.places.features),teamData.places.features);liveZones=mergeFeatures(mergeFeatures([...landcover.features,...collections.officialZones.features],publishedTeamData.zones.features),teamData.zones.features);liveIssues=mergeFeatures(mergeFeatures(collections.issues?.features||[],publishedTeamData.issues.features),teamData.issues.features);demoPlaces=[...livePlaces,...collections.demoPlaces.features];demoZones=[...liveZones,...collections.demoZones.features];dataRevision++;}
const markers=new Map();
const alertHistories={live:new Map(),demo:new Map()};
function makeEngine(zones,mode){return new GeofenceEngine(zones,{mode,allowMapRecords:mode==='live',alertHistory:alertHistories[mode]});}
let toastTimer,positionExpiry;
const readPreference=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}};
const storedSaved=readPreference('together.saved',[]);
const saved=new Set((Array.isArray(storedSaved)?storedSaved:[]).filter(x=>typeof x==='string'));
const t=key=>dictionaries[state.lang]?.[key]??dictionaries.en?.[key]??key;
const dictionary=raw=>raw&&typeof raw==='object'&&!Array.isArray(raw)?Object.fromEntries(Object.entries(raw).filter(([,value])=>typeof value==='string')):{};
const validBounds=b=>Array.isArray(b)&&b.length===4&&b.every(Number.isFinite)&&b[0]>=-180&&b[2]<=180&&b[1]>=-90&&b[3]<=90&&b[0]<b[2]&&b[1]<b[3];
const name=(values)=>values?.[state.lang]||values?.ko||'';
const isDemo=p=>p.verification==='demo';
const allPlaces=()=>state.mode==='demo'?demoPlaces:livePlaces;
const allZones=()=>state.mode==='demo'?demoZones:liveZones;
function spaceLayers(){const counts={};for(const f of allZones()){const category=spaceCategory(f);if(category)counts[category]=(counts[category]||0)+1;}return SPACE_CATEGORIES.filter(c=>counts[c.id]).map(c=>({...c,count:counts[c.id],checked:visibleKinds.has(c.id)}));}
function renderSpaceLegend(){
 const main=['residential','commercial','mixed','school','park','water'];
 const legend=document.querySelector('.map-legend');let heading=$('legend-toggle');if(!heading){heading=document.createElement('button');heading.id='legend-toggle';heading.className='legend-heading';heading.type='button';legend.querySelector('.legend-heading').replaceWith(heading);}heading.innerHTML=`<span>${esc(t('areaLayers'))}</span>${icon('chevron')}`;heading.setAttribute('aria-expanded',String(state.legendExpanded));heading.onclick=()=>{state.legendExpanded=!state.legendExpanded;renderSpaceLegend();};legend.classList.toggle('is-collapsed',!state.legendExpanded);
 document.querySelector('.map-legend .legend-items').innerHTML=main.map(key=>`<label><input type="checkbox" data-space-kind="${key}" ${visibleKinds.has(key)?'checked':''}><span class="legend-dot" style="background:${spaceStyle(key).color}"></span><span>${esc(t('space_'+key))}</span></label>`).join('');
 let more=$('layer-options');if(!more){more=document.createElement('button');more.id='layer-options';more.className='text-button';document.querySelector('.map-legend').append(more);}more.textContent=t('allSpaceLayers');more.onclick=()=>workspace?.openCoverage();
}
function syncSpaceInputs(){document.querySelectorAll('[data-space-kind]').forEach(input=>input.checked=visibleKinds.has(input.dataset.spaceKind));}
const categoryMatch=(p,category)=>category==='all'||(category==='saved'?saved.has(p.id):category==='selected'?p.teamSelected===true:category==='restaurant'?['restaurant','cafe'].includes(p.category):category==='bin'?['bin','recycling'].includes(p.category):p.category===category);
function syncNav(nav='map'){state.nav=nav;document.querySelectorAll('[data-nav]').forEach(b=>{const active=b.dataset.nav===nav;b.classList.toggle('active',active);if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});}
function openTools(nav){if(state.mode==='demo'){setMode('live');$('demo-panel').hidden=true;}stopAuto();state.selected=null;$('detail-panel').hidden=true;const u=new URL(location.href);u.searchParams.delete('place');history.replaceState(null,'',u);if(nav!=='routes')routeUI?.close();if(nav!=='population')populationUI?.close();if(['routes','edit','coverage'].includes(nav))populationUI?.setVisible(false);workspace?.close();syncNav(nav);}

function status(key){state.statusKey=key;$('location-status').textContent=t(key);}
function toast(key){$('toast').textContent=t(key);$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,3200);}
function applyLanguage(){
 document.documentElement.lang=state.lang==='zh'?'zh-Hans':state.lang;
 document.querySelectorAll('[data-i18n]').forEach(el=>el.textContent=t(el.dataset.i18n));
 document.querySelectorAll('[data-placeholder]').forEach(el=>{el.placeholder=t(el.dataset.placeholder);el.setAttribute('aria-label',t(el.dataset.placeholder));});
 document.querySelectorAll('[data-i18n-label]').forEach(el=>{el.setAttribute('aria-label',t(el.dataset.i18nLabel));el.title=t(el.dataset.i18nLabel);});
 $('language').value=state.lang;
 document.querySelector('.rail').setAttribute('aria-label',t('navigation'));
 document.querySelector('.sidebar').setAttribute('aria-label',t('nearby'));
 $('map').setAttribute('aria-label',t('mapTitle'));
 $('language').setAttribute('aria-label',t('language'));
 $('area-reset').setAttribute('aria-label',t('areaReset'));
 document.querySelector('.filters').setAttribute('aria-label',t('categories'));
 $('demo-badge').hidden=state.mode!=='demo';
 $('map-legend-note').textContent=t(state.mode==='demo'?'zoneDisclaimer':'mappedZoneNote');
 $('map-intro-note').textContent=t(state.mode==='demo'?'zoneDisclaimer':'realMapNote');
 status(state.statusKey);renderList();renderMap();renderScene();
 if(state.lastAlert)renderAlertText();
 if(state.selected)renderDetail(state.selected,false);
 renderSpaceLegend();workspace?.translate();routeUI?.translate();populationUI?.translate();
}
function distance([lng,lat]){
 if(!state.position||state.mode!=='live')return '';
 const dx=(lng-state.position.lng)*111195*Math.cos(lat*Math.PI/180),dy=(lat-state.position.lat)*111195;
 const m=Math.hypot(dx,dy);return `${t('straightDistance')} ${m<1000?Math.round(m)+' m':(m/1000).toFixed(1)+' km'}`;
}
function liveBadge(p){if(isDemo(p))return '';const s=openState(p.hours?.ko);if(!s)return '';const k=p.category==='recycling'?(s==='open'?'dropNow':'dropClosed'):(s==='open'?'openNow':'closedNow');return `<span class="live-badge ${s}"><span class="live-dot"></span>${esc(t(k))}</span>`;}
function badge(p){return `<span class="record-badge ${isDemo(p)?'demo-record':''}">${icon(isDemo(p)?'info':'check')}${esc(t(p.verification))}</span>`;}
function filtered(){
 const q=state.query.trim().normalize('NFKC').toLocaleLowerCase();
 const result=allPlaces().filter(f=>{
  const p=f.properties;
  const haystack=[...Object.values(p.names||{}),...Object.values(p.address||{}),t(p.category)].join(' ').normalize('NFKC').toLocaleLowerCase();
  return categoryMatch(p,state.category)&&(!q||haystack.includes(q));
 });
 if(state.mode==='live'&&state.position)result.sort((a,b)=>map.distance([state.position.lat,state.position.lng],a.geometry.coordinates.slice().reverse())-map.distance([state.position.lat,state.position.lng],b.geometry.coordinates.slice().reverse()));
 return result;
}
function renderList(){
 const activeId=document.activeElement?.dataset?.placeId;
 const places=filtered();$('result-count').textContent=places.length;
 $('place-list').innerHTML=places.map(f=>{const p=f.properties;return `<button class="place-row ${state.selected?.properties.id===p.id?'is-selected':''}" data-place-id="${esc(p.id)}"><span class="place-row-icon ${esc(p.category)}">${icon(p.category)}</span><span class="place-row-main"><strong>${esc(name(p.names))}</strong><span class="place-meta">${esc(t(p.category))} · ${esc(name(p.address))}</span>${badge(p)}${liveBadge(p)}<span class="place-hours">${esc(name(p.hours))}</span></span><span class="place-row-arrow">${icon('chevron')}</span></button>`;}).join('');
 $('empty-state').hidden=places.length>0;
 document.querySelectorAll('[data-category]').forEach(el=>{const active=el.dataset.category===state.category;el.classList.toggle('selected',active);el.setAttribute('aria-pressed',String(active));});
 $('place-list').querySelectorAll('[data-place-id]').forEach(el=>el.onclick=()=>selectPlace(places.find(f=>f.properties.id===el.dataset.placeId)));
 if(activeId)[...$('place-list').querySelectorAll('[data-place-id]')].find(e=>e.dataset.placeId===activeId)?.focus({preventScroll:true});
}
function drawSubway(){try{
 if(!map.getPane('subway')){map.createPane('subway').style.zIndex=450;const sp=map.createPane('subwayLabels');sp.style.zIndex=640;sp.style.pointerEvents='none';}
 const renderer=L.svg({pane:'subway'});
 const line2=(landcoverLines.features||[]).filter(f=>f.properties?.names?.ko==='2호선'&&f.geometry?.type==='LineString');
 if(!line2.length)return;
 const layer=L.layerGroup().addTo(map);
 for(const f of line2){const ll=f.geometry.coordinates.map(([x,y])=>[y,x]);
  L.polyline(ll,{renderer,color:'#ffffff',weight:9,opacity:.95,interactive:false}).addTo(layer);
  L.polyline(ll,{renderer,color:'#00a84d',weight:5,opacity:.95,interactive:false}).addTo(layer);}
 const pts=line2.flatMap(f=>f.geometry.coordinates);
 const snap=([lat,lng])=>{let b=null,d=1e9;for(const [x,y] of pts){const dd=(x-lng)**2+(y-lat)**2;if(dd<d){d=dd;b=[y,x];}}return d<4e-6?b:[lat,lng];};
 for(const [ko,key,pos] of [['성수','stSeongsu',[37.54458,127.05596]],['뚝섬','stTtukseom',[37.54717,127.04737]]]){
  L.marker(snap(pos),{pane:'subwayLabels',interactive:false,keyboard:false,icon:L.divIcon({className:'subway-station',html:`<span class="st-ring"></span><span class="st-label"><b>2</b>${esc(t(key))}</span>`,iconSize:[16,16],iconAnchor:[8,8]})}).addTo(layer);}
}catch(e){}}
function renderMap(){
 if(!map)return;
 const zoneKey=[dataRevision,state.mode,state.lang,...visibleKinds].join(':');
 if(zoneKey!==renderedZoneKey){
  renderedZoneKey=zoneKey;zoneLayer.clearLayers();
  const priority=f=>f.properties.geometryRole==='building_footprint'?100:f.properties.sourceType==='official_commercial_analysis_area'?5:f.properties.spaceCategory==='outdoor'?0:f.properties.id?.startsWith('landcover-')?40:20;
  for(const f of [...allZones()].sort((a,b)=>priority(a)-priority(b))){
   const p=f.properties,category=spaceCategory(f);if(!category||!visibleKinds.has(category))continue;const color=spaceStyle(category).color;
   const footprint=p.geometryRole==='building_footprint';
   const layer=L.geoJSON(f,{style:{color,weight:footprint?.7:p.spaceCategory==='outdoor'?.2:.8,fillColor:color,fillOpacity:footprint?.55:p.sourceType==='official_commercial_analysis_area'?.10:category==='outdoor'?.16:.4,dashArray:isDemo(p)?'5 5':null}}).addTo(zoneLayer);
   layer.on('click',()=>{if(!workspace?.isPicking()&&!routeUI?.isPicking())showZone(f);});
   if(isDemo(p))layer.bindTooltip(esc(t(p.kind))+' · '+esc(t('demo')),{permanent:true,direction:'center',className:`zone-label ${p.kind==='commercial'?'commercial-label':''}`});
  }
  for(const f of landcoverLines.features){const category=spaceCategory(f);if(!visibleKinds.has(category))continue;L.geoJSON(f,{style:{color:spaceStyle(category).color,weight:category==='railway'?2.5:1.1,opacity:.8,dashArray:category==='railway'?'4 3':null}}).on('click',()=>{if(!workspace?.isPicking()&&!routeUI?.isPicking())showZone(f);}).addTo(zoneLayer);}
 }
 markerLayer.clearLayers();markers.clear();
 for(const f of filtered()){
  const p=f.properties;
  const marker=L.marker([f.geometry.coordinates[1],f.geometry.coordinates[0]],{keyboard:true,title:name(p.names),icon:L.divIcon({className:'place-pin '+(isDemo(p)?'demo-marker':''),html:`<div class="marker-body ${esc(p.category)} ${state.selected?.properties.id===p.id?'is-selected':''}">${icon(p.category)}</div>`,iconSize:[36,40],iconAnchor:[18,35]})}).addTo(markerLayer);
  marker.on('click',()=>{const point={lng:f.geometry.coordinates[0],lat:f.geometry.coordinates[1]};if(workspace?.isPicking())workspace.pick(point);else if(routeUI?.isPicking())routeUI.pick(point);else selectPlace(f);});marker.bindTooltip(esc(name(p.names)),{direction:'top',offset:[0,-30]});markers.set(p.id,marker);
 }
}
function selectPlace(f){
 if(!f)return;state.selected=f;$('detail-panel').hidden=false;
 workspace?.close();routeUI?.close();populationUI?.close();
 $('demo-panel').hidden=true;stopAuto();renderDetail(f);renderList();renderMap();
 map.setView([f.geometry.coordinates[1],f.geometry.coordinates[0]],Math.max(map.getZoom(),16),{animate:!matchMedia('(prefers-reduced-motion: reduce)').matches});
 $('detail-name').setAttribute('tabindex','-1');$('detail-name').focus({preventScroll:true});
}
function renderDetail(f,updateUrl=true){
 const activeAction=document.activeElement?.id;
 const activeLink=document.activeElement?.closest('#detail-content a')?.href;
 const p=f.properties,coords=f.geometry.coordinates;
 const website=`https://map.naver.com/p/search/${encodeURIComponent(p.names.ko)}`;
 const route=`https://map.kakao.com/link/to/${encodeURIComponent(p.names.ko)},${coords[1]},${coords[0]}`;
 const source=[p.originalSourceUrl,p.sourceUrl].find(url=>typeof url==='string'&&url.startsWith('https://'))||'';
 $('detail-content').innerHTML=`<div class="detail-hero">${icon(p.category)}</div><div class="detail-body"><div class="detail-category">${esc(t(p.category))}</div><h2 id="detail-name" tabindex="-1">${esc(name(p.names))}</h2>${badge(p)}<div class="detail-distance">${esc(distance(coords))}</div><p class="detail-note ${isDemo(p)?'sample-note':''}">${esc(t(isDemo(p)?'samplePlace':p.verification==='map_record'?'mapRecordNote':'notLive'))}</p><div class="detail-info"><span>${icon('pin')}</span><div><small>${esc(t('address'))}</small><span id="detail-address">${esc(name(p.address))}</span></div></div><div class="detail-info"><span>${icon('clock')}</span><div><small>${esc(t('hours'))}</small>${liveBadge(p)}${liveBadge(p)?'<br>':''}${esc(name(p.hours))}</div></div><div class="detail-buttons">${isDemo(p)?'':`<a class="primary-button" href="${esc(route)}" target="_blank" rel="noopener noreferrer">${icon('arrow')}${esc(t('directions'))}</a><button class="secondary-button" id="place-save" aria-pressed="${saved.has(p.id)}">${icon('bookmark')}${esc(t(saved.has(p.id)?'saved':'save'))}</button>`}<button class="secondary-button" id="address-copy">${icon('copy')}${esc(t('copy'))}</button></div>${isDemo(p)?'':`<div class="detail-links"><a href="${esc(website)}" target="_blank" rel="noopener noreferrer">${esc(t('naver'))}</a><button id="place-share" class="text-button">${esc(t('share'))}</button></div><p class="detail-note">${esc(t('externalNote'))}</p><div class="detail-source">${esc(t('checkedAt'))}: ${esc(p.checkedAt)}<br><a href="${esc(source)}" target="_blank" rel="noopener noreferrer">${esc(t('source'))}</a></div>`}</div>`;
 $('address-copy').onclick=()=>copyText(name(p.address),'copied');
 if($('place-save'))$('place-save').onclick=()=>{
  if(saved.has(p.id))saved.delete(p.id);else saved.add(p.id);
  try{localStorage.setItem('together.saved',JSON.stringify([...saved]));}catch{}
  renderDetail(f,false);renderList();toast(saved.has(p.id)?'saveDone':'unsaveDone');
 };
 if($('place-share'))$('place-share').onclick=()=>{const u=new URL(location.href);u.searchParams.set('place',p.id);u.searchParams.set('lang',state.lang);copyText(u.href,'linkCopied');};
 const routeLink=$('detail-content').querySelector('.detail-buttons a');if(routeLink){routeLink.href='#route';routeLink.removeAttribute('target');routeLink.onclick=e=>{e.preventDefault();routeUI?.open(f);};}
 if(!source)$('detail-content').querySelector('.detail-source a')?.remove();
 if(!isDemo(p)){
  const selectButton=document.createElement('button');selectButton.type='button';selectButton.id='place-curate';selectButton.className='text-button';selectButton.textContent=t('selectForTeam');selectButton.onclick=()=>workspace?.openEditor(f);$('detail-content').querySelector('.detail-body').append(selectButton);
  if(p.category==='recycling'){const note=document.createElement('p');note.className='detail-note sample-note';note.textContent=t('recyclingNote');$('detail-content').querySelector('.detail-body').append(note);}
 }
 if(['place-save','place-share','address-copy','detail-name','place-curate'].includes(activeAction))$(activeAction)?.focus({preventScroll:true});
 else if(activeLink)[...$('detail-content').querySelectorAll('a')].find(a=>a.href===activeLink)?.focus({preventScroll:true});
 if(updateUrl&&!isDemo(p)){const url=new URL(location.href);url.searchParams.set('place',p.id);history.replaceState(null,'',url);}
}
async function copyText(text,key){try{await navigator.clipboard.writeText(text);toast(key);}catch{toast('copyError');}}
function closeDetail(){const previous=state.selected?.properties.id;state.selected=null;$('detail-panel').hidden=true;const url=new URL(location.href);url.searchParams.delete('place');history.replaceState(null,'',url);renderList();renderMap();if(previous)[...$('place-list').querySelectorAll('.place-row')].find(el=>el.dataset.placeId===previous)?.focus({preventScroll:true});}
function showIssue(f){
 syncNav('map');issueLayer.clearLayers();const p=f.properties;
 const html=`<strong>${esc(name(p.names))}</strong><p>${esc(name(p.description))}</p>${p.sourceUrl?.startsWith('https://')?`<a href="${esc(p.sourceUrl)}" target="_blank" rel="noopener noreferrer">${esc(t('source'))}</a>`:''}`;
 if(f.geometry?.type==='Point'){const point=f.geometry.coordinates.slice().reverse();const marker=L.marker(point,{title:name(p.names),icon:L.divIcon({className:'issue-reference-pin',html:`<div class="marker-body issue">${icon('smoking')}</div>`,iconSize:[36,40],iconAnchor:[18,35]})}).addTo(issueLayer);map.setView(point,17);marker.bindPopup(html).openPopup();}
 else if(f.geometry){const layer=L.geoJSON(f).addTo(issueLayer);map.fitBounds(layer.getBounds());layer.bindPopup(html).openPopup();}
}
function showDialog(html){$('dialog-content').innerHTML=html;fillIcons($('dialog-content'));$('info-dialog').showModal();}
function showZone(f){const p=f.properties,category=spaceCategory(f);const explanation=category==='mixed'?'mixedDefinition':category==='outdoor'?'outdoorDefinition':p.geometryRole==='building_footprint'?'buildingDefinition':['LineString','MultiLineString'].includes(f.geometry.type)?'sourceLineDefinition':p.sourceType==='official_commercial_analysis_area'?'commercialDefinition':'spaceSourceDefinition';showDialog(`<h2>${esc(name(p.names))}</h2><p class="space-type-label" style="border-color:${spaceStyle(category).color}">${esc(t('space_'+category))}</p><p>${esc(t(explanation))}</p><p class="panel-note">${esc(t(p.verification))}${p.purposeLabel?' · '+esc(p.purposeLabel):''}</p>${p.sourceModifiedDate||p.sourceModifiedAt?`<p>${esc(t('recordDate'))}: ${esc(p.sourceModifiedDate||p.sourceModifiedAt)}</p>`:''}<p>${esc(t('checkedAt'))}: ${esc(p.checkedAt||'')}</p>${p.geometryRole==='building_footprint'?`<p>${esc(t('oldPurposeNote'))}</p>`:''}${category==='residential'||category==='mixed'?`<p>${esc(t('alertBody'))}</p>`:''}${p.sourceUrl?`<a href="${esc(p.sourceUrl)}" target="_blank" rel="noopener noreferrer">${esc(t('source'))}</a>`:''}`);}
function showManners(){
 const items=[['quiet','home'],['privacy','search'],['litter','bin'],['smoke','smoking']];
 showDialog(`<h2>${esc(t('smallManners'))}</h2><p>${esc(t('mannersIntro'))}</p>${items.map(([key,i])=>`<div class="manners-item"><span>${icon(i)}</span><div><h3>${esc(t(key==='smoke'?'smokeManners':key))}</h3><p>${esc(t(key==='smoke'?'smokeBody':key+'Body'))}</p></div></div>`).join('')}`);
}
function showAbout(){showDialog(`<h2>${esc(t('aboutIntro'))}</h2><p>${esc(t('aboutBody'))}</p><div class="about-section"><h3>${esc(t('evidence'))}</h3><p>${esc(t('evidenceBody'))}</p></div><div class="about-section"><h3>${esc(t('source'))}</h3><p>${esc(t('scopeExplanation'))}</p><p>${esc(t('oldPurposeNote'))}</p><p>${esc(t('mapLanguage'))}</p><p><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors · ODbL</a></p></div><div class="about-section"><h3>${esc(t('locationPrivacy'))}</h3><p>${esc(t('locationPrivacyBody'))}</p></div><button id="feedback-open" class="primary-button">${esc(t('feedback'))}</button>`);$('feedback-open').onclick=()=>{$('info-dialog').close();workspace?.openFeedback();};}
function stopAuto(){if(state.auto){clearInterval(state.auto);state.auto=null;}$('demo-play').textContent=t('play');}
function stopLocation(){
 clearTimeout(positionExpiry);
 state.generation++;if(state.watch!==null)navigator.geolocation?.clearWatch(state.watch);state.watch=null;state.position=null;
 locationLayer?.clearLayers();
 if(state.selected)renderDetail(state.selected,false);
}
function setMode(mode){
 if(state.mode!==mode){workspace?.close();routeUI?.close();populationUI?.close();populationUI?.setVisible(false);issueLayer?.clearLayers();syncNav('map');}
 stopAuto();stopLocation();state.mode=mode;state.selected=null;state.lastAlert=null;$('detail-panel').hidden=true;$('zone-alert').hidden=true;
 trace?.remove();trace=null;state.scene=0;
 const url=new URL(location.href);url.searchParams.delete('place');history.replaceState(null,'',url);
 engine=makeEngine(allZones(),mode);
 $('demo-exit').hidden=mode!=='demo';
 status('locationIntro');applyLanguage();
}
function renderPosition(sample,isVirtual=false){
 locationLayer.clearLayers();
 L.circle([sample.lat,sample.lng],{radius:sample.accuracy,color:'#176b50',fillColor:'#176b50',fillOpacity:.06,weight:1,interactive:false}).addTo(locationLayer);
 L.marker([sample.lat,sample.lng],{icon:L.divIcon({className:'user-location',html:'<div class="user-pin"></div>',iconSize:[18,18],iconAnchor:[9,9]}),interactive:false}).addTo(locationLayer);
 if(isVirtual)return;
 state.position=sample;
}
function evaluate(sample,now){
 const result=engine.update(sample,now);state.alertPos=sample;
 if(result.status==='inaccurate'||result.status==='stale'){status('inaccurate');return result;}
 for(const event of result.events){
  if(event.type==='exit'){if(state.lastAlert?.zoneId===event.zoneId&&!result.insideIds.includes(state.lastAlert.zoneId)){$('zone-alert').hidden=true;state.lastAlert=null;}continue;}
  const zone=engine.zones.find(z=>z.properties.id===event.zoneId);
  state.lastAlert={type:event.type,zoneId:event.zoneId,kind:zone?.properties.kind,verification:zone?.properties.verification||'map_record'};
  const wasHidden=$('zone-alert').hidden;renderAlertText();
  $('zone-alert').hidden=false;if(wasHidden)try{navigator.vibrate?.([120,60,120]);}catch{}
 }
 return result;
}
function nearestPlace(categories,from){if(!from)return null;let best=null;for(const f of allPlaces()){if(!categories.includes(f.properties.category)||isDemo(f))continue;const [lng,lat]=f.geometry.coordinates;const m=Math.hypot((lng-from.lng)*111195*Math.cos(lat*Math.PI/180),(lat-from.lat)*111195);if(!best||m<best.m)best={f,m};}return best;}
const walkMinutes=m=>Math.max(1,Math.round(m*1.3/70));
const isNight=()=>{const q=new URLSearchParams(location.search);if(q.has('night'))return true;if(q.has('day'))return false;const h=new Date().getHours();return h>=22||h<6;};
function renderAlertText(){const e=state.lastAlert;if(!e)return;const el=$('zone-alert');const night=isNight();el.classList.add('v2');el.classList.toggle('night',night);
 const booth=nearestPlace(['smoking'],state.alertPos||state.position);
 const acts=night?[['🤫','actQuiet2'],['🚭','actNoSmoke'],['🔦','actFlash']]:[['🚭','actNoSmoke'],['🤫','actQuiet'],['📵','actPhoto']];
 const boothRow=booth?`<button class="za-row za-booth" id="alert-booth"><span>🚬 ${esc(t('boothNear'))} · <b>${esc(t('walkAbout'))} ${walkMinutes(booth.m)}${esc(t('minUnit'))}</b> (${Math.round(booth.m)}m)</span><span class="za-go">${esc(t('guide'))} →</span></button>`:'';
 const nightRow=night?`<button class="za-row" id="alert-route"><span>${esc(t('avoidRoute'))}</span><span class="za-go">${esc(t('careRoute'))} →</span></button>`:'';
 el.innerHTML=`<div class="za-head"><span class="za-ico" aria-hidden="true">${night?'🌙':'🏠'}</span><div><small>${esc(t(night?'za2LabelNight':'za2Label'))}</small><h2 id="alert-title">${esc(t(night?'za2TitleNight':'za2Title'))}</h2></div><button id="alert-dismiss" class="icon-button za-x" aria-label="${esc(t('close'))}">${icon('close')}</button></div><div class="za-acts">${acts.map(([i,k])=>`<div class="za-act${k==='actNoSmoke'?' za-smoke':''}"><span aria-hidden="true">${i}</span>${esc(t(k))}</div>`).join('')}</div>${boothRow}${nightRow}<p class="za-fine">${esc(t('buttFine'))}</p><button id="alert-ok" class="za-ok">${esc(t(night?'okNight':'okDay'))}</button><button id="alert-more" class="text-button za-more">${esc(t('moreManners'))}</button>`;
 const hide=()=>{el.hidden=true;};$('alert-dismiss').onclick=hide;$('alert-ok').onclick=hide;$('alert-more').onclick=showManners;
 if(booth)$('alert-booth').onclick=()=>{hide();if(state.mode==='demo')map.setView([booth.f.geometry.coordinates[1],booth.f.geometry.coordinates[0]],17);else selectPlace(booth.f);};
 if(night)$('alert-route').onclick=()=>{hide();document.querySelector('[data-nav="routes"]')?.click();};
}
function findSmoking(){const booth=nearestPlace(['smoking'],state.position);
 document.querySelector('.chip[data-category="smoking"]')?.click();
 if(booth){selectPlace(booth.f);$('toast').textContent=`🚬 ${t('boothNear')} · ${t('walkAbout')} ${walkMinutes(booth.m)}${t('minUnit')} (${Math.round(booth.m)}m)`;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4200);}
 else toast('boothNeedLocation');}
function startLive(){
 setMode('live');$('demo-panel').hidden=true;
 if(!window.isSecureContext){status('secureRequired');return;}
 if(!navigator.geolocation){status('positionError');return;}
 status('locating');const generation=state.generation;let first=true;
 state.watch=navigator.geolocation.watchPosition(p=>{
  if(state.mode!=='live'||generation!==state.generation||document.hidden)return;
  const sample={lng:p.coords.longitude,lat:p.coords.latitude,accuracy:p.coords.accuracy,timestamp:p.timestamp};
  const result=evaluate(sample,Date.now());
  if(result.status!=='ok'){
   clearTimeout(positionExpiry);state.position=null;locationLayer.clearLayers();engine.invalidate();$('zone-alert').hidden=true;
   if(result.status==='invalid')status('positionError');
   if(state.selected)renderDetail(state.selected,false);
   return;
  }
  renderPosition(sample);const inScope=!scope.features.length||scope.features.some(f=>pointInPolygon([sample.lng,sample.lat],f.geometry));status(!inScope?'outsideScope':engine.zones.length?'liveGuidance':'liveReady');
  clearTimeout(positionExpiry);
  positionExpiry=setTimeout(()=>{
   if(generation!==state.generation||state.mode!=='live')return;
   state.position=null;locationLayer.clearLayers();engine.invalidate();$('zone-alert').hidden=true;status('inaccurate');
   if(state.selected)renderDetail(state.selected,false);
  },Math.max(0,DEFAULT_GEOFENCE_CONFIG.maxAge-(Date.now()-sample.timestamp)));
  if(first){map.setView([sample.lat,sample.lng],16);first=false;}
  renderList();if(state.selected)renderDetail(state.selected,false);
 },error=>{
  if(generation!==state.generation)return;
  // Unavailable/timeout can be temporary: keep watching so a fresh fix can recover.
  if(error.code===1)stopLocation();
  else{state.position=null;locationLayer.clearLayers();}
  if(error.code===1){clearTimeout(positionExpiry);$('zone-alert').hidden=true;engine.invalidate();}status(error.code===1?'denied':'positionError');
  if(state.selected)renderDetail(state.selected,false);
 },MAP_CONFIG.geolocation);
}

// Synthetic time makes this scenario deterministic and lets the 10-minute cooldown be shown quickly.
const scenes=[
 {lat:37.5442,lng:127.0520,t:0},
 {lat:37.5448,lng:127.0524,t:2000},
 {lat:37.5460,lng:127.0540,t:5000},
 {lat:37.5460,lng:127.0540,t:10000},
 {lat:37.5462,lng:127.0540,t:15000},
 {lat:37.5445,lng:127.0521,t:20000},
 {lat:37.5444,lng:127.0520,t:25000},
 {lat:37.5460,lng:127.0540,t:30000,extra:35000},
 {lat:37.5460,lng:127.0540,t:650000,cycle:true}
];
const virtualBase=1_800_000_000_000;
function feedScene(){
 const scene=scenes[state.scene];
 if(scene.cycle){
  evaluate({...scenes[5],accuracy:5,timestamp:virtualBase+620000},virtualBase+620000);
  evaluate({...scenes[6],accuracy:5,timestamp:virtualBase+625000},virtualBase+625000);
  evaluate({...scene,accuracy:5,timestamp:virtualBase+640000},virtualBase+640000);
 }
 const sample={lat:scene.lat,lng:scene.lng,accuracy:5,timestamp:virtualBase+scene.t};
 renderPosition(sample,true);evaluate(sample,sample.timestamp);
 if(scene.extra)evaluate({...sample,timestamp:virtualBase+scene.extra},virtualBase+scene.extra);
 status('sceneNote');renderScene();
}
function renderScene(){
 $('scene-step').textContent=`${state.scene+1} / ${scenes.length}`;
 $('scene-label').textContent=t('scene'+state.scene);
 $('scene-progress').style.width=`${(state.scene+1)/scenes.length*100}%`;
 $('demo-next').disabled=state.scene>=scenes.length-1;
}
function openDemo(){
 alertHistories.demo.clear();
 setMode('demo');$('demo-panel').hidden=false;
 // Only illustrative polygons drive this explicitly labelled demonstration.
 engine=makeEngine(collections.demoZones.features,'demo');
 map.setView([37.5451,127.0538],16);feedScene();
 trace=L.polyline(scenes.slice(0,7).map(s=>[s.lat,s.lng]),{color:'#497b66',weight:2,dashArray:'4 7',interactive:false}).addTo(map);
}
function nextScene(){if(state.scene<scenes.length-1){state.scene++;feedScene();}if(state.scene===scenes.length-1)stopAuto();}
function bind(){
 const compact=matchMedia('(max-width:760px) and (max-height:700px)');
 const syncCompact=()=>{document.querySelector('.sidebar').classList.toggle('collapsed',compact.matches);$('list-toggle').setAttribute('aria-expanded',String(!compact.matches));state.legendExpanded=!compact.matches;if(map)renderSpaceLegend();};
 syncCompact();compact.addEventListener('change',syncCompact);
 $('language').onchange=e=>{state.lang=e.target.value;try{localStorage.setItem('together.language',JSON.stringify(state.lang));}catch{}applyLanguage();};
 $('search').oninput=e=>{state.query=e.target.value;renderList();renderMap();};
 document.querySelectorAll('[data-category]').forEach(el=>el.onclick=()=>{workspace?.close();routeUI?.close();populationUI?.close();state.category=el.dataset.category;syncNav('map');renderList();renderMap();});
 $('bin-directory-open').onclick=()=>workspace?.openBinDirectory();
 document.querySelectorAll('[data-nav]').forEach(el=>el.onclick=()=>{
  const nav=el.dataset.nav;state.nav=nav;
  syncNav(nav);
  if(nav==='routes'){routeUI?.open();return;}
  if(nav==='population'){populationUI?.open();return;}
  if(nav==='issues'){workspace?.openIssues();return;}
  if(nav==='edit'){workspace?.openEditor();return;}
  if(nav==='coverage'){workspace?.openCoverage();return;}
  if(nav==='about'){openTools(nav);showAbout();}else if(nav==='etiquette'){openTools(nav);showManners();}else{
   workspace?.close();routeUI?.close();populationUI?.close();
   closeDetail();state.category=nav==='facilities'?'toilet':nav==='saved'?'saved':'all';state.query='';$('search').value='';renderList();renderMap();
   document.querySelector('.sidebar').classList.remove('collapsed');$('list-toggle').setAttribute('aria-expanded','true');
  }
 });
 $('list-toggle').onclick=()=>{const collapsed=document.querySelector('.sidebar').classList.toggle('collapsed');$('list-toggle').setAttribute('aria-expanded',String(!collapsed));};
 $('detail-close').onclick=closeDetail;$('dialog-close').onclick=()=>$('info-dialog').close();
 $('info-dialog').onclick=e=>{if(e.target===$('info-dialog')){const box=e.target.getBoundingClientRect();if(e.clientX<box.left||e.clientX>box.right||e.clientY<box.top||e.clientY>box.bottom)e.target.close();}};
 $('area-reset').onclick=()=>map.fitBounds(MAP_CONFIG.bounds,{padding:[25,25]});
 document.addEventListener('change',e=>{const input=e.target;if(!input.matches('[data-space-kind]'))return;if(input.checked)visibleKinds.add(input.dataset.spaceKind);else visibleKinds.delete(input.dataset.spaceKind);syncSpaceInputs();renderMap();});
 document.addEventListener('click',e=>{const button=e.target.closest('[data-only-space],#layers-all');if(!button)return;visibleKinds.clear();if(button.id==='layers-all')SPACE_CATEGORIES.forEach(c=>visibleKinds.add(c.id));else visibleKinds.add(button.dataset.onlySpace);syncSpaceInputs();renderMap();});
 $('zoom-in').onclick=()=>map.zoomIn();$('zoom-out').onclick=()=>map.zoomOut();$('gps-button').onclick=startLive;
 $('alert-dismiss').onclick=()=>$('zone-alert').hidden=true;$('alert-more').onclick=showManners;
 $('demo-open').onclick=openDemo;$('smoke-find').onclick=findSmoking;$('demo-close').onclick=()=>{setMode('live');$('demo-panel').hidden=true;map.setView(MAP_CONFIG.center,MAP_CONFIG.zoom);};
 $('demo-exit').onclick=$('demo-close').onclick;
 $('demo-reset').onclick=openDemo;$('demo-next').onclick=nextScene;
 $('demo-play').onclick=()=>{
  if(state.auto){stopAuto();return;}
  if(state.scene===scenes.length-1)openDemo();
  state.auto=setInterval(nextScene,2000);$('demo-play').textContent=t('pause');
 };
 $('demo-poor').onclick=()=>{const s=scenes[state.scene];evaluate({...s,accuracy:90,timestamp:virtualBase+s.t+1000},virtualBase+s.t+1000);};
 $('demo-denied').onclick=()=>{engine.reset();locationLayer.clearLayers();$('zone-alert').hidden=true;status('denied');};
 document.addEventListener('visibilitychange',()=>{
  if(document.hidden){stopAuto();if(state.watch!==null){stopLocation();engine.invalidate();$('zone-alert').hidden=true;status('paused');}}
 });
 window.addEventListener('pagehide',()=>{stopAuto();stopLocation();});
}
async function boot(){
 fillIcons();
 $('location-status').textContent='지도 자료를 불러오고 있어요… / Loading map data…';
 const names=['official-places','demo-places','official-zones','demo-zones','scope','issues'];
 let partial=false;
 const paths=[...locales.map(l=>`./locales/${l}.json`),...names.map(n=>`./data/${n}.geojson`),'./data/coverage.json','./data/walk-network.json','./locales/workspace-locales.json','./locales/route-locales.json','./data/street-bin-directory.json','./data/team-data.json','./data/population.json','./data/landcover.geojson','./data/landcover-lines.geojson','./data/landcover-coverage.json'];
 const data=await Promise.all(paths.map(async(path,index)=>{
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),/official-zones|landcover/.test(path)?MAP_CONFIG.geometryTimeout:MAP_CONFIG.resourceTimeout);
  try{const response=await fetch(path,{signal:controller.signal});if(!response.ok)throw new Error('HTTP '+response.status);return await response.json();}
  catch{partial=true;return index<4?{}:{type:'FeatureCollection',features:[]};}
  finally{clearTimeout(timeout);}
 }));
 dictionaries=Object.fromEntries(locales.map((l,i)=>{const safe=dictionary(data[i]);if(!Object.keys(safe).length)partial=true;return [l,safe];}));
 for(const lang of locales)Object.assign(dictionaries[lang],dictionary(data[12]?.[lang]),dictionary(data[13]?.[lang]),spaceTranslations(lang));
 const sanitized=[sanitizeCollection(data[4],{type:'places'}),sanitizeCollection(data[5],{type:'places',demo:true}),sanitizeCollection(data[6],{type:'zones'}),sanitizeCollection(data[7],{type:'zones',demo:true})];
 partial ||= sanitized.some(result=>result.rejectedCount>0);
 collections={officialPlaces:sanitized[0].collection,demoPlaces:sanitized[1].collection,officialZones:sanitized[2].collection,demoZones:sanitized[3].collection,issues:sanitizeCollection(data[9],{type:'issues'}).collection};
 const scopeFeatures=Array.isArray(data[8]?.features)?data[8].features:[];partial ||= data[8]?.type!=='FeatureCollection'||!Array.isArray(data[8]?.features);
 scope={type:'FeatureCollection',features:scopeFeatures.filter(f=>f?.type==='Feature'&&['Polygon','MultiPolygon'].includes(f.geometry?.type)&&validGeometry(f.geometry))};partial ||= scope.features.length!==scopeFeatures.length;
 coverage=data[10]&&typeof data[10]==='object'&&!Array.isArray(data[10])?data[10]:{};network=data[11]?.version===1?data[11]:null;
 if(!validBounds(coverage.declaredScope?.bbox)){partial=true;coverage={...coverage,declaredScope:{...coverage.declaredScope,bbox:[127.03114,37.52834,127.06748,37.55361]}};}
 const directory=Array.isArray(data[14])?data[14].filter(r=>r&&typeof r.address==='string'&&typeof r.detail==='string'&&typeof r.sourceUrl==='string'&&r.sourceUrl.startsWith('https://')):[];
 partial ||= !Array.isArray(data[14])||directory.length!==data[14].length;
 try{publishedTeamData=parseTeamBundle(data[15],{bounds:coverage.declaredScope?.bbox});}catch{partial=true;publishedTeamData=emptyTeamBundle();}
 const ground=sanitizeCollection(data[17],{type:'zones'}),lines=sanitizeCollection(data[18],{type:'lines'});landcover=ground.collection;landcoverLines=lines.collection;landcoverCoverage=data[19]&&typeof data[19]==='object'?data[19]:{};partial ||= ground.rejectedCount>0||lines.rejectedCount>0;
 const populationAreas=Array.isArray(data[16]?.areas)?data[16].areas.filter(a=>a&&typeof a.id==='string'&&a.names&&locales.every(lang=>typeof a.names[lang]==='string')&&['Polygon','MultiPolygon'].includes(a.geometry?.type)&&validGeometry(a.geometry)&&typeof a.congestionLevel==='string'&&Number.isFinite(a.populationMin)&&Number.isFinite(a.populationMax)&&a.populationMin>=0&&a.populationMax>=a.populationMin):[];
 populationData={...data[16],schemaVersion:1,areas:populationAreas};partial ||= populationAreas.length!==(data[16]?.areas?.length||0);
 if(coverage.declaredScope?.bbox){const [west,south,east,north]=coverage.declaredScope.bbox;MAP_CONFIG.bounds=[[south,west],[north,east]];}
 refreshData();
 const params=new URLSearchParams(location.search);
 const preferred=params.get('lang')||readPreference('together.language',null)||navigator.language.slice(0,2);
 state.lang=locales.includes(preferred)?preferred:'en';
 map=L.map('map',{zoomControl:false,preferCanvas:true,minZoom:MAP_CONFIG.minZoom,maxZoom:MAP_CONFIG.maxZoom,zoomSnap:.5}).setView(MAP_CONFIG.center,MAP_CONFIG.zoom);
 let tileErrors=0;
 tiles=L.tileLayer(MAP_CONFIG.tileUrl,{maxZoom:MAP_CONFIG.maxZoom,attribution:MAP_CONFIG.attribution}).addTo(map);
 tiles.on('tileerror',()=>{if(++tileErrors>=3)$('tile-warning').hidden=false;});
 zoneLayer=L.layerGroup().addTo(map);markerLayer=L.layerGroup().addTo(map);locationLayer=L.layerGroup().addTo(map);
 scopeLayer=L.geoJSON(scope,{interactive:false,style:{color:'#47665b',weight:1.5,fill:false,dashArray:'5 5'}}).addTo(map);
 issueLayer=L.layerGroup().addTo(map);
 const callbacks={map,t,name,getPlaces:()=>livePlaces,getZones:()=>liveZones,getIssues:()=>liveIssues,getPosition:()=>state.position,getGraph:()=>network};
 workspace=initWorkspace({...callbacks,getCoverage:()=>coverage,getSpaceLayers:spaceLayers,getLandcoverCoverage:()=>landcoverCoverage,getBinDirectory:()=>directory,getBounds:()=>coverage.declaredScope?.bbox||[127.02,37.52,127.08,37.57],onOpen:type=>openTools(({editor:'edit',issue:'issues',coverage:'coverage',feedback:'about'})[type]||'map'),onShowIssue:showIssue,onStatus:key=>{if(['smoking','toilet','bin'].includes(key)){state.category=key;state.query='';$('search').value='';syncNav('map');renderList();renderMap();}else status(key);},onDataChange:bundle=>{teamData=bundle;refreshData();engine=makeEngine(allZones(),state.mode);renderList();renderMap();}});
 teamData=workspace.getBundle();refreshData();
 routeUI=initRouteUI({...callbacks,onOpen:()=>openTools('routes'),onStatus:status});
 populationUI=initPopulationUI({...callbacks,getData:()=>populationData,onOpen:()=>openTools('population'),onClose:()=>syncNav('map'),onRefresh:async()=>{try{populationData=await refreshPopulation(populationData);}catch(error){populationData={...populationData,refreshStatus:'failed'};}return populationData;}});
 setInterval(()=>{if(document.hidden)return;renderList();if(state.selected&&!$('detail-panel').hidden)renderDetail(state.selected,false);},60000);
 const autoPopulation=()=>{if(!document.hidden)$('population-refresh')?.click();};setTimeout(autoPopulation,1500);setInterval(autoPopulation,600000);
 $('route-close').addEventListener('click',()=>syncNav('map'));
 for(const id of ['editor-close','issue-close','coverage-close','feedback-close','bin-directory-close'])$(id).addEventListener('click',()=>syncNav('map'));
 map.on('click',e=>{if(workspace.isPicking())workspace.pick(e.latlng);else if(routeUI.isPicking())routeUI.pick(e.latlng);});
 $('info-dialog').addEventListener('close',()=>{const active=[['route','routes'],['population','population'],['editor','edit'],['issue','issues'],['coverage','coverage'],['feedback','about']].find(([id])=>!$(id+'-panel').hidden);syncNav(active?.[1]||'map');});
 engine=makeEngine(allZones(),'live');
 drawSubway();
 bind();applyLanguage();if(partial)status('dataPartial');
 const shared=livePlaces.find(f=>f.properties.id===params.get('place'));
 if(shared)selectPlace(shared);
}
boot().catch(error=>{
 console.error(error);$('location-status').textContent='지도 자료를 불러오지 못했습니다. 새로고침해 주세요. / Map data unavailable. Please reload.';
 $('location-status').setAttribute('role','alert');
});
