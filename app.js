const cfg = window.APP_CONFIG || {};
const configured = Boolean(
  cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY &&
  !cfg.SUPABASE_URL.includes("DEINE_") &&
  !cfg.SUPABASE_ANON_KEY.includes("DEIN_")
);
const db = configured ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;

const $ = (id) => document.getElementById(id);
const feed = $("feed");
const readerDialog = $("readerDialog");
const adminDialog = $("adminDialog");
const previewDialog = $("previewDialog");

let allNews = [];
let adminNews = [];
let activeCategory = "Alle";
let currentAdminSession = null;

const esc = (value="") => String(value).replace(/[&<>"']/g, c => ({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
})[c]);

const fmtDate = (iso) => new Intl.DateTimeFormat("de-DE", {
  weekday:"long", day:"2-digit", month:"long", year:"numeric"
}).format(new Date(`${iso}T12:00:00`));

const fmtDateShort = (iso) => new Intl.DateTimeFormat("de-DE", {
  day:"2-digit", month:"2-digit", year:"numeric"
}).format(new Date(`${iso}T12:00:00`));

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
let reactionCounts = {};
let myReactions = {};
async function loadReactions(){
  if(!configured || !allNews.length) return;
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

function setupState() {
  feed.innerHTML = `<section class="empty-state"><div>
    <h1>Fast fertig.</h1>
    <p>Diese Version ist noch nicht mit Supabase verbunden. Öffne <b>config.js</b> und trage deine Project URL und deinen Publishable/anon Key ein.</p>
  </div></section>`;
}

async function fetchPublicNews() {
  if (!configured) return setupState();
  const nowIso = new Date().toISOString();
  const { data, error } = await db
    .from("news")
    .select("*")
    .eq("status","published")
    .lte("publish_at", nowIso)
    .order("priority_rank",{ascending:false})
    .order("publish_at",{ascending:false});
  if (error) return showFeedError(error.message);
  allNews = data || [];
  await loadReactions();
  const deepId = new URL(location.href).searchParams.get("news");
  renderFeed({startId:deepId});
}

function showFeedError(message) {
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
function buildDateSlide(s){let today=isoLocal(new Date()),past=s<today,d=new Date(`${s}T12:00:00`),wd=new Intl.DateTimeFormat("de-DE",{weekday:"long"}).format(d).toUpperCase(),dm=new Intl.DateTimeFormat("de-DE",{day:"2-digit",month:"long"}).format(d),sp=specialDayFor(s),sec=document.createElement("section");sec.className=`date-slide${past?" past":""}`;sec.innerHTML=`<div class="date-slide-logo-wrap"><img class="date-slide-logo" src="good-news-logo.png" alt="Good News"></div><div class="date-slide-bottom"><div class="date-slide-weekday">${esc(wd)}</div><div class="date-slide-date">${esc(dm)}</div><div class="date-slide-year">${d.getFullYear()}</div>${sp?`<div class="date-slide-special"><span>HEUTE IST</span><strong>${esc(sp[0])} ${esc(sp[1])}</strong></div>`:""}<div class="date-slide-hint">↓ Zu den Good News</div></div>`;return sec}

function renderFeed({startId=null}={}) {
  const data = activeCategory === "Alle" ? allNews : allNews.filter(n => n.category === activeCategory);
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
  if (startId) setTimeout(() => scrollToNews(startId), 30);
}

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

function buildSlide(item, index, total) {
  const article = document.createElement("article");
  article.className = `slide${item.image_url ? " has-image" : ""}`;
  article.dataset.id = item.id;

  const primarySource = sourcesOf(item)[0];
  const fav = isFavorite(item.id);

  article.innerHTML = `
    ${item.image_url ? `<img class="slide-bg-blur" src="${esc(item.image_url)}" alt="" aria-hidden="true"><img class="slide-bg" src="${esc(item.image_url)}" alt="" style="${imageStyleOf(item)}">` : ""}
    <div class="slide-inner">
      <div class="topline">
        <span class="pill">${esc(item.category)}</span>
        ${item.priority === "top" ? `<span class="pill top-pill">Topmeldung</span>` : ""}
        <span class="pill">${esc(fmtDateShort(item.published_date))} · ${esc(item.published_time?.slice(0,5) || "")}</span>
      </div>
      <h1>${esc(item.title)}</h1>
      <p class="summary">${esc(item.summary)}</p>

      ${item.context_text ? `<div class="context-box"><strong>Kurz erklärt</strong>${esc(item.context_text)}</div>` : ""}
      ${item.feel_good_text ? `<div class="feel-good-box"><strong>💛 Darum macht das Freude</strong>${esc(item.feel_good_text)}</div>` : ""}

      <div class="slide-actions">
        <button class="slide-action fav-btn ${fav ? "active":""}" data-id="${item.id}">${fav ? "♥ Gespeichert" : "♡ Merken"}</button>
        <button class="slide-action share-btn" data-id="${item.id}">↗ Teilen</button>
      </div>

      ${item.image_credit ? (
        primarySource?.url
          ? `<a class="credit quiet-link" href="${esc(primarySource.url)}" target="_blank" rel="noopener noreferrer">${esc(item.image_credit)}</a>`
          : `<div class="credit">${esc(item.image_credit)}</div>`
      ) : ""}
      <div class="source-line source-line-simple">
        ${primarySource
          ? `<a class="quiet-link" href="${esc(primarySource.url)}" target="_blank" rel="noopener noreferrer">Quelle: ${esc(primarySource.name)}</a>`
          : `<span>Good News</span>`}
      </div>
    </div>`;
  article.querySelector(".fav-btn").onclick = (e) => {
    const active = toggleFavorite(item.id);
    e.currentTarget.classList.toggle("active",active);
    e.currentTarget.textContent = active ? "♥ Gespeichert" : "♡ Merken";
  };
  article.querySelector(".share-btn").onclick = () => shareItem(item);
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
    if (navigator.share) await navigator.share({title:item.title,text,url:url.toString()});
    else {
      await navigator.clipboard.writeText(`${text}\n\n${url}`);
      alert("Good News und Direktlink wurden kopiert.");
    }
  } catch {}
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
  const categories = ["Alle",...new Set(allNews.map(n=>n.category))];
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
      const catOk = activeCategory === "Alle" || n.category === activeCategory;
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

$("searchBtn").onclick = openSearch;
$("archiveBtn").onclick = openArchive;
$("favoritesBtn").onclick = openFavorites;
$("homeBtn").onclick = () => feed.scrollTo({top:0,behavior:"smooth"});
document.querySelectorAll("[data-close]").forEach(b=>b.onclick=()=>$(b.dataset.close).close());
feed.addEventListener("scroll",()=>{if(feed.scrollTop>100)$("swipeHint").style.display="none"},{passive:true});

// ---------------- ADMIN ----------------
function switchAdminTab(name) {
  localStorage.setItem("goodNewsAdminTab", name);
  document.querySelectorAll(".tab").forEach(t=>t.classList.toggle("active",t.dataset.tab===name));
  document.querySelectorAll(".tab-panel").forEach(p=>p.hidden = p.id !== `tab-${name}`);
  if(name==="dashboard") renderDashboard();
  if(name==="manage") renderAdminList();
}
document.querySelectorAll(".tab").forEach(t=>t.onclick=()=>switchAdminTab(t.dataset.tab));

$("adminBtn").onclick = async () => {
  adminDialog.showModal();
  await refreshAuth();
};

async function refreshAuth() {
  if (!configured) {
    $("loginView").hidden=false;$("adminView").hidden=true;
    $("loginMessage").textContent="Zuerst Supabase in config.js verbinden.";
    return;
  }
  const {data:{session}} = await db.auth.getSession();
  currentAdminSession=session;
  $("loginView").hidden=!!session;
  $("adminView").hidden=!session;
  if(session){
    $("whoAmI").textContent=session.user.email||"Redaktion";
    await loadAdminNews();
    await loadSubmissions();
    await loadAppSettings();
    const lastTab = localStorage.getItem("goodNewsAdminTab") || "dashboard";
    switchAdminTab(lastTab);
  }
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
  const slots=[['damals','🕰️ DAMALS'],['fortschritt','🚀 FORTSCHRITT'],['heute','❤️ HEUTE']];
  const triple=slots.map(([key,label])=>{const n=todayItems.find(x=>x.daily_slot===key);return `<div class="triple-slot ${n?'':'missing'}"><div class="slot-label">${label}</div>${n?`<h4>${esc(n.title)}</h4><div class="muted">${n.status==='published'?'Veröffentlicht':'Entwurf'}</div>`:`<div class="muted">Noch nicht besetzt</div>`}</div>`}).join('');
  $("todayList").innerHTML=`<div class="triple-grid">${triple}</div>`+(todayItems.length?todayItems.map(adminItemHtml).join(""):`<p class="muted">Für heute gibt es noch keine Beiträge.</p>`);
  bindAdminItemButtons($("todayList"));
}

function adminItemHtml(n){
  return `<article class="admin-item" data-admin-id="${n.id}">
    <div class="admin-item-head">
      <div><h4>${esc(n.title)}</h4><div class="admin-meta">${esc(fmtDateShort(n.published_date))} · ${esc(n.published_time?.slice(0,5)||"")} · ${esc(n.category)}</div></div>
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
  $("newsId").value="";$("existingImagePath").value="";
  $("sourcesEditor").innerHTML="";addSourceRow();
  if($("dailySlot")) $("dailySlot").value="none";
  if($("yearsAgo")) $("yearsAgo").value="";
  if($("feelGoodText")) $("feelGoodText").value="";
  const now=new Date();$("publishedDate").value=now.toISOString().slice(0,10);
  $("publishedTime").value=now.toTimeString().slice(0,5);
  $("status").value="draft";$("priority").value="normal";
  $("saveBtn").textContent="Speichern";$("cancelEditBtn").hidden=true;
  $("imagePreviewBox").hidden=true;$("imagePreview").removeAttribute("src");$("imagePreviewBlur")?.removeAttribute("src"); editorCroppedFile=null; editorOriginalPreviewSrc=null;
  if($("imageFit")) $("imageFit").value="cover"; if($("imageZoom")) $("imageZoom").value="1"; if($("imagePosX")) $("imagePosX").value="50"; if($("imagePosY")) $("imagePosY").value="50";
  applyImageEditorState();
  $("editorMessage").textContent="";
}
$("cancelEditBtn").onclick=()=>{clearEditorDraft();resetEditor();switchAdminTab("dashboard")};

let editorCroppedFile=null;
let editorOriginalPreviewSrc=null;

function setEditorImage(src,{preserveOriginal=true}={}){
  if(!src)return;
  if(preserveOriginal && !editorOriginalPreviewSrc) editorOriginalPreviewSrc=src;
  const main=$("imagePreview"), blur=$("imagePreviewBlur"), cropSource=$("imageCropSource");
  [main,blur,cropSource].forEach(el=>{
    if(!el)return;
    if(!src.startsWith("blob:") && !src.startsWith("data:")) el.crossOrigin="anonymous";
    else el.removeAttribute("crossorigin");
    el.src=src;
  });
  $("imagePreviewBox").hidden=false;
  if(cropSource){
    const ready=()=>{resetCropSelection();applyImageEditorState()};
    if(cropSource.complete&&cropSource.naturalWidth) ready();
    else cropSource.addEventListener("load",ready,{once:true});
  }else applyImageEditorState();
}
function currentImageEditorState(){return {
  image_fit:$("imageFit")?.value||"cover", image_zoom:clampNum($("imageZoom")?.value,0.35,2.5,1),
  image_pos_x:clampNum($("imagePosX")?.value,0,100,50), image_pos_y:clampNum($("imagePosY")?.value,0,100,50)
}}
function applyImageEditorState(){
  if(!$("imagePreview"))return; const v=currentImageEditorState();
  $("imagePreview").style.objectFit=v.image_fit; $("imagePreview").style.objectPosition=`${v.image_pos_x}% ${v.image_pos_y}%`; $("imagePreview").style.transform=`scale(${v.image_zoom})`;
  if($("imageZoomValue")) $("imageZoomValue").textContent=v.image_zoom.toFixed(2).replace(".",",")+"×";
}
["imageFit","imageZoom","imagePosX","imagePosY"].forEach(id=>$(id)?.addEventListener("input",applyImageEditorState));
$("imageFillBtn")?.addEventListener("click",()=>{$("imageFit").value="cover";$("imageZoom").value="1";applyImageEditorState()});
$("imageWholeBtn")?.addEventListener("click",()=>{$("imageFit").value="contain";$("imageZoom").value="1";$("imagePosX").value="50";$("imagePosY").value="50";applyImageEditorState()});
$("imageResetBtn")?.addEventListener("click",()=>{$("imageFit").value="cover";$("imageZoom").value="1";$("imagePosX").value="50";$("imagePosY").value="50";applyImageEditorState()});

// Good News 2.4: frei verschiebbarer Zuschneiderahmen wie in der Handy-Galerie.
const cropper=$("imageCropper"), cropSelection=$("cropSelection");
let cropState={x:0,y:0,w:1,h:1};
let cropGesture=null;
const MIN_CROP=.08;
function cropImageDisplayRect(){
  const img=$("imageCropSource"); if(!cropper||!img?.naturalWidth)return null;
  const r=cropper.getBoundingClientRect(), ar=img.naturalWidth/img.naturalHeight, stageAr=r.width/r.height;
  let w,h,left,top;
  if(ar>stageAr){w=r.width;h=w/ar;left=0;top=(r.height-h)/2}
  else{h=r.height;w=h*ar;top=0;left=(r.width-w)/2}
  return {left,top,width:w,height:h};
}
function clampCropState(c){
  c.w=Math.max(MIN_CROP,Math.min(1,c.w)); c.h=Math.max(MIN_CROP,Math.min(1,c.h));
  c.x=Math.max(0,Math.min(1-c.w,c.x)); c.y=Math.max(0,Math.min(1-c.h,c.y)); return c;
}
function renderCropSelection(){
  if(!cropSelection)return; const d=cropImageDisplayRect(); if(!d)return;
  clampCropState(cropState);
  const l=d.left+cropState.x*d.width,t=d.top+cropState.y*d.height,w=cropState.w*d.width,h=cropState.h*d.height;
  Object.assign(cropSelection.style,{left:l+"px",top:t+"px",width:w+"px",height:h+"px"});
  const stage=cropper.getBoundingClientRect();
  const top=$("cropShadeTop"),right=$("cropShadeRight"),bottom=$("cropShadeBottom"),left=$("cropShadeLeft");
  if(top)Object.assign(top.style,{left:d.left+"px",top:d.top+"px",width:d.width+"px",height:(t-d.top)+"px"});
  if(bottom)Object.assign(bottom.style,{left:d.left+"px",top:(t+h)+"px",width:d.width+"px",height:Math.max(0,d.top+d.height-(t+h))+"px"});
  if(left)Object.assign(left.style,{left:d.left+"px",top:t+"px",width:Math.max(0,l-d.left)+"px",height:h+"px"});
  if(right)Object.assign(right.style,{left:(l+w)+"px",top:t+"px",width:Math.max(0,d.left+d.width-(l+w))+"px",height:h+"px"});
}
function resetCropSelection(){cropState={x:0,y:0,w:1,h:1};requestAnimationFrame(renderCropSelection)}
window.addEventListener("resize",renderCropSelection);
$("cropResetBtn")?.addEventListener("click",resetCropSelection);

cropSelection?.addEventListener("pointerdown",e=>{
  e.preventDefault(); cropSelection.setPointerCapture?.(e.pointerId);
  const handle=e.target?.dataset?.handle||"move";
  cropGesture={pointerId:e.pointerId,handle,startX:e.clientX,startY:e.clientY,start:{...cropState}};
});
cropSelection?.addEventListener("pointermove",e=>{
  if(!cropGesture||cropGesture.pointerId!==e.pointerId)return;
  const d=cropImageDisplayRect();if(!d)return;
  const dx=(e.clientX-cropGesture.startX)/Math.max(1,d.width),dy=(e.clientY-cropGesture.startY)/Math.max(1,d.height);
  const s=cropGesture.start,c={...s},h=cropGesture.handle;
  if(h==="move"){
    c.x=s.x+dx;c.y=s.y+dy;
  }else{
    if(h.includes("w")){const nx=Math.min(s.x+s.w-MIN_CROP,Math.max(0,s.x+dx));c.x=nx;c.w=s.x+s.w-nx}
    if(h.includes("e")){c.w=Math.max(MIN_CROP,Math.min(1-s.x,s.w+dx))}
    if(h.includes("n")){const ny=Math.min(s.y+s.h-MIN_CROP,Math.max(0,s.y+dy));c.y=ny;c.h=s.y+s.h-ny}
    if(h.includes("s")){c.h=Math.max(MIN_CROP,Math.min(1-s.y,s.h+dy))}
  }
  cropState=clampCropState(c);renderCropSelection();
});
function endCropGesture(e){if(cropGesture?.pointerId===e.pointerId)cropGesture=null}
cropSelection?.addEventListener("pointerup",endCropGesture);cropSelection?.addEventListener("pointercancel",endCropGesture);

$("imageFile").onchange=()=>{
  const f=$("imageFile").files?.[0];if(!f)return; editorCroppedFile=null; editorOriginalPreviewSrc=null; setEditorImage(URL.createObjectURL(f));
};
$("imageUrl").oninput=()=>{
  if($("imageFile").files?.[0])return; const url=$("imageUrl").value.trim(); if(url)setEditorImage(url);
};

async function cropVisibleImage(){
  const img=$("imageCropSource");
  if(!img?.src) throw new Error("Bitte zuerst ein Bild auswählen.");
  if(!img.complete) await new Promise((resolve,reject)=>{img.addEventListener("load",resolve,{once:true});img.addEventListener("error",()=>reject(new Error("Bild konnte nicht geladen werden.")),{once:true})});
  const nw=img.naturalWidth,nh=img.naturalHeight;if(!nw||!nh)throw new Error("Die Bildgröße konnte nicht gelesen werden.");
  const sx=Math.round(cropState.x*nw),sy=Math.round(cropState.y*nh),sw=Math.max(1,Math.round(cropState.w*nw)),sh=Math.max(1,Math.round(cropState.h*nh));
  const maxSide=2000,scale=Math.min(1,maxSide/Math.max(sw,sh));
  const W=Math.max(1,Math.round(sw*scale)),H=Math.max(1,Math.round(sh*scale));
  const canvas=document.createElement("canvas");canvas.width=W;canvas.height=H;const ctx=canvas.getContext("2d");
  try{ctx.drawImage(img,sx,sy,sw,sh,0,0,W,H)}catch(err){throw new Error("Dieses externe Bild darf der Browser nicht zuschneiden. Lade es bitte als Bilddatei hoch und versuche es erneut.")}
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/jpeg",.93));if(!blob)throw new Error("Der Bildausschnitt konnte nicht erstellt werden.");
  editorCroppedFile=new File([blob],`good-news-crop-${Date.now()}.jpg`,{type:"image/jpeg"});
  const url=URL.createObjectURL(blob);setEditorImage(url,{preserveOriginal:false});
  $("imageFit").value="cover";$("imageZoom").value="1";$("imagePosX").value="50";$("imagePosY").value="50";applyImageEditorState();
  if($("imageCropMessage")) $("imageCropMessage").textContent="Ausschnitt erstellt. Beim Speichern wird genau dieser Bildbereich verwendet.";
}

$("imageCropBtn")?.addEventListener("click",async()=>{
  const btn=$("imageCropBtn");btn.disabled=true;
  try{await cropVisibleImage()}catch(err){if($("imageCropMessage")) $("imageCropMessage").textContent=err.message||String(err)}finally{btn.disabled=false}
});
$("imageUndoCropBtn")?.addEventListener("click",()=>{
  if(!editorOriginalPreviewSrc)return;
  editorCroppedFile=null;setEditorImage(editorOriginalPreviewSrc,{preserveOriginal:false});
  if($("imageCropMessage")) $("imageCropMessage").textContent="Originalbild wiederhergestellt.";
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
    context_text:$("contextText").value.trim()||null,
    daily_slot:$("dailySlot")?.value||"none",
    years_ago:$("yearsAgo")?.value?Number($("yearsAgo").value):null,
    feel_good_text:$("feelGoodText")?.value.trim()||null,
    image_url:$("imageUrl").value.trim()||($("imagePreview").src&&!$("imagePreview").src.startsWith("blob:")?$("imagePreview").src:null),
    ...currentImageEditorState(),
    image_credit:$("imageCredit").value.trim()||null,sources:collectSources()
  };
}

$("previewBtn").onclick=()=>openPreview(formToDraft());
function openPreview(n){
  $("previewContent").innerHTML=`
    <article class="preview-card ${n.image_url?"has-image":""}">
      ${n.image_url?`<img class="slide-bg-blur" src="${esc(n.image_url)}" alt="" aria-hidden="true"><img class="slide-bg" src="${esc(n.image_url)}" alt="" style="${imageStyleOf(n)}">`:""}
      <div class="slide-inner">
        <div class="topline"><span class="pill">${esc(n.category||"Kategorie")}</span>${n.priority==="top"?'<span class="pill top-pill">Topmeldung</span>':""}</div>
        <h1>${esc(n.title||"Deine Überschrift")}</h1>
        <p class="summary">${esc(n.summary||"Hier erscheint deine Nachricht.")}</p>
        ${n.context_text?`<div class="context-box"><strong>Kurz erklärt</strong>${esc(n.context_text)}</div>`:""}
        ${n.feel_good_text?`<div class="feel-good-box"><strong>💛 Darum macht das Freude</strong>${esc(n.feel_good_text)}</div>`:""}
      </div>
    </article>`;
  previewDialog.showModal();
}
function previewSaved(id){const n=adminNews.find(x=>String(x.id)===String(id));if(n)openPreview(n)}

async function editArticle(id){
  const n=adminNews.find(x=>String(x.id)===String(id));if(!n)return;
  $("newsId").value=n.id;$("publishedDate").value=n.published_date;
  $("publishedTime").value=n.published_time?.slice(0,5)||"00:00";$("category").value=n.category;
  $("storyKey").value=n.story_key||"";$("title").value=n.title;$("summary").value=n.summary;
  $("status").value=n.status;$("priority").value=n.priority||"normal";$("contextText").value=n.context_text||"";
  if($("dailySlot")) $("dailySlot").value=n.daily_slot||"none";
  if($("yearsAgo")) $("yearsAgo").value=n.years_ago||"";
  if($("feelGoodText")) $("feelGoodText").value=n.feel_good_text||"";
  $("imageUrl").value=n.image_path?"":(n.image_url||"");$("imageCredit").value=n.image_credit||"";
  $("existingImagePath").value=n.image_path||"";
  const iv=imageViewOf(n); if($("imageFit")) $("imageFit").value=iv.fit; if($("imageZoom")) $("imageZoom").value=iv.zoom; if($("imagePosX")) $("imagePosX").value=iv.x; if($("imagePosY")) $("imagePosY").value=iv.y;
  $("sourcesEditor").innerHTML="";
  (sourcesOf(n).length?sourcesOf(n):[{name:"",url:""}]).forEach(s=>addSourceRow(s.name,s.url));
  editorCroppedFile=null; editorOriginalPreviewSrc=null; if(n.image_url){setEditorImage(n.image_url)}else $("imagePreviewBox").hidden=true; applyImageEditorState();
  $("saveBtn").textContent="Änderungen speichern";$("cancelEditBtn").hidden=false;
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
    }
    const localDateTime=`${d.published_date}T${d.published_time}:00`;
    const publishAt=new Date(localDateTime).toISOString();
    const row={
      published_date:d.published_date,published_time:d.published_time,category:d.category,story_key:d.story_key,
      title:d.title,summary:d.summary,status:d.status,priority:d.priority,priority_rank:d.priority==="top"?1:0,
      context_text:d.context_text,daily_slot:d.daily_slot,years_ago:d.years_ago,feel_good_text:d.feel_good_text,
      image_url:imageUrl,image_path:imagePath,image_credit:d.image_credit,
      image_fit:d.image_fit,image_zoom:d.image_zoom,image_x:d.image_pos_x,image_y:d.image_pos_y,
      sources:d.sources,publish_at:publishAt,updated_at:new Date().toISOString()
    };
    const id=$("newsId").value;
    const result=id?await db.from("news").update(row).eq("id",id):await db.from("news").insert(row);
    if(result.error)throw result.error;
    $("editorMessage").textContent="Gespeichert.";
    clearEditorDraft();
    resetEditor();
    await Promise.all([loadAdminNews(),fetchPublicNews()]);
    switchAdminTab("dashboard");
  }catch(err){$("editorMessage").textContent=err.message||String(err)}
};

if(db) db.auth.onAuthStateChange(()=>{if(adminDialog.open)setTimeout(refreshAuth,0)});
resetEditor();
setupEditorAutosave();
if(localStorage.getItem("goodNewsAdminTab")==="editor"){
  restoreEditorDraft();
}
fetchPublicNews();

if("serviceWorker" in navigator){
  addEventListener("load",async()=>{
    try{
      const reg=await navigator.serviceWorker.register("sw.js");
      await reg.update();
      let reloading=false;
      navigator.serviceWorker.addEventListener("controllerchange",()=>{
        if(reloading)return;reloading=true;location.reload();
      });
    }catch(e){console.warn("Service Worker konnte nicht aktualisiert werden",e)}
  });
}


// ---------------- DESIGN & APP SETTINGS ----------------
let appSettings = null;

async function loadAppSettings() {
  if (!configured) return;
  const {data,error} = await db.from("app_settings").select("*").eq("id",1).maybeSingle();
  if(error) return console.warn("App settings:", error.message);
  if(data){
    appSettings=data;
    applyAppSettings(data);
    if(currentAdminSession) populateSettingsForm(data);
  }
}

function applyAppSettings(s){
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
    if(s.logo_url){
      logo.src=s.logo_url;
      logo.classList.add("visible");
    }else{
      logo.classList.remove("visible");
      logo.removeAttribute("src");
    }
  }
}

function populateSettingsForm(s){
  if(!$("settingAppName")) return;
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
    show_counter:$("settingShowCounter").checked
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
    $("settingsMessage").textContent="Design wird gespeichert …";
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
      $("settingsMessage").textContent="Design gespeichert.";
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
  };
}

// Extend admin tab switching to refresh settings when opened.
const originalSwitchAdminTab = switchAdminTab;
switchAdminTab = function(name){
  originalSwitchAdminTab(name);
  if(name==="settings" && appSettings) populateSettingsForm(appSettings);
};

// load public design immediately
loadAppSettings();

// ---------------- GOOD NEWS 2.1: COMMUNITY SUBMISSIONS ----------------
let readerSubmissions=[];
const submissionDialog=$("submissionDialog");

$("submitNewsBtn").onclick=()=>{
  $("submissionForm").reset();
  $("submissionMessage").textContent="";
  submissionDialog.showModal();
};

$("submissionForm").onsubmit=async(e)=>{
  e.preventDefault();
  const msg=$("submissionMessage");
  if(!configured){msg.textContent="Die Einsendefunktion ist noch nicht verbunden.";return}
  msg.textContent="Wird gesendet …";
  const row={
    title:$("submissionTitle").value.trim(),
    story_text:$("submissionText").value.trim(),
    source_url:$("submissionUrl").value.trim(),
    category:$("submissionCategory").value,
    location:$("submissionLocation").value.trim()||null,
    submitter_name:$("submissionName").value.trim()||null,
    status:"new"
  };
  const {error}=await db.from("submissions").insert(row);
  if(error){msg.textContent="Das hat leider nicht geklappt: "+error.message;return}
  msg.textContent="Danke! 💛 Deine gute Nachricht ist bei der Redaktion angekommen.";
  e.target.reset();
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
    <div class="submission-meta">${esc(submissionStatusLabel(x.status))} · ${esc(new Date(x.created_at).toLocaleString("de-DE"))}${x.location?` · ${esc(x.location)}`:""}${x.submitter_name?` · von ${esc(x.submitter_name)}`:""}</div>
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
  $("category").value=x.category||"Menschen";
  $("title").value=x.title;
  $("summary").value=x.story_text;
  $("sourcesEditor").innerHTML="";addSourceRow("Leserhinweis / Originalquelle",x.source_url);
  $("feelGoodText").value="";
  await setSubmissionStatus(id,"accepted");
  switchAdminTab("editor");
  $("editorMessage").textContent="Lesereinsendung übernommen. Bitte redaktionell prüfen, umformulieren und erst danach veröffentlichen.";
}

// Extend admin tab behavior for submissions.
const _switchAdminTab=switchAdminTab;
switchAdminTab=function(name){
  _switchAdminTab(name);
  if(name==="submissions")loadSubmissions();
  if(name==="editor" && !$("newsId").value && !$("title").value.trim()) restoreEditorDraft();
};
