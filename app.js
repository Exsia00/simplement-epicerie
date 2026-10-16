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
let scanner = null, scanning = false, lastCode = "";
async function startScan(){
  $("foundSheet").hidden = true; $("scanSheet").hidden = false;
  $("scanMsg").textContent = "Garde le téléphone stable, à une main de distance.";
  if (typeof Html5Qrcode === "undefined"){ $("scanMsg").textContent = "Le scanner n'a pas pu se charger. Vérifie ta connexion."; return; }
  try {
    scanner = scanner || new Html5Qrcode("reader", {
      formatsToSupport: [Html5QrcodeSupportedFormats.EAN_13, Html5QrcodeSupportedFormats.EAN_8, Html5QrcodeSupportedFormats.UPC_A, Html5QrcodeSupportedFormats.UPC_E],
      experimentalFeatures: { useBarCodeDetectorIfSupported: true }, verbose: false });
    scanning = true;
    await scanner.start({ facingMode: "environment" }, { fps: 12, qrbox: (w, h) => ({ width: Math.floor(w * 0.85), height: Math.floor(Math.min(h, w) * 0.45) }) },
      txt => { if (!scanning) return; scanning = false; onCode(txt); }, () => {});
  } catch(err){
    scanning = false;
    $("scanMsg").textContent = "La caméra est bloquée. Autorise la caméra pour ce site dans les réglages du navigateur, puis réessaie.";
  }
}
async function stopScan(){ scanning = false; try { if (scanner && scanner.isScanning) await scanner.stop(); } catch(e){} }
$("scanBtn").onclick = startScan;
$("scanClose").onclick = async () => { await stopScan(); $("scanSheet").hidden = true; };

async function lookupOFF(bc){
  try {
    const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(bc)}.json?fields=product_name_fr,product_name,generic_name_fr,brands,quantity,categories_tags&lc=fr`);
    if (!r.ok) return null; const j = await r.json(); if (j.status !== 1 || !j.product) return null;
    const p = j.product; const name = (p.product_name_fr || p.generic_name_fr || p.product_name || "").trim(); if (!name) return null;
    const tags = (p.categories_tags || []).join(" ");
    const cat = tags ? OFF_MAP.find(([re]) => re.test(tags))[1] : guess(name);
    const brand = (p.brands || "").split(",")[0].trim();
    return { name: brand && !norm(name).includes(norm(brand)) ? `${name} (${brand})` : name, cat, size: p.quantity || "" };
  } catch(e){ return null; }
}
async function onCode(bc){
  await stopScan(); lastCode = bc; $("scanSheet").hidden = true;
  $("foundTitle").textContent = "Je cherche le produit…"; $("foundHint").textContent = `Code-barres ${bc}`;
  $("fName").value = ""; $("fQty").value = ""; $("fCat").value = "Autre"; $("foundSheet").hidden = false;
  let mine = null; try { const r = await api("product_get", { barcode: bc }); mine = r.ok ? r.product : null; } catch(e){}
  if (mine){ $("foundTitle").textContent = "Déjà connu de la famille"; $("fName").value = mine.name; $("fCat").value = mine.cat; return; }
  const off = await lookupOFF(bc);
  if (off){ $("foundTitle").textContent = "Produit trouvé"; $("foundHint").textContent = `Tu peux changer le nom avant de l'ajouter.${off.size ? " Format : " + off.size : ""}`;
    $("fName").value = off.name; $("fCat").value = off.cat; }
  else { $("foundTitle").textContent = "Produit inconnu"; $("foundHint").textContent = "Écris son nom une fois. La prochaine fois que quelqu'un le scanne, l'app va s'en souvenir.";
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
