/* Simplement L'Épicerie — logique de l'app */
const SUPABASE_URL = "https://nbgjdoxbinvpvdslyamp.supabase.co";
const SUPABASE_KEY = "sb_publishable_5ZjJDbhx9lReO8an0JOm_Q_pMLGx5-x"; // clé publique : sans le code de famille, elle ne donne accès à rien
const CODE_KEY = "epicerie-code";

const CATS = ["Fruits et légumes","Boulangerie","Viandes et poissons","Produits laitiers et œufs","Garde-manger","Surgelés","Boissons","Collations","Ménager","Soins personnels","Autre"];
const GUESS = {
  "Fruits et légumes":"pomme banane orange citron fraise bleuet raisin poire melon avocat tomate patate pomme de terre carotte oignon ail laitue salade concombre poivron brocoli chou céleri champignon courgette épinard légume fruit lime mangue ananas",
  "Boulangerie":"pain baguette bagel muffin croissant tortilla pita brioche",
  "Viandes et poissons":"poulet boeuf bœuf porc jambon bacon saucisse steak viande haché dinde poisson saumon thon crevette côtelette",
  "Produits laitiers et œufs":"lait beurre fromage yogourt yaourt crème oeuf oeufs œuf œufs margarine cheddar mozzarella",
  "Garde-manger":"pâtes pate spaghetti macaroni riz farine sucre sel poivre huile vinaigre conserve soupe sauce ketchup moutarde mayonnaise céréales gruau arachide confiture épice bouillon café thé miel sirop",
  "Surgelés":"congelé surgelé frites pizza crème glacée glace",
  "Boissons":"jus liqueur boisson eau bière vin",
  "Collations":"chips biscuit croustille barre chocolat bonbon popcorn noix craquelin",
  "Ménager":"papier toilette essuie-tout savon vaisselle détergent lessive sac poubelle javel nettoyant",
  "Soins personnels":"shampoing dentifrice brosse déodorant rasoir couche"
};
// Catégories Open Food Facts → nos catégories (le premier qui correspond gagne)
const OFF_MAP = [
  [/frozen/, "Surgelés"],
  [/beverages|drinks|waters|juices|sodas|coffees|teas/, "Boissons"],
  [/dairies|dairy|cheeses|milks|yogurts|butters|eggs|creams/, "Produits laitiers et œufs"],
  [/meats|poultry|fishes|seafood|hams|sausages/, "Viandes et poissons"],
  [/breads|bakery|viennoiseries|tortillas|bagels/, "Boulangerie"],
  [/fruits|vegetables|plant-based-foods-and-beverages:fresh/, "Fruits et légumes"],
  [/snacks|sweet-snacks|salty-snacks|chips|biscuits|cookies|chocolates|candies|confectioneries/, "Collations"],
  [/cleaning|household|detergents/, "Ménager"],
  [/hygiene|cosmetics|toothpastes|shampoos/, "Soins personnels"],
  [/./, "Garde-manger"]
];

const $ = id => document.getElementById(id);
const norm = s => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
function guess(name){ const n = norm(name); for (const c in GUESS) for (const w of GUESS[c].split(" ")) if (w.length > 2 && n.includes(norm(w))) return c; return "Autre"; }
let toastT; function toast(t){ const el = $("toast"); el.textContent = t; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => el.hidden = true, 2800); }
function getCode(){ try { return localStorage.getItem(CODE_KEY) || ""; } catch(e){ return ""; } }
function setCode(c){ try { c ? localStorage.setItem(CODE_KEY, c) : localStorage.removeItem(CODE_KEY); } catch(e){} }

/* ---------- Serveur ---------- */
async function rpc(fn, body){
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error("http " + r.status);
  return r.json();
}
let code = getCode();
const api = (action, args = {}) => rpc("api", { p_code: code, p_action: action, p_args: args });

/* ---------- État ---------- */
const data = { family: "", items: [], staples: [], meals: [] };
let loaded = false, curTab = "list", busy = 0;

