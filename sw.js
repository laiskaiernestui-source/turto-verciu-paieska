// Realia platformos service worker: įdiegimas kaip programėlė, push pranešimai ir programėlės balionėlis.
self.addEventListener('install',e=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',e=>{ if(e.request.method!=='GET'||!e.request.url.startsWith(self.location.origin)) return;
  e.respondWith(fetch(e.request).catch(()=>caches.match(e.request).then(r=>r||new Response('<!doctype html><meta charset="utf-8"><body style="font-family:sans-serif;padding:40px;text-align:center"><h2>Nėra interneto ryšio</h2><p>Realia platformai reikia interneto.</p>',{headers:{'content-type':'text/html'}})))); });

// --- balionėlio skaitikliai (IndexedDB, nes SW neturi localStorage)
function idb(){ return new Promise((res,rej)=>{ const r=indexedDB.open('tvb',1); r.onupgradeneeded=()=>r.result.createObjectStore('kv'); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); }); }
async function kvGet(k){ const d=await idb(); return new Promise(res=>{ const q=d.transaction('kv').objectStore('kv').get(k); q.onsuccess=()=>res(q.result); q.onerror=()=>res(undefined); }); }
async function kvSet(k,v){ const d=await idb(); return new Promise(res=>{ const t=d.transaction('kv','readwrite'); t.objectStore('kv').put(v,k); t.oncomplete=()=>res(); t.onerror=()=>res(); }); }
async function applyBadge(){ try{ const b=(await kvGet('badge'))||{}; const n=(b.mail|0)+(b.task|0); if('setAppBadge' in self.navigator){ if(n>0) await self.navigator.setAppBadge(n); else await self.navigator.clearAppBadge(); } }catch(e){} }

self.addEventListener('message',e=>{ const m=e.data||{}; if(m.type==='badge'){ e.waitUntil((async()=>{ const b=(await kvGet('badge'))||{}; if('mail' in m) b.mail=m.mail|0; if('task' in m) b.task=m.task|0; await kvSet('badge',b); await applyBadge(); })()); } });

self.addEventListener('push',e=>{ let p={}; try{ p=e.data?e.data.json():{}; }catch(x){ p={title:'Realia',body:e.data?e.data.text():''}; }
  e.waitUntil((async()=>{ const b=(await kvGet('badge'))||{};
    if(p.kind==='mail') b.mail=(b.mail|0)+1; else if(p.kind==='task'){ b.task=p.badge!=null?p.badge|0:(b.task|0)+1; }
    await kvSet('badge',b); await applyBadge();
    await self.registration.showNotification(p.title||'Realia',{ body:p.body||'', icon:'/icon-192.png', badge:'/icon-192.png', tag:p.tag||undefined, renotify:!!p.tag, data:{url:p.url||'/'} });
  })()); });

self.addEventListener('notificationclick',e=>{ e.notification.close(); const url=new URL((e.notification.data&&e.notification.data.url)||'/',self.location.origin).href;
  e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(cs=>{ for(const c of cs){ if(c.url.split('?')[0]===url.split('?')[0]&&'focus' in c){ c.navigate&&c.navigate(url); return c.focus(); } } return self.clients.openWindow(url); })); });
