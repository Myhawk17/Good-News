const AUFWIND_SW_BUILD=92;
const CACHE=`aufwind-build-${AUFWIND_SW_BUILD}`;
const STATIC=[
  "./",
  "./index.html",
  "./style.css?v=92",
  "./app.js?v=92",
  "./config.js",
  "./manifest.json?v=92",
  "./aufwind-favicon-32.png",
  "./aufwind-apple-touch-icon.png",
  "./aufwind-icon-192.png",
  "./aufwind-icon-512.png",
  "./aufwind-maskable-192.png",
  "./aufwind-maskable-512.png",
  "./date-slide-background-v2.png",
  "./aufwind-icon-192.png",
  "./notification-badge.png"
];

self.addEventListener("install",event=>{
  // Sofort übernehmen. Das Vorladen ist absichtlich nicht Voraussetzung für die
  // Aktivierung, damit auch eine festhängende ältere Android-PWA aktualisiert wird.
  self.skipWaiting();
});

self.addEventListener("message",event=>{
  if(event.data?.type==="SKIP_WAITING") self.skipWaiting();
});

function freshClientUrl(rawUrl){
  const url=new URL(rawUrl);
  if(url.origin!==self.location.origin) return null;
  const shownBuild=Number(url.searchParams.get("gn_sw"));
  if(shownBuild===AUFWIND_SW_BUILD) return null;
  url.searchParams.set("gn_build",String(AUFWIND_SW_BUILD));
  url.searchParams.set("gn_sw",String(AUFWIND_SW_BUILD));
  url.searchParams.set("gn_refresh",String(Date.now()));
  return url.href;
}

self.addEventListener("activate",event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    const hadOlderGoodNewsCache=keys.some(k=>(k.startsWith("good-news-") || k.startsWith("aufwind-")) && k!==CACHE);
    await Promise.all(keys.filter(k=>(k.startsWith("good-news-") || k.startsWith("aufwind-")) && k!==CACHE).map(k=>caches.delete(k)));
    await self.clients.claim();

    // Migrationshilfe nur beim Wechsel von einem älteren Aufwind-Build. Bei einer
    // frischen Erstinstallation gibt es keinen alten Cache und damit keinen unnötigen
    // Zusatz-Reload. So kann Build 37 trotzdem eine festhängende ältere Android-PWA
    // selbst auf die neue Version führen.
    if(hadOlderGoodNewsCache){
      const windows=await self.clients.matchAll({type:"window",includeUncontrolled:true});
      await Promise.all(windows.map(async client=>{
        const target=freshClientUrl(client.url);
        if(!target || !("navigate" in client)) return;
        try{await client.navigate(target)}catch{}
      }));
    }
  })());
});

function isAppShellRequest(request,url){
  if(url.origin!==self.location.origin) return false;
  if(request.mode==="navigate") return true;
  const path=url.pathname;
  return STATIC.some(item=>{
    const clean=item.replace(/^\.\//,"").split("?")[0];
    return path.endsWith("/"+clean) || path.endsWith(clean);
  });
}

self.addEventListener("fetch",event=>{
  if(event.request.method!=="GET") return;
  const url=new URL(event.request.url);

  // Supabase und Versionsprüfung niemals aus einem App-Cache beantworten.
  if(url.hostname.includes("supabase.co")) return;
  if(url.origin===self.location.origin && url.pathname.endsWith("/version.json")){
    event.respondWith(fetch(new Request(event.request,{cache:"no-store"})));
    return;
  }

  // Fremde Ressourcen (z. B. Supabase-CDN) bleiben komplett beim Browser.
  if(url.origin!==self.location.origin) return;

  if(isAppShellRequest(event.request,url)){
    event.respondWith((async()=>{
      try{
        const response=await fetch(new Request(event.request,{cache:"no-store"}));
        if(response && response.ok){
          const copy=response.clone();
          caches.open(CACHE).then(cache=>cache.put(event.request,copy)).catch(()=>{});
        }
        return response;
      }catch{
        const cached=await caches.match(event.request,{ignoreSearch:true});
        if(cached) return cached;
        if(event.request.mode==="navigate"){
          const shell=await caches.match("./index.html",{ignoreSearch:true});
          if(shell) return shell;
        }
        return Response.error();
      }
    })());
  }
});

self.addEventListener("push",event=>{
  let data={};
  try{data=event.data?.json()||{}}catch{data={body:event.data?.text()||""}}
  const title=data.title||"Aufwind";
  const options={
    body:data.body||"Neue Good News aus aller Welt sind da.",
    icon:data.icon||"./aufwind-icon-192.png",
    badge:data.badge||"./notification-badge.png",
    data:{url:data.url||"./"},
    tag:data.tag||"aufwind-daily"
  };
  event.waitUntil(self.registration.showNotification(title,options));
});
self.addEventListener("notificationclick",event=>{
  event.notification.close();
  const url=event.notification.data?.url||"./";
  event.waitUntil(clients.matchAll({type:"window",includeUncontrolled:true}).then(list=>{
    for(const client of list){
      if("focus" in client){client.navigate(url);return client.focus();}
    }
    return clients.openWindow?clients.openWindow(url):undefined;
  }));
});
