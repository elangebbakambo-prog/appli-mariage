// Annonces (« 📸 Photo de groupe dehors ») et Moments (« ⚡ 2 min pour poster ! ») envoyés par les mariés à tout le monde,
// notifications pour les invités, et livre d'or.
// Chargé AVANT app.js : utilise data, code, rpc, esc, LIVE, INFOS, popupTable, alerte… seulement dans ses fonctions.

const ANNONCES_RAPIDES = ["📸 Photo de groupe dehors dans 5 min !", "🍽️ Le repas commence, installez-vous", "🥂 Direction le vin d'honneur !",
  "⛪ On part à l'église", "💐 Lancer du bouquet au balcon !", "🎂 Le gâteau arrive !", "💃 La piste de danse est ouverte !"];
const MOMENTS_RAPIDES = ["Entrée des mariés", "Première danse", "La chorée Team Bride", "Le gâteau", "Le lancer du bouquet", "Le feu d'artifice"];
let decalage = 0;   // différence entre l'heure du serveur et celle du téléphone (pour le compte à rebours)

// ---------- Les bandeaux : Moment en cours, dernière annonce ----------
const fermees = () => { try { return new Set(JSON.parse(STOCKAGE.getItem("mariage-annonces-fermees") || "[]")); } catch (e) { return new Set(); } };
function annoncesActuelles() {
  const D = INFOS.data || {};
  if (D.maintenant) decalage = new Date(D.maintenant).getTime() - Date.now();
  return D.annonces || [];
}
function momentEnCours() {
  const t = Date.now() + decalage;
  return annoncesActuelles().find(a => a.type === "moment" && a.fin && new Date(a.fin).getTime() > t) || null;
}
function bandeauxAnnonces() {
  let html = "";
  const m = momentEnCours();
  if (m) html += `<section class="moment-barre" role="alert">
      <p><b>⚡ MOMENT : ${esc(m.texte)}</b><span>Il reste <b id="momentReste">${resteMoment(m)}</b> pour poster ta photo ou ta vidéo !</span></p>
      <button type="button" class="btn" data-poster>📸 Poster</button>
    </section>`;
  const F = fermees(), t = Date.now() + decalage;
  const a = annoncesActuelles().find(x => x.type === "annonce" && !F.has(x.id) && t - new Date(x.cree_le).getTime() < 2 * 3600e3);
  if (a) {
    let h = ""; try { h = new Date(a.cree_le).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }); } catch (e) {}
    html += `<section class="annonce-barre" role="status">
        <p><b>📣 ${esc(a.texte)}</b><small>${esc(a.de || "")} · ${esc(h)}</small></p>
        <button type="button" class="fermer" data-annonce-fermer="${esc(a.id)}" aria-label="Fermer l'annonce">×</button>
      </section>`;
  }
  return html;
}
function resteMoment(m) {
  const s = Math.max(0, Math.round((new Date(m.fin).getTime() - Date.now() - decalage) / 1000));
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
}
setInterval(() => {
  const el = document.getElementById("momentReste"), m = momentEnCours();
  if (el && m) el.textContent = resteMoment(m);
  else if (el && !m) dessiner();
}, 1000);

