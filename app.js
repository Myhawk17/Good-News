const cfg = window.APP_CONFIG || {};
const backendConfigured = Boolean(
  cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY &&
  !cfg.SUPABASE_URL.includes("DEINE_") &&
  !cfg.SUPABASE_ANON_KEY.includes("DEIN_")
);
const supabaseClientAvailable = Boolean(window.supabase && typeof window.supabase.createClient === "function");
const configured = backendConfigured && supabaseClientAvailable;
const db = configured ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;

const $ = (id) => document.getElementById(id);
const feed = $("feed");
const readerDialog = $("readerDialog");
const userPreferencesDialog = $("userPreferencesDialog");
const settingsDialog = $("settingsDialog");
const adminDialog = $("adminDialog");
const previewDialog = $("previewDialog");

let allNews = [];
let adminNews = [];
let activeCategory = "Alle";
let currentAdminSession = null;

const USER_PREFS_KEY="goodNewsUserPreferencesV1";
const GOOD_NEWS_CATEGORIES=[
  "Was war....",
  "Tiere",
  "Sport",
  "Wirtschaft & Politik",
  "Fortschritt, Medizin & Technologie",
  "Kultur/Natur"
];
const USER_PREF_DEFAULTS={
  appearance:"dark",
  textSize:"normal",
  dataSaver:false,
  notifications:false,
  analytics:false,
  notifyMorning:true,
  notifyEvening:true,
  notifyCategories:[
    "Was war....",
    "Tiere",
    "Sport",
    "Wirtschaft & Politik",
    "Fortschritt, Medizin & Technologie",
    "Kultur/Natur"
  ]
};
let userPrefs={...USER_PREF_DEFAULTS};

function migrateNotifyCategoryLabel(value){
  const c=String(value||"").trim();
  if(["Was war....","Was war...","Damals"].includes(c))return "Was war....";
  if(["Tiere","Tiere & Natur"].includes(c))return "Tiere";
  if(c==="Sport")return "Sport";
  if(["Wirtschaft & Politik","Wirtschaft","Politik"].includes(c))return "Wirtschaft & Politik";
  if(["Fortschritt, Medizin & Technologie","Fortschritt","Medizin","Technologie","Wissenschaft","Wirtschaft & Technologie","Politik, Fortschritt & Medizin"].includes(c))return "Fortschritt, Medizin & Technologie";
  if(["Kultur/Natur","Kultur","Natur","Menschen","Kultur & Menschen"].includes(c))return "Kultur/Natur";
  return c;
}
function readUserPreferences(){
  try{
    const saved=JSON.parse(localStorage.getItem(USER_PREFS_KEY)||"{}");
    const normalized={
      ...USER_PREF_DEFAULTS,
      ...saved,
      notifyCategories:Array.isArray(saved.notifyCategories)
        ? [...new Set(saved.notifyCategories.map(migrateNotifyCategoryLabel).filter(x=>GOOD_NEWS_CATEGORIES.includes(x)))]
        : [...USER_PREF_DEFAULTS.notifyCategories]
    };
    if(!["dark","light"].includes(normalized.appearance))normalized.appearance="dark";
    if(!["small","normal","large"].includes(normalized.textSize))normalized.textSize="normal";
    delete normalized.reduceMotion;
    return normalized;
  }catch{
    return {...USER_PREF_DEFAULTS,notifyCategories:[...USER_PREF_DEFAULTS.notifyCategories]};
  }
}
function saveUserPreferences(next=userPrefs){
  userPrefs={
    ...USER_PREF_DEFAULTS,
    ...next,
    notifyCategories:Array.isArray(next.notifyCategories)?next.notifyCategories:[...USER_PREF_DEFAULTS.notifyCategories]
  };
  try{localStorage.setItem(USER_PREFS_KEY,JSON.stringify(userPrefs))}catch{}
  applyUserPreferences();
}
function resolvedAppearance(){
  return userPrefs.appearance==="light"?"light":"dark";
}
function applyUserPreferences(){
  const root=document.documentElement;
  root.classList.toggle("user-theme-light",resolvedAppearance()==="light");
  root.classList.toggle("user-theme-dark",resolvedAppearance()==="dark");
  root.classList.toggle("user-text-small",userPrefs.textSize==="small");
  root.classList.toggle("user-text-large",userPrefs.textSize==="large");
  root.classList.toggle("user-data-saver",Boolean(userPrefs.dataSaver));
  root.dataset.dataSaver=userPrefs.dataSaver?"true":"false";
}
function populateUserPreferences(prefs=userPrefs){
  if($("prefAppearance"))$("prefAppearance").value=prefs.appearance;
  if($("prefTextSize"))$("prefTextSize").value=prefs.textSize;
  if($("prefDataSaver"))$("prefDataSaver").checked=Boolean(prefs.dataSaver);
  if($("prefNotifications"))$("prefNotifications").checked=Boolean(prefs.notifications);
  if($("prefAnalytics"))$("prefAnalytics").checked=Boolean(prefs.analytics);
  if($("prefNotifyMorning"))$("prefNotifyMorning").checked=Boolean(prefs.notifyMorning);
  if($("prefNotifyEvening"))$("prefNotifyEvening").checked=Boolean(prefs.notifyEvening);
  document.querySelectorAll("[data-notify-category]").forEach(input=>{
    input.checked=(prefs.notifyCategories||[]).includes(input.dataset.notifyCategory);
  });
  updateNotificationPreferencesVisibility();
}
function collectUserPreferences(){
  return {
    appearance:$("prefAppearance")?.value||"dark",
    textSize:$("prefTextSize")?.value||"normal",
    dataSaver:Boolean($("prefDataSaver")?.checked),
    notifications:Boolean($("prefNotifications")?.checked),
    analytics:Boolean($("prefAnalytics")?.checked),
    notifyMorning:Boolean($("prefNotifyMorning")?.checked),
    notifyEvening:Boolean($("prefNotifyEvening")?.checked),
    notifyCategories:[...document.querySelectorAll("[data-notify-category]:checked")].map(x=>x.dataset.notifyCategory)
  };
}
function updateNotificationPreferencesVisibility(){
  const details=$("notificationPreferenceDetails");
  if(!details)return;
  const enabled=Boolean($("prefNotifications")?.checked);
  details.classList.toggle("disabled",!enabled);
  details.querySelectorAll("input").forEach(input=>input.disabled=!enabled);
}
// Formulare werden erst beim expliziten Speichern übernommen. Für alle bearbeitbaren
// Bereiche merken wir einen Ausgangszustand und warnen beim Verlassen mit Änderungen.
const trackedFormStates=new WeakMap();
function serializeFormState(form){
  if(!form)return "";
  return [...form.querySelectorAll("input,select,textarea")].map((el,index)=>{
    const key=el.id||el.name||`${el.tagName}:${index}`;
    let value="";
    if(el.type==="checkbox"||el.type==="radio") value=el.checked?"1":"0";
    else if(el.type==="file") value=[...(el.files||[])].map(f=>`${f.name}:${f.size}:${f.lastModified}`).join("|");
    else value=el.value||"";
    return `${key}=${value}`;
  }).join("¦");
}
function trackFormState(form,label="Änderungen"){
  if(!form)return;
  trackedFormStates.set(form,{baseline:serializeFormState(form),forced:false,label});
}
function markFormClean(form){
  if(!form)return;
  const state=trackedFormStates.get(form)||{label:"Änderungen"};
  state.baseline=serializeFormState(form);
  state.forced=false;
  trackedFormStates.set(form,state);
}
function markFormDirty(form){
  if(!form)return;
  const state=trackedFormStates.get(form)||{baseline:serializeFormState(form),label:"Änderungen"};
  state.forced=true;
  trackedFormStates.set(form,state);
}
function formIsDirty(form){
  if(!form)return false;
  const state=trackedFormStates.get(form);
  if(!state)return false;
  return Boolean(state.forced||serializeFormState(form)!==state.baseline);
}
function confirmDiscard(message="Du hast nicht gespeicherte Änderungen. Möchtest du diesen Bereich wirklich ohne Speichern verlassen?"){
  return window.confirm(message);
}
let appNoticeTimer=null;
function showAppNotice(text="Gespeichert."){
  let box=$("appNotice");
  if(!box){
    box=document.createElement("div");
    box.id="appNotice";
    box.className="app-notice";
    box.setAttribute("role","status");
    box.setAttribute("aria-live","polite");
    document.body.appendChild(box);
  }
  box.textContent=text;
  box.classList.add("show");
  clearTimeout(appNoticeTimer);
  appNoticeTimer=setTimeout(()=>box.classList.remove("show"),1600);
}
function setShortMessage(element,text="Gespeichert."){
  if(!element)return;
  element.textContent=text;
  clearTimeout(element._goodNewsMessageTimer);
  element._goodNewsMessageTimer=setTimeout(()=>{if(element.textContent===text)element.textContent=""},1600);
}

userPrefs=readUserPreferences();
applyUserPreferences();
// Frühere Test-Builds legten eine Analyse-ID ohne eigene Opt-in-Einstellung an.
// Ab Build 40 wird sie entfernt, solange die Nutzungsstatistik nicht freiwillig aktiviert ist.
if(!userPrefs.analytics){
  try{
    localStorage.removeItem("goodNewsDeviceId");
    localStorage.removeItem("goodNewsAnalyticsActiveDay");
  }catch{}
}

const esc = (value="") => String(value).replace(/[&<>"']/g, c => ({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
})[c]);

const fmtDate = (iso) => new Intl.DateTimeFormat("de-DE", {
  weekday:"long", day:"2-digit", month:"long", year:"numeric"
}).format(new Date(`${iso}T12:00:00`));

const fmtDateShort = (iso) => new Intl.DateTimeFormat("de-DE", {
  day:"2-digit", month:"2-digit", year:"numeric"
}).format(new Date(`${iso}T12:00:00`));

function historicalTitle(title, yearsAgo){
  const years=Number(yearsAgo)||null;
  let event=String(title||"").trim();
  // Alte Varianten wie „Vor 243 Jahren …“ oder „Vor 243 Jahren: …“ bereinigen.
  event=event.replace(/^vor\s+\d+\s+jahren\s*[:–—-]?\s*/i,"").trim();
  return years ? `Vor ${years} Jahren: ${event}` : event;
}
function displayCategory(item){
  return item?.daily_slot==="damals" ? "Was war...." : categoryBucket(item);
}
function displayTitle(item){
  return item?.daily_slot==="damals" ? historicalTitle(item?.title,item?.years_ago) : (item?.title||"");
}

function categoryBucket(item={}){
  const c=String(item.category||"").trim();
  if(item.daily_slot==="damals"||["Was war....","Was war...","Damals"].includes(c))return "Was war....";
  if(["Tiere","Tiere & Natur"].includes(c))return "Tiere";
  if(c==="Sport")return "Sport";
  if(["Wirtschaft & Politik","Wirtschaft","Politik"].includes(c))return "Wirtschaft & Politik";
  if(["Fortschritt, Medizin & Technologie","Fortschritt","Medizin","Technologie","Wissenschaft","Wirtschaft & Technologie","Politik, Fortschritt & Medizin"].includes(c))return "Fortschritt, Medizin & Technologie";
  if(["Kultur/Natur","Kultur","Natur","Menschen","Kultur & Menschen"].includes(c))return "Kultur/Natur";
  return c;
}


const getFavorites = () => {
  try { return JSON.parse(localStorage.getItem("goodNewsFavorites") || "[]"); }
  catch { return []; }
};
const setFavorites = (ids) => localStorage.setItem("goodNewsFavorites", JSON.stringify(ids));
const isFavorite = (id) => getFavorites().map(String).includes(String(id));
const toggleFavorite = (id) => {
  const ids = getFavorites().map(String);
  const key = String(id);
  const next = ids.includes(key) ? ids.filter(x => x !== key) : [...ids, key];
  setFavorites(next);
  return next.includes(key);
};

const reactionLabels = {hope:"❤️ Hoffnung", touched:"🥹 Berührt", wow:"🤯 Wow"};
const getDeviceId = () => {
  let id = localStorage.getItem("goodNewsDeviceId");
  if (!id) { id = (crypto.randomUUID ? crypto.randomUUID() : `dev-${Date.now()}-${Math.random().toString(36).slice(2)}`); localStorage.setItem("goodNewsDeviceId", id); }
  return id;
};

// ---------------- PRIVATE ADMIN ANALYTICS ----------------
// Pseudonymous local device ID only; no name/e-mail is attached to public usage events.
async function trackAnalyticsEvent(eventType, newsId=null){
  // Nutzungsstatistik ist freiwillig und standardmäßig ausgeschaltet.
  if(!userPrefs.analytics || !configured || !db) return false;
  try{
    const row={event_type:eventType,visitor_id:getDeviceId()};
    if(newsId!==null && newsId!==undefined) row.news_id=newsId;
    const {error}=await db.from("analytics_events").insert(row);
    return !error;
  }catch{return false}
}

async function trackDailyActive(){
  const day=new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Berlin",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const key="goodNewsAnalyticsActiveDay";
  if(localStorage.getItem(key)===day) return;
  if(await trackAnalyticsEvent("active")) localStorage.setItem(key,day);
}

let analyticsSummaryCache=null;
let analyticsOpenMetric=null;

function renderAnalyticsDetails(metric){
  const details=$("analyticsDetails");
  document.querySelectorAll(".analytics-metric").forEach(btn=>{
    const isOpen=btn.dataset.analytics===metric;
    btn.classList.toggle("active",isOpen);
    btn.setAttribute("aria-expanded",String(isOpen));
  });
  if(!metric || !analyticsSummaryCache){
    details.hidden=true;
    details.innerHTML="";
    analyticsOpenMetric=null;
    return;
  }
  analyticsOpenMetric=metric;
  const s=analyticsSummaryCache;
  const n=(v)=>Number(v||0).toLocaleString("de-DE");
  const labels={
    active:["Nutzeraktivität","Aktive Nutzer"],
    favorite:["Favorisierungen","Favorisierungen"],
    share:["Geteilt","Teilen-Aktionen"]
  };
  const prefix=metric==="active"?"active":metric==="favorite"?"favorites":"shares";
  details.innerHTML=`
    <div class="analytics-detail-row">
      <div><strong>${n(s[`${prefix}_7d`])}</strong><span>letzte 7 Tage</span></div>
      <div><strong>${n(s[`${prefix}_30d`])}</strong><span>letzte 30 Tage</span></div>
    </div>`;
  details.hidden=false;
}

function bindAnalyticsButtons(){
  document.querySelectorAll(".analytics-metric").forEach(btn=>{
    btn.onclick=()=>{
      const metric=btn.dataset.analytics;
      renderAnalyticsDetails(analyticsOpenMetric===metric ? null : metric);
    };
  });
}

async function loadAnalyticsSummary(){
  const box=$("analyticsCards");
  if(!box || !configured || !db || !currentAdminSession) return;
  box.classList.add("is-loading");
  try{
    const {data,error}=await db.rpc("get_analytics_summary");
    if(error) throw error;
    const s=Array.isArray(data)?(data[0]||{}):(data||{});
    analyticsSummaryCache=s;
    const n=(v)=>Number(v||0).toLocaleString("de-DE");
    const values={
      active:n(s.active_today),
      favorite:n(s.favorites_today),
      share:n(s.shares_today)
    };
    document.querySelectorAll(".analytics-metric").forEach(btn=>{
      const strong=btn.querySelector("strong");
      if(strong) strong.textContent=values[btn.dataset.analytics] ?? "0";
    });
    bindAnalyticsButtons();
    if(analyticsOpenMetric) renderAnalyticsDetails(analyticsOpenMetric);
  }catch(err){
    analyticsSummaryCache=null;
    document.querySelectorAll(".analytics-metric strong").forEach(el=>el.textContent="–");
    $("analyticsDetails").hidden=true;
    console.warn("Analytics:",err);
  }finally{
    box.classList.remove("is-loading");
  }
}
let reactionCounts = {};
let myReactions = {};
async function loadReactions(){
  if(!db || !allNews.length) return;
  const ids=allNews.map(n=>n.id);
  const [{data:rows,error},{data:mine,error:mineErr}] = await Promise.all([
    db.from("news_reactions").select("news_id,reaction").in("news_id",ids),
    db.from("news_reactions").select("news_id,reaction").eq("device_id",getDeviceId()).in("news_id",ids)
  ]);
  if(error || mineErr){ console.warn("Reaktionen nicht verfügbar:", (error||mineErr).message); return; }
  reactionCounts={}; myReactions={};
  (rows||[]).forEach(r=>{const k=String(r.news_id);reactionCounts[k]??={hope:0,touched:0,wow:0};reactionCounts[k][r.reaction]=(reactionCounts[k][r.reaction]||0)+1});
  (mine||[]).forEach(r=>myReactions[String(r.news_id)]=r.reaction);
}
async function reactToNews(newsId,reaction){
  const key=String(newsId), current=myReactions[key];
  let error;
  if(current===reaction){ ({error}=await db.from("news_reactions").delete().eq("news_id",newsId).eq("device_id",getDeviceId())); }
  else { ({error}=await db.from("news_reactions").upsert({news_id:newsId,device_id:getDeviceId(),reaction},{onConflict:"news_id,device_id"})); }
  if(error){alert("Reaktion konnte nicht gespeichert werden: "+error.message);return;}
  await loadReactions(); renderFeed({startId:newsId});
}
function reactionBar(item){
  const key=String(item.id), counts=reactionCounts[key]||{};
  return `<div class="reaction-bar" aria-label="Auf diese Good News reagieren">${Object.entries(reactionLabels).map(([r,label])=>`<button class="reaction-btn ${myReactions[key]===r?'active':''}" data-reaction="${r}" data-id="${item.id}">${label}<span>${counts[r]||0}</span></button>`).join('')}</div>`;
}

function sourcesOf(item) {
  if (!item.sources) return [];
  return Array.isArray(item.sources) ? item.sources : [];
}

const PUBLIC_FEED_CACHE_KEY="goodNewsPublicFeedCacheV2";

function readCachedPublicNews(){
  try{
    const parsed=JSON.parse(localStorage.getItem(PUBLIC_FEED_CACHE_KEY)||"null");
    return Array.isArray(parsed?.items)?parsed.items:[];
  }catch{return []}
}
function writeCachedPublicNews(items){
  try{
    localStorage.setItem(PUBLIC_FEED_CACHE_KEY,JSON.stringify({
      saved_at:new Date().toISOString(),
      items:Array.isArray(items)?items:[]
    }));
  }catch{}
}
function renderCachedFeed(){
  const cached=readCachedPublicNews();
  if(!cached.length)return false;
  allNews=cached;
  renderFeed();
  return true;
}
function setupState() {
  if(renderCachedFeed())return;
  feed.innerHTML = `<section class="empty-state"><div>
    <h1>Verbindung fehlt</h1>
    <p>Good News konnte gerade keine Verbindung herstellen. Bitte versuche es gleich noch einmal.</p>
  </div></section>`;
}