async function refresh(){
  if (!code || busy) return;
  try {
    const r = await api("state");
    if (!r.ok){ if (r.error === "mauvais_code"){ logout("Ce code de famille ne marche plus."); } return; }
    if (busy) return; // un changement est parti pendant la lecture : on attend le prochain tour
    Object.assign(data, { family: r.family, items: r.items, staples: r.staples, meals: r.meals });
    loaded = true; $("offline").hidden = true; renderAll();
  } catch(e){ $("offline").hidden = false; }
}
async function act(action, args, optimistic){
  if (optimistic){ optimistic(); renderAll(); }
  busy++;
  try {
    const r = await api(action, args);
    if (!r.ok) toast("Pas pu enregistrer. Réessaie.");
    return r;
  } catch(e){ $("offline").hidden = false; toast("Pas de connexion. Réessaie."); return { ok:false }; }
  finally { busy--; refresh(); }
}
async function addToList(name, qty, cat){
  if (data.items.some(i => !i.done && norm(i.name) === norm(name))) return false;
  const r = await act("item_add", { name, qty: qty || "", cat: cat || guess(name) },
    () => data.items.push({ id: "tmp" + Date.now(), name, qty: qty || "", cat: cat || guess(name), done: false }));
  return r.ok && !r.dup;
}

/* ---------- Rendu ---------- */
function renderHead(){
  $("famTitle").textContent = data.family || "L'épicerie";
  const total = data.items.length, done = data.items.filter(i => i.done).length;
  $("count").textContent = !loaded ? "Chargement…" : total ? `${total} article${total>1?"s":""} sur la liste · ${done} dans le panier` : "La liste est vide";
  $("prog").style.width = total ? (done/total*100) + "%" : "0";
}
function renderList(){
  const its = data.items, done = its.filter(i => i.done).length;
  $("clearZone").hidden = !done;
  if (!loaded){ $("list").innerHTML = ""; return; }
  if (!its.length){ $("list").innerHTML = `<p class="empty">Ajoute un article en bas, scanne un code-barres,<br>ou passe par « Avant de partir » et « Repas ».</p>`; return; }
  $("list").innerHTML = CATS.filter(c => its.some(i => (CATS.includes(i.cat) ? i.cat : "Autre") === c)).map(c => {
    const g = its.filter(i => (CATS.includes(i.cat) ? i.cat : "Autre") === c).sort((a,b) => a.done - b.done);
    const left = g.filter(i => !i.done).length;
    return `<section><h2><span>${c}</span><span>${left || "✓"}</span></h2><ul class="box">${g.map(i => `
      <li class="${i.done ? "done" : ""}"><label><input class="chk" type="checkbox" data-id="${esc(i.id)}" ${i.done ? "checked" : ""}>
      <span class="name">${esc(i.name)}${i.qty ? `<span class="qty">${esc(i.qty)}</span>` : ""}</span></label>
      <button class="del" type="button" data-del="${esc(i.id)}" aria-label="Enlever ${esc(i.name)}">×</button></li>`).join("")}</ul></section>`;
  }).join("");
}
function renderInv(){
  if (!loaded){ $("inv").innerHTML = ""; return; }
  const st = [...data.staples].sort((a,b) => CATS.indexOf(a.cat) - CATS.indexOf(b.cat) || norm(a.name).localeCompare(norm(b.name)));
  if (!st.length){ $("inv").innerHTML = `<p class="empty">Ajoute les produits que tu veux vérifier avant chaque épicerie.</p>`; return; }
  const left = st.filter(s => !s.status).length;
  $("inv").innerHTML = `<section><h2><span>Produits de base</span><span>${left ? left + " à vérifier" : "Vérification finie ✓"}</span></h2><ul class="box inv">${st.map(s => `
    <li><span class="name">${esc(s.name)}</span><span class="seg">
      <button type="button" class="have" data-st="${esc(s.id)}" data-v="ok" aria-pressed="${s.status === "ok"}">J'en ai</button>
      <button type="button" class="need" data-st="${esc(s.id)}" data-v="manque" aria-pressed="${s.status === "manque"}">Manque</button>
    </span><button class="del" type="button" data-sdel="${esc(s.id)}" aria-label="Retirer ${esc(s.name)} des produits de base">×</button></li>`).join("")}</ul></section>`;
}
function renderMeals(){
  if (!loaded){ $("meals").innerHTML = ""; return; }
  const open = new Set([...document.querySelectorAll(".meal[open]")].map(d => d.dataset.id));
  const ms = [...data.meals].sort((a,b) => norm(a.name).localeCompare(norm(b.name)));
  if (!ms.length){ $("meals").innerHTML = `<p class="empty">Ta banque de repas est vide.<br>Appuie sur « Nouveau repas » pour commencer.</p>`; return; }
  $("meals").innerHTML = ms.map(m => { const ing = Array.isArray(m.ingredients) ? m.ingredients : [];
    return `<details class="meal" data-id="${esc(m.id)}" ${open.has(m.id) ? "open" : ""}><summary><b>${esc(m.name)}</b><span>${ing.length} ingrédient${ing.length>1?"s":""}</span></summary><div class="body">
      <div class="row" style="margin-top:14px"><button class="btn pri sm" type="button" data-cook="${esc(m.id)}">Ajouter les ingrédients à la liste</button></div>
      <h3>Ingrédients</h3><ul>${ing.map(x => `<li>${esc(x.name)}${x.qty ? ` <span class="qty">${esc(x.qty)}</span>` : ""}</li>`).join("") || "<li>Aucun</li>"}</ul>
      ${m.recipe ? `<h3>Recette</h3><p class="recipe">${esc(m.recipe)}</p>` : ""}
      <div class="row"><button class="btn sm" type="button" data-medit="${esc(m.id)}">Modifier</button><button class="btn sm warnb" type="button" data-mdel="${esc(m.id)}">Supprimer</button></div>
    </div></details>`; }).join("");
}
function renderAll(){
  renderHead(); renderList(); renderInv();
  if (!document.activeElement || !$("p-meals").contains(document.activeElement)) renderMeals();
}

