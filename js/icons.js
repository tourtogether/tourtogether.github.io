const paths={
 people:'<circle cx="9" cy="7" r="3"/><path d="M3 21v-4a6 6 0 0 1 12 0v4M16 4a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 4v4"/>',
 route:'<circle cx="5" cy="5" r="2"/><circle cx="19" cy="19" r="2"/><path d="M7 5h8a4 4 0 0 1 0 8H9a4 4 0 0 0 0 8h8"/>',
 edit:'<path d="m14 4 6 6M4 20l1-6L16 3l5 5-11 11-6 1Z"/>',
 layers:'<path d="m12 3 10 6-10 6L2 9l10-6Zm-9 11 9 6 9-6M3 18l9 5 9-5"/>',
 recycling:'<path d="m8 3 4 1-2 4m2-4 5 7m5 5-2 4-4-2m4 2H10M3 12l-1-4 4-1M2 8l5 10"/>',
 bookmark:'<path d="M6 3h12v18l-6-4-6 4V3Z"/>',
 cafe:'<path d="M4 9h12v8a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V9Zm12 1h2a3 3 0 0 1 0 6h-2M7 3v2m5-2v2"/>',
 map:'<path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2V5Z"/><path d="M9 3v16m6-14v16"/>',
 search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
 pin:'<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2.5"/>',
 restaurant:'<path d="M4 3v6a3 3 0 0 0 6 0V3M7 3v18m10 0V3c-4 2-4 9 0 9h2"/>',
 toilet:'<circle cx="7" cy="4" r="1"/><circle cx="17" cy="4" r="1"/><path d="M4 10V8h6v2m-3-2v13m-2-7h4m5-4 3-3 3 3m-3-3 4 9h-8l4-9Zm-2 10v4m4-4v4"/>',
 bin:'<path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/>',
 smoking:'<path d="M3 15h14v5H3zm14 0h4v5h-4M10 3c-3 4 5 3 2 7m5-7c-3 4 5 3 2 7"/>',
 leaf:'<path d="M20 3C9 3 3 8 5 15s13 6 15-12Z"/><path d="M4 21 15 10"/>',
 info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.1"/>',
 home:'<path d="m3 11 9-8 9 8M5 9v12h14V9m-10 12v-8h6v8"/>',
 locate:'<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3m10 7h-3m-7 10v-3M2 12h3"/>',
 play:'<path d="m8 4 12 8-12 8V4Z"/>',
 close:'<path d="m6 6 12 12M6 18 18 6"/>',
 chevron:'<path d="m8 10 4 4 4-4"/>',
 arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>',
 copy:'<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
 check:'<path d="m5 12 4 4L19 6"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'
};
export const icon=name=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]||paths.pin}</svg>`;
export function fillIcons(root=document){root.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon));}