async function fetchPublicNews() {
  if(!backendConfigured)return setupState();

  const cachedWasShown=allNews.length>0 || renderCachedFeed();
  const nowIso=new Date().toISOString();
  const url=new URL(`${cfg.SUPABASE_URL.replace(/\/$/,"")}/rest/v1/news`);
  url.searchParams.set("select","*");
  url.searchParams.set("status","eq.published");
  url.searchParams.set("publish_at",`lte.${nowIso}`);
  url.searchParams.set("order","priority_rank.desc,publish_at.desc");

  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),8000);
  try{
    const response=await fetch(url.toString(),{
      headers:{
        "apikey":cfg.SUPABASE_ANON_KEY,
        "Authorization":`Bearer ${cfg.SUPABASE_ANON_KEY}`,
        "Accept":"application/json"
      },
      signal:controller.signal,
      cache:"no-store"
    });
    if(!response.ok)throw new Error(`Feed HTTP ${response.status}`);
    const data=await response.json();
    allNews=Array.isArray(data)?data:[];
    writeCachedPublicNews(allNews);

    const deepId=new URL(location.href).searchParams.get("news");
    renderFeed({startId:deepId});

    // Reaktionen sind derzeit nicht Bestandteil der sichtbaren App und werden deshalb nicht geladen.
  }catch(err){
    console.warn("Öffentlicher Feed konnte nicht aktualisiert werden:",err);
    if(!cachedWasShown){
      feed.innerHTML=`<section class="empty-state"><div>
        <h1>Good News lädt noch</h1>
        <p>Die Verbindung ist gerade langsam. Tippe auf das Logo oder öffne die App gleich noch einmal.</p>
      </div></section>`;
    }
  }finally{
    clearTimeout(timeout);
  }
}

function showFeedError(message) {
  if(allNews.length)return;
  feed.innerHTML = `<section class="empty-state"><div><h1>Feed nicht erreichbar</h1><p>${esc(message)}</p></div></section>`;
}


