import {GEOFENCE_CONFIG} from './config.js';
// Distances are metres. Local projection is appropriate for this Seongsu map.
export const DEFAULT_GEOFENCE_CONFIG=GEOFENCE_CONFIG;
function inRing([x,y],ring){
 let inside=false;
 for(let i=0,j=ring.length-1;i<ring.length;j=i++){
  const [xi,yi]=ring[i], [xj,yj]=ring[j];
  if((yi>y)!==(yj>y) && x<(xj-xi)*(y-yi)/(yj-yi)+xi)inside=!inside;
 }
 return inside;
}
export function pointInPolygon(point,geometry){
 if(geometry?.type==='MultiPolygon')return geometry.coordinates.some(c=>pointInPolygon(point,{type:'Polygon',coordinates:c}));
 if(geometry?.type!=='Polygon'||!geometry.coordinates?.length)return false;
 return inRing(point,geometry.coordinates[0])&&!geometry.coordinates.slice(1).some(r=>inRing(point,r));
}
export function distanceToBoundary([lng,lat],geometry){
 const polygons=geometry.type==='MultiPolygon'?geometry.coordinates:[geometry.coordinates];
 const scaleX=111195*Math.cos(lat*Math.PI/180),scaleY=111195;
 let closest=Infinity;
 for(const polygon of polygons)for(const ring of polygon)for(let i=1;i<ring.length;i++){
  const ax=(ring[i-1][0]-lng)*scaleX,ay=(ring[i-1][1]-lat)*scaleY;
  const bx=(ring[i][0]-lng)*scaleX,by=(ring[i][1]-lat)*scaleY;
  const dx=bx-ax,dy=by-ay,den=dx*dx+dy*dy;
  const t=den?Math.max(0,Math.min(1,-(ax*dx+ay*dy)/den)):0;
  closest=Math.min(closest,Math.hypot(ax+t*dx,ay+t*dy));
 }
 return closest;
}
export class GeofenceEngine {
 constructor(zones,{mode='live',allowMapRecords=false,alertHistory=null,...config}={}){
  this.config={...DEFAULT_GEOFENCE_CONFIG,...config};
  this.alertHistory=alertHistory||new Map();
  this.zones=zones.filter(z=>z?.properties&&['residential','mixed','no_smoking'].includes(z.properties.kind)&&
   (['official','field_checked'].includes(z.properties.verification)||(allowMapRecords&&['map_record','derived'].includes(z.properties.verification))||(mode==='demo'&&z.properties.verification==='demo')));
  this.reset({preserveAlerts:true});
 }
 reset({preserveAlerts=false}={}){this.states=new Map();this.lastTimestamp=-Infinity;if(!preserveAlerts)this.alertHistory.clear();}
 invalidate(){for(const state of this.states.values())state.candidate=null;}
 update(sample,now=Date.now()){
  const events=[];const response=status=>({status,events,insideIds:[...this.states].filter(([,s])=>s.inside).map(([id])=>id)});
  if(!sample||!['lng','lat','accuracy','timestamp'].every(k=>Number.isFinite(sample[k]))||Math.abs(sample.lng)>180||Math.abs(sample.lat)>90||sample.accuracy<0)return response('invalid');
  if(now-sample.timestamp>this.config.maxAge||sample.timestamp>now+1000||sample.timestamp<=this.lastTimestamp)return response('stale');
  this.lastTimestamp=sample.timestamp;
  if(sample.accuracy>this.config.maxAccuracy){for(const s of this.states.values())s.candidate=null;return response('inaccurate');}
  for(const zone of this.zones){
   const id=zone.properties.id,point=[sample.lng,sample.lat];
   const footprint=zone.properties.geometryRole==='building_footprint'&&zone.properties.residentialBasis===true;
   const rawInterior=pointInPolygon(point,zone.geometry),rawDistance=distanceToBoundary(point,zone.geometry);
   // A footprint is not a neighborhood boundary: describe this separate 25m guide as nearby.
   const interior=rawInterior||(footprint&&rawDistance<this.config.residentialProximity);
   const distance=footprint?(rawInterior?this.config.residentialProximity+rawDistance:Math.abs(this.config.residentialProximity-rawDistance)):rawDistance;
   let s=this.states.get(id);
   if(!s){s={inside:false,initialInside:interior,observedOutside:!interior,candidate:null,lastAlert:this.alertHistory.get(id)??-Infinity};this.states.set(id,s);}
   const threshold=Math.max(sample.accuracy,interior?this.config.entryMargin:this.config.exitMargin);
   if(distance<threshold){s.candidate=null;continue;}
   if(!interior)s.observedOutside=true;
   if(interior===s.inside){s.candidate=null;continue;}
   if(!s.candidate||s.candidate.target!==interior){s.candidate={target:interior,start:sample.timestamp,count:1};continue;}
   s.candidate.count++;
   if(s.candidate.count<2||(interior&&sample.timestamp-s.candidate.start<this.config.entryDelay))continue;
   s.inside=interior;s.candidate=null;
   if(!interior){events.push({zoneId:id,type:'exit'});continue;}
   const nearbyAllowed=!footprint||sample.timestamp-(this.alertHistory.get('@residential-nearby')??-Infinity)>=this.config.nearbyCooldown;
   if(sample.timestamp-s.lastAlert>=this.config.cooldown&&nearbyAllowed){
    events.push({zoneId:id,type:footprint?'nearby':s.initialInside&&!s.observedOutside?'current':'entry'});s.lastAlert=sample.timestamp;this.alertHistory.set(id,sample.timestamp);
    if(footprint)this.alertHistory.set('@residential-nearby',sample.timestamp);
   }
  }
  return response('ok');
 }
}