/* ---------- Entrée / sortie ---------- */
function showApp(){ $("login").hidden = true; $("app").hidden = false; loaded = false; renderAll(); refresh(); }
function logout(msg){ setCode(""); code = ""; $("app").hidden = true; $("login").hidden = false; if (msg){ $("joinErr").textContent = msg; $("joinErr").hidden = false; } }
$("joinForm").addEventListener("submit", async e => {
  e.preventDefault(); const c = $("joinCode").value.trim(); $("joinErr").hidden = true;
  try { const r = await rpc("api", { p_code: c, p_action: "state", p_args: {} });
    if (!r.ok){ $("joinErr").textContent = "Ce code ne correspond à aucune famille. Vérifie les lettres et les tirets."; $("joinErr").hidden = false; return; }
    code = c; setCode(c); showApp();
  } catch(err){ $("joinErr").textContent = "Pas de connexion. Réessaie."; $("joinErr").hidden = false; }
});
$("createForm").addEventListener("submit", async e => {
  e.preventDefault(); const c = $("newCode").value.trim(); $("createErr").hidden = true;
  try { const r = await rpc("create_family", { p_code: c, p_name: $("famName").value.trim() });
    if (!r.ok){ $("createErr").textContent = r.error === "code_court" ? "Le code doit avoir au moins 8 caractères." : "Ce code est déjà pris. Choisis-en un autre."; $("createErr").hidden = false; return; }
    code = c; setCode(c); showApp(); toast("Liste créée! Donne le code à la famille.");
  } catch(err){ $("createErr").textContent = "Pas de connexion. Réessaie."; $("createErr").hidden = false; }
});
$("logout").onclick = () => logout();