// ---------------- GOOD NEWS 2.9: DATUMSFOLIEN ----------------
const SPECIAL_DAYS={
"01-24":["🎓","Internationaler Tag der Bildung"],"01-26":["☀️","Internationaler Tag der sauberen Energie"],
"02-10":["🫘","Welttag der Hülsenfrüchte"],"02-13":["📻","Welttag des Radios"],"02-14":["❤️","Valentinstag"],"02-20":["⚖️","Welttag der sozialen Gerechtigkeit"],"02-21":["🗣️","Internationaler Tag der Muttersprache"],"02-27":["🐻‍❄️","Internationaler Eisbärentag"],
"03-01":["🌊","Welttag des Seegrases"],"03-03":["🐘","Welttag des Artenschutzes"],"03-20":["😄","Internationaler Tag des Glücks"],"03-22":["💧","Weltwassertag"],"03-23":["🌦️","Welttag der Meteorologie"],"03-30":["♻️","Internationaler Zero-Waste-Tag"],
"04-06":["🏃","Internationaler Tag des Sports"],"04-07":["🩺","Weltgesundheitstag"],"04-12":["🚀","Tag der bemannten Raumfahrt"],"04-21":["💡","Welttag für Kreativität und Innovation"],"04-22":["🌍","Tag der Erde"],"04-23":["📚","Welttag des Buches"],"04-25":["🐧","Weltpinguintag"],"04-29":["💃","Welttag des Tanzes"],"04-30":["🎷","Internationaler Tag des Jazz"],
"05-08":["❤️","Weltrotkreuztag"],"05-09":["🇪🇺","Europatag"],"05-12":["🌱","Internationaler Tag der Pflanzengesundheit"],"05-15":["👨‍👩‍👧","Internationaler Tag der Familie"],"05-16":["💡","Internationaler Tag des Lichts"],"05-20":["🐝","Weltbienentag"],"05-21":["🍵","Internationaler Tag des Tees"],"05-22":["🦋","Tag der biologischen Vielfalt"],"05-23":["🐢","Welt-Schildkröten-Tag"],"05-25":["⚽","Weltfußballtag"],"05-30":["🥔","Internationaler Tag der Kartoffel"],
"06-01":["👨‍👩‍👧","Weltelterntag"],"06-03":["🚲","Weltfahrradtag"],"06-05":["🌱","Weltumwelttag"],"06-08":["🌊","Welttag der Ozeane"],"06-11":["🧸","Internationaler Tag des Spiels"],"06-14":["🩸","Weltblutspendetag"],"06-18":["🍽️","Tag der nachhaltigen Gastronomie"],"06-21":["🧘","Internationaler Yogatag"],"06-30":["☄️","Internationaler Asteroidentag"],
"07-07":["🍫","Welttag der Schokolade"],"07-11":["🐴","Welttag des Pferdes"],"07-12":["🌈","Internationaler Tag der Hoffnung"],"07-17":["😀","Welt-Emoji-Tag"],"07-18":["❤️","Nelson-Mandela-Tag"],"07-20":["🌕","Internationaler Mondtag"],"07-29":["🐯","Internationaler Tag des Tigers"],"07-30":["🫂","Internationaler Tag der Freundschaft"],
"08-08":["🐱","Internationaler Katzentag"],"08-10":["🦁","Weltlöwentag"],"08-12":["🐘","Weltelefantentag"],"08-19":["📸","Welttag der Fotografie"],"08-26":["🐶","Tag des Hundes"],"08-27":["🏞️","Welttag der Seen"],"08-30":["🐋","Internationaler Walhai-Tag"],
"09-05":["❤️","Internationaler Tag der Wohltätigkeit"],"09-07":["🌤️","Internationaler Tag der sauberen Luft"],"09-08":["📖","Weltalphabetisierungstag"],"09-16":["🌎","Tag zum Schutz der Ozonschicht"],"09-20":["🧹","World Cleanup Day"],"09-21":["🕊️","Internationaler Friedenstag"],"09-22":["🚲","Autofreier Tag"],"09-23":["🤟","Internationaler Tag der Gebärdensprachen"],"09-27":["🧳","Welttourismustag"],"09-29":["🍽️","Tag gegen Lebensmittelverschwendung"],"09-30":["🌐","Internationaler Übersetzertag"],
"10-01":["☕","Internationaler Tag des Kaffees"],"10-04":["🐾","Welttierschutztag"],"10-05":["👩‍🏫","Weltlehrertag"],"10-09":["✉️","Weltposttag"],"10-16":["🌾","Welternährungstag"],"10-23":["🐆","Tag des Schneeleoparden"],"10-25":["🍝","Weltnudeltag"],"10-27":["🎞️","Welttag des audiovisuellen Erbes"],"10-31":["🏙️","Welttag der Städte"],
"11-01":["🌱","Weltvegantag"],"11-03":["🥪","Tag des Sandwiches"],"11-10":["🔬","Welttag der Wissenschaft"],"11-13":["❤️","Welttag der Freundlichkeit"],"11-16":["🤝","Internationaler Tag der Toleranz"],"11-17":["🍞","Tag des selbstgebackenen Brotes"],"11-20":["🧒","Weltkindertag"],"11-21":["📺","Welttag des Fernsehens"],
"12-03":["♿","Internationaler Tag der Menschen mit Behinderungen"],"12-05":["🙋","Internationaler Tag des Ehrenamts"],"12-07":["✈️","Tag der Zivilluftfahrt"],"12-10":["❤️","Tag der Menschenrechte"],"12-11":["🏔️","Internationaler Tag der Berge"],"12-20":["🤝","Tag der menschlichen Solidarität"],"12-21":["🧘","Welttag der Meditation"]
};
function easterSunday(y){let a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),mo=Math.floor((h+l-7*m+114)/31),da=(h+l-7*m+114)%31+1;return new Date(y,mo-1,da,12)}
function datePlus(d,n){let x=new Date(d);x.setDate(x.getDate()+n);return x}
function isoLocal(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`}
function germanHolidayMap(y){let e=easterSunday(y),m={},add=(d,i,t)=>m[isoLocal(d)]=[i,t];add(new Date(y,0,1,12),"🎆","Neujahr");add(datePlus(e,-2),"✝️","Karfreitag");add(datePlus(e,1),"🌷","Ostermontag");add(new Date(y,4,1,12),"🌼","Tag der Arbeit");add(datePlus(e,39),"☁️","Christi Himmelfahrt");add(datePlus(e,50),"🕊️","Pfingstmontag");add(new Date(y,9,3,12),"🇩🇪","Tag der Deutschen Einheit");add(new Date(y,11,25,12),"🎄","1. Weihnachtstag");add(new Date(y,11,26,12),"🎄","2. Weihnachtstag");return m}
function specialDayFor(s){let d=new Date(`${s}T12:00:00`),h=germanHolidayMap(d.getFullYear());return h[s]||SPECIAL_DAYS[s.slice(5)]||null}
function buildDateSlide(s){let today=isoLocal(new Date()),past=s<today,d=new Date(`${s}T12:00:00`),wd=new Intl.DateTimeFormat("de-DE",{weekday:"long"}).format(d).toUpperCase(),dm=new Intl.DateTimeFormat("de-DE",{day:"2-digit",month:"long"}).format(d),sp=specialDayFor(s),sec=document.createElement("section");sec.className=`date-slide${past?" past":""}`;sec.innerHTML=`<img class="date-slide-art" src="date-slide-background-v2.png" alt="" aria-hidden="true"><div class="date-slide-overlay"></div><div class="date-slide-bottom"><div class="date-slide-weekday">${esc(wd)}</div><div class="date-slide-date">${esc(dm)}</div><div class="date-slide-year">${d.getFullYear()}</div>${sp?`<div class="date-slide-special"><span>HEUTE IST</span><strong>${esc(sp[0])} ${esc(sp[1])}</strong></div>`:""}<div class="date-slide-hint">↓ Zu den Good News</div></div>`;return sec}


function headlineLineCount(headline){
  if(!headline)return 0;
  const cs=getComputedStyle(headline);
  const lineHeight=parseFloat(cs.lineHeight);
  if(!Number.isFinite(lineHeight)||lineHeight<=0)return 0;
  return Math.max(1,Math.ceil((headline.scrollHeight-.5)/lineHeight));
}

function fitHeadlineToFourLines(slide){
  const headline=slide.querySelector("h1");
  if(!headline)return;
  let factor=1;
  headline.style.setProperty("--headline-fit","1");
  // Lange Titel bleiben vollständig sichtbar, werden aber nur so weit verkleinert,
  // bis sie in höchstens vier Zeilen passen.
  for(let i=0;i<11 && headlineLineCount(headline)>4;i++){
    factor=Math.max(.68,factor-.04);
    headline.style.setProperty("--headline-fit",factor.toFixed(2));
  }
}

function fitSlidesToViewport(){
  document.querySelectorAll(".feed .slide").forEach(slide=>{
    const inner=slide.querySelector(".slide-inner");
    if(!inner)return;
    inner.style.setProperty("--slide-fit","1");
    const cs=getComputedStyle(slide);
    const topPad=parseFloat(cs.paddingTop)||0;
    const bottomPad=parseFloat(cs.paddingBottom)||0;
    const available=Math.max(120,slide.clientHeight-topPad-bottomPad);
    let scale=1;

    // Titel- und Gesamtanpassung beeinflussen sich gegenseitig (Breite/Umbruch).
    // Zwei kurze Durchläufe stabilisieren die Darstellung auch auf kleinen Displays.
    for(let pass=0;pass<2;pass++){
      inner.style.setProperty("--slide-fit",String(scale));
      fitHeadlineToFourLines(slide);
      for(let i=0;i<12;i++){
        inner.style.setProperty("--slide-fit",String(scale));
        const visualHeight=inner.scrollHeight*scale;
        if(visualHeight<=available+1)break;
        const next=Math.max(.56,scale*(available/visualHeight)*.985);
        if(Math.abs(next-scale)<.005){scale=Math.max(.56,scale-.025)}else{scale=next}
      }
    }
    inner.style.setProperty("--slide-fit",String(scale));
    fitHeadlineToFourLines(slide);
  });
}
function scheduleSlideFit(){
  requestAnimationFrame(()=>requestAnimationFrame(fitSlidesToViewport));
}

function renderFeed({startId=null}={}) {
  const data = activeCategory === "Alle" ? allNews : allNews.filter(n => categoryBucket(n) === activeCategory);
  feed.innerHTML = "";
  if (!data.length) {
    feed.innerHTML = `<section class="empty-state"><div><h1>Keine Beiträge</h1><p>Für diese Auswahl gibt es noch keine veröffentlichten Nachrichten.</p></div></section>`;
    return;
  }
  let prevDate = null;
  data.forEach((item, index) => {
    if (item.published_date !== prevDate) feed.appendChild(buildDateSlide(item.published_date));
    feed.appendChild(buildSlide(item, index, data.length));
    prevDate = item.published_date;
  });
  scheduleSlideFit();
  if (startId) setTimeout(() => scrollToNews(startId), 30);
}

window.addEventListener("resize",scheduleSlideFit,{passive:true});
if(document.fonts?.ready)document.fonts.ready.then(scheduleSlideFit);

function addDayBreak(date) {
  const sec = document.createElement("section");
  sec.className = "day-break";
  const d = new Date(`${date}T12:00:00`);
  const weekday = new Intl.DateTimeFormat("de-DE",{weekday:"long"}).format(d);
  const main = new Intl.DateTimeFormat("de-DE",{day:"2-digit",month:"long"}).format(d);
  sec.innerHTML = `<div><div class="date-small">${esc(weekday)}</div><div class="date-big">${esc(main)}</div></div>`;
  feed.appendChild(sec);
}

function clampNum(v,min,max,fallback){const n=Number(v);return Number.isFinite(n)?Math.min(max,Math.max(min,n)):fallback}
function imageViewOf(item={}){
  return {
    fit:item.image_fit === "contain" ? "contain" : "cover",
    zoom:clampNum(item.image_zoom,0.35,2.5,1),
    x:clampNum(item.image_x ?? item.image_pos_x,0,100,50),
    y:clampNum(item.image_y ?? item.image_pos_y,0,100,50)
  };
}
function imageStyleOf(item={}){const v=imageViewOf(item);return `object-fit:${v.fit};object-position:${v.x}% ${v.y}%;transform:scale(${v.zoom});transform-origin:center center;`}

function openTextSource(item={}){
  const dlg=$("textSourceDialog"), details=$("textSourceDetails");
  if(!dlg||!details)return;
  const sources=sourcesOf(item);
  details.innerHTML=sources.length
    ? sources.map((src,i)=>`<p><strong>${sources.length>1?`Quelle ${i+1}: `:""}${esc(src.name||"Textquelle")}</strong><br><a class="source-detail-link" href="${esc(src.url)}" target="_blank" rel="noopener noreferrer">Quelle öffnen ↗</a></p>`).join("")
    : `<p class="muted">Für diese Meldung sind noch keine Textquellen hinterlegt.</p>`;
  dlg.showModal();
}

function openImageSource(item={}){
  const dlg=$("imageSourceDialog"), details=$("imageSourceDetails"), title=$("imageSourceTitle");
  if(!dlg||!details)return;
  const isAi=item.image_kind === "ai";
  if(title) title.textContent=isAi?"ⓘ KI-Illustration":"ⓘ Bildquelle";
  details.innerHTML=isAi
    ? `<p><strong>KI-generierte Illustration</strong></p><p class="muted">Dieses Bild wurde künstlich erzeugt und dient als Illustration zur Meldung.</p>${item.image_credit?`<p>${esc(item.image_credit)}</p>`:""}`
    : `${item.image_credit?`<p><strong>Urheber:</strong> ${esc(item.image_credit)}</p>`:""}${item.image_license?`<p><strong>Lizenz:</strong> ${esc(item.image_license)}</p>`:""}${item.image_source_url?`<p><a class="source-detail-link" href="${esc(item.image_source_url)}" target="_blank" rel="noopener noreferrer">Originale Bildquelle öffnen ↗</a></p>`:""}${!item.image_credit&&!item.image_license&&!item.image_source_url?`<p class="muted">Für dieses Bild sind noch keine zusätzlichen Quellenangaben hinterlegt.</p>`:""}`;
  dlg.showModal();
}

function buildSlide(item, index, total) {
  const article = document.createElement("article");
  article.className = `slide${item.image_url ? " has-image" : ""}`;
  article.dataset.id = item.id;

  const primarySource = sourcesOf(item)[0];
  const fav = isFavorite(item.id);

  const imageLoading=(userPrefs.dataSaver || index>1)?"lazy":"eager";
  const imagePriority=index===0?"high":"low";
  article.innerHTML = `
    ${item.image_url ? `${userPrefs.dataSaver?"":`<img class="slide-bg-blur" src="${esc(item.image_url)}" alt="" aria-hidden="true" loading="${imageLoading}" decoding="async" fetchpriority="${imagePriority}">`}<img class="slide-bg" src="${esc(item.image_url)}" alt="" style="${imageStyleOf(item)}" loading="${imageLoading}" decoding="async" fetchpriority="${imagePriority}">` : ""}
    <div class="slide-inner">
      <div class="topline">
        <span class="pill">${esc(displayCategory(item))}</span>
        ${item.priority === "top" ? `<span class="pill top-pill">Topmeldung</span>` : ""}
        <span class="pill">${esc(fmtDateShort(item.published_date))} · ${esc(item.published_time?.slice(0,5) || "")}</span>
      </div>
      ${item.byline_visible&&item.byline_name?`<div class="news-byline">von ${esc(item.byline_name)}</div>`:""}
      <h1>${esc(displayTitle(item))}</h1>
      <p class="summary">${esc(item.summary)}</p>

      <div class="slide-source-row">
        <button class="text-source-link" type="button" data-text-source-id="${item.id}">Textquelle</button>
        <span class="symbol-image-note">${item.image_kind === "symbol" ? "ⓘ Symbolbild" : ""}</span>
        ${item.image_url ? `<button class="image-source-link" type="button" data-image-source-id="${item.id}">${item.image_kind === "ai" ? "ⓘ KI-Illustration" : "Bildquelle"}</button>` : `<span class="source-spacer"></span>`}
      </div>
    </div>`;
  // Ein kaputtes Bild darf den Slide nicht kaputt aussehen lassen.
  const mainImg=article.querySelector(".slide-bg");
  if(mainImg){
    mainImg.addEventListener("error",()=>{
      article.classList.add("image-load-error");
      if(!article.querySelector(".image-error-note")){
        const note=document.createElement("div"); note.className="image-error-note";
        note.textContent="Bild konnte gerade nicht geladen werden.";
        article.appendChild(note);
      }
    },{once:true});
  }
  article.querySelector(".text-source-link")?.addEventListener("click",()=>openTextSource(item));
  article.querySelector(".image-source-link")?.addEventListener("click",()=>openImageSource(item));
  return article;
}

function scrollToNews(id) {
  const target = feed.querySelector(`[data-id="${CSS.escape(String(id))}"]`);
  if (target) {
    readerDialog.open && readerDialog.close();
    target.scrollIntoView({behavior:"smooth",block:"start"});
  }
}

async function shareItem(item) {
  const url = new URL(location.href); url.search=""; url.hash=""; url.searchParams.set("news",item.id);
  const text = `${item.title}\n\n${item.summary}`;
  try {
    if (navigator.share) {
      await navigator.share({title:item.title,text,url:url.toString()});
      trackAnalyticsEvent("share",item.id);
    } else {
      await navigator.clipboard.writeText(`${text}\n\n${url}`);
      trackAnalyticsEvent("share",item.id);
      alert("Good News und Direktlink wurden kopiert.");
    }
  } catch {}
}

function currentSlideItem(){
  const slides=[...feed.querySelectorAll(".slide[data-id]")];
  if(!slides.length)return null;
  const center=window.innerHeight/2;
  let best=slides[0],bestDist=Infinity;
  for(const slide of slides){
    const r=slide.getBoundingClientRect();
    const dist=Math.abs((r.top+r.bottom)/2-center);
    if(dist<bestDist){best=slide;bestDist=dist;}
  }
  return allNews.find(n=>String(n.id)===String(best.dataset.id))||null;
}
function syncSlideQuickActions(){
  const item=currentSlideItem(), favBtn=$("slideFavBtn"), shareBtn=$("slideShareBtn");
  if(!favBtn||!shareBtn)return;
  const available=!!item;
  favBtn.style.visibility=available?"visible":"hidden";
  shareBtn.style.visibility=available?"visible":"hidden";
  if(!available)return;
  const active=isFavorite(item.id);
  favBtn.textContent=active?"♥":"♡";
  favBtn.classList.toggle("active",active);
  favBtn.setAttribute("aria-label",active?"Meldung nicht mehr merken":"Meldung merken");
}
$("slideFavBtn")?.addEventListener("click",()=>{
  const item=currentSlideItem(); if(!item)return;
  const active=toggleFavorite(item.id);
  if(active)trackAnalyticsEvent("favorite",item.id);
  syncSlideQuickActions();
});
$("slideShareBtn")?.addEventListener("click",()=>{const item=currentSlideItem();if(item)shareItem(item);});

let reportNewsId=null;
$("slideReportBtn")?.addEventListener("click",()=>{
  const item=currentSlideItem();if(!item)return;reportNewsId=item.id;
  $("reportNewsTitle").textContent=item.title||"Aktuelle Meldung";$("reportForm").reset();$("reportMessage").textContent="";markFormClean($("reportForm"));$("reportDialog").showModal();
});
$("reportForm")?.addEventListener("submit",async e=>{
  e.preventDefault();const msg=$("reportMessage");if(!configured||!reportNewsId){msg.textContent="Meldung konnte nicht gesendet werden.";return;}
  msg.textContent="Wird gesendet …";
  try{
    const {data:{user}}=await db.auth.getUser();
    const {error}=await db.from("news_reports").insert({news_id:reportNewsId,reporter_user_id:user?.id||null,report_type:$("reportType").value,comment:$("reportComment").value.trim()||null});
    if(error)throw error;msg.textContent="Danke! Dein Hinweis ist bei der Redaktion angekommen. 💛";markFormClean($("reportForm"));setTimeout(()=>$("reportDialog").open&&$("reportDialog").close(),1400);
  }catch(err){msg.textContent="Das hat leider nicht geklappt: "+(err.message||String(err));}
});

const reportTypeLabels={content:"Inhaltlicher Fehler",source:"Quelle / Link",image:"Bild / Bildquelle",spelling:"Rechtschreibung",other:"Sonstiges"};
async function loadNewsReports(){
  if(!currentAdminSession)return;
  const {data,error}=await db.from("news_reports").select("id,news_id,report_type,comment,status,created_at,news(title)").order("created_at",{ascending:false});
  if(error){$("reportList").innerHTML=`<p class="message">${esc(error.message)}</p>`;return;}
  const rows=data||[], fresh=rows.filter(r=>r.status==="new").length,badge=$("reportBadge");if(badge){badge.textContent=fresh;badge.hidden=!fresh;}
  $("reportList").innerHTML=rows.length?rows.map(r=>`<article class="submission-card"><div class="submission-meta">${esc(reportTypeLabels[r.report_type]||r.report_type)} · ${esc(new Date(r.created_at).toLocaleString("de-DE"))}</div><h4>${esc(r.news?.title||`Beitrag #${r.news_id}`)}</h4>${r.comment?`<p>${esc(r.comment)}</p>`:""}<div class="row"><button class="secondary report-status-btn" data-report-id="${r.id}" data-status="resolved">✓ Erledigt</button><button class="secondary report-status-btn" data-report-id="${r.id}" data-status="dismissed">Verwerfen</button></div></article>`).join(""):`<p class="muted">Keine Fehlermeldungen vorhanden.</p>`;
  document.querySelectorAll(".report-status-btn").forEach(b=>b.onclick=async()=>{const {error}=await db.from("news_reports").update({status:b.dataset.status,updated_at:new Date().toISOString()}).eq("id",b.dataset.reportId);if(!error)loadNewsReports();});
}


function openReader(title, eyebrow, html) {
  $("readerTitle").textContent = title;
  $("readerEyebrow").textContent = eyebrow;
  $("readerContent").innerHTML = html;
  readerDialog.showModal();
}

function openSources(item) {
  const links = sourcesOf(item).map((s,i)=>`
    <a class="source-link" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">
      <strong>${i+1}. ${esc(s.name)}</strong><br><span class="muted">${esc(s.url)}</span>
    </a>`).join("");
  openReader("Quellen","Zum Beitrag",`<p>${esc(item.title)}</p><div class="source-list">${links}</div>`);
}

function openStory(storyKey) {
  const items = allNews.filter(n => n.story_key === storyKey).sort((a,b)=>new Date(b.publish_at)-new Date(a.publish_at));
  const html = items.map(n=>`
    <div class="result-item"><button data-jump="${n.id}">
      <div class="result-meta">${esc(fmtDateShort(n.published_date))} · ${esc(n.category)}</div>
      <h4>${esc(n.title)}</h4>
      <div class="muted">${esc(n.summary.slice(0,160))}${n.summary.length>160?"…":""}</div>
    </button></div>`).join("");
  openReader(storyKey,"Was bisher geschah",html || "<p>Keine weiteren Beiträge vorhanden.</p>");
  $("readerContent").querySelectorAll("[data-jump]").forEach(b=>b.onclick=()=>scrollToNews(b.dataset.jump));
}

function openSearch() {
  const categories = ["Alle",...GOOD_NEWS_CATEGORIES];
  openReader("Suche","Nachrichten finden",`
    <input id="readerSearchInput" class="search-input" type="search" placeholder="Suchbegriff eingeben">
    <div class="category-chips">${categories.map(c=>`<button class="chip ${c===activeCategory?"active":""}" data-cat="${esc(c)}">${esc(c)}</button>`).join("")}</div>
    <div id="readerResults"></div>
  `);
  const input = $("readerSearchInput");
  const result = $("readerResults");
  const run = () => {
    const q = input.value.trim().toLowerCase();
    const filtered = allNews.filter(n => {
      const catOk = activeCategory === "Alle" || categoryBucket(n) === activeCategory;
      const text = `${n.title} ${n.summary} ${n.context_text||""} ${n.story_key||""}`.toLowerCase();
      return catOk && (!q || text.includes(q));
    });
    result.innerHTML = filtered.slice(0,60).map(n=>`
      <div class="result-item"><button data-jump="${n.id}">
        <div class="result-meta">${esc(fmtDateShort(n.published_date))} · ${esc(n.category)}</div>
        <h4>${esc(n.title)}</h4>
      </button></div>`).join("") || `<p class="muted">Keine Treffer.</p>`;
    result.querySelectorAll("[data-jump]").forEach(b=>b.onclick=()=>scrollToNews(b.dataset.jump));
  };
  input.oninput = run;
  $("readerContent").querySelectorAll("[data-cat]").forEach(btn=>btn.onclick=()=>{
    activeCategory = btn.dataset.cat;
    $("readerContent").querySelectorAll(".chip").forEach(x=>x.classList.toggle("active",x.dataset.cat===activeCategory));
    renderFeed();
    run();
  });
  run();
}

function openArchive() {
  const groups = {};
  allNews.forEach(n => (groups[n.published_date] ||= []).push(n));
  const html = Object.entries(groups).sort((a,b)=>b[0].localeCompare(a[0])).map(([date,items])=>`
    <div class="archive-day">
      <button data-date="${date}">
        <strong>${esc(fmtDate(date))}</strong>
        <div class="muted">${items.length} ${items.length===1?"Meldung":"Meldungen"}</div>
      </button>
    </div>`).join("");
  openReader("Archiv","Nach Tagen",html || "<p>Noch kein Archiv vorhanden.</p>");
  $("readerContent").querySelectorAll("[data-date]").forEach(btn=>btn.onclick=()=>{
    const item=allNews.find(n=>n.published_date===btn.dataset.date); if(item) scrollToNews(item.id);
  });
}

function openFavorites() {
  const ids = getFavorites().map(String);
  const items = allNews.filter(n=>ids.includes(String(n.id)));
  const html = items.map(n=>`
    <div class="favorite-item"><button data-jump="${n.id}">
      <div class="result-meta">${esc(fmtDateShort(n.published_date))} · ${esc(n.category)}</div>
      <h4>${esc(n.title)}</h4>
    </button></div>`).join("");
  openReader("Gespeichert","Deine Favoriten",html || `<p class="muted">Du hast noch keine Nachrichten gespeichert.</p>`);
  $("readerContent").querySelectorAll("[data-jump]").forEach(b=>b.onclick=()=>scrollToNews(b.dataset.jump));
}

const mainMenu=$("mainMenu");
const menuBtn=$("menuBtn");
function closeMainMenu(){
  mainMenu.hidden=true;
  menuBtn.setAttribute("aria-expanded","false");
}
menuBtn.onclick=(e)=>{
  e.stopPropagation();
  const willOpen=mainMenu.hidden;
  mainMenu.hidden=!willOpen;
  menuBtn.setAttribute("aria-expanded",String(willOpen));
};
function runMenuAction(fn){return (...args)=>{closeMainMenu();return fn(...args)}}
$("searchBtn").onclick = runMenuAction(openSearch);
$("archiveBtn").onclick = runMenuAction(openArchive);
$("favoritesBtn").onclick = runMenuAction(openFavorites);


// ---------------- PWA INSTALLATION ----------------
let deferredInstallPrompt=null;
const installAppBtn=$("installAppBtn");
function isStandaloneApp(){
  return window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone===true;
}
function syncInstallButton(){
  if(!installAppBtn)return;
  installAppBtn.hidden=isStandaloneApp() || !deferredInstallPrompt;
}
window.addEventListener("beforeinstallprompt",e=>{
  e.preventDefault();
  deferredInstallPrompt=e;
  syncInstallButton();
});
installAppBtn?.addEventListener("click",runMenuAction(async()=>{
  if(!deferredInstallPrompt)return;
  deferredInstallPrompt.prompt();
  try{await deferredInstallPrompt.userChoice}catch{}
  deferredInstallPrompt=null;
  syncInstallButton();
}));
window.addEventListener("appinstalled",()=>{
  deferredInstallPrompt=null;
  syncInstallButton();
});
syncInstallButton();

const quickToggleBtn=$("quickToggleBtn"), quickActions=$("quickActions");
let quickActionsOpen=localStorage.getItem("goodNewsQuickActionsOpen")==="true";
function applyQuickActionsState(){
  if(!quickToggleBtn||!quickActions)return;
  quickActions.hidden=!quickActionsOpen;
  quickToggleBtn.textContent=quickActionsOpen?"×":"＋";
  quickToggleBtn.setAttribute("aria-expanded",String(quickActionsOpen));
  quickToggleBtn.setAttribute("aria-label",quickActionsOpen?"Schnellfunktionen schließen":"Schnellfunktionen öffnen");
}
quickToggleBtn?.addEventListener("click",()=>{quickActionsOpen=!quickActionsOpen;localStorage.setItem("goodNewsQuickActionsOpen",String(quickActionsOpen));applyQuickActionsState();});
applyQuickActionsState();

let slideTextHidden=false;
function applySlideFocusMode(){
  document.documentElement.classList.toggle("slide-text-hidden",slideTextHidden);
  const btn=$("slideFocusBtn");
  if(!btn)return;
  btn.classList.toggle("active",slideTextHidden);
  btn.setAttribute("aria-pressed",String(slideTextHidden));
  btn.setAttribute("aria-label",slideTextHidden?"Slide-Text einblenden":"Slide-Text ausblenden");
  btn.title=slideTextHidden?"Text wieder einblenden":"Nur Bild anzeigen";
}
$("slideFocusBtn")?.addEventListener("click",()=>{
  slideTextHidden=!slideTextHidden;
  applySlideFocusMode();
});
applySlideFocusMode();

$("userPreferencesBtn").onclick = runMenuAction(()=>{
  populateUserPreferences();
  markFormClean($("userPreferencesForm"));
  if($("userPreferencesMessage")) $("userPreferencesMessage").textContent="";
  userPreferencesDialog.showModal();
});
document.addEventListener("click",(e)=>{
  if(!mainMenu.hidden && !mainMenu.contains(e.target) && e.target!==menuBtn) closeMainMenu();
});
document.addEventListener("keydown",(e)=>{if(e.key==="Escape")closeMainMenu()});
$("homeBtn").onclick = () => {closeMainMenu();feed.scrollTo({top:0,behavior:"smooth"});}

function dialogDirtyForms(dialog){
  if(!dialog)return [];
  if(dialog===userPreferencesDialog)return [$("userPreferencesForm")].filter(Boolean);
  if(dialog===$("submissionDialog"))return [$("submissionForm")].filter(Boolean);
  if(dialog===$("reportDialog"))return [$("reportForm")].filter(Boolean);
  if(dialog===adminDialog)return [$("newsForm"),$("settingsForm")].filter(Boolean);
  return [];
}
function discardDialogChanges(dialog){
  if(dialog===userPreferencesDialog){
    populateUserPreferences();
    markFormClean($("userPreferencesForm"));
    return;
  }
  if(dialog===$("submissionDialog")){
    $("submissionForm")?.reset();
    if($("submissionMessage"))$("submissionMessage").textContent="";
    markFormClean($("submissionForm"));
    return;
  }
  if(dialog===$("reportDialog")){
    $("reportForm")?.reset();
    if($("reportMessage"))$("reportMessage").textContent="";
    markFormClean($("reportForm"));
    return;
  }
  if(dialog===adminDialog){
    if(formIsDirty($("newsForm"))){clearEditorDraft();resetEditor();}
    if(formIsDirty($("settingsForm"))&&appSettings){
      populateSettingsForm(appSettings);
      if($("settingLogoFile"))$("settingLogoFile").value="";
      markFormClean($("settingsForm"));
    }
  }
}
function dirtyDialogMessage(dialog){
  if(dialog===$("submissionDialog"))return "Du hast eine noch nicht eingesendete Nachricht. Möchtest du den Bereich wirklich verlassen und die Eingaben verwerfen?";
  if(dialog===$("reportDialog"))return "Du hast eine noch nicht gesendete Fehlermeldung. Möchtest du den Bereich wirklich verlassen und die Eingaben verwerfen?";
  return "Du hast nicht gespeicherte Änderungen. Möchtest du diesen Bereich wirklich ohne Speichern verlassen?";
}
function requestDialogClose(dialog){
  if(!dialog)return false;
  const dirty=dialogDirtyForms(dialog).some(formIsDirty);
  if(dirty&&!confirmDiscard(dirtyDialogMessage(dialog)))return false;
  if(dirty)discardDialogChanges(dialog);
  dialog.close();
  return true;
}
document.querySelectorAll("[data-close]").forEach(b=>b.onclick=()=>requestDialogClose($(b.dataset.close)));
[userPreferencesDialog,$("submissionDialog"),$("reportDialog"),adminDialog].filter(Boolean).forEach(dialog=>{
  dialog.addEventListener("cancel",e=>{
    if(dialogDirtyForms(dialog).some(formIsDirty)){
      e.preventDefault();
      if(confirmDiscard(dirtyDialogMessage(dialog))){
        discardDialogChanges(dialog);
        dialog.close();
      }
    }
  });
});
window.addEventListener("beforeunload",e=>{
  const forms=[$("userPreferencesForm"),$("submissionForm"),$("reportForm"),$("newsForm"),$("settingsForm")].filter(Boolean);
  if(forms.some(formIsDirty)){e.preventDefault();e.returnValue="";}
});
let quickActionScrollTimer;
feed.addEventListener("scroll",()=>{
  if(feed.scrollTop>100)$("swipeHint").style.display="none";
  clearTimeout(quickActionScrollTimer);
  quickActionScrollTimer=setTimeout(syncSlideQuickActions,80);
},{passive:true});
window.addEventListener("resize",syncSlideQuickActions);
setTimeout(syncSlideQuickActions,250);


const userPreferencesForm=$("userPreferencesForm");
trackFormState(userPreferencesForm,"Einstellungen");
["prefAppearance","prefTextSize","prefDataSaver","prefAnalytics","prefNotifyMorning","prefNotifyEvening"].forEach(id=>{
  $(id)?.addEventListener("change",()=>{});
});
$("prefNotifications")?.addEventListener("change",()=>updateNotificationPreferencesVisibility());
document.querySelectorAll("[data-notify-category]").forEach(input=>input.addEventListener("change",()=>{}));

$("resetUserPreferencesBtn")?.addEventListener("click",()=>{
  populateUserPreferences({...USER_PREF_DEFAULTS,notifyCategories:[...USER_PREF_DEFAULTS.notifyCategories]});
  markFormDirty(userPreferencesForm);
  const msg=$("userPreferencesMessage");
  if(msg)msg.textContent="Standard ausgewählt – zum Übernehmen noch speichern.";
});

userPreferencesForm?.addEventListener("submit",async e=>{
  e.preventDefault();
  const msg=$("userPreferencesMessage");
  const saveBtn=$("saveUserPreferencesBtn");
  const next=collectUserPreferences();
  const previous={...userPrefs,notifyCategories:[...(userPrefs.notifyCategories||[])]};
  if(saveBtn)saveBtn.disabled=true;
  if(msg)msg.textContent="Speichern …";
  try{
    if(next.notifications){
      const existing=await getPushSubscription();
      if(!existing || Notification.permission!=="granted") await enablePush(next);
      else await savePushSubscription(existing,next);
      localStorage.setItem("goodnews_push_enabled","1");
    }else{
      const existing=await getPushSubscription();
      if(existing)await disablePush();
      localStorage.setItem("goodnews_push_enabled","0");
    }

    saveUserPreferences(next);
    if(!next.analytics){
      try{
        localStorage.removeItem("goodNewsDeviceId");
        localStorage.removeItem("goodNewsAnalyticsActiveDay");
      }catch{}
    }else if(!previous.analytics){
      await trackDailyActive();
    }
    if(allNews.length)renderFeed();
    markFormClean(userPreferencesForm);
    setShortMessage(msg,"Gespeichert.");
    showAppNotice("Gespeichert.");
  }catch(err){
    if(msg)msg.textContent=err?.message||String(err);
  }finally{
    if(saveBtn)saveBtn.disabled=false;
  }
});

// ---------------- ADMIN ----------------

let currentUserIsAdmin=false;

async function sessionIsAdmin(session){
  if(!session?.user?.id || !db) return false;
  const {data,error}=await db
    .from("user_roles")
    .select("role")
    .eq("user_id",session.user.id)
    .eq("role","admin")
    .maybeSingle();
  if(error){
    console.warn("Adminrolle konnte nicht geprüft werden:", error.message);
    return false;
  }
  return Boolean(data);
}


function switchAdminTab(name) {
  localStorage.setItem("goodNewsAdminTab", name);
  document.querySelectorAll(".tab").forEach(t=>t.classList.toggle("active",t.dataset.tab===name));
  document.querySelectorAll(".tab-panel").forEach(p=>p.hidden = p.id !== `tab-${name}`);
  if(name==="dashboard"){renderDashboard();loadAnalyticsSummary();}
  if(name==="manage") renderAdminList();
  if(name==="reports") loadNewsReports();
  // Der bevorzugte Referenz-Viewport ist 360 × 640 (auf dem Testgerät ca. 77 % Vorschau).
  if(name==="display-tests" && !displayTestSize) openDisplayTest(360,640);
}
function activeAdminTab(){return document.querySelector(".tab.active")?.dataset.tab||"dashboard";}
function discardAdminTabChanges(name){
  if(name==="editor"&&formIsDirty($("newsForm"))){
    clearEditorDraft();
    resetEditor();
  }
  if(name==="settings"&&formIsDirty($("settingsForm"))&&appSettings){
    populateSettingsForm(appSettings);
    if($("settingLogoFile"))$("settingLogoFile").value="";
    markFormClean($("settingsForm"));
  }
}
function guardedSwitchAdminTab(name){
  const current=activeAdminTab();
  if(current===name)return;
  if((current==="editor"&&formIsDirty($("newsForm")))||(current==="settings"&&formIsDirty($("settingsForm")))){
    if(!confirmDiscard())return;
    discardAdminTabChanges(current);
  }
  switchAdminTab(name);
}
document.querySelectorAll(".tab").forEach(t=>t.onclick=()=>guardedSwitchAdminTab(t.dataset.tab));

// Build 35 – Display-Testmodus; Referenzansicht 360 × 640 als bevorzugter Standard.
// Build 33 – Display-Testmodus. Ein iframe bekommt die echte gewählte CSS-Viewportgröße
// und wird nur optisch so skaliert, dass er auch auf einem einzelnen Handy sichtbar bleibt.
const displayTestStage=$("displayTestStage");
const displayTestScaler=$("displayTestScaler");
const displayTestFrame=$("displayTestFrame");
const displayTestInfo=$("displayTestInfo");
let displayTestSize=null;
function fitDisplayTest(){
  if(!displayTestSize||!displayTestStage||!displayTestScaler||!displayTestFrame)return;
  const {w,h}=displayTestSize;
  const available=Math.max(240,Math.min(displayTestStage.clientWidth||window.innerWidth-32,window.innerWidth-32));
  const scale=Math.min(1,available/w);
  displayTestFrame.style.width=w+"px";
  displayTestFrame.style.height=h+"px";
  displayTestScaler.style.width=w+"px";
  displayTestScaler.style.height=h+"px";
  displayTestScaler.style.transform=`scale(${scale})`;
  displayTestStage.style.height=Math.ceil(h*scale)+"px";
  if(displayTestInfo)displayTestInfo.textContent=`Simulation: ${w} × ${h} CSS-Pixel · Darstellung ${Math.round(scale*100)} %`;
}
function openDisplayTest(w,h){
  displayTestSize={w:Number(w),h:Number(h)};
  displayTestStage.hidden=false;
  if(!displayTestFrame.src){
    const u=new URL(location.href);u.searchParams.set("displayPreview","1");u.hash="";
    displayTestFrame.src=u.toString();
  }
  requestAnimationFrame(fitDisplayTest);
}
document.querySelectorAll(".display-test-btn").forEach(btn=>btn.addEventListener("click",()=>openDisplayTest(btn.dataset.w,btn.dataset.h)));
window.addEventListener("resize",fitDisplayTest);


$("adminBtn").onclick = async () => {
  closeMainMenu();
  adminDialog.showModal();
  await refreshAuth();
};

$("accountBtn").onclick = async () => {
  closeMainMenu();
  settingsDialog.showModal();
  await refreshSettingsAccount();
};

async function refreshSettingsAccount(){
  const loggedOut=$("settingsLoggedOut");
  const loggedIn=$("settingsLoggedIn");
  const message=$("settingsLoginMessage");
  if(!configured){
    loggedOut.hidden=false;
    loggedIn.hidden=true;
    if(message)message.textContent=backendConfigured?"Anmeldung wird gerade geladen. Bitte versuche es in einem Moment erneut.":"Die Anmeldung ist noch nicht mit Supabase verbunden.";
    return;
  }
  const {data:{session}}=await db.auth.getSession();
  currentAdminSession=session;
  currentUserIsAdmin=await sessionIsAdmin(session);
  loggedOut.hidden=!!session;
  loggedIn.hidden=!session;
  $("adminBtn").hidden=!currentUserIsAdmin;
  if($("accountBtnLabel")) $("accountBtnLabel").textContent=session?"Konto":"Anmelden";
  if($("accountDialogTitle")) $("accountDialogTitle").textContent=session?"Konto":"Anmelden";
  if(message&&!session)message.textContent="";
  if(session){
    $("settingsWhoAmI").textContent=session.user.email||"Good-News-Konto";
  }
}

$("settingsLoginForm").onsubmit=async(e)=>{
  e.preventDefault();
  const msg=$("settingsLoginMessage");
  msg.textContent="Anmeldung …";
  if(!configured){msg.textContent="Die Anmeldung ist noch nicht verbunden.";return}
  const {error}=await db.auth.signInWithPassword({
    email:$("settingsLoginEmail").value.trim(),
    password:$("settingsLoginPassword").value
  });
  if(error){msg.textContent=error.message;return}
  msg.textContent="";
  $("settingsLoginPassword").value="";
  await refreshSettingsAccount();
  await fetchPublicNews();
};

$("settingsLogoutBtn").onclick=async()=>{
  if(db)await db.auth.signOut();
  await refreshSettingsAccount();
  await fetchPublicNews();
};


async function refreshAuth() {
  if (!configured) {
    $("loginView").hidden=false;$("adminView").hidden=true;
    $("loginMessage").textContent="Zuerst Supabase in config.js verbinden.";
    return;
  }
  const {data:{session}} = await db.auth.getSession();
  currentAdminSession=session;
  currentUserIsAdmin=await sessionIsAdmin(session);
  $("adminBtn").hidden=!currentUserIsAdmin;
  if($("accountBtnLabel")) $("accountBtnLabel").textContent=session?"Konto":"Anmelden";
  $("loginView").hidden=currentUserIsAdmin;
  $("adminView").hidden=!currentUserIsAdmin;

  if(session && !currentUserIsAdmin){
    $("loginMessage").textContent="Dieses Konto hat keine Redaktionsrechte.";
    return;
  }
  if(!session){
    $("loginMessage").textContent="";
    return;
  }

  $("loginMessage").textContent="";
  $("whoAmI").textContent=session.user.email||"Redaktion";
  await loadAdminNews();
  await loadSubmissions();
  await loadTripleDrafts();
  await loadAppSettings();
  await loadAnalyticsSummary();
  const lastTab = localStorage.getItem("goodNewsAdminTab") || "dashboard";
  switchAdminTab(lastTab);
}

$("loginForm").onsubmit = async (e)=>{
  e.preventDefault();
  $("loginMessage").textContent="Anmeldung …";
  const {error}=await db.auth.signInWithPassword({
    email:$("loginEmail").value.trim(),
    password:$("loginPassword").value
  });
  $("loginMessage").textContent=error?error.message:"";
  if(!error) await refreshAuth();
};
$("logoutBtn").onclick=async()=>{await db.auth.signOut();await refreshAuth()};

async function loadAdminNews() {
  const {data,error}=await db.from("news").select("*").order("publish_at",{ascending:false});
  if(error){alert(error.message);return}
  adminNews=data||[];
  renderDashboard();renderAdminList();
}

function renderDashboard() {
  const today=new Date().toISOString().slice(0,10);
  const todayItems=adminNews.filter(n=>n.published_date===today);
  const published=adminNews.filter(n=>n.status==="published").length;
  const drafts=adminNews.filter(n=>n.status==="draft").length;
  $("dashboardCards").innerHTML=`
    <div class="metric"><strong>${todayItems.length}</strong><span>heute</span></div>
    <div class="metric"><strong>${published}</strong><span>veröffentlicht</span></div>
    <div class="metric"><strong>${drafts}</strong><span>Entwürfe</span></div>`;
  const slots=[['damals','🕰️ WAS WAR....'],['fortschritt','🚀 FORTSCHRITT'],['heute','❤️ HEUTE']];
  const triple=slots.map(([key,label])=>{const n=todayItems.find(x=>x.daily_slot===key);return `<div class="triple-slot ${n?'':'missing'}"><div class="slot-label">${label}</div>${n?`<h4>${esc(n.title)}</h4><div class="muted">${n.status==='published'?'Veröffentlicht':'Entwurf'}</div>`:`<div class="muted">Noch nicht besetzt</div>`}</div>`}).join('');
  $("todayList").innerHTML=`<div class="triple-grid">${triple}</div>`+(todayItems.length?todayItems.map(adminItemHtml).join(""):`<p class="muted">Für heute gibt es noch keine Beiträge.</p>`);
  bindAdminItemButtons($("todayList"));
}

function adminItemHtml(n){
  return `<article class="admin-item" data-admin-id="${n.id}">
    <div class="admin-item-head">
      <div><h4>${esc(displayTitle(n))}</h4><div class="admin-meta">${esc(fmtDateShort(n.published_date))} · ${esc(n.published_time?.slice(0,5)||"")} · ${esc(displayCategory(n))}</div></div>
      <span class="status ${esc(n.status)}">${n.status==="published"?"Veröffentlicht":"Entwurf"}</span>
    </div>
    <div class="admin-item-actions">
      <button class="secondary edit-admin" data-id="${n.id}">Bearbeiten</button>
      <button class="secondary preview-admin" data-id="${n.id}">Vorschau</button>
      ${n.status==="draft"?`<button class="primary publish-admin" data-id="${n.id}">Veröffentlichen</button>`:""}
      <button class="danger delete-admin" data-id="${n.id}">Löschen</button>
    </div>
  </article>`;
}

function renderAdminList(){
  const q=($("adminSearch")?.value||"").trim().toLowerCase();
  const status=$("adminStatus")?.value||"all";
  const rows=adminNews.filter(n=>{
    const statusOk=status==="all"||n.status===status;
    const text=`${n.title} ${n.summary} ${n.category} ${n.story_key||""}`.toLowerCase();
    return statusOk&&(!q||text.includes(q));
  });
  $("adminList").innerHTML=rows.map(adminItemHtml).join("")||`<p class="muted">Keine Beiträge gefunden.</p>`;
  bindAdminItemButtons($("adminList"));
}
$("adminSearch").oninput=renderAdminList;
$("adminStatus").onchange=renderAdminList;

function bindAdminItemButtons(root){
  root.querySelectorAll(".edit-admin").forEach(b=>b.onclick=()=>editArticle(b.dataset.id));
  root.querySelectorAll(".preview-admin").forEach(b=>b.onclick=()=>previewSaved(b.dataset.id));
  root.querySelectorAll(".publish-admin").forEach(b=>b.onclick=()=>quickPublish(b.dataset.id));
  root.querySelectorAll(".delete-admin").forEach(b=>b.onclick=()=>deleteArticle(b.dataset.id));
}

async function quickPublish(id){
  const n=adminNews.find(x=>String(x.id)===String(id)); if(!n)return;
  const {error}=await db.from("news").update({status:"published",publish_at:new Date().toISOString()}).eq("id",id);
  if(error)return alert(error.message);
  await Promise.all([loadAdminNews(),fetchPublicNews()]);
}
async function deleteArticle(id){
  const n=adminNews.find(x=>String(x.id)===String(id)); if(!n)return;
  if(!confirm(`„${n.title}“ wirklich löschen?`))return;
  const {error}=await db.from("news").delete().eq("id",id);
  if(error)return alert(error.message);
  if(n.image_path) await db.storage.from("news-images").remove([n.image_path]);
  await Promise.all([loadAdminNews(),fetchPublicNews()]);
}

function addSourceRow(name="",url=""){
  const row=document.createElement("div");row.className="source-edit";
  row.innerHTML=`<label>Name<input class="source-name" value="${esc(name)}" placeholder="z. B. Reuters"></label>
    <label class="url-field">Link<input class="source-url" type="url" value="${esc(url)}" placeholder="https://…"></label>
    <button type="button" class="remove-source">✕</button>`;
  row.querySelector(".remove-source").onclick=()=>row.remove();
  $("sourcesEditor").appendChild(row);
}
$("addSourceBtn").onclick=()=>addSourceRow();

function collectSources(){
  return [...$("sourcesEditor").querySelectorAll(".source-edit")].map(r=>({
    name:r.querySelector(".source-name").value.trim(),
    url:r.querySelector(".source-url").value.trim()
  })).filter(s=>s.name&&s.url);
}


const ADMIN_DRAFT_KEY = "goodNewsEditorDraft";

function saveEditorDraft(){
  const form=$("newsForm");
  if(!form) return;
  const draft={
    newsId:$("newsId")?.value||"",
    publishedDate:$("publishedDate")?.value||"",
    publishedTime:$("publishedTime")?.value||"",
    category:$("category")?.value||"",
    storyKey:$("storyKey")?.value||"",
    title:$("title")?.value||"",
    summary:$("summary")?.value||"",
    status:$("status")?.value||"draft",
    priority:$("priority")?.value||"normal",
    imageUrl:$("imageUrl")?.value||"",
    imageCredit:$("imageCredit")?.value||"",
    imageLicense:$("imageLicense")?.value||"",
    imageSourceUrl:$("imageSourceUrl")?.value||"",
    imageKind:$("imageKind")?.value||"photo",
    dailySlot:$("dailySlot")?.value||"none",
    yearsAgo:$("yearsAgo")?.value||"",
    feelGoodText:$("feelGoodText")?.value||"",
    contextText:$("contextText")?.value||"",
    imageFit:$("imageFit")?.value||"cover",
    imageZoom:$("imageZoom")?.value||"1",
    imagePosX:$("imagePosX")?.value||"50",
    imagePosY:$("imagePosY")?.value||"50",
    sources:[...$("sourcesEditor").querySelectorAll(".source-edit")].map(r=>({
      name:r.querySelector(".source-name")?.value||"",
      url:r.querySelector(".source-url")?.value||""
    }))
  };
  localStorage.setItem(ADMIN_DRAFT_KEY,JSON.stringify(draft));
}

function clearEditorDraft(){
  localStorage.removeItem(ADMIN_DRAFT_KEY);
}

function restoreEditorDraft(){
  const raw=localStorage.getItem(ADMIN_DRAFT_KEY);
  if(!raw) return false;
  try{
    const d=JSON.parse(raw);
    $("newsId").value=d.newsId||"";
    if(d.publishedDate) $("publishedDate").value=d.publishedDate;
    if(d.publishedTime) $("publishedTime").value=d.publishedTime;
    $("category").value=d.category||"";
    $("storyKey").value=d.storyKey||"";
    $("title").value=d.title||"";
    $("summary").value=d.summary||"";
    $("status").value=d.status||"draft";
    $("priority").value=d.priority||"normal";
    $("imageUrl").value=d.imageUrl||"";
    $("imageCredit").value=d.imageCredit||"";
    if($("imageLicense")) $("imageLicense").value=d.imageLicense||"";
    if($("imageSourceUrl")) $("imageSourceUrl").value=d.imageSourceUrl||"";
    if($("imageKind")) $("imageKind").value=d.imageKind||"photo";
    if($("dailySlot")) $("dailySlot").value=d.dailySlot||"none";
    if($("yearsAgo")) $("yearsAgo").value=d.yearsAgo||"";
    if($("feelGoodText")) $("feelGoodText").value=d.feelGoodText||"";
    if($("contextText")) $("contextText").value=d.contextText||"";
    if($("imageFit")) $("imageFit").value=d.imageFit||"cover";
    if($("imageZoom")) $("imageZoom").value=d.imageZoom||"1";
    if($("imagePosX")) $("imagePosX").value=d.imagePosX||"50";
    if($("imagePosY")) $("imagePosY").value=d.imagePosY||"50";
    $("sourcesEditor").innerHTML="";
    (d.sources?.length?d.sources:[{name:"",url:""}]).forEach(s=>addSourceRow(s.name,s.url));
    if(d.imageUrl) setEditorImage(d.imageUrl);
    applyImageEditorState();
    $("saveBtn").textContent=d.newsId?"Änderungen speichern":"Speichern";
    $("cancelEditBtn").hidden=!d.newsId;
    $("editorMessage").textContent="Nicht gespeicherter Entwurf wiederhergestellt.";
    markFormDirty($("newsForm"));
    return true;
  }catch(e){
    console.warn("Lokaler Redaktionsentwurf konnte nicht geladen werden",e);
    return false;
  }
}

function setupEditorAutosave(){
  const form=$("newsForm");
  if(!form) return;
  const save=()=>saveEditorDraft();
  form.addEventListener("input",save);
  form.addEventListener("change",save);
}

function resetEditor(){
  $("newsForm").reset();
  $("newsId").value="";$("existingImagePath").value=""; if($("bylineName")) $("bylineName").value=""; if($("bylineVisible")) $("bylineVisible").value="false";
  $("sourcesEditor").innerHTML="";addSourceRow();
  if($("dailySlot")) $("dailySlot").value="none";
  if($("yearsAgo")) $("yearsAgo").value="";
  if($("feelGoodText")) $("feelGoodText").value="";
  if($("contextText")) $("contextText").value="";
  if($("imageKind")) $("imageKind").value="photo";
  const now=new Date();$("publishedDate").value=now.toISOString().slice(0,10);
  $("publishedTime").value=now.toTimeString().slice(0,5);
  $("status").value="draft";$("priority").value="normal";
  $("saveBtn").textContent="Speichern";$("cancelEditBtn").hidden=true;
  $("imagePreviewBox").hidden=true;$("imagePreview").removeAttribute("src");$("imagePreviewBlur")?.removeAttribute("src"); editorCroppedFile=null; editorOriginalPreviewSrc=null;
  if($("imageFit")) $("imageFit").value="cover"; if($("imageZoom")) $("imageZoom").value="1"; if($("imagePosX")) $("imagePosX").value="50"; if($("imagePosY")) $("imagePosY").value="50";
  applyImageEditorState();
  $("editorMessage").textContent="";
  markFormClean($("newsForm"));
}
$("cancelEditBtn").onclick=()=>{
  if(formIsDirty($("newsForm"))&&!confirmDiscard())return;
  clearEditorDraft();resetEditor();switchAdminTab("dashboard");
};

let editorCroppedFile=null;
let editorOriginalPreviewSrc=null;

function setEditorImage(src,{preserveOriginal=true}={}){
  if(!src)return;
  if(preserveOriginal && !editorOriginalPreviewSrc) editorOriginalPreviewSrc=src;
  const main=$("imagePreview"), blur=$("imagePreviewBlur"), cropSource=$("imageCropSource");
  [main,blur].forEach(el=>{
    if(!el)return;
    // Sichtbare Vorschau nie durch CORS blockieren: externe Bilder dürfen normal angezeigt werden.
    el.removeAttribute("crossorigin");
    el.src=src;
  });
  if(cropSource){
    // Nur die unsichtbare Zuschneidequelle braucht CORS für canvas.toBlob().
    // Wenn ein Anbieter CORS verweigert, bleibt die normale Vorschau trotzdem sichtbar.
    if(!src.startsWith("blob:") && !src.startsWith("data:")) cropSource.crossOrigin="anonymous";
    else cropSource.removeAttribute("crossorigin");
    cropSource.src=src;
  }
  $("imagePreviewBox").hidden=false;
  if(cropSource){
    const ready=()=>{resetCropSelection();applyImageEditorState()};
    if(cropSource.complete&&cropSource.naturalWidth) ready();
    else cropSource.addEventListener("load",ready,{once:true});
  }else applyImageEditorState();
}
function currentImageEditorState(){return {
  image_fit:"cover",image_zoom:1,image_pos_x:50,image_pos_y:50
}}
function applyImageEditorState(){
  const preview=$("imagePreview");
  if(!preview)return;
  preview.style.objectFit="cover";
  preview.style.objectPosition="50% 50%";
  preview.style.transform="scale(1)";
}

// Schlanker Bildeditor: ein verschieb- und skalierbarer Handy-Ausschnitt im festen Format 9:16.
const cropper=$("imageCropper"), cropSelection=$("cropSelection");
const PHONE_CROP_AR=9/16;
let cropState={x:0,y:0,w:1,h:1};
let cropGesture=null;
const MIN_CROP_PX=90;

function cropImageDisplayRect(){
  const img=$("imageCropSource");
  if(!cropper||!img?.naturalWidth||!img?.naturalHeight)return null;
  const r=cropper.getBoundingClientRect();
  const ar=img.naturalWidth/img.naturalHeight;
  const stageAr=r.width/r.height;
  let w,h,left,top;
  if(ar>stageAr){w=r.width;h=w/ar;left=0;top=(r.height-h)/2}
  else{h=r.height;w=h*ar;top=0;left=(r.width-w)/2}
  return {left,top,width:w,height:h,imageAr:ar};
}

function cropNormalizedRatio(){
  const img=$("imageCropSource");
  const imageAr=(img?.naturalWidth&&img?.naturalHeight)?img.naturalWidth/img.naturalHeight:1;
  return PHONE_CROP_AR/imageAr; // normalized width / normalized height
}

function largestPhoneCrop(){
  const img=$("imageCropSource");
  if(!img?.naturalWidth||!img?.naturalHeight)return {x:0,y:0,w:1,h:1};
  const imageAr=img.naturalWidth/img.naturalHeight;
  let w,h;
  if(imageAr>=PHONE_CROP_AR){
    h=1;
    w=PHONE_CROP_AR/imageAr;
  }else{
    w=1;
    h=imageAr/PHONE_CROP_AR;
  }
  return {x:(1-w)/2,y:(1-h)/2,w,h};
}

function clampPhoneCrop(c){
  const d=cropImageDisplayRect();
  const ratio=cropNormalizedRatio();
  if(!d||!Number.isFinite(ratio)||ratio<=0)return c;

  const minW=Math.min(.9, Math.max(.05, MIN_CROP_PX/Math.max(1,d.width)));
  const maxW=Math.min(1, ratio); // h=w/ratio must stay <=1
  c.w=Math.max(Math.min(minW,maxW),Math.min(maxW,c.w));
  c.h=c.w/ratio;

  c.x=Math.max(0,Math.min(1-c.w,c.x));
  c.y=Math.max(0,Math.min(1-c.h,c.y));
  return c;
}

function renderCropSelection(){
  if(!cropSelection)return;
  const d=cropImageDisplayRect();
  if(!d)return;
  cropState=clampPhoneCrop({...cropState});
  const l=d.left+cropState.x*d.width;
  const t=d.top+cropState.y*d.height;
  const w=cropState.w*d.width;
  const h=cropState.h*d.height;
  Object.assign(cropSelection.style,{left:l+"px",top:t+"px",width:w+"px",height:h+"px"});

  const top=$("cropShadeTop"),right=$("cropShadeRight"),bottom=$("cropShadeBottom"),left=$("cropShadeLeft");
  if(top)Object.assign(top.style,{left:d.left+"px",top:d.top+"px",width:d.width+"px",height:Math.max(0,t-d.top)+"px"});
  if(bottom)Object.assign(bottom.style,{left:d.left+"px",top:(t+h)+"px",width:d.width+"px",height:Math.max(0,d.top+d.height-(t+h))+"px"});
  if(left)Object.assign(left.style,{left:d.left+"px",top:t+"px",width:Math.max(0,l-d.left)+"px",height:h+"px"});
  if(right)Object.assign(right.style,{left:(l+w)+"px",top:t+"px",width:Math.max(0,d.left+d.width-(l+w))+"px",height:h+"px"});
}

function resetCropSelection(){
  cropState=largestPhoneCrop();
  requestAnimationFrame(renderCropSelection);
}
window.addEventListener("resize",renderCropSelection);
$("cropResetBtn")?.addEventListener("click",resetCropSelection);

cropSelection?.addEventListener("pointerdown",e=>{
  e.preventDefault();
  cropSelection.setPointerCapture?.(e.pointerId);
  const handle=e.target?.dataset?.handle||"move";
  cropGesture={pointerId:e.pointerId,handle,startX:e.clientX,startY:e.clientY,start:{...cropState}};
});
cropSelection?.addEventListener("pointermove",e=>{
  if(!cropGesture||cropGesture.pointerId!==e.pointerId)return;
  const d=cropImageDisplayRect();
  if(!d)return;
  const dx=(e.clientX-cropGesture.startX)/Math.max(1,d.width);
  const dy=(e.clientY-cropGesture.startY)/Math.max(1,d.height);
  const s=cropGesture.start;
  let c={...s};

  if(cropGesture.handle==="move"){
    c.x=s.x+dx;
    c.y=s.y+dy;
  }else if(cropGesture.handle==="resize"){
    const ratio=cropNormalizedRatio();
    const byX=s.w+dx;
    const byY=(s.h+dy)*ratio;
    const desired=Math.abs(dx) >= Math.abs(dy) ? byX : byY;
    const maxW=Math.min(1-s.x,(1-s.y)*ratio,1,ratio);
    const minW=Math.min(maxW,Math.max(.05,MIN_CROP_PX/Math.max(1,d.width)));
    c.w=Math.max(minW,Math.min(maxW,desired));
    c.h=c.w/ratio;
  }
  cropState=clampPhoneCrop(c);
  renderCropSelection();
});
function endCropGesture(e){
  if(cropGesture?.pointerId===e.pointerId)cropGesture=null;
}
cropSelection?.addEventListener("pointerup",endCropGesture);
cropSelection?.addEventListener("pointercancel",endCropGesture);

$("imageFile").onchange=()=>{
  const f=$("imageFile").files?.[0];
  if(!f)return;
  editorCroppedFile=null;
  editorOriginalPreviewSrc=null;
  setEditorImage(URL.createObjectURL(f));
};
$("imageUrl").oninput=()=>{
  if($("imageFile").files?.[0])return;
  const url=$("imageUrl").value.trim();
  if(url)setEditorImage(url);
};

async function cropVisibleImage(){
  const img=$("imageCropSource");
  if(!img?.src)throw new Error("Bitte zuerst ein Bild auswählen.");
  if(!img.complete)await new Promise((resolve,reject)=>{
    img.addEventListener("load",resolve,{once:true});
    img.addEventListener("error",()=>reject(new Error("Bild konnte nicht geladen werden.")),{once:true});
  });
  const nw=img.naturalWidth,nh=img.naturalHeight;
  if(!nw||!nh)throw new Error("Die Bildgröße konnte nicht gelesen werden.");

  cropState=clampPhoneCrop({...cropState});
  const sx=Math.round(cropState.x*nw);
  const sy=Math.round(cropState.y*nh);
  const sw=Math.max(1,Math.round(cropState.w*nw));
  const sh=Math.max(1,Math.round(cropState.h*nh));

  // Ausgabe immer exakt 9:16; ausreichend groß für mobile Vollbild-Slides.
  const targetW=1080,targetH=1920;
  const canvas=document.createElement("canvas");
  canvas.width=targetW;
  canvas.height=targetH;
  const ctx=canvas.getContext("2d");
  try{
    ctx.drawImage(img,sx,sy,sw,sh,0,0,targetW,targetH);
  }catch(err){
    throw new Error("Dieses externe Bild darf der Browser nicht zuschneiden. Lade es bitte als Bilddatei hoch und versuche es erneut.");
  }
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/jpeg",.90));
  if(!blob)throw new Error("Der Bildausschnitt konnte nicht erstellt werden.");

  editorCroppedFile=new File([blob],`good-news-9x16-${Date.now()}.jpg`,{type:"image/jpeg"});
  const url=URL.createObjectURL(blob);
  setEditorImage(url,{preserveOriginal:false});
  $("imageFit").value="cover";
  $("imageZoom").value="1";
  $("imagePosX").value="50";
  $("imagePosY").value="50";
  applyImageEditorState();
  if($("imageCropMessage"))$("imageCropMessage").textContent="Handy-Ausschnitt übernommen. Beim Speichern wird genau dieses 9:16-Bild verwendet.";
  markFormDirty($("newsForm"));
  saveEditorDraft();
}

$("imageCropBtn")?.addEventListener("click",async()=>{
  const btn=$("imageCropBtn");
  btn.disabled=true;
  try{
    await cropVisibleImage();
  }catch(err){
    if($("imageCropMessage"))$("imageCropMessage").textContent=err.message||String(err);
  }finally{
    btn.disabled=false;
  }
});
$("imageUndoCropBtn")?.addEventListener("click",()=>{
  if(!editorOriginalPreviewSrc)return;
  editorCroppedFile=null;
  setEditorImage(editorOriginalPreviewSrc,{preserveOriginal:false});
  if($("imageCropMessage"))$("imageCropMessage").textContent="";
  markFormDirty($("newsForm"));
  saveEditorDraft();
});

async function uploadImage(file){
  if(!file)return null;
  const ext=(file.name.split(".").pop()||"jpg").toLowerCase().replace(/[^a-z0-9]/g,"");
  const path=`${currentAdminSession.user.id}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
  const {error}=await db.storage.from("news-images").upload(path,file,{cacheControl:"3600",upsert:false});
  if(error)throw error;
  const {data}=db.storage.from("news-images").getPublicUrl(path);
  return {path,url:data.publicUrl};
}

