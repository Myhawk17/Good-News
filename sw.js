const CACHE="good-news-v63-push-test";
const STATIC=[
  "./",
  "./index.html",
  "./style.css?v=63",
  "./app.js?v=50",
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

self.addEventListener("push",event=>{
  let data={};
  try{data=event.data?.json()||{}}catch{data={body:event.data?.text()||""}}
  const title=data.title||"Good News";
  const options={
    body:data.body||"Neue Good News sind da.",
    icon:data.icon||"./icon-192.png",
    badge:data.badge||"./icon-192.png",
    data:{url:data.url||"./"},
    tag:data.tag||"good-news-daily"
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
