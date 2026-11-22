// Écran géant (télé ou vidéoprojecteur dans la salle) : les photos et vidéos du live défilent en direct.
// Adresse : …/ecran.html?invite=CODE (le lien est dans l'onglet Équipe des admins).
// Les nouvelles photos passent en priorité ; sinon tout le live tourne en boucle. Un QR code invite à poster.

const CFG = window.MARIAGE || {};
const INVITE = new URLSearchParams(location.search).get("invite") || "";
const zone = document.getElementById("ecran");
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const PHOTO_MS = 7000, VIDEO_MAX_MS = 20000;

const posts = new Map();          // id → post
const aVoir = [];                 // nouvelles photos à montrer en priorité
let depuis = null, rang = 0, minuteur = 0, moment = null, decalage = 0, enCours = null;

async function rpc(nom, corps) {
  const r = await fetch(CFG.supabaseUrl + "/rest/v1/rpc/" + nom, {
    method: "POST", headers: { apikey: CFG.supabaseKey, "Content-Type": "application/json" }, body: JSON.stringify(corps), cache: "no-store" });
  if (!r.ok) throw new Error(r.status);
  return r.json();
}
const url = chemin => CFG.supabaseUrl + "/storage/v1/object/public/live/" + chemin;
const lienInvites = () => new URL("./?invite=" + encodeURIComponent(INVITE), location.href).href;

async function charger() {
  try {
    const r = await rpc("live_fil", { p_code: INVITE, p_depuis: depuis ? new Date(new Date(depuis).getTime() - 10000).toISOString() : null });
    if (!r) return erreur("Ce lien d'écran n'est pas valable. Reprends-le dans l'onglet Équipe de l'appli.");
    const premier = depuis === null;
    depuis = r.maintenant;
    for (const p of r.posts) {
      if (p.cache) { posts.delete(p.id); continue; }
      if (!posts.has(p.id) && !premier) aVoir.push(p.id);
      posts.set(p.id, p);
    }
    const i = await rpc("infos_invites", { p_code: INVITE });
    if (i) {
      decalage = new Date(i.maintenant).getTime() - Date.now();
      moment = (i.annonces || []).find(a => a.type === "moment" && new Date(a.fin).getTime() > Date.now() + decalage) || null;
    }
    majBandeau();
    if (!enCours) suivant();
  } catch (e) { /* réseau : on réessaie au prochain tour */ }
}
function erreur(t) { zone.innerHTML = `<p class="attente">${esc(t)}</p>`; }

function cadre() {
  if (!document.getElementById("scene")) {
    let qr = "";
    try { const q = qrcode(0, "M"); q.addData(lienInvites()); q.make(); qr = q.createDataURL(8, 2); } catch (e) {}
    zone.innerHTML = `<div id="scene"></div>
      <header class="titre"><p>Le mariage de</p><h1>${esc(CFG.maries || "")}</h1></header>
      <div id="bandeau" hidden></div>
      <aside class="qr">${qr ? `<img src="${qr}" alt="">` : ""}<p><b>📸 Poste tes photos !</b><br>Scanne avec ton téléphone</p></aside>
      <div id="legende"></div>
      <button type="button" id="pleinEcran">⛶ Plein écran</button>`;
    document.getElementById("pleinEcran").onclick = () => { document.documentElement.requestFullscreen && document.documentElement.requestFullscreen().catch(() => {}); };
  }
}
function majBandeau() {
  cadre();
  const b = document.getElementById("bandeau");
  if (moment) { b.hidden = false; b.innerHTML = `⚡ MOMENT : <b>${esc(moment.texte)}</b> — postez vos photos !`; }
  else b.hidden = true;
}

function suivant() {
  clearTimeout(minuteur);
  const liste = [...posts.values()].sort((a, b) => String(a.cree_le).localeCompare(String(b.cree_le)));
  cadre();
  if (!liste.length) {
    enCours = null;
    document.getElementById("scene").innerHTML = `<p class="attente">Les photos du mariage s'afficheront ici ✨<br><small>Scanne le QR code pour poster la première !</small></p>`;
    document.getElementById("legende").innerHTML = "";
    return;
  }
  let p = null;
  while (aVoir.length && !p) p = posts.get(aVoir.shift()) || null;   // nouveauté d'abord
  if (!p) { rang = rang % liste.length; p = liste[rang++]; }
  montrer(p);
}
function montrer(p) {
  enCours = p;
  const scene = document.getElementById("scene");
  const vieux = scene.firstElementChild;
  const el = document.createElement(p.type === "video" ? "video" : "img");
  el.className = "media";
  if (p.type === "video") { el.muted = true; el.playsInline = true; el.autoplay = true; el.poster = url(p.miniature); el.src = url(p.fichier); }
  else el.src = url(p.fichier);
  const pret = () => {
    scene.appendChild(el); requestAnimationFrame(() => el.classList.add("visible"));
    if (vieux) { vieux.classList.remove("visible"); setTimeout(() => vieux.remove(), 1200); }
    let heure = ""; try { heure = new Date(p.cree_le).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }); } catch (e) {}
    document.getElementById("legende").innerHTML = `<b>${esc(p.auteur)}</b> · ${esc(heure)}${p.moment ? ` · <span>⚡ ${esc(p.moment)}</span>` : ""}${p.texte ? `<em>${esc(p.texte)}</em>` : ""}`;
    if (p.type === "video") { el.onended = suivant; minuteur = setTimeout(suivant, VIDEO_MAX_MS); el.play().catch(() => {}); }
    else minuteur = setTimeout(suivant, PHOTO_MS);
  };
  el.onerror = () => { minuteur = setTimeout(suivant, 500); };
  if (p.type === "video") el.onloadeddata = pret; else el.onload = pret;
  setTimeout(() => { if (!el.isConnected && enCours === p) pret(); }, 4000);   // si le chargement traîne
}

// L'écran ne doit pas se mettre en veille
async function resterAllume() { try { if (navigator.wakeLock) await navigator.wakeLock.request("screen"); } catch (e) {} }
document.addEventListener("visibilitychange", () => { if (!document.hidden) resterAllume(); });

if (!CFG.supabaseUrl || !INVITE) erreur("Il manque le code du live. Ouvre l'écran géant depuis l'onglet Équipe de l'appli.");
else { cadre(); charger(); setInterval(charger, 15000); resterAllume(); }
