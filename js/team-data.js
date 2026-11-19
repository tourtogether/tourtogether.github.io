import {sanitizeCollection} from './resources.js';
import {SPACE_CATEGORIES} from './categories.js';
const langs=['ko','en','ja','zh'];
const collection=features=>({type:'FeatureCollection',features});
const texts=(value,fallback='')=>Object.fromEntries(langs.map(l=>{const f=typeof fallback==='object'?fallback[l]||fallback.ko||'':fallback;return [l,typeof value==='object'?String(value?.[l]||value?.ko||f):String(value||f)];}));
export const emptyTeamBundle=()=>({version:1,places:collection([]),zones:collection([]),issues:collection([])});
export function createTeamFeature(input){
 const type=input.type||'places',label=String(input.name||'').trim();
 if(!['places','zones','issues'].includes(type))throw new Error('entry-type');
 if(type==='zones'&&(input.kind==='no_smoking'||input.spaceCategory==='no_smoking'))throw new Error('official-impersonation-legal-boundary');
 if(!label)throw new Error('name-required');
 const now=new Date().toISOString().slice(0,10);
 const id=input.id||`team-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`;
 const properties={id,names:texts(input.translations||label,label),verification:input.reviewed?'field_checked':'team_entry',sourceUrl:'project:team-entry',checkedAt:now,description:texts(input.description),reviewStatus:input.reviewed?'checked':'pending',teamSelected:Boolean(input.curated),publicConsent:Boolean(input.publicConsent)};
 if(input.reviewed)Object.assign(properties,{verificationBasis:'team_self_report',independentlyFieldVerified:false});
 let geometry;
 if(type==='zones'){
  const ring=(input.coordinates||[]).map(p=>[Number(p[0]),Number(p[1])]);
  if(ring.length&&ring[0].some((n,i)=>n!==ring.at(-1)[i]))ring.push([...ring[0]]);
  const category=input.spaceCategory||input.kind||'residential';
  if(!SPACE_CATEGORIES.some(c=>c.id===category)&&category!=='unknown')throw new Error('invalid-space-category');
  geometry={type:'Polygon',coordinates:[ring]};properties.spaceCategory=category==='unknown'?'other_facility':category;properties.kind=['residential','commercial','mixed'].includes(category)?category:'unknown';
 }else{
  properties.category=input.category||'restaurant';properties.address=texts(input.address);properties.hours=texts(input.hours,{'ko':'미확인','en':'Not checked','ja':'未確認','zh':'待核实'});
  geometry=input.lat!==''&&input.lng!==''&&Number.isFinite(Number(input.lat))&&Number.isFinite(Number(input.lng))?{type:'Point',coordinates:[Number(input.lng),Number(input.lat)]}:null;
 }
 const feature={type:'Feature',properties,geometry};
 const result=sanitizeCollection(collection([feature]),{type,bounds:input.bounds});
 if(result.rejectedCount)throw new Error(result.errors.join(','));
 return feature;
}
export function parseTeamBundle(text,{bounds=null}={}){
 const raw=typeof text==='string'?JSON.parse(text):text;
 if(raw?.version!==1)throw new Error('team-version');
 const result=emptyTeamBundle();
 const seen=new Set();
 for(const type of ['places','zones','issues']){
  const features=raw[type]?.features;
  if(!Array.isArray(features)||features.some(f=>!['team_entry','field_checked'].includes(f?.properties?.verification)||typeof f?.properties?.sourceUrl!=='string'||!f.properties.sourceUrl.startsWith('project:')))throw new Error('team-verification');
  for(const f of features){const p=f.properties;if(seen.has(p.id))throw new Error('duplicate-id');seen.add(p.id);if(p.verification==='field_checked'&&p.reviewStatus!=='checked')throw new Error('field-review');if(type==='zones'&&(p.kind==='no_smoking'||p.spaceCategory==='no_smoking'))throw new Error('official-impersonation-legal-boundary');}
  const sanitized=sanitizeCollection(raw[type],{type,bounds});
  if(sanitized.rejectedCount)throw new Error(sanitized.errors.join(','));
  result[type]=sanitized.collection;
 }
 return result;
}
