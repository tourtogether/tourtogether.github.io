import {orient2d} from '../vendor/robust-predicates/orient2d.js';
const LIVE=new Set(['official','field_checked','map_record','derived','team_entry','interview_report']);
const CATEGORIES=new Set(['restaurant','cafe','toilet','bin','recycling','smoking','rest','water','station','store']);
const KINDS=new Set(['residential','commercial','mixed','unknown','no_smoking']);
const isPoint=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&Math.abs(p[0])<=180&&Math.abs(p[1])<=90;
const orientation=(a,b,c)=>orient2d(a[0],a[1],b[0],b[1],c[0],c[1]);
const onSegment=(a,b,p)=>orientation(a,b,p)===0&&p[0]>=Math.min(a[0],b[0])&&p[0]<=Math.max(a[0],b[0])&&p[1]>=Math.min(a[1],b[1])&&p[1]<=Math.max(a[1],b[1]);
function intersects(a,b,c,d){
 const ab1=orientation(a,b,c),ab2=orientation(a,b,d),cd1=orientation(c,d,a),cd2=orientation(c,d,b);
 return (ab1*ab2<0&&cd1*cd2<0)||onSegment(a,b,c)||onSegment(a,b,d)||onSegment(c,d,a)||onSegment(c,d,b);
}
function validRing(ring){
 if(!Array.isArray(ring)||ring.length<4||!ring.every(isPoint)||ring[0][0]!==ring.at(-1)[0]||ring[0][1]!==ring.at(-1)[1])return false;
 let area=0;
 for(let i=0;i<ring.length-1;i++){
  const a=ring[i],b=ring[i+1];area+=(a[0]-ring[0][0])*(b[1]-ring[0][1])-(b[0]-ring[0][0])*(a[1]-ring[0][1]);
  if(a[0]===b[0]&&a[1]===b[1])return false;
  for(let j=i+2;j<ring.length-1;j++){
   if(i===0&&j===ring.length-2)continue;
   if(intersects(a,b,ring[j],ring[j+1]))return false;
  }
 }
 return Math.abs(area)>1e-20;
}
export function validGeometry(g,{nullable=false}={}){
 if(g===null)return nullable;
 if(!g||typeof g!=='object')return false;
 if(g.type==='Point')return isPoint(g.coordinates);
 if(g.type==='LineString')return Array.isArray(g.coordinates)&&g.coordinates.length>=2&&g.coordinates.every(isPoint);
 if(g.type==='MultiLineString')return Array.isArray(g.coordinates)&&g.coordinates.length>0&&g.coordinates.every(line=>Array.isArray(line)&&line.length>=2&&line.every(isPoint));
 if(!['Polygon','MultiPolygon'].includes(g.type))return false;
 const polygons=g.type==='Polygon'?[g.coordinates]:g.coordinates;
 return Array.isArray(polygons)&&polygons.length>0&&polygons.every(p=>Array.isArray(p)&&p.length>0&&p.every(validRing));
}
function geometryPoints(g){
 if(g.type==='Point')return [g.coordinates];
 if(g.type==='LineString')return g.coordinates;
 if(g.type==='MultiLineString')return g.coordinates.flat();
 if(g.type==='Polygon')return g.coordinates.flat();
 return g.coordinates.flat(2);
}
export function sanitizeCollection(raw,{type='places',demo=false,bounds=null}={}){
 const collection={type:'FeatureCollection',features:[]},errors=[],seen=new Set();
 if(raw?.type!=='FeatureCollection'||!Array.isArray(raw.features))return {collection,rejectedCount:1,errors:['invalid-collection']};
 for(const [index,f] of raw.features.entries()){
  const p=f?.properties;
  let reason='';
  if(f?.type!=='Feature'||!p||typeof p.id!=='string'||!p.id.trim())reason='invalid-feature';
  else if(seen.has(p.id))reason='duplicate-id';
  else if(!(demo?p.verification==='demo':LIVE.has(p.verification)))reason='invalid-verification';
  else if(!p.names||!['ko','en','ja','zh'].every(l=>typeof p.names[l]==='string'&&p.names[l].trim()))reason='missing-name';
  else if(!demo&&!(typeof p.sourceUrl==='string'&&(p.sourceUrl.startsWith('https://')||(['team_entry','interview_report','field_checked'].includes(p.verification)&&p.sourceUrl.startsWith('project:')))))reason='missing-source';
  else if(!validGeometry(f.geometry,{nullable:type==='issues'}))reason='invalid-geometry';
  else if(type==='places'&&(f.geometry.type!=='Point'||!CATEGORIES.has(p.category)))reason='invalid-place';
  else if(type==='zones'&&(!['Polygon','MultiPolygon'].includes(f.geometry?.type)||!KINDS.has(p.kind)))reason='invalid-zone';
  else if(type==='lines'&&!['LineString','MultiLineString'].includes(f.geometry?.type))reason='invalid-line';
  else if(bounds&&f.geometry&&geometryPoints(f.geometry).some(([lng,lat])=>lng<bounds[0]||lng>bounds[2]||lat<bounds[1]||lat>bounds[3]))reason='outside-scope';
  if(reason){errors.push(`${index}:${reason}`);continue;}
  seen.add(p.id);collection.features.push(f);
 }
 return {collection,rejectedCount:errors.length,errors};
}