function formToDraft(){
  const d=$("publishedDate").value,t=$("publishedTime").value||"00:00";
  return {
    id:$("newsId").value||null,published_date:d,published_time:t,
    category:$("category").value.trim(),story_key:$("storyKey").value.trim()||null,
    title:$("title").value.trim(),summary:$("summary").value.trim(),
    status:$("status").value,priority:$("priority").value,
    byline_name:$("bylineName")?.value.trim()||null,
    byline_visible:$("bylineVisible")?.value==="true",
    context_text:$("contextText").value.trim()||null,
    daily_slot:$("dailySlot")?.value||"none",
    years_ago:$("yearsAgo")?.value?Number($("yearsAgo").value):null,
    feel_good_text:$("feelGoodText")?.value.trim()||null,
    image_url:$("imageUrl").value.trim()||($("imagePreview").src&&!$("imagePreview").src.startsWith("blob:")?$("imagePreview").src:null),
    ...currentImageEditorState(),
    image_credit:$("imageCredit").value.trim()||null,
    image_license:$("imageLicense")?.value.trim()||null,
    image_source_url:$("imageSourceUrl")?.value.trim()||null,
    image_kind:$("imageKind")?.value||"photo",
    sources:collectSources()
  };
}

$("previewBtn").onclick=()=>openPreview(formToDraft());
function openPreview(n){
  $("previewContent").innerHTML=`
    <article class="preview-card ${n.image_url?"has-image":""}">
      ${n.image_url?`<img class="slide-bg-blur" src="${esc(n.image_url)}" alt="" aria-hidden="true"><img class="slide-bg" src="${esc(n.image_url)}" alt="" style="${imageStyleOf(n)}">`:""}
      <div class="slide-inner">
        <div class="topline"><span class="pill">${esc(displayCategory(n))}</span>${n.priority==="top"?'<span class="pill top-pill">Topmeldung</span>':""}</div>
        ${n.byline_visible&&n.byline_name?`<div class="news-byline">von ${esc(n.byline_name)}</div>`:""}
        <h1>${esc(n.title||"Deine Überschrift")}</h1>
        <p class="summary">${esc(n.summary||"Hier erscheint deine Nachricht.")}</p>
              </div>
    </article>`;
  previewDialog.showModal();
}
function previewSaved(id){const n=adminNews.find(x=>String(x.id)===String(id));if(n)openPreview(n)}

