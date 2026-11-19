// Directed OSM network routing. All lengths and costs use metres.
const R=6371000, DEG=Math.PI/180, NEAR=20, SAMPLE=5;
const TRUSTED=new Set(['official','field_checked','map_record']);
const ISSUE_CATEGORIES=new Set(['smoking_issue','litter_issue','noise_issue','facility_issue','privacy_issue']);
const ALLOW=new Set(['yes','designated','permissive','official']);
const DEFAULT_WALK=new Set(['footway','pedestrian','path','steps','corridor','residential','living_street','service','unclassified','road','track','primary','primary_link','secondary','secondary_link','tertiary','tertiary_link']);
const graphCache=new WeakMap(), EMPTY=[];
function pedestrianEdge(p={}){
 if(!p||typeof p!=='object')return true;
 if(p.foot&&!ALLOW.has(p.foot))return false;
 if(!ALLOW.has(p.foot)&&p.access&&!ALLOW.has(p.access))return false;
 if(['motorway','motorway_link','construction','proposed','raceway'].includes(p.highway))return false;
 if(p.highway&&!DEFAULT_WALK.has(p.highway)&&!ALLOW.has(p.foot))return false;
 if((p.construction&&p.construction!=='no')||(p.proposed&&p.proposed!=='no'))return false;
 return !['foot:conditional','access:conditional','oneway:foot:conditional'].some(k=>p[k]);
}
const validPoint=p=>Array.isArray(p)&&p.length>=2&&Number.isFinite(p[0])&&Number.isFinite(p[1])&&Math.abs(p[0])<=180&&Math.abs(p[1])<=90;
function distance(a,b){
 const q=Math.sin((b[1]-a[1])*DEG/2)**2+Math.cos(a[1]*DEG)*Math.cos(b[1]*DEG)*Math.sin((b[0]-a[0])*DEG/2)**2;
 return 2*R*Math.asin(Math.min(1,Math.sqrt(q)));
}
function pointSegment(p,a,b){
 const dx=b[0]-a[0],dy=b[1]-a[1],den=dx*dx+dy*dy;
 const t=den?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/den)):0;
 return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);
}
function inRing(p,ring){
 let yes=false;
 for(let i=0,j=ring.length-1;i<ring.length;j=i++){
  const a=ring[i],b=ring[j];
  if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])yes=!yes;
 }
 return yes;
}
function nearGeometry(p,g){
 if(g.type==='Point')return Math.hypot(p[0]-g.coordinates[0],p[1]-g.coordinates[1])<=NEAR;
 const polygons=g.type==='Polygon'?[g.coordinates]:g.type==='MultiPolygon'?g.coordinates:[];
 if(polygons.some(rings=>inRing(p,rings[0])&&!rings.slice(1).some(r=>inRing(p,r))))return true;
 const lines=g.type==='LineString'?[g.coordinates]:g.type==='MultiLineString'?g.coordinates:polygons.flat();
 return lines.some(line=>line.slice(1).some((b,i)=>pointSegment(p,line[i],b)<=NEAR));
}
function officialDerivedResidence(p){
 if(p?.verification!=='derived'||!['residential','mixed','mixed_use'].includes(p.kind)||p.residentialBasis!==true||p.sourceType!=='official_building_purpose'||p.geometryRole!=='building_footprint'||p.classificationBasis?.residentialCodeMatch!==true)return false;
 try{const source=new URL(p.sourceUrl);return source.protocol==='https:'&&source.hostname==='smap.seoul.go.kr';}catch{return false;}
}
function prepareFeatures(features,project,issue=false){
 return (Array.isArray(features)?features:[]).flatMap(f=>{
  if(!f||f.type!=='Feature'||(!TRUSTED.has(f.properties?.verification)&&(issue||!officialDerivedResidence(f.properties))))return [];
  const kind=f.properties.kind;
  if(issue&&(!ISSUE_CATEGORIES.has(f.properties.category)||f.properties.alertEnabled===false||f.properties.geometryRole==='representative_point'||String(f.properties.geometrySemantics||'').includes('reference')||String(f.properties.sourceType||'').includes('reference_point')))return [];
  if(!issue&&!['residential','mixed','mixed_use'].includes(kind))return [];
  const g=f.geometry;if(!g||!['Point','LineString','MultiLineString','Polygon','MultiPolygon'].includes(g.type))return [];
  if(!issue&&!['Polygon','MultiPolygon'].includes(g.type))return [];
  const level={Point:0,LineString:1,MultiLineString:2,Polygon:2,MultiPolygon:3}[g.type];
  const points=[];
  function convert(c,l){
   if(l===0){if(!validPoint(c))throw Error('coordinate');const p=project(c);points.push(p);return p;}
   if(!Array.isArray(c)||!c.length)throw Error('coordinates');
   const converted=c.map(x=>convert(x,l-1));
   if(l===1&&g.type!=='Point'&&converted.length<2)throw Error('line');
   return converted;
  }
  try{
   const coordinates=convert(g.coordinates,level);
   const polygons=g.type==='Polygon'?[coordinates]:g.type==='MultiPolygon'?coordinates:[];
   if(polygons.some(poly=>poly.some(r=>r.length<4||r[0][0]!==r.at(-1)[0]||r[0][1]!==r.at(-1)[1])))return [];
   const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
   return [{geometry:{type:g.type,coordinates},bbox:[Math.min(...xs)-NEAR,Math.min(...ys)-NEAR,Math.max(...xs)+NEAR,Math.max(...ys)+NEAR],residential:!issue&&['residential','mixed','mixed_use'].includes(kind),factor:issue?2:kind==='residential'?2:0.5}];
  }catch{return [];}
 });
}
// Fixed-size spatial buckets keep building footprints out of unrelated edge checks.
function spatialIndex(features){
 const cells=new Map();
 for(const f of features){
  const [x0,y0,x1,y1]=f.bbox;
  for(let x=Math.floor(x0/100);x<=Math.floor(x1/100);x++)for(let y=Math.floor(y0/100);y<=Math.floor(y1/100);y++){
   const key=`${x}:${y}`;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(f);
  }
 }
 return {query(p,q){
  const x0=Math.min(p[0],q[0]),x1=Math.max(p[0],q[0]),y0=Math.min(p[1],q[1]),y1=Math.max(p[1],q[1]),found=new Set();
  for(let x=Math.floor(x0/100);x<=Math.floor(x1/100);x++)for(let y=Math.floor(y0/100);y<=Math.floor(y1/100);y++){
   for(const f of cells.get(`${x}:${y}`)||[])if(f.bbox[0]<=x1&&f.bbox[2]>=x0&&f.bbox[1]<=y1&&f.bbox[3]>=y0)found.add(f);
  }
  return [...found];
 }};
}
function cachedNetwork(graph){
 let cached=graphCache.get(graph);if(cached)return cached;
 const nodes=new Map(graph.nodes.filter(n=>n&&validPoint([n.lng,n.lat])&&n.id!=null).map(n=>[n.id,n]));
 const adjacency=new Map();
 for(const e of graph.edges){
  if(!e||!nodes.has(e.from)||!nodes.has(e.to)||!Number.isFinite(e.distance)||e.distance<=0||!pedestrianEdge(e.properties))continue;
  if(!adjacency.has(e.from))adjacency.set(e.from,[]);adjacency.get(e.from).push(e);
 }
 const origin=nodes.values().next().value||{lng:127,lat:37.54};
 const project=p=>[(p[0]-origin.lng)*R*DEG*Math.cos(origin.lat*DEG),(p[1]-origin.lat)*R*DEG];
 cached={nodes,adjacency,project,zones:new WeakMap(),issues:new WeakMap(),metrics:new WeakMap()};graphCache.set(graph,cached);return cached;
}
function cachedFeatures(cache,data,project,issue){
 if(!Array.isArray(data))return spatialIndex([]);
 if(!cache.has(data))cache.set(data,spatialIndex(prepareFeatures(data,project,issue)));
 return cache.get(data);
}
class MinHeap{
 constructor(){this.items=[];}
 push(value){const a=this.items;let i=a.length;a.push(value);while(i){const p=(i-1)>>1;if(a[p].cost<=value.cost)break;a[i]=a[p];i=p;}a[i]=value;}
 pop(){const a=this.items,first=a[0],last=a.pop();if(a.length){let i=0;while(i*2+1<a.length){let c=i*2+1;if(c+1<a.length&&a[c+1].cost<a[c].cost)c++;if(a[c].cost>=last.cost)break;a[i]=a[c];i=c;}a[i]=last;}return first;}
 get length(){return this.items.length;}
}

