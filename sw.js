const AUFWIND_SW_BUILD=106;
const CACHE=`aufwind-build-${AUFWIND_SW_BUILD}`;
const STATIC_ASSETS=new Set([
  "style.css",
  "app.js",
  "config.js",
  "manifest.json",
  "aufwind-favicon-32.png",
  "aufwind-apple-touch-icon.png",
  "aufwind-icon-192.png",
  "aufwind-icon-512.png",
  "aufwind-maskable-192.png",
  "aufwind-maskable-512.png",
  "date-slide-background-v2.png",
  "notification-badge.png"
]);

self.addEventListener("install",event=>{
  // Ein neuer Worker darf nie hinter einem alten Build warten.
  self.skipWaiting();
});

self.addEventListener("message",event=>{
  if(event.data?.type==="SKIP_WAITING") self.skipWaiting();
  if(event.data?.type==="CLEAR_AUFWIND_CACHES"){
    event.waitUntil(clearOldAufwindCaches({includeCurrent:true}));
  }
});

async function clearOldAufwindCaches({includeCurrent=false}={}){
  const keys=await caches.keys();
  const doomed=keys.filter(key=>{
    const ours=key.startsWith("good-news-") || key.startsWith("aufwind-");
    return ours && (includeCurrent || key!==CACHE);
  });
  await Promise.all(doomed.map(key=>caches.delete(key)));
}

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
    const hadOlderCache=keys.some(key=>(key.startsWith("good-news-") || key.startsWith("aufwind-")) && key!==CACHE);
    await clearOldAufwindCaches();
    await self.clients.claim();

    // Beim echten Build-Wechsel offene PWA-Fenster einmal auf eine eindeutige
    // Netzwerk-URL führen. Danach kontrolliert Build 105 sämtliche Navigationen.
    if(hadOlderCache){
      const windows=await self.clients.matchAll({type:"window",includeUncontrolled:true});
      await Promise.all(windows.map(async client=>{
        const target=freshClientUrl(client.url);
        if(!target || !("navigate" in client)) return;
        try{ await client.navigate(target); }catch{}
      }));
    }
  })());
});

function assetName(url){
  return url.pathname.split("/").pop() || "";
}

self.addEventListener("fetch",event=>{
  if(event.request.method!=="GET") return;
  const url=new URL(event.request.url);

  // Fremdressourcen und Supabase nie beeinflussen.
  if(url.hostname.includes("supabase.co") || url.origin!==self.location.origin) return;

  // Build 106: App-Shell grundsätzlich nur aus dem Netzwerk. Kein HTML, JS, CSS,
  // Manifest oder version.json wird noch in Cache Storage abgelegt. Damit kann
  // ein alter Aufwind-Build nicht mehr aus dem App-Cache wiederauferstehen.
  if(event.request.mode==="navigate" ||
     url.pathname.endsWith("/version.json") ||
     STATIC_ASSETS.has(assetName(url))){
    event.respondWith(fetch(new Request(event.request,{cache:"no-store"})).catch(()=>{
      if(event.request.mode==="navigate") return new Response(
        '<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Aufwind offline</title><body style="font-family:system-ui;padding:2rem"><h1>Aufwind ist gerade offline</h1><p>Bitte prüfe deine Internetverbindung und öffne die App erneut.</p></body></html>',
        {status:503,headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store"}}
      );
      return Response.error();
    }));
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