async function editArticle(id){
  const n=adminNews.find(x=>String(x.id)===String(id));if(!n)return;
  $("newsId").value=n.id;$("publishedDate").value=n.published_date;
  $("publishedTime").value=n.published_time?.slice(0,5)||"00:00";$("category").value=categoryBucket(n)||"Kultur/Natur";
  $("storyKey").value=n.story_key||"";$("title").value=n.title;$("summary").value=n.summary;
  if($("bylineName")) $("bylineName").value=n.byline_name||"";
  if($("bylineVisible")) $("bylineVisible").value=n.byline_visible?"true":"false";
  $("status").value=n.status;$("priority").value=n.priority||"normal";$("contextText").value=n.context_text||"";
  if($("dailySlot")) $("dailySlot").value=n.daily_slot||"none";
  if($("yearsAgo")) $("yearsAgo").value=n.years_ago||"";
  if($("feelGoodText")) $("feelGoodText").value=n.feel_good_text||"";
  $("imageUrl").value=n.image_path?"":(n.image_url||"");$("imageCredit").value=n.image_credit||"";
  if($("imageLicense")) $("imageLicense").value=n.image_license||"";
  if($("imageSourceUrl")) $("imageSourceUrl").value=n.image_source_url||"";
  if($("imageKind")) $("imageKind").value=n.image_kind||"photo";
  $("existingImagePath").value=n.image_path||"";
  const iv=imageViewOf(n); if($("imageFit")) $("imageFit").value=iv.fit; if($("imageZoom")) $("imageZoom").value=iv.zoom; if($("imagePosX")) $("imagePosX").value=iv.x; if($("imagePosY")) $("imagePosY").value=iv.y;
  $("sourcesEditor").innerHTML="";
  (sourcesOf(n).length?sourcesOf(n):[{name:"",url:""}]).forEach(s=>addSourceRow(s.name,s.url));
  editorCroppedFile=null; editorOriginalPreviewSrc=null; if(n.image_url){setEditorImage(n.image_url)}else $("imagePreviewBox").hidden=true; applyImageEditorState();
  $("saveBtn").textContent="Änderungen speichern";$("cancelEditBtn").hidden=false;
  markFormClean($("newsForm"));
  switchAdminTab("editor");
  saveEditorDraft();
}

$("newsForm").onsubmit=async(e)=>{
  e.preventDefault();$("editorMessage").textContent="Speichern …";
  try{
    const d=formToDraft();
    if(!d.sources.length)throw new Error("Bitte mindestens eine Quelle mit Name und Link angeben.");
    let imageUrl=d.image_url,imagePath=$("existingImagePath").value||null;
    const file=editorCroppedFile || $("imageFile").files?.[0];
    if(file){
      const uploaded=await uploadImage(file);imageUrl=uploaded.url;imagePath=uploaded.path;
    }else{
      imageUrl=await resolveDisplayImageUrl(imageUrl);
    }
    const localDateTime=`${d.published_date}T${d.published_time}:00`;
    const publishAt=new Date(localDateTime).toISOString();
    const row={
      published_date:d.published_date,published_time:d.published_time,category:d.category,story_key:d.story_key,
      title:d.title,summary:d.summary,status:d.status,priority:d.priority,priority_rank:d.priority==="top"?1:0,
      byline_name:d.byline_visible?d.byline_name:null,byline_visible:Boolean(d.byline_visible&&d.byline_name),
      context_text:d.context_text,daily_slot:d.daily_slot,years_ago:d.years_ago,feel_good_text:d.feel_good_text,
      image_url:imageUrl,image_path:imagePath,image_credit:d.image_credit,
      image_license:d.image_license,image_source_url:d.image_source_url,image_kind:d.image_kind,
      image_fit:d.image_fit,image_zoom:d.image_zoom,image_x:d.image_pos_x,image_y:d.image_pos_y,
      sources:d.sources,publish_at:publishAt,updated_at:new Date().toISOString()
    };
    const id=$("newsId").value;
    const result=id?await db.from("news").update(row).eq("id",id):await db.from("news").insert(row);
    if(result.error)throw result.error;
    $("editorMessage").textContent="Gespeichert.";
    clearEditorDraft();
    resetEditor();
    showAppNotice("Gespeichert.");
    await Promise.all([loadAdminNews(),fetchPublicNews()]);
    switchAdminTab("dashboard");
  }catch(err){$("editorMessage").textContent=err.message||String(err)}
};

if(db){
  db.auth.getSession().then(async({data:{session}})=>{
    currentAdminSession=session;
    currentUserIsAdmin=await sessionIsAdmin(session);
    $("adminBtn").hidden=!currentUserIsAdmin;
    if($("accountBtnLabel")) $("accountBtnLabel").textContent=session?"Konto":"Anmelden";
  }).catch(()=>{
    currentAdminSession=null;
    currentUserIsAdmin=false;
    $("adminBtn").hidden=true;
    if($("accountBtnLabel")) $("accountBtnLabel").textContent="Anmelden";
  });
  db.auth.onAuthStateChange((_event,session)=>{
    currentAdminSession=session;
    currentUserIsAdmin=false;
    $("adminBtn").hidden=true;
    if($("accountBtnLabel")) $("accountBtnLabel").textContent=session?"Konto":"Anmelden";
    setTimeout(async()=>{
      currentUserIsAdmin=await sessionIsAdmin(session);
      $("adminBtn").hidden=!currentUserIsAdmin;
      if(adminDialog.open)await refreshAuth();
      if(settingsDialog.open)await refreshSettingsAccount();
      await fetchPublicNews();
    },0);
  });
}else{
  currentAdminSession=null;
  currentUserIsAdmin=false;
  $("adminBtn").hidden=true;
}
trackFormState($("newsForm"),"Beitrag");
trackFormState($("submissionForm"),"Einsendung");
trackFormState($("reportForm"),"Fehlermeldung");
resetEditor();
setupEditorAutosave();
if(localStorage.getItem("goodNewsAdminTab")==="editor"){
  restoreEditorDraft();
}
// Sofort den letzten bekannten Feed zeigen; danach im Hintergrund aktualisieren.
renderCachedFeed();
trackDailyActive();
fetchPublicNews();

// Build 37 – PWA-Update-Reparatur für installierte Android-Apps.
// Der Service Worker hat ab jetzt eine STABILE URL (sw.js). Beim manuellen Update
// werden alte App-Caches entfernt; danach wird mit einer eindeutigen Navigations-URL
// frisch vom Server geladen. Der neue Service Worker kann beim Aktivieren zusätzlich
// selbst alle offenen Good-News-Fenster auf den neuen Build führen. So hängt die
// installierte PWA nicht mehr an einer alten Cache-/Worker-Version fest.
// Build 35 – adaptive Überschriften (max. 4 Zeilen) und stärkerer Lesbarkeitsverlauf.
const GOOD_NEWS_BUILD=44;
let goodNewsSwRegistration=null;
let goodNewsReloading=false;

function goodNewsFreshUrl(remoteBuild){
  const url=new URL(location.href);
  url.searchParams.set("gn_build",String(remoteBuild||GOOD_NEWS_BUILD));
  url.searchParams.set("gn_refresh",String(Date.now()));
  return url.href;
}

function cleanGoodNewsUpdateParams(){
  const url=new URL(location.href);
  const target=Number(url.searchParams.get("gn_build"));
  if(Number.isFinite(target) && target<=GOOD_NEWS_BUILD){
    url.searchParams.delete("gn_build");
    url.searchParams.delete("gn_refresh");
    url.searchParams.delete("gn_sw");
    history.replaceState(null,"",url.pathname+url.search+url.hash);
  }
}

async function getRemoteBuild(){
  const response=await fetch(`version.json?gn_version=${Date.now()}`,{
    cache:"no-store",
    headers:{"Cache-Control":"no-cache"}
  });
  if(!response.ok) throw new Error(`Version ${response.status}`);
  const data=await response.json();
  const build=Number(data?.build);
  if(!Number.isFinite(build)) throw new Error("Ungültige Build-Nummer");
  return build;
}

async function clearGoodNewsCaches(){
  if(!("caches" in window)) return;
  const keys=await caches.keys();
  await Promise.all(keys.filter(key=>key.startsWith("good-news-")).map(key=>caches.delete(key)));
}