/** Returns graph-node geometry only. Edges are directed; builder emits both foot directions. */
export function findWalkingRoute(graph,start,end,{mode='normal',zones=EMPTY,issues=EMPTY}={}){
 const empty=(status,notes=[])=>({status,coordinates:[],distanceMeters:0,weightedCost:0,nearbyResidentialMeters:0,notes});
 if(!validPoint(start)||!validPoint(end))return empty('too-far',['invalid-endpoint']);
 if(graph?.version!==1||!Array.isArray(graph.nodes)||!Array.isArray(graph.edges))return empty('no-route',['invalid-network']);
 const cached=cachedNetwork(graph),{nodes,adjacency,project}=cached;
 function snap(p){let nearest=null,best=Infinity;for(const n of nodes.values()){const d=distance(p,[n.lng,n.lat]);if(d<best){nearest=n;best=d;}}return {node:nearest,distance:best};}
 const a=snap(start),b=snap(end);
 if(!a.node||!b.node||a.distance>80||b.distance>80)return empty('too-far',['endpoint-over-80m-from-network']);
 const notes=['osm-not-field-verified','snapped-endpoints',`start-snap-meters:${a.distance.toFixed(1)}`,`end-snap-meters:${b.distance.toFixed(1)}`];
 const zoneIndex=cachedFeatures(cached.zones,zones,project,false),issueIndex=cachedFeatures(cached.issues,issues,project,true);
 if(!cached.metrics.has(zoneIndex))cached.metrics.set(zoneIndex,new WeakMap());
 const byIssue=cached.metrics.get(zoneIndex);
 if(!byIssue.has(issueIndex))byIssue.set(issueIndex,new Map());
 const metrics=byIssue.get(issueIndex);
 function measure(edge){
  const key=[String(edge.from),String(edge.to)].sort().join(':')+':'+edge.distance;
  if(metrics.has(key))return metrics.get(key);
  const u=nodes.get(edge.from),v=nodes.get(edge.to),p=project([u.lng,u.lat]),q=project([v.lng,v.lat]);
  const candidates=[...zoneIndex.query(p,q),...issueIndex.query(p,q)];
  let exposure=0,penalty=0;
  if(candidates.length){
   const count=Math.max(1,Math.ceil(Math.hypot(q[0]-p[0],q[1]-p[1])/SAMPLE)),unit=edge.distance/count;
   for(let i=0;i<count;i++){
    const t=(i+0.5)/count,point=[p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t];
    let factor=0,residential=false;
    for(const f of candidates)if(nearGeometry(point,f.geometry)){factor=Math.max(factor,f.factor);residential ||= f.residential;}
    if(residential)exposure+=unit;
    penalty+=unit*factor;
   }
  }
  const result={exposure,penalty};metrics.set(key,result);return result;
 }
 const costs=new Map([[a.node.id,0]]),previous=new Map(),queue=new MinHeap();queue.push({id:a.node.id,cost:0});
 while(queue.length){
  const current=queue.pop();if(current.cost!==costs.get(current.id))continue;
  if(current.id===b.node.id)break;
  for(const edge of adjacency.get(current.id)||[]){
   const cost=current.cost+edge.distance+(mode==='considerate'?measure(edge).penalty:0);
   if(cost<(costs.get(edge.to)??Infinity)){costs.set(edge.to,cost);previous.set(edge.to,edge);queue.push({id:edge.to,cost});}
  }
 }
 if(!costs.has(b.node.id))return empty('no-route',[...notes,'disconnected-network']);
 const route=[];let id=b.node.id;
 while(id!==a.node.id){const edge=previous.get(id);route.push(edge);id=edge.from;}
 route.reverse();
 const coordinates=[[a.node.lng,a.node.lat],...route.map(e=>{const n=nodes.get(e.to);return [n.lng,n.lat];})];
 if(route.some(e=>e.properties?.highway==='steps'))notes.push('includes-steps');
 if(route.some(e=>e.properties?.nodeBarriers?.length))notes.push('includes-mapped-barrier');
 if(route.some(e=>e.properties?.access==='permissive'||e.properties?.foot==='permissive'))notes.push('includes-permissive-access');
 return {status:'ok',coordinates,distanceMeters:route.reduce((s,e)=>s+e.distance,0),weightedCost:costs.get(b.node.id),nearbyResidentialMeters:route.reduce((s,e)=>s+measure(e).exposure,0),notes};
}