// ---------- Envoyer (mariés et Elange) ----------
function boutonAnnonce() {
  return data && data.moi && data.moi.admin ? `<button type="button" class="btn-wizz btn-annonce" data-annonce-ouvrir aria-label="Envoyer une annonce à tout le monde">📣</button>` : "";
}
function composerAnnonce() {
  return `<h2>📣 À tout le monde</h2>
    <p class="petit">Tous les invités et toute l'équipe reçoivent une notification et voient le message dans l'appli.</p>
    <h3 class="wz-titre">Annonce</h3>
    <div class="wz-puces">${ANNONCES_RAPIDES.map(t => `<button type="button" class="wz-puce wz-msg" data-annonce="${esc(t)}">${esc(t)}</button>`).join("")}</div>
    <form class="wz-form" data-form-annonce="annonce"><input maxlength="140" placeholder="Ou écris ton annonce" autocomplete="off"><button class="btn plein" type="submit">Envoyer</button></form>
    <h3 class="wz-titre">⚡ Lancer un Moment <small>(2 min pour que tout le monde poste)</small></h3>
    <div class="wz-puces">${MOMENTS_RAPIDES.map(t => `<button type="button" class="wz-puce wz-moment" data-moment="${esc(t)}">⚡ ${esc(t)}</button>`).join("")}</div>
    <form class="wz-form" data-form-annonce="moment"><input maxlength="60" placeholder="Ou le nom du Moment" autocomplete="off"><button class="btn plein" type="submit">Lancer</button></form>`;
}
async function envoyerAnnonce(type, texte) {
  texte = String(texte || "").trim();
  if (!texte) return alerte("Écris d'abord le message.");
  const question = type === "moment" ? `Lancer le Moment « ${texte} » ? Tout le monde a 2 min pour poster.` : `Envoyer « ${texte} » à tout le monde ?`;
  if (!confirm(question)) return;
  try {
    if (DEMO_MODE) {
      const A = window.DEMO.annonces = window.DEMO.annonces || [];
      A.unshift({ id: A.length + 1, type, texte, de: data.moi.prenom, cree_le: new Date().toISOString(),
        fin: type === "moment" ? new Date(Date.now() + 120000).toISOString() : null });
    } else await rpc("envoyer_annonce", { p_code: code, p_type: type, p_texte: texte });
    fermerPopupTable();
    alerte(type === "moment" ? "⚡ Moment lancé !" : "📣 Annonce envoyée à tout le monde");
    await chargerInfos(true);
  } catch (e) { alerte(/trop/.test(e.message) ? "Doucement 😄 Trop d'annonces d'un coup." : "Pas envoyé : vérifie ta connexion."); }
}

// ---------- Notifications des invités (pour les annonces et les Moments) ----------
const notifInviteGardee = () => { try { return JSON.parse(STOCKAGE.getItem("mariage-notif-invite") || "null"); } catch (e) { return null; } };
let notifInviteOccupe = false;
function bandeauNotifInvite() {
  if (DEMO_MODE || !CFG.vapidPub || !LIVE.invite) return "";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return iOS && !enApp() ? `<p class="notif-barre">🔔 Pour être prévenu des moments forts (photo de groupe, repas…) : ajoute l'appli à l'écran d'accueil (Partager → « Sur l'écran d'accueil »).</p>` : "";
  }
  if (iOS && !enApp()) return `<p class="notif-barre">🔔 Pour être prévenu des moments forts (photo de groupe, repas…) : ajoute l'appli à l'écran d'accueil (Partager → « Sur l'écran d'accueil »).</p>`;
  if (Notification.permission === "denied") return "";
  const g = notifInviteGardee();
  if (Notification.permission === "granted" && g && g.invite === LIVE.invite) return "";
  return `<div class="notif-barre"><span>🔔 Sois prévenu des moments forts : photo de groupe, repas, entrée des mariés…</span>
    <button type="button" class="btn plein" data-notif-invite ${notifInviteOccupe ? "disabled" : ""}>${notifInviteOccupe ? "Activation…" : "Activer"}</button></div>`;
}
async function activerNotifInvite() {
  notifInviteOccupe = true; dessiner();
  let perm;
  try { perm = await Notification.requestPermission(); } catch (e) { perm = Notification.permission; }
  try {
    if (perm !== "granted") throw new Error("refus");
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uVersOctets(CFG.vapidPub) });
    if (!await rpc("push_invite_enregistrer", { p_invite: LIVE.invite, p_sub: sub.toJSON(), p_prenom: prenomLive() })) throw new Error("refusé");
    STOCKAGE.setItem("mariage-notif-invite", JSON.stringify({ e: sub.endpoint, invite: LIVE.invite }));
    reg.showNotification("🔔 C'est activé !", { body: "Tu seras prévenu des moments forts du mariage.", icon: "icon-192.png", tag: "notif-test" }).catch(() => {});
  } catch (e) { if (e.message !== "refus") alerte("L'activation a échoué. Réessaie."); }
  notifInviteOccupe = false; dessiner();
}