function waitForServiceWorkerActivation(reg,timeoutMs=12000){
  return new Promise(resolve=>{
    let settled=false;
    let timer=null;
    const finish=value=>{
      if(settled)return;
      settled=true;
      clearTimeout(timer);
      navigator.serviceWorker.removeEventListener("controllerchange",onControllerChange);
      resolve(value);
    };
    const onControllerChange=()=>finish(true);
    navigator.serviceWorker.addEventListener("controllerchange",onControllerChange);

    const watch=worker=>{
      if(!worker)return;
      const stateChanged=()=>{
        if(worker.state==="installed") worker.postMessage({type:"SKIP_WAITING"});
        if(worker.state==="activated") finish(true);
      };
      worker.addEventListener("statechange",stateChanged);
      stateChanged();
    };

    watch(reg.installing);
    watch(reg.waiting);
    if(reg.waiting) reg.waiting.postMessage({type:"SKIP_WAITING"});

    const poll=setInterval(()=>{
      if(settled){clearInterval(poll);return;}
      watch(reg.installing);
      watch(reg.waiting);
      if(reg.waiting) reg.waiting.postMessage({type:"SKIP_WAITING"});
    },250);

    timer=setTimeout(()=>{clearInterval(poll);finish(false)},timeoutMs);
  });
}

async function installRemoteBuild(remoteBuild){
  // Ab Build 37 bleibt die Worker-URL absichtlich konstant. Dadurch erzeugt ein
  // Reload nicht direkt wieder eine zweite Worker-Installation mit anderer URL.
  const reg=await navigator.serviceWorker.register("sw.js",{
    scope:"./",
    updateViaCache:"none"
  });
  goodNewsSwRegistration=reg;
  await reg.update();

  if(reg.waiting) reg.waiting.postMessage({type:"SKIP_WAITING"});
  const activated=await waitForServiceWorkerActivation(reg);
  return activated;
}

async function forceFreshAppNavigation(remoteBuild){
  goodNewsReloading=true;
  try{sessionStorage.setItem("goodNewsUpdateTarget",String(remoteBuild));}catch{}

  // Die Caches löschen, BEVOR navigiert wird. Selbst falls der alte Worker das
  // aktuelle Fenster noch kontrolliert, muss er danach den Server benutzen.
  await clearGoodNewsCaches().catch(()=>{});
  location.replace(goodNewsFreshUrl(remoteBuild));
}

async function checkForAppUpdate({manual=false}={}){
  if(!("serviceWorker" in navigator)){
    if(manual) alert("Auf diesem Gerät ist kein Service Worker verfügbar.");
    return;
  }

  const button=$("checkUpdateBtn");
  const oldText=button?.innerHTML;
  try{
    if(manual && button){
      button.disabled=true;
      button.innerHTML="<span>↻</span>Update wird geprüft …";
    }

    const remoteBuild=await getRemoteBuild();
    if(remoteBuild<=GOOD_NEWS_BUILD){
      const reg=goodNewsSwRegistration || await navigator.serviceWorker.getRegistration();
      if(reg) await reg.update().catch(()=>{});
      if(manual) alert(`Du nutzt bereits die aktuelle Version (Build ${GOOD_NEWS_BUILD}).`);
      return;
    }

    if(manual && button) button.innerHTML="<span>↻</span>Update wird installiert …";

    // Worker aktualisieren. Build 37+ navigiert beim Aktivieren zusätzlich selbst
    // auf eine frische URL; forceFreshAppNavigation bleibt als zuverlässiger Fallback.
    await installRemoteBuild(remoteBuild).catch(e=>console.warn("Worker-Update:",e));
    await forceFreshAppNavigation(remoteBuild);
  }catch(e){
    console.warn("App-Update konnte nicht geprüft werden",e);
    if(manual) alert("Die Update-Prüfung hat gerade nicht geklappt. Bitte versuche es erneut.");
  }finally{
    if(manual && button && !goodNewsReloading){
      button.disabled=false;
      if(oldText!=null) button.innerHTML=oldText;
    }
  }
}

cleanGoodNewsUpdateParams();

if("serviceWorker" in navigator){
  navigator.serviceWorker.addEventListener("controllerchange",()=>{
    // Der aktive Update-Ablauf navigiert selbst. Keine zusätzliche reload()-Kaskade.
  });

  addEventListener("load",async()=>{
    try{
      // Stabile URL ab Build 37. updateViaCache:none zwingt die Update-Prüfung
      // am Browser-HTTP-Cache vorbei.
      goodNewsSwRegistration=await navigator.serviceWorker.register("sw.js",{
        scope:"./",
        updateViaCache:"none"
      });
      await goodNewsSwRegistration.update().catch(()=>{});
      await checkForAppUpdate();
    }catch(e){
      console.warn("Service Worker konnte nicht aktualisiert werden",e);
    }
  });
}
$("checkUpdateBtn")?.addEventListener("click",runMenuAction(()=>checkForAppUpdate({manual:true})));


// ---------------- DESIGN & APP SETTINGS ----------------
let appSettings = null;

async function loadAppSettings() {
  if (!configured) return;
  const {data,error} = await db.from("app_settings").select("*").eq("id",1).maybeSingle();
  if(error) return console.warn("App settings:", error.message);
  if(data){
    appSettings=data;
    applyAppSettings(data);
    if(currentAdminSession){populateSettingsForm(data);markFormClean($("settingsForm"));}
  }
}


const DEFAULT_LEGAL_SETTINGS={
  provider_name:"Timo Heinrich Grabbe",
  provider_address:"c/o Online-Impressum 10641\nEuroparing 90\n53757 Sankt Augustin",
  contact_email:"good-news@mail.online-impressum.de",
  editorial_name:"Timo Heinrich Grabbe",
  editorial_address:"c/o Online-Impressum 10641\nEuroparing 90\n53757 Sankt Augustin",
  privacy_email:"good-news@mail.online-impressum.de"
};

function legalText(value,fallback){
  const v=String(value||"").trim();
  return v || fallback;
}

function legalHtmlLines(value,fallback){
  const v=String(value||"").trim();
  return esc(v || fallback).replace(/\n/g,"<br>");
}

function applyLegalSettings(settings={}){
  const l=settings?.legal_settings||{};
  const name=legalText(l.provider_name,DEFAULT_LEGAL_SETTINGS.provider_name);
  const address=legalText(l.provider_address,DEFAULT_LEGAL_SETTINGS.provider_address);
  const email=legalText(l.contact_email,DEFAULT_LEGAL_SETTINGS.contact_email);
  const editorialName=legalText(l.editorial_name,DEFAULT_LEGAL_SETTINGS.editorial_name);
  const editorialAddress=legalText(l.editorial_address,DEFAULT_LEGAL_SETTINGS.editorial_address);
  const privacyEmail=legalText(l.privacy_email,DEFAULT_LEGAL_SETTINGS.privacy_email);

  if($("legalProviderName")) $("legalProviderName").textContent=name;
  if($("legalProviderAddress")) $("legalProviderAddress").innerHTML=legalHtmlLines(address,"[Geschäfts-/Impressumsadresse ergänzen]");
  if($("legalContactEmail")){
    $("legalContactEmail").innerHTML=email.startsWith("[")?esc(email):`<a href="mailto:${esc(email)}">${esc(email)}</a>`;
  }
  if($("legalEditorialResponsible")){
    $("legalEditorialResponsible").innerHTML=`${esc(editorialName)}<br>${legalHtmlLines(editorialAddress,"[Anschrift ergänzen]")}`;
  }
  if($("legalPrivacyResponsible")){
    const privacyParts=[name,address,privacyEmail].filter(Boolean);
    $("legalPrivacyResponsible").innerHTML=`${esc(privacyParts[0]||"[Name ergänzen]")}<br>${legalHtmlLines(privacyParts[1]||"[Anschrift ergänzen]","[Anschrift ergänzen]")}<br>${privacyEmail.startsWith("[")?esc(privacyEmail):`<a href="mailto:${esc(privacyEmail)}">${esc(privacyEmail)}</a>`}`;
  }
}

function populateLegalSettingsForm(settings={}){
  if(!$("settingLegalName")) return;
  const l=settings?.legal_settings||{};
  $("settingLegalName").value=l.provider_name||DEFAULT_LEGAL_SETTINGS.provider_name;
  $("settingLegalAddress").value=l.provider_address||DEFAULT_LEGAL_SETTINGS.provider_address;
  $("settingLegalEmail").value=l.contact_email||DEFAULT_LEGAL_SETTINGS.contact_email;
  $("settingLegalEditorialName").value=l.editorial_name||DEFAULT_LEGAL_SETTINGS.editorial_name;
  $("settingLegalEditorialAddress").value=l.editorial_address||DEFAULT_LEGAL_SETTINGS.editorial_address;
  $("settingLegalPrivacyEmail").value=l.privacy_email||DEFAULT_LEGAL_SETTINGS.privacy_email;
}

function readLegalSettingsForm(){
  return {
    provider_name:$("settingLegalName")?.value.trim()||"",
    provider_address:$("settingLegalAddress")?.value.trim()||"",
    contact_email:$("settingLegalEmail")?.value.trim()||"",
    editorial_name:$("settingLegalEditorialName")?.value.trim()||"",
    editorial_address:$("settingLegalEditorialAddress")?.value.trim()||"",
    privacy_email:$("settingLegalPrivacyEmail")?.value.trim()||""
  };
}

function applyAppSettings(s){
  applyLegalSettings(s);
  document.body.classList.add("theme-user");
  document.documentElement.style.setProperty("--user-bg", s.background_color || "#0e0e10");
  document.documentElement.style.setProperty("--user-text", s.text_color || "#f5f5f5");
  document.documentElement.style.setProperty("--user-accent", s.accent_color || "#ffffff");
  document.documentElement.style.setProperty("--image-overlay", String((s.overlay_strength ?? 65)/100));

  const scale = s.title_size === "compact" ? .82 : s.title_size === "large" ? 1.16 : 1;
  document.documentElement.style.setProperty("--title-scale", String(scale));

  const radius = s.corner_style === "square" ? "2px" : s.corner_style === "round" ? "999px" : "16px";
  document.documentElement.style.setProperty("--user-radius", radius);

  document.body.classList.toggle("image-mode-top", s.image_mode === "top");
  document.body.classList.toggle("image-mode-hidden", s.image_mode === "hidden");
  document.body.classList.toggle("hide-category", s.show_category === false);
  document.body.classList.toggle("hide-date", s.show_date === false);
  document.body.classList.toggle("hide-sources", s.show_sources === false);
  document.body.classList.toggle("hide-counter", s.show_counter === false);

  const name = s.app_name || "Good News";
  document.title = name;
  const brandName=document.querySelector(".brand-name");
  if(brandName) brandName.textContent=name;

  const logo=$("brandLogo");
  if(logo){
    // Das Good-News-Appsymbol ist immer der Fallback. Ein in der Redaktion
    // hinterlegtes Logo darf es weiterhin überschreiben.
    logo.src=s.logo_url || "icon-192.png";
    logo.classList.add("visible");
    logo.onerror=()=>{
      if(!logo.src.endsWith("/icon-192.png") && !logo.src.endsWith("icon-192.png")){
        logo.src="icon-192.png";
      }
    };
  }
}

function populateSettingsForm(s){
  if(!$("settingAppName")) return;
  populateLegalSettingsForm(s);
  $("settingAppName").value=s.app_name||"Good News";
  $("settingLogoUrl").value=s.logo_path?"":(s.logo_url||"");
  $("settingBg").value=s.background_color||"#0e0e10";
  $("settingText").value=s.text_color||"#f5f5f5";
  $("settingAccent").value=s.accent_color||"#ffffff";
  $("settingTitleSize").value=s.title_size||"normal";
  $("settingRadius").value=s.corner_style||"soft";
  $("settingImageMode").value=s.image_mode||"full";
  $("settingOverlay").value=s.overlay_strength??65;
  $("settingShowCategory").checked=s.show_category!==false;
  $("settingShowDate").checked=s.show_date!==false;
  $("settingShowSources").checked=s.show_sources!==false;
  $("settingShowCounter").checked=s.show_counter!==false;
  if(s.logo_url){
    $("logoPreview").src=s.logo_url;
    $("logoPreviewBox").hidden=false;
  }else{
    $("logoPreviewBox").hidden=true;
  }
  updateThemePreview();
}

function readSettingsForm(){
  return {
    app_name:$("settingAppName").value.trim()||"Good News",
    background_color:$("settingBg").value,
    text_color:$("settingText").value,
    accent_color:$("settingAccent").value,
    title_size:$("settingTitleSize").value,
    corner_style:$("settingRadius").value,
    image_mode:$("settingImageMode").value,
    overlay_strength:Number($("settingOverlay").value),
    show_category:$("settingShowCategory").checked,
    show_date:$("settingShowDate").checked,
    show_sources:$("settingShowSources").checked,
    show_counter:$("settingShowCounter").checked,
    legal_settings:readLegalSettingsForm()
  };
}

function updateThemePreview(){
  if(!$("themePreview")) return;
  const s=readSettingsForm();
  const box=$("themePreview");
  box.style.background=s.background_color;
  box.style.color=s.text_color;
  box.style.borderRadius=s.corner_style==="square"?"2px":s.corner_style==="round"?"28px":"18px";
  box.style.boxShadow=`inset 0 0 0 2px ${s.accent_color}22`;
  const head=box.querySelector(".preview-headline");
  if(head) head.style.fontSize=s.title_size==="compact"?"1.6rem":s.title_size==="large"?"2.5rem":"2rem";
}

async function uploadLogo(file){
  if(!file) return null;
  const ext=(file.name.split(".").pop()||"png").toLowerCase().replace(/[^a-z0-9]/g,"");
  const path=`${currentAdminSession.user.id}/logo-${Date.now()}.${ext}`;
  const {error}=await db.storage.from("news-images").upload(path,file,{upsert:false});
  if(error) throw error;
  const {data}=db.storage.from("news-images").getPublicUrl(path);
  return {path,url:data.publicUrl};
}

trackFormState($("settingsForm"),"App-Einstellungen");
if($("settingLogoFile")){
  $("settingLogoFile").onchange=()=>{
    const f=$("settingLogoFile").files?.[0];
    if(!f)return;
    $("logoPreview").src=URL.createObjectURL(f);
    $("logoPreviewBox").hidden=false;
  };
  [
    "settingAppName","settingBg","settingText","settingAccent","settingTitleSize","settingRadius",
    "settingImageMode","settingOverlay","settingShowCategory","settingShowDate","settingShowSources","settingShowCounter"
  ].forEach(id=>{
    const el=$(id);
    if(el) el.addEventListener(el.type==="range"||el.type==="color"?"input":"change", updateThemePreview);
  });

  $("settingsForm").onsubmit=async(e)=>{
    e.preventDefault();
    $("settingsMessage").textContent="Änderungen werden gespeichert …";
    try{
      const payload=readSettingsForm();
      let logoUrl=$("settingLogoUrl").value.trim() || appSettings?.logo_url || null;
      let logoPath=appSettings?.logo_path || null;
      const file=$("settingLogoFile").files?.[0];
      if(file){
        const up=await uploadLogo(file);
        logoUrl=up.url; logoPath=up.path;
      } else if($("settingLogoUrl").value.trim()){
        logoPath=null;
      }
      payload.logo_url=logoUrl;
      payload.logo_path=logoPath;
      payload.updated_at=new Date().toISOString();

      const {data,error}=await db.from("app_settings").update(payload).eq("id",1).select().single();
      if(error) throw error;
      appSettings=data;
      applyAppSettings(data);
      populateSettingsForm(data);
      if($("settingLogoFile"))$("settingLogoFile").value="";
      markFormClean($("settingsForm"));
      setShortMessage($("settingsMessage"),"Gespeichert.");
      showAppNotice("Gespeichert.");
    }catch(err){
      $("settingsMessage").textContent=err.message||String(err);
    }
  };

  $("resetThemeBtn").onclick=()=>{
    populateSettingsForm({
      app_name:"Good News",logo_url:null,logo_path:null,
      background_color:"#0e0e10",text_color:"#f5f5f5",accent_color:"#ffffff",
      title_size:"normal",corner_style:"soft",image_mode:"full",overlay_strength:65,
      show_category:true,show_date:true,show_sources:true,show_counter:true
    });
    $("settingLogoUrl").value="";
    $("settingLogoFile").value="";
    markFormDirty($("settingsForm"));
    if($("settingsMessage"))$("settingsMessage").textContent="Standard ausgewählt – zum Übernehmen noch speichern.";
  };
}

// Extend admin tab switching to refresh settings when opened.
const originalSwitchAdminTab = switchAdminTab;
switchAdminTab = function(name){
  originalSwitchAdminTab(name);
  if(name==="settings" && appSettings){
    populateSettingsForm(appSettings);
    if($("settingLogoFile"))$("settingLogoFile").value="";
    markFormClean($("settingsForm"));
    if($("settingsMessage"))$("settingsMessage").textContent="";
  }
};

// load public design immediately
loadAppSettings();

// ---------------- GOOD NEWS 2.1: COMMUNITY SUBMISSIONS ----------------
let readerSubmissions=[];
const submissionDialog=$("submissionDialog");

$("submitNewsBtn").onclick=()=>{
  closeMainMenu();
  $("submissionForm").reset();
  $("submissionMessage").textContent="";
  markFormClean($("submissionForm"));
  submissionDialog.showModal();
};

$("submissionName").addEventListener("input",()=>{
  if(!$("submissionName").value.trim()) $("submissionPublishName").checked=false;
});

$("submissionForm").onsubmit=async(e)=>{
  e.preventDefault();
  const msg=$("submissionMessage");
  if(!configured){msg.textContent="Die Einsendefunktion ist noch nicht verbunden.";return}
  const submitterName=$("submissionName").value.trim();
  const publishSubmitterName=$("submissionPublishName").checked;
  if(publishSubmitterName && !submitterName){
    msg.textContent="Bitte trage einen Namen oder ein Pseudonym ein, wenn er veröffentlicht werden soll.";
    $("submissionName").focus();
    return;
  }
  msg.textContent="Wird gesendet …";
  const row={
    title:$("submissionTitle").value.trim(),
    story_text:$("submissionText").value.trim(),
    source_url:$("submissionUrl").value.trim(),
    category:$("submissionCategory").value,
    location:$("submissionLocation").value.trim()||null,
    submitter_name:submitterName||null,
    publish_submitter_name:publishSubmitterName,
    status:"new"
  };
  const {error}=await db.from("submissions").insert(row);
  if(error){msg.textContent="Das hat leider nicht geklappt: "+error.message;return}
  msg.textContent="Danke! 💛 Deine gute Nachricht ist bei der Redaktion angekommen.";
  e.target.reset();
  markFormClean(e.target);
  setTimeout(()=>{if(submissionDialog.open)submissionDialog.close()},1800);
};

