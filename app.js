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
  try { return JSON.parse(localStorage.getItem("dailySlidesFavorites") || "[]"); }
  catch { return []; }
};
const setFavorites = (ids) => localStorage.setItem("dailySlidesFavorites", JSON.stringify(ids));
const isFavorite = (id) => getFavorites().map(String).includes(String(id));
const toggleFavorite = (id) => {
  const ids = getFavorites().map(String);
  const key = String(id);
  const next = ids.includes(key) ? ids.filter(x => x !== key) : [...ids, key];
  setFavorites(next);
  return next.includes(key);
};

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
  renderFeed();
}

function showFeedError(message) {
  feed.innerHTML = `<section class="empty-state"><div><h1>Feed nicht erreichbar</h1><p>${esc(message)}</p></div></section>`;
}

function renderFeed({startId=null}={}) {
  const data = activeCategory === "Alle" ? allNews : allNews.filter(n => n.category === activeCategory);
  feed.innerHTML = "";
  if (!data.length) {
    feed.innerHTML = `<section class="empty-state"><div><h1>Keine Beiträge</h1><p>Für diese Auswahl gibt es noch keine veröffentlichten Nachrichten.</p></div></section>`;
    return;
  }
  let prevDate = null;
  data.forEach((item, index) => {
    if (prevDate && item.published_date !== prevDate) addDayBreak(item.published_date);
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

function buildSlide(item, index, total) {
  const article = document.createElement("article");
  article.className = `slide${item.image_url ? " has-image" : ""}`;
  article.dataset.id = item.id;

  const primarySource = sourcesOf(item)[0];
  const fav = isFavorite(item.id);

  article.innerHTML = `
    ${item.image_url ? `<img class="slide-bg" src="${esc(item.image_url)}" alt="">` : ""}
    <div class="slide-inner">
      <div class="topline">
        <span class="pill">${esc(item.category)}</span>
        ${item.priority === "top" ? `<span class="pill top-pill">Topmeldung</span>` : ""}
        <span class="pill">${esc(fmtDateShort(item.published_date))} · ${esc(item.published_time?.slice(0,5) || "")}</span>
      </div>
      <h1>${esc(item.title)}</h1>
      <p class="summary">${esc(item.summary)}</p>

      ${item.context_text ? `<div class="context-box"><strong>Kurz erklärt</strong>${esc(item.context_text)}</div>` : ""}

      <div class="slide-actions">
        <button class="slide-action fav-btn ${fav ? "active":""}" data-id="${item.id}">${fav ? "♥ Gespeichert" : "♡ Merken"}</button>
        <button class="slide-action share-btn" data-id="${item.id}">↗ Teilen</button>
        ${sourcesOf(item).length > 0 ? `<button class="slide-action sources-btn" data-id="${item.id}">Quellen (${sourcesOf(item).length})</button>` : ""}
        ${item.story_key ? `<button class="slide-action story-btn" data-story="${esc(item.story_key)}">Was bisher geschah</button>` : ""}
      </div>

      ${item.image_credit ? `<div class="credit">${esc(item.image_credit)}</div>` : ""}
      <div class="source-line">
        <span>${primarySource ? `Quelle: ${esc(primarySource.name)}` : "Daily Slides"}</span>
        <span>${String(index+1).padStart(2,"0")} / ${String(total).padStart(2,"0")}</span>
      </div>
    </div>`;
  article.querySelector(".fav-btn").onclick = (e) => {
    const active = toggleFavorite(item.id);
    e.currentTarget.classList.toggle("active",active);
    e.currentTarget.textContent = active ? "♥ Gespeichert" : "♡ Merken";
  };
  article.querySelector(".share-btn").onclick = () => shareItem(item);
  article.querySelector(".sources-btn")?.addEventListener("click",()=>openSources(item));
  article.querySelector(".story-btn")?.addEventListener("click",()=>openStory(item.story_key));
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
  const text = `${item.title}\n\n${item.summary}`;
  try {
    if (navigator.share) await navigator.share({title:item.title,text});
    else {
      await navigator.clipboard.writeText(text);
      alert("Text wurde in die Zwischenablage kopiert.");
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
    await loadAppSettings();
    switchAdminTab("dashboard");
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
  $("todayList").innerHTML=todayItems.length?todayItems.map(adminItemHtml).join(""):`<p class="muted">Für heute gibt es noch keine Beiträge.</p>`;
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

function resetEditor(){
  $("newsForm").reset();
  $("newsId").value="";$("existingImagePath").value="";
  $("sourcesEditor").innerHTML="";addSourceRow();
  const now=new Date();$("publishedDate").value=now.toISOString().slice(0,10);
  $("publishedTime").value=now.toTimeString().slice(0,5);
  $("status").value="draft";$("priority").value="normal";
  $("saveBtn").textContent="Speichern";$("cancelEditBtn").hidden=true;
  $("imagePreviewBox").hidden=true;$("imagePreview").removeAttribute("src");
  $("editorMessage").textContent="";
}
$("cancelEditBtn").onclick=()=>{resetEditor();switchAdminTab("dashboard")};

$("imageFile").onchange=()=>{
  const f=$("imageFile").files?.[0];if(!f)return;
  $("imagePreview").src=URL.createObjectURL(f);$("imagePreviewBox").hidden=false;
};
$("imageUrl").oninput=()=>{
  if($("imageFile").files?.[0])return;
  const url=$("imageUrl").value.trim();
  if(url){$("imagePreview").src=url;$("imagePreviewBox").hidden=false}
};

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
    image_url:$("imageUrl").value.trim()||($("imagePreview").src&&!$("imagePreview").src.startsWith("blob:")?$("imagePreview").src:null),
    image_credit:$("imageCredit").value.trim()||null,sources:collectSources()
  };
}

$("previewBtn").onclick=()=>openPreview(formToDraft());
function openPreview(n){
  $("previewContent").innerHTML=`
    <article class="preview-card ${n.image_url?"has-image":""}">
      ${n.image_url?`<img src="${esc(n.image_url)}" alt="">`:""}
      <div class="slide-inner">
        <div class="topline"><span class="pill">${esc(n.category||"Kategorie")}</span>${n.priority==="top"?'<span class="pill top-pill">Topmeldung</span>':""}</div>
        <h1>${esc(n.title||"Deine Überschrift")}</h1>
        <p class="summary">${esc(n.summary||"Hier erscheint deine Nachricht.")}</p>
        ${n.context_text?`<div class="context-box"><strong>Kurz erklärt</strong>${esc(n.context_text)}</div>`:""}
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
  $("imageUrl").value=n.image_path?"":(n.image_url||"");$("imageCredit").value=n.image_credit||"";
  $("existingImagePath").value=n.image_path||"";
  $("sourcesEditor").innerHTML="";
  (sourcesOf(n).length?sourcesOf(n):[{name:"",url:""}]).forEach(s=>addSourceRow(s.name,s.url));
  if(n.image_url){$("imagePreview").src=n.image_url;$("imagePreviewBox").hidden=false}else $("imagePreviewBox").hidden=true;
  $("saveBtn").textContent="Änderungen speichern";$("cancelEditBtn").hidden=false;
  switchAdminTab("editor");
}

$("newsForm").onsubmit=async(e)=>{
  e.preventDefault();$("editorMessage").textContent="Speichern …";
  try{
    const d=formToDraft();
    if(!d.sources.length)throw new Error("Bitte mindestens eine Quelle mit Name und Link angeben.");
    let imageUrl=d.image_url,imagePath=$("existingImagePath").value||null;
    const file=$("imageFile").files?.[0];
    if(file){
      const uploaded=await uploadImage(file);imageUrl=uploaded.url;imagePath=uploaded.path;
    }
    const localDateTime=`${d.published_date}T${d.published_time}:00`;
    const publishAt=new Date(localDateTime).toISOString();
    const row={
      published_date:d.published_date,published_time:d.published_time,category:d.category,story_key:d.story_key,
      title:d.title,summary:d.summary,status:d.status,priority:d.priority,priority_rank:d.priority==="top"?1:0,
      context_text:d.context_text,image_url:imageUrl,image_path:imagePath,image_credit:d.image_credit,
      sources:d.sources,publish_at:publishAt,updated_at:new Date().toISOString()
    };
    const id=$("newsId").value;
    const result=id?await db.from("news").update(row).eq("id",id):await db.from("news").insert(row);
    if(result.error)throw result.error;
    $("editorMessage").textContent="Gespeichert.";
    resetEditor();
    await Promise.all([loadAdminNews(),fetchPublicNews()]);
    switchAdminTab("dashboard");
  }catch(err){$("editorMessage").textContent=err.message||String(err)}
};

if(db) db.auth.onAuthStateChange(()=>{if(adminDialog.open)setTimeout(refreshAuth,0)});
resetEditor();
fetchPublicNews();

if("serviceWorker" in navigator){
  addEventListener("load",()=>navigator.serviceWorker.register("sw.js"));
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

  const name = s.app_name || "Daily Slides";
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
  $("settingAppName").value=s.app_name||"Daily Slides";
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
    app_name:$("settingAppName").value.trim()||"Daily Slides",
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
      app_name:"Daily Slides",logo_url:null,logo_path:null,
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