// ---------- Livre d'or ----------
const LIVRE = { liste: null };
function carteLivreOr() {
  if (!LIVE.invite || !prenomLive()) return "";
  return `<section class="carte livre-or">
      <h3>💌 Livre d'or</h3>
      <p class="petit">Laisse un mot à Chaïna et Chris : ils le découvriront après le mariage.</p>
      <form id="formLivre">
        <textarea id="champLivre" maxlength="1000" rows="4" placeholder="Ton message…" required></textarea>
        <button class="btn plein" type="submit">Envoyer mon mot</button>
      </form>
    </section>`;
}
function vueLivreAdmin() {
  if (!data || !data.moi || !data.moi.admin) return "";
  const L = LIVRE.liste;
  return `<details class="fiche" id="livreAdmin"><summary><span class="ico-fiche" aria-hidden="true">💌</span>Livre d'or${L ? ` (${L.length} mot${L.length > 1 ? "s" : ""})` : ""}</summary>
      <div class="fiche-corps">${L === null ? `<p>Chargement…</p>` : L.length ? L.map(m => `<blockquote class="mot"><p>${esc(m.texte)}</p><cite>${esc(m.auteur)}</cite></blockquote>`).join("")
        : `<p>Pas encore de message.</p>`}</div>
    </details>`;
}
async function chargerLivre() {
  if (!data || !data.moi || !data.moi.admin) return;
  try { LIVRE.liste = DEMO_MODE ? (window.DEMO.livre || []) : await rpc("livre_or_lire", { p_code: code }); } catch (e) { return; }
  const d = document.getElementById("livreAdmin"), ouvert = d && d.open;
  if (d) { d.outerHTML = vueLivreAdmin(); if (ouvert) document.getElementById("livreAdmin").open = true; }
}

// ---------- Interactions ----------
document.addEventListener("click", e => {
  if (e.target.closest("[data-annonce-ouvrir]")) return popupTable(composerAnnonce(), "Annonce à tout le monde");
  const a = e.target.closest("[data-annonce]"); if (a) return envoyerAnnonce("annonce", a.dataset.annonce);
  const m = e.target.closest("[data-moment]"); if (m) return envoyerAnnonce("moment", m.dataset.moment);
  const f = e.target.closest("[data-annonce-fermer]");
  if (f) { const F = fermees(); F.add(Number(f.dataset.annonceFermer)); try { STOCKAGE.setItem("mariage-annonces-fermees", JSON.stringify([...F].slice(-50))); } catch (err) {} return dessiner(); }
  if (e.target.closest("[data-notif-invite]")) return activerNotifInvite();
});
document.addEventListener("submit", async e => {
  const fa = e.target.closest("[data-form-annonce]");
  if (fa) { e.preventDefault(); return envoyerAnnonce(fa.dataset.formAnnonce, fa.querySelector("input").value); }
  if (e.target.id !== "formLivre") return;
  e.preventDefault();
  const c = document.getElementById("champLivre"), t = c.value.trim();
  if (!t) return;
  try {
    if (DEMO_MODE) (window.DEMO.livre = window.DEMO.livre || []).push({ auteur: prenomLive(), texte: t, cree_le: new Date().toISOString() });
    else if (!await rpc("livre_or_ecrire", { p_invite: LIVE.invite, p_auteur: prenomLive(), p_texte: t })) throw new Error("refusé");
    c.value = ""; alerte("💌 Merci ! Ton mot est bien envoyé aux mariés.");
    chargerLivre();
  } catch (err) { alerte(/trop/.test(err.message) ? "Tu as déjà écrit plusieurs mots, attends un peu 😊" : "Pas envoyé : vérifie ta connexion."); }
});
document.addEventListener("toggle", e => { if (e.target.id === "livreAdmin" && e.target.open) chargerLivre(); }, true);

// Les annonces et Moments arrivent toutes les 15 s (et dès qu'on revient sur l'appli)
setInterval(() => { if (!document.hidden && LIVE.invite && (data || modeInvite())) chargerInfos(true); }, 15000);