/* ---------- Onglets ---------- */
document.querySelector(".tabs").addEventListener("click", e => {
  const t = e.target.dataset.tab; if (!t) return; curTab = t;
  document.querySelectorAll(".tabs button").forEach(b => b.setAttribute("aria-selected", b.dataset.tab === t));
  ["list","inv","meals"].forEach(k => $("p-" + k).hidden = k !== t);
  $("addBar").hidden = t !== "list"; window.scrollTo(0, 0);
});

/* ---------- Liste ---------- */
const catOptions = CATS.map(c => `<option>${c}</option>`).join("");
$("cat").innerHTML = '<option value="">Catégorie : je devine pour toi</option>' + catOptions;
$("fCat").innerHTML = catOptions;
$("form").addEventListener("submit", async e => {
  e.preventDefault(); const n = $("item").value.trim(); if (!n) return;
  const q = $("qty").value.trim(), c = $("cat").value || guess(n);
  $("item").value = ""; $("qty").value = ""; $("cat").value = ""; $("item").focus();
  if (!(await addToList(n, q, c))) toast(`${n} est déjà sur la liste`);
});
$("list").addEventListener("change", e => { const id = e.target.dataset.id; if (!id) return; const v = e.target.checked;
  act("item_done", { id, done: v }, () => { const it = data.items.find(i => i.id === id); if (it) it.done = v; }); });
$("list").addEventListener("click", e => { const id = e.target.dataset.del; if (!id) return;
  act("item_del", { id }, () => { data.items = data.items.filter(i => i.id !== id); }); });
$("clearBtn").onclick = () => { $("confirm").hidden = false; $("clearBtn").hidden = true; };
$("no").onclick = () => { $("confirm").hidden = true; $("clearBtn").hidden = false; };
$("yes").onclick = () => { $("confirm").hidden = true; $("clearBtn").hidden = false;
  act("items_clear_done", {}, () => { data.items = data.items.filter(i => !i.done); }); };

/* ---------- Avant de partir ---------- */
$("inv").addEventListener("click", async e => {
  const sd = e.target.dataset.sdel;
  if (sd){ act("staple_del", { id: sd }, () => { data.staples = data.staples.filter(s => s.id !== sd); }); return; }
  const id = e.target.dataset.st; if (!id) return;
  const s = data.staples.find(x => x.id === id); if (!s) return;
  const v = s.status === e.target.dataset.v ? "" : e.target.dataset.v;
  await act("staple_status", { id, status: v }, () => { s.status = v; });
  if (v === "manque"){ const added = await addToList(s.name, "", s.cat); toast(added ? `${s.name} ajouté à la liste` : `${s.name} est déjà sur la liste`); }
});
$("invReset").onclick = () => { act("staples_reset", {}, () => data.staples.forEach(s => s.status = "")); toast("Prêt pour une nouvelle vérification"); };
$("stapleForm").addEventListener("submit", e => {
  e.preventDefault(); const n = $("stapleName").value.trim(); if (!n) return;
  if (data.staples.some(s => norm(s.name) === norm(n))){ toast(`${n} est déjà dans tes produits de base`); return; }
  $("stapleName").value = "";
  act("staple_add", { name: n, cat: guess(n) }, () => data.staples.push({ id: "tmp" + Date.now(), name: n, cat: guess(n), status: "" }));
});

/* ---------- Repas ---------- */
let editing = null;
const parseIng = t => t.split("\n").map(l => l.trim()).filter(Boolean).map(l => {
  const k = l.indexOf(","); const name = (k < 0 ? l : l.slice(0, k)).trim(); const qty = k < 0 ? "" : l.slice(k + 1).trim();
  return { name, qty, cat: guess(name) }; });
function openForm(m){ editing = m?.id || null; $("mealForm").hidden = false; $("newMeal").hidden = true;
  $("mName").value = m?.name || ""; $("mIng").value = (m?.ingredients || []).map(x => x.qty ? `${x.name}, ${x.qty}` : x.name).join("\n");
  $("mRec").value = m?.recipe || ""; $("mName").focus(); }
