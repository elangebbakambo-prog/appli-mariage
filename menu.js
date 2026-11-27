// Le menu qui glisse depuis la gauche (comme l'appli Vegas) : un accès direct à tout, sans faire défiler la page.
// Bouton ☰ en haut à gauche, ou glisser le doigt depuis le bord gauche de l'écran ; glisser vers la gauche pour fermer.
// Chargé AVANT app.js : utilise data, onglet, ongletInvite, modeInvite, dessiner… seulement dans ses fonctions.

function construireMenu() {
  if (document.getElementById("menuBtn")) return;
  document.body.insertAdjacentHTML("beforeend", `
    <button type="button" class="menu-btn" id="menuBtn" aria-label="Ouvrir le menu" aria-expanded="false" aria-controls="tiroir"><span></span><span></span><span></span></button>
    <div class="voile" id="voile"></div>
    <nav class="tiroir" id="tiroir" aria-label="Menu" aria-hidden="true">
      <div class="tr-tete"><div><p class="eyebrow">Le mariage de</p><b class="tr-titre">${esc(CFG.maries || "")}</b></div>
        <button type="button" class="tr-x" id="menuFermer" aria-label="Fermer le menu">✕</button></div>
      <div id="tiroirListe"></div>
    </nav>`);
  document.getElementById("menuBtn").onclick = ouvrirMenu;
  document.getElementById("menuFermer").onclick = fermerMenu;
  document.getElementById("voile").onclick = fermerMenu;
}
function entrees() {
  const E = [], sec = t => E.push({ sep: t }), it = (ico, nom, act, extra) => E.push({ ico, nom, act, extra });
  const fiches = (modeInvite() ? (INFOS.data && INFOS.data.fiches) : data && data.fiches) || [];
  if (modeInvite()) {
    it("📸", "Le live", "o:live"); it("📅", "Programme", "o:programme"); it("🍽️", "Trouve ta table", "table");
    sec("Infos");
    fiches.forEach(f => it(f.icone || "📄", f.titre, "f:" + f.id));
    it("💌", "Livre d'or", "livre");
    if (bandeauNotifInvite()) it("🔔", "Activer les notifications", "notif");
    return E;
  }
  if (!data) return E;
  const reste = (data.taches || []).filter(t => !t.fait && t.section !== SECTION_PHOTOS).length;
  it("📅", "Programme", "o:programme"); it("🎥", "Le live", "o:live"); it("✅", data.moi.admin ? "Tâches" : "Mes tâches", "o:taches", reste ? String(reste) : "");
  if (mesContacts().length) it("📞", "Numéros importants", "o:contacts");
  if (photosGroupe().length) it("📸", "Photos de groupe", "o:photos", compteurPhotos());
  it("🍽️", "Trouve ta table", "table");
  if (data.annuaire && data.annuaire.length) it("⚡", "Envoyer un wizz", "wizz");
  if (data.moi.admin) it("📣", "Annonce ou Moment", "annonce");
  if (fiches.length) { sec("Fiches"); fiches.forEach(f => it(f.icone || "📄", f.titre, "f:" + f.id)); }
  sec("Livre d'or");
  if (data.moi.admin) it("📖", "Lire les mots", "livre-lire");
  it("💌", "Écrire un mot", "livre");
  if (data.moi.admin) {
    sec("Organisation");
    it("👥", "Équipe et liens", "o:equipe"); it("📺", "Écran géant", "ecran"); it("📦", "Télécharger les souvenirs", "souvenirs");
  }
  if (bandeauNotif()) { sec("Réglages"); it("🔔", "Activer les notifications", "notif"); }
  return E;
}
function remplirMenu() {
  const box = document.getElementById("tiroirListe"); if (!box) return;
  const actif = modeInvite() ? "o:" + ongletInvite : "o:" + onglet;
  let html = "", ouvert = false;
  for (const e of entrees()) {
    if (e.sep) { if (ouvert) html += "</ul>"; html += `<p class="tr-sep">${esc(e.sep)}</p><ul class="tr-liste">`; ouvert = true; continue; }
    if (!ouvert) { html += `<ul class="tr-liste">`; ouvert = true; }
    html += `<li><button type="button" data-aller="${esc(e.act)}" ${e.act === actif ? 'aria-current="page"' : ""}><i aria-hidden="true">${esc(e.ico)}</i><span>${esc(e.nom)}</span>${e.extra ? `<b>${esc(e.extra)}</b>` : ""}</button></li>`;
  }
  if (ouvert) html += "</ul>";
  box.innerHTML = html;
}
function ouvrirMenu() {
  construireMenu(); remplirMenu();
  document.body.classList.add("menu-ouvert");
  document.getElementById("tiroir").setAttribute("aria-hidden", "false");
  document.getElementById("menuBtn").setAttribute("aria-expanded", "true");
  const f = document.querySelector('#tiroir [aria-current="page"]') || document.querySelector("#tiroir button[data-aller]");
  if (f) setTimeout(() => f.focus({ preventScroll: true }), 50);
}
function fermerMenu() {
  if (!document.body.classList.contains("menu-ouvert")) return;
  document.body.classList.remove("menu-ouvert");
  document.getElementById("tiroir").setAttribute("aria-hidden", "true");
  document.getElementById("menuBtn").setAttribute("aria-expanded", "false");
}

