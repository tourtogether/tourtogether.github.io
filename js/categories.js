// Space-use colors are independent of the residential evidence used for GPS/routes.
const rows=[
 ['residential','#9276bd','주거','Residential','住宅','住宅'],
 ['commercial','#65aa8b','상권','Commercial area','商圏','商圈'],
 ['mixed','#d0a551','주거·상권 겹침','Housing in trade area','住宅・商圏の重なり','住宅与商圈重叠'],
 ['neighborhood_service','#c7b18c','근린생활시설','Neighborhood services','近隣生活施設','社区生活设施'],
 ['retail','#cfac87','판매시설','Retail','販売施設','零售设施'],
 ['food','#c89b70','음식·카페 시설','Food and café premises','飲食・カフェ施設','餐饮咖啡设施'],
 ['school','#6697cb','학교','School','学校','学校'],
 ['education','#87acce','교육·연구','Education and research','教育・研究','教育科研'],
 ['childcare','#c0a8d0','아동·보육','Childcare','児童・保育','儿童保育'],
 ['welfare','#bd9eb9','복지시설','Welfare','福祉施設','福利设施'],
 ['education_welfare','#a79cc9','교육·복지','Education and welfare','教育・福祉','教育福利'],
 ['religion','#b59ace','종교시설','Religion','宗教施設','宗教设施'],
 ['medical','#d68c9a','의료시설','Healthcare','医療施設','医疗设施'],
 ['culture','#b797b6','문화·집회','Culture and assembly','文化・集会','文化集会'],
 ['sports','#8aaeb3','체육시설','Sports','体育施設','体育设施'],
 ['industrial','#b69c82','공장·제조','Industry and manufacturing','工場・製造','工厂制造'],
 ['storage','#b2a996','창고','Storage','倉庫','仓储'],
 ['office','#8fa6b5','업무시설','Offices','業務施設','办公设施'],
 ['hospitality','#ca9d92','숙박시설','Accommodation','宿泊施設','住宿设施'],
 ['public','#899dbe','공공시설','Public facilities','公共施設','公共设施'],
 ['transport','#9baeb9','교통시설','Transport','交通施設','交通设施'],
 ['parking','#b2b7bb','주차장','Parking','駐車場','停车场'],
 ['automotive','#a4abb0','자동차 관련','Automotive facilities','自動車関連','汽车设施'],
 ['utilities','#aeb699','기반·처리시설','Utilities','基盤・処理施設','基础处理设施'],
 ['tourism','#baac8d','관광·휴게','Tourism and recreation','観光・休憩','旅游休闲'],
 ['other_facility','#b4aba3','기타 시설·공간','Other recorded facilities','その他の施設','其他设施空间'],
 ['park','#83b77e','공원','Park','公園','公园'],
 ['green','#aacb94','녹지','Green space','緑地','绿地'],
 ['water','#85b9d2','하천·수면','Water','河川・水面','河流水面'],
 ['road','#d2cbbb','도로','Road','道路','道路'],
 ['railway','#a7a4b4','철도','Railway','鉄道','铁路'],
 ['construction','#c7ae83','공사 부지','Construction site','工事用地','施工用地'],
 ['no_smoking','#c36b59','금연 안내구역','No-smoking guidance zone','禁煙案内区域','禁烟提示区域'],
 ['outdoor','#ded9ce','건물 외부공간','Outdoor space','建物外の空間','建筑外部空间']
];
export const SPACE_CATEGORIES=rows.map(([id,color,ko,en,ja,zh])=>({id,color,names:{ko,en,ja,zh}}));
const known=new Set(SPACE_CATEGORIES.map(c=>c.id));
export function spaceCategory(feature){const p=feature?.properties||{};if(p.displayEnabled===false||p.spaceCategory==='coverage_extent')return null;return known.has(p.spaceCategory)?p.spaceCategory:known.has(p.kind)?p.kind:p.kind==='unknown'?'other_facility':null;}
export function spaceTranslations(lang){return Object.fromEntries(SPACE_CATEGORIES.map(c=>['space_'+c.id,c.names[lang]||c.names.en]));}
export const spaceStyle=key=>SPACE_CATEGORIES.find(c=>c.id===key)||SPACE_CATEGORIES.at(-1);