function closeForm(){ editing = null; $("mealForm").hidden = true; $("newMeal").hidden = false; renderMeals(); }
$("newMeal").onclick = () => openForm(null);
$("cancelMeal").onclick = closeForm;
$("mealForm").addEventListener("submit", async e => {
  e.preventDefault(); const name = $("mName").value.trim(); if (!name) return;
  const r = await act("meal_save", { id: editing || "", name, ingredients: parseIng($("mIng").value), recipe: $("mRec").value.trim() });
  if (r.ok){ closeForm(); toast("Repas enregistré"); }
});
$("meals").addEventListener("click", async e => {
  const t = e.target.dataset;
  if (t.cook){ const m = data.meals.find(x => x.id === t.cook); if (!m) return; let a = 0, s = 0;
    for (const x of m.ingredients || []){ if (await addToList(x.name, x.qty, x.cat)) a++; else s++; }
    toast(`${a} ajouté${a>1?"s":""} à la liste${s ? ` · ${s} déjà dessus` : ""}`); }
  if (t.medit){ openForm(data.meals.find(x => x.id === t.medit)); window.scrollTo(0, 0); }
  if (t.mdel){ if (e.target.dataset.sure){ act("meal_del", { id: t.mdel }, () => { data.meals = data.meals.filter(x => x.id !== t.mdel); }); }
    else { e.target.dataset.sure = "1"; e.target.textContent = "Appuie encore pour supprimer"; } }
});

/* ---------- Scanner de code-barres ---------- */
// Vérifie la clé de contrôle d'un EAN-8 / UPC-A / EAN-13 (évite les mauvaises lectures)
function validCode(c){
  if (!/^\d{8}$|^\d{12,14}$/.test(c)) return false;
  const d = c.split("").map(Number), chk = d.pop();
  let sum = 0; d.reverse().forEach((n, i) => sum += n * (i % 2 === 0 ? 3 : 1));
  return (10 - sum % 10) % 10 === chk;
}
let stream = null, track = null, detector = null, loopOn = false, h5 = null, lastCode = "", hits = {}, taken = false;
async function startScan(){
  $("foundSheet").hidden = true; $("scanSheet").hidden = false; $("manualCode").value = "";
  $("scanMsg").textContent = "Tiens le produit à environ 20 cm. Le code se lit tout seul.";
  $("torchBtn").hidden = true; $("zoomWrap").hidden = true; hits = {}; taken = false;
  // 1) Lecteur intégré au téléphone (Android/Chrome) : le plus rapide
  if ("BarcodeDetector" in window){
    try {
      const fmts = await BarcodeDetector.getSupportedFormats();
      if (fmts.includes("ean_13")){
        detector = new BarcodeDetector({ formats: ["ean_13","ean_8","upc_a","upc_e"].filter(f => fmts.includes(f)) });
        await openCamera(); $("scanVideo").hidden = false; $("reader").hidden = true;
        loopOn = true; detectLoop(); return;
      }
    } catch(e){ await closeCamera(); if (camBlocked(e)) return; }
  }
  // 2) Sinon (iPhone) : lecteur de secours
  $("scanVideo").hidden = true; $("reader").hidden = false;
  if (typeof Html5Qrcode === "undefined"){ $("scanMsg").textContent = "Le scanner n'a pas pu se charger. Tape les chiffres plus bas."; return; }
  try {
    h5 = h5 || new Html5Qrcode("reader", { formatsToSupport: [Html5QrcodeSupportedFormats.EAN_13, Html5QrcodeSupportedFormats.EAN_8, Html5QrcodeSupportedFormats.UPC_A, Html5QrcodeSupportedFormats.UPC_E], verbose: false });
    await h5.start({ facingMode: "environment" },
      { fps: 15, qrbox: (w, h) => ({ width: Math.floor(w * 0.82), height: Math.floor(h * 0.32) }),
        videoConstraints: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 }, advanced: [{ focusMode: "continuous" }] } },
      txt => accept(txt), () => {});
    try { track = h5.getRunningTrack(); setupTools(); } catch(e){}
  } catch(e){ camBlocked(e); }
}
function camBlocked(e){
  if (e && (e.name === "NotAllowedError" || /permission/i.test(String(e)))){
    $("scanMsg").textContent = "La caméra est bloquée. Autorise la caméra pour ce site dans le navigateur, ou tape les chiffres plus bas."; return true; }
  $("scanMsg").textContent = "La caméra n'a pas démarré. Tape les chiffres plus bas."; return false;
}
async function openCamera(){
  stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: {
    facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 },
    advanced: [{ focusMode: "continuous" }] } });
  const v = $("scanVideo"); v.srcObject = stream; await v.play();
  track = stream.getVideoTracks()[0]; setupTools();
}
function setupTools(){
  if (!track || !track.getCapabilities) return;
  const caps = track.getCapabilities();
  const adv = {};
  if (caps.focusMode && caps.focusMode.includes("continuous")) adv.focusMode = "continuous";
  if (caps.zoom){ // un peu de zoom : on tient le produit plus loin, la caméra fait mieux le focus
    const z = Math.min(Math.max(2, caps.zoom.min), caps.zoom.max);
    adv.zoom = z; const r = $("zoomRange"); r.min = caps.zoom.min; r.max = Math.min(caps.zoom.max, 6); r.step = caps.zoom.step || 0.1; r.value = z;
    $("zoomWrap").hidden = false; }
  if (Object.keys(adv).length) track.applyConstraints({ advanced: [adv] }).catch(() => {});
  if (caps.torch){ $("torchBtn").hidden = false; $("torchBtn").setAttribute("aria-pressed", "false"); }
}
$("zoomRange").addEventListener("input", e => { if (track) track.applyConstraints({ advanced: [{ zoom: Number(e.target.value) }] }).catch(() => {}); });
$("torchBtn").onclick = () => { if (!track) return; const on = $("torchBtn").getAttribute("aria-pressed") !== "true";
  track.applyConstraints({ advanced: [{ torch: on }] }).then(() => $("torchBtn").setAttribute("aria-pressed", on)).catch(() => {}); };
