const CACHE="good-news-v58-legal-menu-fixed";
const STATIC=[
  "./",
  "./index.html",
  "./style.css?v=59",
  "./app.js?v=46",
  "./config.js",
  "./manifest.json",
  "./date-slide-background-v2.png",
  "./icon-192.png"
];

self.addEventListener("install",e=>{
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(STATIC)));
});

self.addEventListener("activate",e=>{
  e.waitUntil(Promise.all([
    caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))),
    self.clients.claim()
  ]));
});

self.addEventListener("fetch",e=>{
  if(e.request.method!=="GET")return;
  const u=new URL(e.request.url);

  // Supabase API calls should always go directly to the network.
  if(u.hostname.includes("supabase.co"))return;

  e.respondWith(
    fetch(e.request).then(response=>{
      const copy=response.clone();
      caches.open(CACHE).then(c=>c.put(e.request,copy)).catch(()=>{});
      return response;
    }).catch(async()=>{
      const cached=await caches.match(e.request);
      if(cached)return cached;
      if(e.request.mode==="navigate"){
        return caches.match("./index.html");
      }
      return Response.error();
    })
  );
});