async function loadSubmissions(){
  if(!currentAdminSession)return;
  const {data,error}=await db.from("submissions").select("*").order("created_at",{ascending:false});
  if(error){console.warn("Submissions:",error.message);return}
  readerSubmissions=data||[];
  const count=readerSubmissions.filter(x=>x.status==="new").length;
  const badge=$("submissionBadge");badge.textContent=count;badge.hidden=!count;
  renderSubmissions();
}
function submissionStatusLabel(s){return ({new:"Neu",reviewing:"In Prüfung",accepted:"Übernommen",rejected:"Abgelehnt"})[s]||s}
function renderSubmissions(){
  const root=$("submissionList");if(!root)return;
  const filter=$("submissionStatus")?.value||"new";
  const rows=readerSubmissions.filter(x=>filter==="all"||x.status===filter);
  root.innerHTML=rows.map(x=>`<article class="submission-card">
    <div class="submission-meta">${esc(submissionStatusLabel(x.status))} · ${esc(new Date(x.created_at).toLocaleString("de-DE"))}${x.location?` · ${esc(x.location)}`:""}${x.submitter_name?` · Name/Pseudonym: ${esc(x.submitter_name)}`:""} · Namensnennung: ${x.publish_submitter_name&&x.submitter_name?"Ja":"Nein"}</div>
    <h4>${esc(x.title)}</h4><p>${esc(x.story_text)}</p>
    <div class="submission-source">Quelle: <a href="${esc(x.source_url)}" target="_blank" rel="noopener noreferrer">${esc(x.source_url)}</a></div>
    <div class="submission-actions">
      ${x.status!=="accepted"?`<button class="primary accept-sub" data-id="${x.id}">Für Redaktion übernehmen</button>`:""}
      ${x.status!=="reviewing"&&x.status!=="accepted"?`<button class="secondary review-sub" data-id="${x.id}">In Prüfung</button>`:""}
      ${x.status!=="rejected"&&x.status!=="accepted"?`<button class="secondary reject-sub" data-id="${x.id}">Ablehnen</button>`:""}
    </div></article>`).join("")||'<p class="muted">Hier gibt es aktuell keine Einsendungen.</p>';
  root.querySelectorAll(".accept-sub").forEach(b=>b.onclick=()=>acceptSubmission(b.dataset.id));
  root.querySelectorAll(".review-sub").forEach(b=>b.onclick=()=>setSubmissionStatus(b.dataset.id,"reviewing"));
  root.querySelectorAll(".reject-sub").forEach(b=>b.onclick=()=>setSubmissionStatus(b.dataset.id,"rejected"));
}
$("submissionStatus").onchange=renderSubmissions;
async function setSubmissionStatus(id,status){
  const {error}=await db.from("submissions").update({status,reviewed_at:new Date().toISOString()}).eq("id",id);
  if(error)return alert(error.message);await loadSubmissions();
}
async function acceptSubmission(id){
  const x=readerSubmissions.find(v=>String(v.id)===String(id));if(!x)return;
  resetEditor();
  $("category").value=categoryBucket(x)||"Kultur/Natur";
  $("title").value=x.title;
  $("summary").value=x.story_text;
  $("sourcesEditor").innerHTML="";addSourceRow("Leserhinweis / Originalquelle",x.source_url);
  $("feelGoodText").value="";
  const mayPublishName=Boolean(x.publish_submitter_name && x.submitter_name);
  $("bylineName").value=mayPublishName?x.submitter_name:"";
  $("bylineVisible").value=mayPublishName?"true":"false";
  await setSubmissionStatus(id,"accepted");
  switchAdminTab("editor");
  $("editorMessage").textContent=(x.publish_submitter_name&&x.submitter_name)
    ? `Lesereinsendung übernommen. Namensnennung freigegeben: „von ${x.submitter_name}“. Bitte redaktionell prüfen und erst danach veröffentlichen.`
    : "Lesereinsendung übernommen. Die veröffentlichte Nachricht bleibt ohne Namensnennung. Bitte redaktionell prüfen und erst danach veröffentlichen.";
}

// Extend admin tab behavior for submissions.
const _switchAdminTab=switchAdminTab;
switchAdminTab=function(name){
  _switchAdminTab(name);
  if(name==="submissions")loadSubmissions();
  if(name==="editor" && !$("newsId").value && !$("title").value.trim()) restoreEditorDraft();
};


// ---------------- GOOD NEWS: MORGEN-/ABEND-AUSWAHL ----------------
let tripleDrafts=[];

async function loadTripleDrafts(){
  if(!currentAdminSession || !configured)return;
  const {data,error}=await db.from("triple_drafts").select("*").order("created_at",{ascending:false});
  if(error){console.warn("Entwürfe – Auswahl:",error.message);return}
  tripleDrafts=data||[];
  const count=tripleDrafts.filter(x=>x.status==="new").length;
  const badge=$("tripleDraftBadge");
  if(badge){badge.textContent=count;badge.hidden=!count}
  renderTripleDrafts();
}
function tripleDraftStatusLabel(s){return ({new:"Neu",imported:"Übernommen",rejected:"Abgelehnt"})[s]||s}

function wikimediaFileNameFromUrl(raw){
  if(!raw)return null;
  try{
    const u=new URL(String(raw).trim());
    if(u.hostname!=="commons.wikimedia.org" && u.hostname!=="www.commons.wikimedia.org")return null;
    const path=decodeURIComponent(u.pathname);
    const redirectMarker="/wiki/Special:Redirect/file/";
    if(path.includes(redirectMarker))return path.split(redirectMarker)[1]||null;
    const fileMarker="/wiki/File:";
    if(path.includes(fileMarker))return path.split(fileMarker)[1]||null;
  }catch(_e){}
  return null;
}

async function resolveDisplayImageUrl(raw){
  const value=String(raw||"").trim();
  if(!value)return null;
  const fileName=wikimediaFileNameFromUrl(value);
  if(!fileName)return value;
  try{
    const api="https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&prop=imageinfo&iiprop=url&iiurlwidth=1600&titles="+encodeURIComponent("File:"+fileName);
    const response=await fetch(api,{cache:"no-store"});
    if(!response.ok)throw new Error("Wikimedia HTTP "+response.status);
    const json=await response.json();
    const page=Object.values(json?.query?.pages||{})[0];
    const info=page?.imageinfo?.[0];
    return info?.thumburl||info?.url||value;
  }catch(err){
    console.warn("Bilddatei konnte nicht automatisch aufgelöst werden:",err);
    return value;
  }
}

function normalizeCandidateItem(item,category){
  item=item||{};
  const src=Array.isArray(item.sources)?item.sources:(item.source_url?[{name:item.source_name||"Quelle",url:item.source_url}]:[]);
  const canonicalCategory=categoryBucket({category});
  const isHistory=canonicalCategory==="Was war....";
  return {
    category:canonicalCategory,
    title:isHistory?historicalTitle(item.title,Number(item.years_ago)||null):(item.title||""),
    summary:item.summary||item.text||"",
    context_text:item.context_text||null,
    years_ago:isHistory?(Number(item.years_ago)||null):null,
    image_url:item.image_url||null,
    image_credit:item.image_credit||item.image_author||null,
    image_license:item.image_license||null,
    image_source_url:item.image_source_url||item.image_page_url||null,
    image_kind:item.image_kind==="ai"?"ai":"photo",
    sources:src.filter(x=>x&&x.url).map(x=>({name:x.name||"Quelle",url:x.url}))
  };
}

// Kompatibilität mit älteren Dreier-Entwürfen.
function normalizeTripleItem(item,slot){
  const defaults={damals:"Was war....",fortschritt:"Fortschritt, Medizin & Technologie",heute:"Kultur/Natur"};
  return normalizeCandidateItem(item,slot==="damals"?"Was war....":(item?.category||defaults[slot]));
}

function isCandidateBatch(payload){
  return payload?.schema==="candidate_batch_v1" && Array.isArray(payload?.groups) && payload.groups.length===3;
}
function batchHeading(payload){
  return payload?.batch_type==="evening"?"🌙 Abend-Auswahl":"☀️ Morgen-Auswahl";
}
function candidateCardHtml(x,group,index){
  const n=normalizeCandidateItem(group.candidates?.[index],group.category);
  const inputName=`batch-${x.id}-${group.key}`;
  return `<label class="candidate-card" data-candidate-card>
    <input type="radio" name="${esc(inputName)}" value="${index}" data-batch-id="${x.id}" data-group-key="${esc(group.key)}">
    <span class="candidate-choice-mark" aria-hidden="true"></span>
    <span class="candidate-copy">
      <span class="candidate-kicker">Vorschlag ${index===0?"A":"B"}</span>
      <strong>${esc(n.title||"Ohne Überschrift")}</strong>
      <span class="candidate-summary">${esc(n.summary)}</span>
      <span class="candidate-meta">${n.image_url?(n.image_kind==="ai"?"🖼️ KI-Illustration":"🖼️ Bild vorhanden"):"Kein Bild"} · ${n.sources.length} ${n.sources.length===1?"Quelle":"Quellen"}</span>
    </span>
  </label>`;
}
function batchDraftHtml(x){
  const p=x.payload||{};
  const groups=p.groups||[];
  return `<article class="triple-draft-card candidate-batch-card" data-batch-card="${x.id}">
    <div class="batch-draft-head">
      <div>
        <div class="batch-title">${batchHeading(p)}</div>
        <div class="submission-meta">${esc(tripleDraftStatusLabel(x.status))} · ${esc(new Date(x.created_at).toLocaleString("de-DE"))} · für ${esc(fmtDateShort(x.draft_date))}</div>
      </div>
      <div class="triple-draft-source">${esc(x.source_label||"ChatGPT")}</div>
    </div>
    <div class="candidate-groups">
      ${groups.map(group=>`<section class="candidate-group">
        <div class="candidate-group-head"><strong>${esc(categoryBucket({category:group.category}))}</strong><span>1 von 2 wählen</span></div>
        <div class="candidate-pair">
          ${candidateCardHtml(x,group,0)}
          ${candidateCardHtml(x,group,1)}
        </div>
      </section>`).join("")}
    </div>
    <div class="submission-actions">
      ${x.status!=="imported"?`<button class="primary import-selected-batch" data-id="${x.id}" disabled>3 ausgewählte Entwürfe übernehmen</button>`:""}
      ${x.status==="new"?`<button class="secondary reject-triple" data-id="${x.id}">Ablehnen</button>`:""}
    </div>
    ${x.status==="new"?`<div class="batch-selection-note" data-selection-note>Bitte aus jeder Rubrik einen Vorschlag auswählen.</div>`:""}
  </article>`;
}
function legacyTripleHtml(x){
  const p=x.payload||{};
  const d=normalizeTripleItem(p.damals,"damals"),f=normalizeTripleItem(p.fortschritt,"fortschritt"),h=normalizeTripleItem(p.heute,"heute");
  return `<article class="triple-draft-card">
    <div class="submission-meta">${esc(tripleDraftStatusLabel(x.status))} · ${esc(new Date(x.created_at).toLocaleString("de-DE"))} · für ${esc(fmtDateShort(x.draft_date))}</div>
    <div class="triple-draft-source">${esc(x.source_label||"Automatischer Entwurf")}</div>
    <div class="triple-grid triple-grid-drafts">
      <div class="triple-slot"><div class="slot-label">🕰️ WAS WAR...</div><h4>${esc(d.title||"Ohne Überschrift")}</h4><p>${esc(d.summary)}</p></div>
      <div class="triple-slot"><div class="slot-label">🚀 ${esc(f.category)}</div><h4>${esc(f.title||"Ohne Überschrift")}</h4><p>${esc(f.summary)}</p></div>
      <div class="triple-slot"><div class="slot-label">❤️ ${esc(h.category)}</div><h4>${esc(h.title||"Ohne Überschrift")}</h4><p>${esc(h.summary)}</p></div>
    </div>
    <div class="submission-actions">
      ${x.status!=="imported"?`<button class="primary import-triple" data-id="${x.id}">Als 3 Entwürfe übernehmen</button>`:""}
      ${x.status==="new"?`<button class="secondary reject-triple" data-id="${x.id}">Ablehnen</button>`:""}
    </div>
  </article>`;
}
function renderTripleDrafts(){
  const root=$("tripleDraftList");if(!root)return;
  const filter=$("tripleDraftStatus")?.value||"new";
  const rows=tripleDrafts.filter(x=>filter==="all"||x.status===filter);
  root.innerHTML=rows.map(x=>isCandidateBatch(x.payload)?batchDraftHtml(x):legacyTripleHtml(x)).join("")||'<p class="muted">Hier gibt es aktuell keine Entwürfe.</p>';

  root.querySelectorAll('.candidate-card input[type="radio"]').forEach(input=>input.addEventListener("change",()=>{
    const card=input.closest(".candidate-batch-card");
    card?.querySelectorAll("[data-candidate-card]").forEach(c=>c.classList.toggle("selected",Boolean(c.querySelector("input:checked"))));
    updateBatchSelectionState(input.dataset.batchId);
  }));
  root.querySelectorAll(".import-selected-batch").forEach(b=>b.onclick=()=>importCandidateBatch(b.dataset.id));
  root.querySelectorAll(".import-triple").forEach(b=>b.onclick=()=>importTripleDraft(b.dataset.id));
  root.querySelectorAll(".reject-triple").forEach(b=>b.onclick=()=>setTripleDraftStatus(b.dataset.id,"rejected"));
}
function updateBatchSelectionState(id){
  const x=tripleDrafts.find(v=>String(v.id)===String(id));if(!x||!isCandidateBatch(x.payload))return;
  const card=document.querySelector(`[data-batch-card="${CSS.escape(String(id))}"]`);if(!card)return;
  const groups=x.payload.groups||[];
  const complete=groups.every(g=>card.querySelector(`input[name="batch-${CSS.escape(String(id))}-${CSS.escape(g.key)}"]:checked`));
  const btn=card.querySelector(".import-selected-batch");
  if(btn)btn.disabled=!complete;
  const note=card.querySelector("[data-selection-note]");
  if(note)note.textContent=complete?"Auswahl komplett – diese drei Beiträge können übernommen werden.":"Bitte aus jeder Rubrik einen Vorschlag auswählen.";
}
$("tripleDraftStatus")?.addEventListener("change",renderTripleDrafts);

async function setTripleDraftStatus(id,status){
  const {error}=await db.from("triple_drafts").update({status,reviewed_at:new Date().toISOString()}).eq("id",id);
  if(error)return alert(error.message);
  await loadTripleDrafts();
}

function rowFromCandidate(x,group,raw,index){
  const canonicalCategory=categoryBucket({category:group.category});
  const n=normalizeCandidateItem(raw,canonicalCategory);
  const isMorning=x.payload?.batch_type!=="evening";
  const baseHour=isMorning?8:19;
  const time=`${String(baseHour).padStart(2,"0")}:0${index}`;
  const localDateTime=`${x.draft_date}T${time}:00`;
  return {
    published_date:x.draft_date,
    published_time:time,
    publish_at:new Date(localDateTime).toISOString(),
    category:canonicalCategory,
    story_key:null,
    title:n.title,
    summary:n.summary,
    context_text:n.context_text,
    status:"draft",
    priority:"normal",
    priority_rank:0,
    image_url:n.image_url,
    image_path:null,
    image_credit:n.image_credit,
    image_license:n.image_license,
    image_source_url:n.image_source_url,
    image_kind:n.image_kind,
    image_fit:"cover",
    image_zoom:1,
    image_x:50,
    image_y:50,
    sources:n.sources,
    daily_slot:canonicalCategory==="Was war...."?"damals":"none",
    years_ago:n.years_ago,
    feel_good_text:null,
    updated_at:new Date().toISOString()
  };
}

async function importCandidateBatch(id){
  const x=tripleDrafts.find(v=>String(v.id)===String(id));if(!x||!isCandidateBatch(x.payload))return;
  const card=document.querySelector(`[data-batch-card="${CSS.escape(String(id))}"]`);
  if(!card)return;
  const selected=[];
  for(const group of x.payload.groups){
    const checked=card.querySelector(`input[name="batch-${CSS.escape(String(id))}-${CSS.escape(group.key)}"]:checked`);
    if(!checked)return alert("Bitte aus jeder Rubrik genau einen Vorschlag auswählen.");
    const raw=group.candidates?.[Number(checked.value)];
    selected.push([group,raw]);
  }
  const rows=selected.map(([group,raw],index)=>rowFromCandidate(x,group,raw,index));
  if(rows.some(r=>!r.title||!r.summary||!r.sources.length))return alert("Mindestens ein ausgewählter Vorschlag ist unvollständig. Überschrift, Text und mindestens eine Quelle sind erforderlich.");
  for(const row of rows) row.image_url=await resolveDisplayImageUrl(row.image_url);
  const {error}=await db.from("news").insert(rows);
  if(error)return alert("Auswahl konnte nicht übernommen werden: "+error.message);
  await db.from("triple_drafts").update({status:"imported",reviewed_at:new Date().toISOString()}).eq("id",id);
  await Promise.all([loadTripleDrafts(),loadAdminNews()]);
  switchAdminTab("manage");
}

async function importTripleDraft(id){
  const x=tripleDrafts.find(v=>String(v.id)===String(id));if(!x)return;
  const p=x.payload||{};
  const slots=[["damals",p.damals],["fortschritt",p.fortschritt],["heute",p.heute]];
  const times={damals:"08:00",fortschritt:"08:01",heute:"08:02"};
  const rows=slots.map(([slot,raw])=>{
    const n=normalizeTripleItem(raw,slot);
    const localDateTime=`${x.draft_date}T${times[slot]}:00`;
    return {
      published_date:x.draft_date,published_time:times[slot],publish_at:new Date(localDateTime).toISOString(),
      category:n.category,story_key:null,title:n.title,summary:n.summary,context_text:n.context_text,
      status:"draft",priority:"normal",priority_rank:0,image_url:n.image_url,image_path:null,image_credit:n.image_credit,
      image_license:n.image_license,image_source_url:n.image_source_url,image_kind:n.image_kind,
      image_fit:"cover",image_zoom:1,image_x:50,image_y:50,
      sources:n.sources,daily_slot:slot==="damals"?"damals":"none",years_ago:n.years_ago,feel_good_text:null,
      updated_at:new Date().toISOString()
    };
  });
  if(rows.some(r=>!r.title||!r.summary||!r.sources.length))return alert("Dieser Dreier ist unvollständig. Jede Meldung braucht Überschrift, Text und mindestens eine Quelle.");
  for(const row of rows) row.image_url=await resolveDisplayImageUrl(row.image_url);
  const {error}=await db.from("news").insert(rows);
  if(error)return alert("Dreier konnte nicht übernommen werden: "+error.message);
  await db.from("triple_drafts").update({status:"imported",reviewed_at:new Date().toISOString()}).eq("id",id);
  await Promise.all([loadTripleDrafts(),loadAdminNews()]);
  switchAdminTab("manage");
}

// Letzten Tab-Wrapper um den Dreier-Bereich erweitern.
const __switchAdminTabTriple=switchAdminTab;
switchAdminTab=function(name){
  __switchAdminTabTriple(name);
  if(name==="triple-drafts")loadTripleDrafts();
};


// Impressum & Datenschutz

$("legalBtn")?.addEventListener("click",()=>{
  // Das Hauptmenü ist kein <dialog>. Deshalb die vorhandene Menüfunktion nutzen
  // und das Rechtliches-Fenster anschließend direkt als modalen Dialog öffnen.
  closeMainMenu();
  const legalDialog=$("legalDialog");
  if(legalDialog && !legalDialog.open) legalDialog.showModal();
  // Beim erneuten Öffnen immer am Anfang beginnen. Native Dialoge behalten sonst
  // auf manchen mobilen Browsern die alte Scrollposition bei.
  requestAnimationFrame(()=>{
    const scroll=legalDialog?.querySelector(".legal-scroll");
    if(scroll) scroll.scrollTop=0;
  });
});
document.querySelectorAll("[data-legal-tab]").forEach(btn=>btn.addEventListener("click",()=>{
  const key=btn.dataset.legalTab;
  document.querySelectorAll("[data-legal-tab]").forEach(x=>x.classList.toggle("active",x===btn));
  document.querySelectorAll("[data-legal-panel]").forEach(x=>x.classList.toggle("active",x.dataset.legalPanel===key));
  // Impressum und Datenschutz sind unterschiedlich lang. Beim Wechsel deshalb
  // die gemeinsame Scrollposition zurücksetzen, damit kein Text oben fehlt.
  const scroll=$("legalDialog")?.querySelector(".legal-scroll");
  if(scroll) scroll.scrollTop=0;
}));