async function detectLoop(){
  const v = $("scanVideo");
  while (loopOn){
    if (v.readyState >= 2){
      try { const res = await detector.detect(v); for (const r of res){ if (accept(r.rawValue)) return; } } catch(e){}
    }
    await new Promise(r => setTimeout(r, 60));
  }
}
// Accepte un code valide; s'il ne passe pas la vérification, il faut deux lectures identiques
function accept(raw){
  const c = String(raw || "").replace(/\D/g, ""); if (!c) return false;
  if (!validCode(c)){ hits[c] = (hits[c] || 0) + 1; if (hits[c] < 2) return false; }
  if (taken) return false; taken = true;
  $("scanSheet").querySelector(".cam-box").classList.add("hit");
  try { navigator.vibrate && navigator.vibrate(80); } catch(e){}
  setTimeout(() => onCode(c), 120); loopOn = false; return true;
}
async function closeCamera(){
  loopOn = false;
  try { if (h5 && h5.isScanning) await h5.stop(); } catch(e){}
  if (stream){ stream.getTracks().forEach(t => t.stop()); stream = null; }
  track = null; $("scanSheet").querySelector(".cam-box").classList.remove("hit");
}
$("scanBtn").onclick = startScan;
$("scanClose").onclick = async () => { await closeCamera(); $("scanSheet").hidden = true; };
$("manualForm").addEventListener("submit", e => { e.preventDefault(); const c = $("manualCode").value.replace(/\D/g, "");
  if (c.length < 8){ toast("Tape tous les chiffres sous le code-barres"); return; } onCode(c); });

