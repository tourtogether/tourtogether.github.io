import {findWalkingRoute} from './routing.js';

const STATIONS={seongsu:{key:'routeStationSeongsu',coordinates:[127.0561016,37.5445688]},forest:{key:'routeStationForest',coordinates:[127.0447397,37.5435916]}};
const validPoint=p=>Array.isArray(p)&&p.length>=2&&Number.isFinite(p[0])&&Number.isFinite(p[1])&&Math.abs(p[0])<=180&&Math.abs(p[1])<=90;
const actualPoint=f=>f?.type==='Feature'&&f.geometry?.type==='Point'&&validPoint(f.geometry.coordinates)&&f.properties?.verification!=='demo';
function element(tag,{className='',text='',id='',...attributes}={}){
 const el=document.createElement(tag);el.className=className;el.textContent=text;if(id)el.id=id;
 for(const [key,value] of Object.entries(attributes))el.setAttribute(key,String(value));return el;
}

/** Coordinates stay in this instance's memory; callers supply fresh GPS state and immutable data arrays. */
export function initRouteUI({map,t,name,getPlaces,getZones,getIssues,getPosition,getGraph,onOpen=()=>{},onStatus=()=>{}}){
 const L=globalThis.L,layer=L.layerGroup().addTo(map);
 const panel=element('section',{id:'route-panel',className:'app-panel','aria-labelledby':'route-title'});panel.hidden=true;
 const header=element('header',{className:'panel-header'}),heading=element('h2',{id:'route-title'}),back=element('button',{id:'route-back',className:'secondary-button',type:'button'}),closeButton=element('button',{id:'route-close',className:'icon-button',type:'button'});
 header.append(heading,back,closeButton);
 const body=element('div',{className:'panel-body'}),actions=element('div',{className:'panel-actions'});
 panel.append(header,body,actions);(map.getContainer().parentElement||document.body).append(panel);
 L.DomEvent.disableClickPropagation(panel);L.DomEvent.disableScrollPropagation(panel);
 const state={start:{key:'seongsu',coordinates:STATIONS.seongsu.coordinates},end:{key:'forest',coordinates:STATIONS.forest.coordinates},places:[],picking:null,viewing:false,routes:null,selected:'considerate',busy:false,generation:0,status:null};
 const text=(key,values={})=>String(t(key)).replace(/\{(\w+)\}/g,(_,k)=>String(values[k]??`{${k}}`));
 const metres=value=>String(Math.round(value));
 const label=point=>point.feature?name(point.feature.properties?.names)||text('routeUnnamed'):STATIONS[point.key]?text(STATIONS[point.key].key):text(point.key==='gps'?'routeMyPosition':'routeMapPoint');
 const status=key=>{state.status=key;onStatus(key);const el=panel.querySelector('#route-message');if(el)el.textContent=text(key);};
 function clearRoutes(){state.routes=null;state.generation++;layer.clearLayers();}
 function button(key,id,className='secondary-button'){return element('button',{id,className,text:text(key),type:'button'});}
 function endpointField(which){
  const point=state[which],field=element('div',{className:'form-field'}),caption=element('label',{text:text(which==='start'?'routeStart':'routeEnd'),for:`route-${which}`}),select=element('select',{id:`route-${which}`,'aria-label':caption.textContent});
  for(const [value,key] of [['seongsu','routeStationSeongsu'],['forest','routeStationForest'],...(which==='start'?[['gps','routeMyPosition']]:[]),['map','routeChooseMap']])select.append(element('option',{value,text:text(key)}));
  for(let i=0;i<state.places.length;i++)select.append(element('option',{value:`poi-${i}`,text:name(state.places[i].properties?.names)||text('routeUnnamed')}));
  if(['picked','destination','invalid'].includes(point.key))select.append(element('option',{value:point.key,text:label(point)}));
  select.value=point.key;select.disabled=state.busy;
  select.onchange=()=>{
   clearRoutes();state.status=null;const key=select.value;
   if(key==='map'){state.picking=which;state.viewing=false;render();onStatus(which==='start'?'routePickStart':'routePickEnd');return;}
   if(STATIONS[key])state[which]={key,coordinates:STATIONS[key].coordinates};
   else if(key==='gps'){
    const p=getPosition();state[which]={key,coordinates:p&&validPoint([p.lng,p.lat])?[p.lng,p.lat]:null};
    if(!state[which].coordinates)state.status='routeNoPosition';
   }else if(key.startsWith('poi-')){const feature=state.places[Number(key.slice(4))];state[which]={key,feature,coordinates:feature.geometry.coordinates};}
   render();draw();
  };
  field.append(caption,select);
  if(validPoint(point.coordinates))field.append(element('small',{text:`${point.coordinates[1].toFixed(5)}, ${point.coordinates[0].toFixed(5)}`}));
  return field;
 }
 function tooltip(message){return element('span',{text:message});}
 function draw(){
  layer.clearLayers();if(panel.hidden)return;
  for(const which of ['start','end']){
   const p=state[which];if(validPoint(p.coordinates))L.circleMarker([p.coordinates[1],p.coordinates[0]],{radius:7,color:which==='start'?'#176b50':'#7b5698',weight:3,fillColor:'#fff',fillOpacity:1}).bindTooltip(tooltip(`${text(which==='start'?'routeStart':'routeEnd')}: ${label(p)}`)).addTo(layer);
  }
  if(!state.routes)return;
  for(const mode of ['normal','considerate']){
   const route=state.routes[mode];if(route.status!=='ok'||route.coordinates.length<2)continue;
   const selected=state.selected===mode;
   const line=L.polyline(route.coordinates.map(([lng,lat])=>[lat,lng]),{color:mode==='considerate'?'#176b50':'#7b5698',weight:selected?6:3,opacity:selected?.95:.45,dashArray:mode==='normal'?'7 5':null}).addTo(layer);
   line.on('click',()=>{state.selected=mode;render();draw();});
   if(selected)line.bringToFront();
  }
  const selected=state.routes[state.selected];
  if(selected.status==='ok')for(const [i,key] of [[0,'routeSnappedStart'],[selected.coordinates.length-1,'routeSnappedEnd']]){
   const p=selected.coordinates[i];L.circleMarker([p[1],p[0]],{radius:4,color:'#fff',weight:2,fillColor:'#176b50',fillOpacity:1}).bindTooltip(tooltip(text(key))).addTo(layer);
  }
 }
 function fit(){
  const route=state.routes?.[state.selected];if(route?.status!=='ok'||!route.coordinates.length)return;
  const coordinates=route.coordinates.map(([lng,lat])=>[lat,lng]);
  map.invalidateSize({pan:false});
  const mapRect=map.getContainer().getBoundingClientRect(),panelRect=panel.getBoundingClientRect();
  const top=state.viewing?Math.max(80,panelRect.bottom-mapRect.top+16):40;
  if(coordinates.length===1)map.setView(coordinates[0],Math.max(map.getZoom(),17));
  else map.fitBounds(L.latLngBounds(coordinates),{paddingTopLeft:state.viewing?[24,top]:map.getSize().x>760?[410,40]:[24,40],paddingBottomRight:[24,state.viewing?96:32],maxZoom:18,animate:false});
 }
 function routeOptions(){
  const fragment=document.createDocumentFragment();
  if(!state.routes)return fragment;
  for(const mode of ['normal','considerate']){
   const route=state.routes[mode];if(route.status!=='ok')continue;
   const option=element('button',{className:'route-option secondary-button','data-route':mode,'aria-pressed':String(state.selected===mode),type:'button'});
   option.style.cssText='width:100%;display:grid;gap:5px;text-align:left;margin-bottom:8px;padding:12px';
   if(state.selected===mode){option.style.borderColor='#176b50';option.style.background='#edf6f1';}
   option.append(element('strong',{text:text(mode==='normal'?'routeNormal':'routeConsiderate')}),element('span',{text:text('routeDistance',{distance:metres(route.distanceMeters)})}),element('small',{text:text('routeExposure',{distance:metres(route.nearbyResidentialMeters)})}));
   option.onclick=()=>{state.selected=mode;render();draw();};fragment.append(option);
  }
  const {normal,considerate}=state.routes;
  if(normal.status==='ok'&&considerate.status==='ok'){
   const delta=considerate.distanceMeters-normal.distanceMeters,ratio=normal.distanceMeters>0?`${(delta/normal.distanceMeters*100).toFixed(1)}%`:text('routeNoRatio');
   const exposureChange=normal.nearbyResidentialMeters-considerate.nearbyResidentialMeters;
   fragment.append(element('p',{id:'route-comparison',className:'detail-note',text:text(exposureChange>=0?'routeComparison':'routeComparisonIncreased',{distance:metres(delta),ratio,exposure:metres(Math.abs(exposureChange))})}));
  }
  const selected=state.routes[state.selected];
  if(selected.status==='ok'){
   const snap=prefix=>selected.notes.find(n=>n.startsWith(prefix))?.slice(prefix.length)??'0';
   fragment.append(element('p',{id:'route-snap-note',className:'detail-note',text:text('routeSnap',{start:snap('start-snap-meters:'),end:snap('end-snap-meters:')})}));
   if(selected.notes.includes('includes-steps')||selected.notes.includes('includes-mapped-barrier'))fragment.append(element('p',{className:'detail-note',text:text('routeAccessCaution')}));
  }
  return fragment;
 }
 async function copyDestination(){
  const p=state.end,address=p.feature?name(p.feature.properties?.address):'',value=[label(p),address,validPoint(p.coordinates)?`${p.coordinates[1]}, ${p.coordinates[0]}`:''].filter(Boolean).join('\n');
  try{await navigator.clipboard.writeText(value);status('routeCopied');}
  catch{
   let fallback=panel.querySelector('#route-copy-fallback');
   if(!fallback){fallback=element('textarea',{id:'route-copy-fallback',readonly:'readonly','aria-label':text('routeCopyFallback')});body.append(fallback);}
   fallback.value=value;fallback.focus();fallback.select();status('routeCopyFallback');
  }
 }
 function externalActions(){
  const fragment=document.createDocumentFragment();
  if(!validPoint(state.start.coordinates)||!validPoint(state.end.coordinates))return fragment;
  const [slng,slat]=state.start.coordinates,[dlng,dlat]=state.end.coordinates;
  // NAVER official walking scheme: https://guide.ncloud-docs.com/docs/maps-url-scheme
  const params=new URLSearchParams({slat,slng,sname:label(state.start),dlat,dlng,dname:label(state.end),appname:location.origin});
  const link=element('a',{id:'route-external-walk',className:'text-button',href:`nmap://route/walk?${params}`,text:text('routeNaverWalk')});
  link.style.display='block';link.style.padding='10px 0';
  fragment.append(element('p',{className:'detail-note',text:text('routeExternalNote')}),link);
  const copy=button('routeCopyDestination','route-copy');copy.onclick=copyDestination;fragment.append(copy);return fragment;
 }
 function render(){
  const active=document.activeElement,activeId=panel.contains(active)?active.id:null,activeRoute=panel.contains(active)?active.dataset?.route:null;
  heading.textContent=text(state.picking?(state.picking==='start'?'routePickStart':'routePickEnd'):state.viewing?'routeViewing':'routeTitle');
  closeButton.textContent='×';closeButton.setAttribute('aria-label',text('routeClose'));
  const compact=Boolean(state.picking||state.viewing);back.hidden=!compact;back.textContent=text(state.picking?'routeCancelPick':'routeShowControls');
  document.body.classList.toggle('route-map-view',state.viewing&&!panel.hidden);
  if(compact){
   const top=getComputedStyle(panel).position==='fixed'?Math.max(12,map.getContainer().getBoundingClientRect().top+12):12;
   panel.style.cssText=`inset:${top}px 12px auto;width:auto`;
  }else panel.removeAttribute('style');
  body.hidden=compact;actions.hidden=compact;body.replaceChildren();actions.replaceChildren();
  body.append(element('p',{text:text('routeIntro')}),endpointField('start'),endpointField('end'));
  const message=element('p',{id:'route-message',role:'status','aria-live':'polite',text:state.status?text(state.status):''});body.append(message,routeOptions());
  body.append(element('p',{className:'detail-note',text:text('routeCaveat')}));
  if(state.routes||state.status)body.append(externalActions());
  const calculate=button(state.busy?'routeCalculating':'routeCalculate','route-calculate','primary-button');calculate.disabled=state.busy||state.end.key==='invalid';calculate.onclick=calculateRoutes;actions.append(calculate);
  if(state.routes?.[state.selected]?.status==='ok'){const view=button('routeView','route-view');view.onclick=()=>{state.viewing=true;render();fit();};actions.append(view);}
  panel.setAttribute('aria-busy',String(state.busy));
  const restore=activeId?panel.querySelector(`#${CSS.escape(activeId)}`):activeRoute?panel.querySelector(`[data-route="${CSS.escape(activeRoute)}"]`):null;
  if(restore&&!restore.disabled&&!restore.closest('[hidden]'))restore.focus({preventScroll:true});
 }
 async function calculateRoutes(){
  if(state.busy)return;
  if(state.end.key==='invalid'){status('routeNoCoordinates');return;}
  clearRoutes();state.status=null;
  if(state.start.key==='gps'){const p=getPosition();state.start.coordinates=p&&validPoint([p.lng,p.lat])?[p.lng,p.lat]:null;}
  if(!validPoint(state.start.coordinates)||!validPoint(state.end.coordinates)){render();status('routeNoPosition');return;}
  const graph=getGraph();if(!graph){render();status('routeNetworkMissing');return;}
  const token=state.generation;state.busy=true;render();
  // Paint the disabled state before synchronous network traversal begins.
  await new Promise(resolve=>requestAnimationFrame(()=>setTimeout(resolve,0)));
  if(token!==state.generation||panel.hidden)return;
  try{
   const zones=getZones()||[],issues=getIssues()||[];
   const normal=findWalkingRoute(graph,state.start.coordinates,state.end.coordinates,{mode:'normal',zones,issues});
   const considerate=findWalkingRoute(graph,state.start.coordinates,state.end.coordinates,{mode:'considerate',zones,issues});
   state.routes={normal,considerate};state.selected=considerate.status==='ok'?'considerate':'normal';
   state.status=normal.status==='ok'?'routeReady':normal.status==='too-far'?'routeTooFar':'routeDisconnected';
  }catch{state.routes=null;state.status='routeError';}
  finally{state.busy=false;render();draw();if(state.status)onStatus(state.status);fit();}
 }
 function close(){clearRoutes();state.busy=false;state.picking=null;state.viewing=false;panel.hidden=true;document.body.classList.remove('route-map-view');}
 function open(destinationFeature){
  close();onOpen();state.start={key:'seongsu',coordinates:STATIONS.seongsu.coordinates};state.end={key:'forest',coordinates:STATIONS.forest.coordinates};state.status=null;
  state.places=(getPlaces()||[]).filter(actualPoint);
  if(destinationFeature){if(actualPoint(destinationFeature))state.end={key:'destination',feature:destinationFeature,coordinates:destinationFeature.geometry.coordinates};else{state.end={key:'invalid',feature:destinationFeature,coordinates:null};state.status='routeNoCoordinates';}}
  panel.hidden=false;render();draw();heading.tabIndex=-1;heading.focus({preventScroll:true});
 }
 function pick(latLng){
  if(!state.picking)return false;
  const coordinates=Array.isArray(latLng)?[latLng[1],latLng[0]]:[latLng?.lng,latLng?.lat];
  if(!validPoint(coordinates)){status('routeInvalidPoint');return false;}
  const which=state.picking;state[which]={key:'picked',coordinates};state.picking=null;state.status=null;clearRoutes();render();draw();return true;
 }
 closeButton.onclick=close;back.onclick=()=>{state.picking=null;state.viewing=false;render();};
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!panel.hidden){if(state.picking||state.viewing){state.picking=null;state.viewing=false;render();}else closeButton.click();}});
 render();return {open,close,translate(){render();draw();},isPicking:()=>Boolean(state.picking),pick};
}