// Aller quelque part : changer d'onglet, puis ouvrir et montrer le bon élément
function allerOnglet(o) {
  if (modeInvite()) ongletInvite = o; else onglet = o;
  dessiner(); window.scrollTo({ top: 0 });
  if (o === "live") chargerLive(); else if (modeInvite()) chargerInfos();
}
const montrer = (sel, ouvrir) => setTimeout(() => {
  const el = document.querySelector(sel); if (!el) return;
  if (ouvrir && el.tagName === "DETAILS") el.open = true;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
  el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash");
}, 60);
function aller(act) {
  fermerMenu();
  const ongletInfos = modeInvite() ? "infos" : "fiches";
  if (act.startsWith("o:")) return allerOnglet(act.slice(2));
  if (act.startsWith("f:")) { allerOnglet(ongletInfos); return montrer(`[data-fiche="${CSS.escape(act.slice(2))}"]`, true); }
  if (act === "table") { montrer("#formTable"); return setTimeout(() => { const c = document.getElementById("champTable"); if (c) c.focus({ preventScroll: true }); }, 400); }
  if (act === "livre") { allerOnglet(ongletInfos); montrer(".livre-or"); return setTimeout(() => { const c = document.getElementById("champLivre"); if (c) c.focus({ preventScroll: true }); }, 500); }
  if (act === "livre-lire") { allerOnglet("fiches"); return montrer("#livreAdmin", true); }
  if (act === "wizz") { const b = document.querySelector("[data-wizz-ouvrir]"); return b && b.click(); }
  if (act === "annonce") { const b = document.querySelector("[data-annonce-ouvrir]"); return b && b.click(); }
  if (act === "ecran") { allerOnglet("equipe"); return montrer(".ecran-carte"); }
  if (act === "souvenirs") { allerOnglet("live"); return montrer(".souvenirs"); }
  if (act === "notif") { window.scrollTo({ top: 0, behavior: "smooth" }); return montrer(".notif-barre"); }
}
document.addEventListener("click", e => { const b = e.target.closest("[data-aller]"); if (b) aller(b.dataset.aller); });
document.addEventListener("keydown", e => { if (e.key === "Escape") fermerMenu(); });
// Glisser depuis le bord gauche pour ouvrir, vers la gauche pour fermer
(() => {
  let x0 = null, y0 = 0, depuis = "";
  document.addEventListener("touchstart", e => {
    if (story || (cam && cam.el && !cam.el.hidden) || !document.getElementById("menuBtn")) return;
    const t = e.touches[0], ouvert = document.body.classList.contains("menu-ouvert");
    if (!ouvert && t.clientX > 24) return;
    x0 = t.clientX; y0 = t.clientY; depuis = ouvert ? "ouvert" : "bord";
  }, { passive: true });
  document.addEventListener("touchend", e => {
    if (x0 === null) return;
    const t = e.changedTouches[0], dx = t.clientX - x0, dy = Math.abs(t.clientY - y0); x0 = null;
    if (dy > 60) return;
    if (depuis === "bord" && dx > 50) ouvrirMenu(); else if (depuis === "ouvert" && dx < -50) fermerMenu();
  }, { passive: true });
})();
// Le bouton ☰ n'apparaît que quand on est entré dans l'appli (lien perso, ou invité avec son prénom)
function majBoutonMenu() {
  const visible = !!data || (modeInvite() && !!prenomLive());
  if (visible) construireMenu();
  const b = document.getElementById("menuBtn"); if (b) b.hidden = !visible;
  if (document.body.classList.contains("menu-ouvert")) remplirMenu();
}