/* Recherche du produit : plusieurs banques gratuites, plusieurs formes du code */
function codeVariants(c){
  const v = new Set([c]);
  if (c.length === 12) v.add("0" + c);
  if (c.length === 13 && c[0] === "0") v.add(c.slice(1));
  if (c.length === 14 && c[0] === "0") { v.add(c.slice(1)); v.add(c.slice(2)); }
  return [...v];
}
const BANKS = ["https://world.openfoodfacts.org", "https://world.openproductsfacts.org", "https://world.openbeautyfacts.org"];
async function fetchJSON(url, ms = 6000){
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
  try { const r = await fetch(url, { signal: ctl.signal }); return r.ok ? await r.json() : null; } catch(e){ return null; } finally { clearTimeout(t); }
}
async function lookupOpen(bank, code){
  const j = await fetchJSON(`${bank}/api/v2/product/${code}.json?fields=product_name_fr,product_name,product_name_en,generic_name_fr,generic_name,brands,quantity,categories_tags&lc=fr`);
  if (!j || j.status !== 1 || !j.product) return null;
  const p = j.product; const name = (p.product_name_fr || p.generic_name_fr || p.product_name || p.product_name_en || p.generic_name || "").trim();
  if (!name) return null;
  const tags = (p.categories_tags || []).join(" ");
  let cat = bank.includes("beauty") ? "Soins personnels" : bank.includes("products") ? "Ménager" : null;
  if (!cat) cat = tags ? OFF_MAP.find(([re]) => re.test(tags))[1] : guess(name);
  const brand = (p.brands || "").split(",")[0].trim();
  return { name: brand && !norm(name).includes(norm(brand)) ? `${name} (${brand})` : name, cat, size: p.quantity || "" };
}
async function lookupAll(code){
  const vars = codeVariants(code);
  // Les banques Open*Facts en parallèle; la première qui trouve gagne (dans l'ordre de préférence)
  const tries = BANKS.flatMap(b => vars.map(v => lookupOpen(b, v)));
  const res = await Promise.all(tries);
  const found = res.find(Boolean); if (found) return found;
  return null;
}
async function onCode(bc){
  await closeCamera(); lastCode = bc; $("scanSheet").hidden = true;
  $("foundTitle").textContent = "Je cherche le produit…"; $("foundHint").textContent = `Code-barres ${bc}`;
  $("fName").value = ""; $("fQty").value = ""; $("fCat").value = "Autre"; $("foundSheet").hidden = false;
  let mine = null;
  try { for (const v of codeVariants(bc)){ const r = await api("product_get", { barcode: v }); if (r.ok && r.product){ mine = r.product; break; } } } catch(e){}
  if (mine){ $("foundTitle").textContent = "Déjà connu de la famille"; $("fName").value = mine.name; $("fCat").value = mine.cat; return; }
  const p = await lookupAll(bc);
  if (p){ $("foundTitle").textContent = "Produit trouvé"; $("foundHint").textContent = `Vérifie le nom avant de l'ajouter.${p.size ? " Format : " + p.size : ""}`;
    $("fName").value = p.name; $("fCat").value = CATS.includes(p.cat) ? p.cat : "Autre"; }
  else { $("foundTitle").textContent = "Produit inconnu"; $("foundHint").textContent = `Code ${bc}. Écris son nom une fois : la prochaine fois que quelqu'un le scanne, l'app va s'en souvenir.`;
    $("fName").focus(); }
}
$("foundForm").addEventListener("submit", async e => {
  e.preventDefault(); const name = $("fName").value.trim(); if (!name) return; const cat = $("fCat").value;
  $("foundSheet").hidden = true;
  api("product_save", { barcode: lastCode, name, cat }).catch(() => {});
  toast((await addToList(name, $("fQty").value.trim(), cat)) ? `${name} ajouté à la liste` : `${name} est déjà sur la liste`);
});
$("foundAgain").onclick = startScan;
$("foundCancel").onclick = () => { $("foundSheet").hidden = true; };

/* ---------- Démarrage ---------- */
if (code) showApp(); else $("login").hidden = false;
setInterval(() => { if (!document.hidden && !$("app").hidden) refresh(); }, 4000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });
window.addEventListener("online", refresh);
