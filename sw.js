// Minimalus service worker: tik tam, kad platformą būtų galima įdiegti kaip programėlę. Tinklas visada pirmas.
self.addEventListener('install',e=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',e=>{ if(e.request.method!=='GET'||!e.request.url.startsWith(self.location.origin)) return;
  e.respondWith(fetch(e.request).catch(()=>caches.match(e.request).then(r=>r||new Response('<!doctype html><meta charset="utf-8"><body style="font-family:sans-serif;padding:40px;text-align:center"><h2>Nėra interneto ryšio</h2><p>Realia platformai reikia interneto.</p>',{headers:{'content-type':'text/html'}})))); });