// --- Push-Benachrichtigungen ---
const PUSH_PUBLIC_KEY = "BK3FtoZHXCmal9ul6LE0mneb_JN-gZh9udlFO5UKThwxxHPYrKP5UsPIi804PZgYIhwq44RCrLVgWxXXbYLY91Q"; // Vor echtem Versand einmalig mit dem öffentlichen VAPID-Schlüssel befüllen.

function pushSupported(){
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}
function urlBase64ToUint8Array(base64String){
  const padding="=".repeat((4-base64String.length%4)%4);
  const base64=(base64String+padding).replace(/-/g,"+").replace(/_/g,"/");
  const rawData=atob(base64);
  return Uint8Array.from([...rawData].map(ch=>ch.charCodeAt(0)));
}
async function getPushSubscription(){
  if(!pushSupported()) return null;
  const reg=await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}
const PUSH_DEVICE_KEY_STORAGE="goodnews_push_device_key";
function getPushDeviceKey(){
  let key=localStorage.getItem(PUSH_DEVICE_KEY_STORAGE);
  if(!key){
    key=(window.crypto?.randomUUID?.()||`gn-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    localStorage.setItem(PUSH_DEVICE_KEY_STORAGE,key);
  }
  return key;
}
async function savePushSubscription(sub,prefs=userPrefs){
  if(!sub) return;
  const j=sub.toJSON();
  const {data:{session}}=await db.auth.getSession();
  const user=session?.user||null;
  const categories=Array.isArray(prefs?.notifyCategories)?prefs.notifyCategories.map(migrateNotifyCategoryLabel).filter(x=>GOOD_NEWS_CATEGORIES.includes(x)):[...GOOD_NEWS_CATEGORIES];
  const deviceKey=getPushDeviceKey();
  const payload={
    user_id:user?.id||null,
    device_key:deviceKey,
    endpoint:j.endpoint,
    p256dh:j.keys?.p256dh||"",
    auth:j.keys?.auth||"",
    enabled:true,
    notify_morning:prefs?.notifyMorning!==false,
    notify_evening:prefs?.notifyEvening!==false,
    notify_categories:categories,
    updated_at:new Date().toISOString()
  };
  const {error}=await db.from("push_subscriptions").upsert(payload,{onConflict:"endpoint"});
  if(error) throw error;
  // Falls sich der Browser-/PWA-Push-Endpunkt auf derselben Installation ändert,
  // bleibt nur der aktuelle Endpunkt aktiv. Andere Geräte behalten ihre eigene device_key.
  if(user?.id && deviceKey){
    await db.from("push_subscriptions")
      .delete()
      .eq("user_id",user.id)
      .eq("device_key",deviceKey)
      .neq("endpoint",j.endpoint);
  }
}
async function enablePush(prefs=userPrefs){
  if(!pushSupported()) throw new Error("Push-Benachrichtigungen werden von diesem Browser nicht unterstützt.");
  if(!PUSH_PUBLIC_KEY) throw new Error("Push ist vorbereitet, aber der Versand-Schlüssel muss vor dem öffentlichen Release noch eingerichtet werden.");
  const permission=await Notification.requestPermission();
  if(permission!=="granted") throw new Error("Benachrichtigungen wurden nicht erlaubt.");
  const reg=await navigator.serviceWorker.ready;
  let sub=await reg.pushManager.getSubscription();
  if(!sub) sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:urlBase64ToUint8Array(PUSH_PUBLIC_KEY)});
  await savePushSubscription(sub,prefs);
  return true;
}
async function disablePush(){
  const sub=await getPushSubscription();
  if(sub){
    await db.from("push_subscriptions").delete().eq("endpoint",sub.endpoint);
    await sub.unsubscribe();
  }
  return true;
}
async function reconcilePushPreference(){
  const input=$("prefNotifications");
  if(!input)return;
  try{
    const sub=await getPushSubscription();
    const reallyEnabled=Boolean(sub && Notification.permission==="granted");
    localStorage.setItem("goodnews_push_enabled",reallyEnabled?"1":"0");
    // Eine gespeicherte Aktivierung ohne Browser-Abo kann z. B. nach Löschen der
    // Browserdaten entstehen. Dann zeigen wir beim nächsten Öffnen den echten Zustand.
    if(userPrefs.notifications&&!reallyEnabled){
      userPrefs.notifications=false;
      saveUserPreferences({...userPrefs,notifications:false});
      if(!userPreferencesDialog.open){input.checked=false;updateNotificationPreferencesVisibility();}
    }else if(reallyEnabled){
      // Filterwerte bestehender Abos bei jedem Start auf den aktuellen Stand bringen.
      await savePushSubscription(sub,userPrefs).catch(()=>{});
    }
  }catch{}
}
window.addEventListener("DOMContentLoaded",reconcilePushPreference);


// Admin-Test für echten Web Push

async function sendAdminTestPush(){
  const msg=$("pushAdminMessage");
  if(msg) msg.textContent="Test-Push wird vorbereitet …";
  try{
    const sub=await getPushSubscription();
    if(!sub){
      throw new Error("Auf diesem Gerät gibt es noch kein Push-Abo. Öffne Einstellungen und aktiviere Benachrichtigungen erneut.");
    }
    await savePushSubscription(sub);
    const {data,error}=await db.functions.invoke("send-good-news-push",{
      body:{
        mode:"test",
        title:"Good News",
        body:"🎉 Dein Good-News-Push funktioniert!"
      }
    });
    if(error) throw error;
    if(!data?.sent){
      throw new Error(data?.message==="No active subscriptions"
        ?"Für dieses Konto wurde noch kein aktives Push-Abo gefunden."
        :(data?.error||"Der Test-Push konnte nicht versendet werden."));
    }
    if(msg) msg.textContent="Test-Push wurde gesendet. Schau jetzt in deine Benachrichtigungen. ✅";
  }catch(err){
    if(msg) msg.textContent=err?.message||String(err);
  }
}
if($("sendTestPushBtn")){
  $("sendTestPushBtn").addEventListener("click",sendAdminTestPush);
}


// ---------------- GOOD NEWS 3.2: OFFLINE-/FEHLERZUSTÄNDE + ADMIN-TESTS ----------------
const ERROR_TEST_KEY="goodNewsErrorTestMode";
let errorTestMode=localStorage.getItem(ERROR_TEST_KEY)||"normal";
function errorBackdrop(){return allNews.find(n=>n.image_url)?.image_url||"date-slide-background-v2.png"}
function renderFriendlyError(kind){
  const states={
    offline:["📴","Kurz offline 🌿","Sobald du wieder verbunden bist, sind die Good News wieder für dich da."],
    server:["☕","Die Good News machen gerade eine kurze Pause","Die Verbindung konnte nicht hergestellt werden. Versuch es gleich noch einmal."],
    empty:["🌱","Für diesen Tag haben wir noch keine Good News","Schau später noch einmal vorbei oder öffne einen anderen Tag."],
    slow:["⏳","Good News sind unterwegs …","Die Verbindung ist gerade etwas langsam. Einen kleinen Moment noch."],
  };
  const s=states[kind]||states.server;
  feed.innerHTML=`<section class="error-state-slide ${kind==='slow'?'simulated-slow':''}"><img src="${esc(errorBackdrop())}" alt="" aria-hidden="true"><div class="error-state-copy"><div class="error-icon">${s[0]}</div><h1>${s[1]}</h1><p>${s[2]}</p>${kind==='empty'?'<button class="secondary" id="errorBackBtn">Zum letzten Tag mit Nachrichten</button>':'<button class="secondary" id="errorRetryBtn">Erneut versuchen</button>'}</div></section>`;
  $("errorRetryBtn")?.addEventListener("click",()=>{setErrorTestMode("normal");fetchPublicNews()});
  $("errorBackBtn")?.addEventListener("click",()=>{setErrorTestMode("normal");renderFeed()});
}
function simulateImageError(){
  renderFeed();
  const slide=feed.querySelector(".slide.has-image");
  if(!slide){renderFriendlyError("server");return}
  slide.classList.add("image-load-error");
  const note=document.createElement("div");note.className="image-error-note";note.textContent="Bild konnte gerade nicht geladen werden.";slide.appendChild(note);
  slide.scrollIntoView({block:"start"});
}
function showConnectionBanner(text){
  let b=$("connectionBanner");
  if(!b){b=document.createElement("div");b.id="connectionBanner";b.className="connection-banner";document.body.appendChild(b)}
  b.textContent=text;b.hidden=false;
}
function hideConnectionBanner(){const b=$("connectionBanner");if(b)b.hidden=true}
function setErrorTestMode(mode){
  errorTestMode=mode||"normal";localStorage.setItem(ERROR_TEST_KEY,errorTestMode);
  const msg=$("errorTestMessage");if(msg)msg.textContent=errorTestMode==="normal"?"Normalzustand ist wieder aktiv.":"Testmodus aktiv: "+errorTestMode+". Nur auf diesem Gerät.";
  hideConnectionBanner();
  if(errorTestMode==="normal"){renderFeed();return}
  if(errorTestMode==="image"){simulateImageError();return}
  if(errorTestMode==="action"){renderFeed();showConnectionBanner("Das hat gerade nicht geklappt. Versuch es bitte noch einmal.");setTimeout(hideConnectionBanner,4500);return}
  renderFriendlyError(errorTestMode);
}
document.querySelectorAll(".error-test-btn").forEach(btn=>btn.addEventListener("click",()=>setErrorTestMode(btn.dataset.errorTest)));
window.addEventListener("offline",()=>{showConnectionBanner("Offline – gespeicherte Good News werden angezeigt");if(!allNews.length)renderFriendlyError("offline")});
window.addEventListener("online",()=>{hideConnectionBanner();if(errorTestMode==="normal")fetchPublicNews()});
if(!navigator.onLine)showConnectionBanner("Offline – gespeicherte Good News werden angezeigt");

// Der Testmodus greift auch nach einem Neuladen – ausschließlich lokal im Admin-Gerät.
if(errorTestMode!=="normal")setTimeout(()=>setErrorTestMode(errorTestMode),250);


// ---------------- GOOD NEWS 4.0: DSGVO SELBSTAUSKUNFT + ADMIN-AUSKUNFT ----------------
let myPrivacyExportCache=null;
let adminPrivacyExportCache=null;

function localPrivacySnapshot(){
  return {
    generated_at:new Date().toISOString(),
    preferences:{...userPrefs},
    favorites:getFavorites(),
    push_enabled_local:localStorage.getItem("goodnews_push_enabled")==="1",
    analytics:{
      enabled:Boolean(userPrefs.analytics),
      local_device_id:userPrefs.analytics ? (localStorage.getItem("goodNewsDeviceId")||null) : null
    }
  };
}

async function invokePrivacyFunction(body){
  if(!configured || !db) throw new Error("Die Kontofunktionen sind derzeit nicht verbunden.");
  const {data,error}=await db.functions.invoke("good-news-privacy",{body});
  if(error){
    let message=error.message||"Die Anfrage konnte nicht ausgeführt werden.";
    try{
      if(error.context && typeof error.context.clone==="function"){
        const payload=await error.context.clone().json();
        if(payload?.error) message=payload.error;
      }
    }catch{}
    throw new Error(message);
  }
  if(!data?.ok) throw new Error(data?.error||"Die Anfrage konnte nicht ausgeführt werden.");
  return data.data||data;
}

function privacyExportBundle(serverData, includeLocal=false){
  return {
    service:"Good News",
    export_type:includeLocal?"Selbstauskunft":"Admin-Auskunft",
    generated_at:new Date().toISOString(),
    server_data:serverData,
    ...(includeLocal?{local_device_data:localPrivacySnapshot()}:{}),
    explanation:{
      local_data:"Favoriten und App-Einstellungen werden lokal auf dem jeweiligen Gerät gespeichert und sind nur in einer Selbstauskunft auf diesem Gerät enthalten.",
      analytics:"Die optionale Nutzungsstatistik wird nicht mit dem Benutzerkonto verknüpft.",
      submissions:"Lesereinsendungen besitzen derzeit keine Benutzerkonto-ID und können nicht automatisch einem Konto zugeordnet werden."
    }
  };
}

function downloadJsonFile(filename,data){
  const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json;charset=utf-8"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;
  a.download=filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

function fmtPrivacyDate(value){
  if(!value)return "–";
  try{return new Intl.DateTimeFormat("de-DE",{dateStyle:"medium",timeStyle:"short"}).format(new Date(value));}
  catch{return String(value);}
}

function renderPrivacyExport(target,data,{showEmail=true,localData=null}={}){
  if(!target)return;
  const account=data?.account||{};
  const roles=Array.isArray(data?.roles)?data.roles:[];
  const pushes=Array.isArray(data?.push_subscriptions)?data.push_subscriptions:[];
  const reports=Array.isArray(data?.news_reports)?data.news_reports:[];
  const notes=Array.isArray(data?.notes)?data.notes:[];
  const reportRows=reports.length
    ? `<ul class="privacy-compact-list">${reports.map(r=>`<li><strong>Fehlermeldung #${esc(r.id)}</strong> · Meldung ${esc(r.news_id)} · ${esc(r.report_type||"")}<br><span class="muted">${esc(fmtPrivacyDate(r.created_at))}${r.comment?` · ${esc(r.comment)}`:""}</span></li>`).join("")}</ul>`
    : `<p class="muted">Keine deinem Konto zugeordneten Fehlermeldungen.</p>`;
  const pushRows=pushes.length
    ? `<ul class="privacy-compact-list">${pushes.map(p=>{
        const times=[p.notify_morning!==false?"morgens":null,p.notify_evening!==false?"abends":null].filter(Boolean).join(" & ")||"keine Zeit ausgewählt";
        const cats=Array.isArray(p.notify_categories)&&p.notify_categories.length?p.notify_categories.join(", "):"keine Kategorie ausgewählt";
        return `<li><strong>Push-Abo #${esc(p.id)}</strong> · ${p.enabled?"aktiv":"inaktiv"}<br><span class="muted">${esc(times)} · ${esc(cats)}<br>angelegt ${esc(fmtPrivacyDate(p.created_at))}</span></li>`;
      }).join("")}</ul>`
    : `<p class="muted">Keine Push-Abonnements gespeichert.</p>`;
  target.innerHTML=`
    <div class="privacy-summary-grid">
      ${showEmail?`<div><span>E-Mail</span><strong>${esc(account.email||"–")}</strong></div>`:""}
      <div><span>Konto-ID</span><strong class="privacy-mono">${esc(account.id||"–")}</strong></div>
      <div><span>Konto erstellt</span><strong>${esc(fmtPrivacyDate(account.created_at))}</strong></div>
      <div><span>Letzte Anmeldung</span><strong>${esc(fmtPrivacyDate(account.last_sign_in_at))}</strong></div>
      <div><span>Rolle</span><strong>${esc(roles.map(r=>r.role).join(", ")||"Nutzer")}</strong></div>
      <div><span>Push-Abos</span><strong>${pushes.length}</strong></div>
      <div><span>Fehlermeldungen</span><strong>${reports.length}</strong></div>
      ${localData?`<div><span>Lokale Favoriten</span><strong>${Array.isArray(localData.favorites)?localData.favorites.length:0}</strong></div>`:""}
    </div>
    <details><summary>Push-Abonnements</summary>${pushRows}</details>
    <details><summary>Fehlermeldungen</summary>${reportRows}</details>
    ${localData?`<details><summary>Lokale App-Daten auf diesem Gerät</summary><pre class="privacy-json-preview">${esc(JSON.stringify(localData,null,2))}</pre></details>`:""}
    ${notes.length?`<div class="privacy-note-list">${notes.map(n=>`<p>ℹ️ ${esc(n)}</p>`).join("")}</div>`:""}
  `;
  target.hidden=false;
}

async function loadMyPrivacyData(){
  const msg=$("myDataMessage");
  const result=$("myDataResult");
  const download=$("downloadMyDataBtn");
  if(msg)msg.textContent="Daten werden zusammengestellt …";
  if(result)result.hidden=true;
  if(download)download.hidden=true;
  try{
    const serverData=await invokePrivacyFunction({mode:"self_export"});
    myPrivacyExportCache=privacyExportBundle(serverData,true);
    renderPrivacyExport(result,serverData,{localData:myPrivacyExportCache.local_device_data});
    if(download)download.hidden=false;
    if(msg)msg.textContent="Deine Daten sind bereit.";
  }catch(err){
    if(msg)msg.textContent=err?.message||String(err);
  }
}

$("loadMyDataBtn")?.addEventListener("click",loadMyPrivacyData);
$("downloadMyDataBtn")?.addEventListener("click",()=>{
  if(!myPrivacyExportCache)return;
  const stamp=new Date().toISOString().slice(0,10);
  downloadJsonFile(`good-news-datenauskunft-${stamp}.json`,myPrivacyExportCache);
});

async function clearGoodNewsLocalAccountData(){
  const keys=[USER_PREFS_KEY,"goodNewsFavorites","goodNewsDeviceId","goodNewsAnalyticsActiveDay","goodnews_push_enabled",PUBLIC_FEED_CACHE_KEY,"goodNewsQuickActionsOpen"];
  keys.forEach(k=>{try{localStorage.removeItem(k)}catch{}});
  try{
    const sub=await getPushSubscription();
    if(sub)await sub.unsubscribe();
  }catch{}
}

$("deleteMyAccountBtn")?.addEventListener("click",async()=>{
  const msg=$("myDataMessage");
  if(!confirm("Möchtest du dein Good-News-Konto und die damit verknüpften Serverdaten wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden."))return;
  const phrase=prompt('Zur Bestätigung bitte LÖSCHEN eingeben:');
  if(phrase!=="LÖSCHEN"){
    if(msg)msg.textContent="Löschung abgebrochen.";
    return;
  }
  if(msg)msg.textContent="Konto wird gelöscht …";
  try{
    await invokePrivacyFunction({mode:"self_delete",confirm:"LÖSCHEN"});
    await clearGoodNewsLocalAccountData();
    try{await db.auth.signOut()}catch{}
    alert("Dein Good-News-Konto und die direkt zugeordneten Serverdaten wurden gelöscht.");
    location.reload();
  }catch(err){
    if(msg)msg.textContent=err?.message||String(err);
  }
});

$("privacyAdminForm")?.addEventListener("submit",async(e)=>{
  e.preventDefault();
  const email=$("privacyAdminEmail")?.value.trim();
  const msg=$("privacyAdminMessage");
  const result=$("privacyAdminResult");
  const download=$("privacyAdminDownloadBtn");
  if(!email)return;
  if(msg)msg.textContent="Nutzerdaten werden gesucht …";
  if(result)result.hidden=true;
  if(download)download.hidden=true;
  try{
    const serverData=await invokePrivacyFunction({mode:"admin_lookup",email});
    adminPrivacyExportCache=privacyExportBundle(serverData,false);
    renderPrivacyExport(result,serverData,{showEmail:true});
    if(download)download.hidden=false;
    if(msg)msg.textContent="Auskunft zusammengestellt.";
  }catch(err){
    adminPrivacyExportCache=null;
    if(msg)msg.textContent=err?.message||String(err);
  }
});

$("privacyAdminDownloadBtn")?.addEventListener("click",()=>{
  if(!adminPrivacyExportCache)return;
  const email=String(adminPrivacyExportCache?.server_data?.account?.email||"nutzer").replace(/[^a-z0-9._-]+/gi,"-");
  const stamp=new Date().toISOString().slice(0,10);
  downloadJsonFile(`good-news-dsgvo-${email}-${stamp}.json`,adminPrivacyExportCache);
});

