// Le Wizz (comme sur MSN) : biper quelqu'un de l'équipe. Chez lui, l'écran tremble, le téléphone vibre et sonne.
// Pour l'instant, le wizz arrive quand l'appli est ouverte (vérification toutes les 8 s, et dès qu'on revient dessus).
// Chargé AVANT app.js : utilise data, code, rpc, esc, avatar, popupTable… seulement dans ses fonctions.

const WIZZ = { file: [], affiche: null, choix: new Set(), lieu: "", timer: 0 };
// Les endroits du mariage (Domaine de Fompeyre et église) : touchés une fois, ils s'ajoutent au message
const LIEUX_WIZZ = ["Chambre de la mariée", "Salle prépa garçons", "Salle de shooting", "Salle principale", "Salle du vin d'honneur",
  "Entrée / jonction des salles", "Vestiaire", "Parking", "Cheminée", "Table d'honneur", "Piste de danse / DJ", "Bar",
  "Tables dessert", "Arche (dehors)", "Devant le château", "Église"];
const MESSAGES_WIZZ = ["Besoin de toi ici 🙏", "Tu es où ?", "Urgent, appelle-moi 📞", "Viens vite !", "On t'attend pour la photo 📸", "C'est l'heure ⏰"];
const lusRep = () => { try { return new Set(JSON.parse(STOCKAGE.getItem("mariage-wizz-rep") || "[]")); } catch (e) { return new Set(); } };

// ---------- Envoyer ----------
function boutonWizz() {
  return data && data.annuaire && data.annuaire.length ? `<button type="button" class="btn-wizz" data-wizz-ouvrir aria-label="Envoyer un wizz">⚡ Wizz</button>` : "";
}
function composerWizz() {
  const A = (data && data.annuaire) || [];
  const groupes = [...new Set(A.flatMap(p => p.groupes || []))].sort();
  const nomGroupe = g => ({ Team: "Toute la Team", Filles: "Les filles", "Garçons": "Les garçons", Prestataires: "Les prestataires", Photo: "Photo et vidéo" }[g] || g);
  const puce = (val, html) => `<button type="button" class="wz-puce ${WIZZ.choix.has(val) ? "on" : ""}" data-wizz-pour="${esc(val)}" aria-pressed="${WIZZ.choix.has(val)}">${html}</button>`;
  const lieux = LIEUX_WIZZ.map(l => { const choisi = WIZZ.lieu === l;
    return `<button type="button" class="wz-puce wz-lieu ${choisi ? "on" : ""}" data-wizz-lieu="${esc(l)}" aria-pressed="${choisi}">📍 ${esc(l)}</button>`; }).join("");
  const gens = A.map(p => puce(p.prenom, `${avatar(p, 30)}<span>${esc(p.prenom)}</span>`)).join("");   // puce() échappe la valeur
  return `<h2>⚡ Wizz</h2>
    <p class="petit">Bipe quelqu'un : son écran tremble et son téléphone vibre.</p>
    <h3 class="wz-titre">À qui ?</h3>
    ${groupes.length ? `<div class="wz-puces">${groupes.map(g => puce(g, esc(nomGroupe(g)))).join("")}</div>` : ""}
    <div class="wz-puces wz-gens">${gens}</div>
    <h3 class="wz-titre">Où ? <small>(facultatif)</small></h3>
    <div class="wz-puces wz-lieux">${lieux}</div>
    <h3 class="wz-titre">Message <small>(il part dès que tu le touches)</small></h3>
    <div class="wz-puces">${MESSAGES_WIZZ.map(m => `<button type="button" class="wz-puce wz-msg" data-wizz-msg="${esc(m)}">${esc(m)}</button>`).join("")}</div>
    <form id="formWizz" class="wz-form">
      <input id="champWizz" maxlength="140" placeholder="Ou écris ton message (ex. Viens au vestiaire)" autocomplete="off" enterkeyhint="send">
      <button class="btn plein" type="submit">Envoyer ⚡</button>
    </form>`;
}
function majChoixWizz() {
  document.querySelectorAll("[data-wizz-pour]").forEach(b => {
    const on = WIZZ.choix.has(b.dataset.wizzPour); b.classList.toggle("on", on); b.setAttribute("aria-pressed", on);
  });
}
async function envoyerWizz(message) {
  const pour = [...WIZZ.choix], texte = String(message || "").trim();
  const msg = texte && WIZZ.lieu ? (texte + "\n📍 " + WIZZ.lieu).slice(0, 140) : texte;
  if (!pour.length) return alerte("Choisis d'abord à qui envoyer le wizz.");
  if (!msg) return alerte("Choisis ou écris un message.");
  try {
    let n;
    if (DEMO_MODE) {
      const A = data.annuaire || [];
      const cibles = A.filter(p => pour.some(x => x === p.prenom || (p.groupes || []).includes(x)));
      cibles.forEach(p => (window.DEMO.wizz = window.DEMO.wizz || []).push({ pour: p.prenom, de: data.moi.prenom, message: msg }));
      n = cibles.length;
      if (cibles[0]) setTimeout(() => alerte(cibles[0].prenom + " : J'arrive 🏃"), 2500);   // réponse simulée
    } else n = await rpc("envoyer_wizz", { p_code: code, p_pour: pour, p_message: msg });
    fermerPopupTable(); WIZZ.choix.clear(); WIZZ.lieu = "";
    alerte(n ? `⚡ Wizz envoyé à ${n} personne${n > 1 ? "s" : ""}` : "Personne à wizzer dans ce choix.");
    if (navigator.vibrate) navigator.vibrate(60);
  } catch (e) { alerte(/trop de wizz/.test(e.message) ? "Doucement 😄 Trop de wizz d'un coup." : "Pas envoyé : vérifie ta connexion."); }
}
document.addEventListener("click", e => {
  if (e.target.closest("[data-wizz-ouvrir]")) { WIZZ.choix.clear(); WIZZ.lieu = ""; return popupTable(composerWizz(), "Envoyer un wizz"); }
  const l = e.target.closest("[data-wizz-lieu]");
  if (l) {
    WIZZ.lieu = WIZZ.lieu === l.dataset.wizzLieu ? "" : l.dataset.wizzLieu;
    document.querySelectorAll("[data-wizz-lieu]").forEach(b => { const on = b.dataset.wizzLieu === WIZZ.lieu; b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); });
    return;
  }
  const p = e.target.closest("[data-wizz-pour]");
  if (p) { const v = p.dataset.wizzPour; WIZZ.choix.has(v) ? WIZZ.choix.delete(v) : WIZZ.choix.add(v); return majChoixWizz(); }
  const m = e.target.closest("[data-wizz-msg]");
  if (m) return envoyerWizz(m.dataset.wizzMsg);
  const r = e.target.closest("[data-wizz-rep]");
  if (r) return repondreWizz(r.dataset.wizzRep);
});
document.addEventListener("submit", e => {
  if (e.target.id !== "formWizz") return;
  e.preventDefault();
  envoyerWizz(document.getElementById("champWizz").value);
});

// ---------- Recevoir ----------
async function verifierWizz() {
  if (!data || !code || document.hidden) return;
  let r;
  try {
    if (DEMO_MODE) {
      const W = window.DEMO.wizz || [];
      r = { recus: W.filter(w => w.pour === data.moi.prenom && !w.vu).map((w, i) => Object.assign({ id: "d" + W.indexOf(w), cree_le: new Date().toISOString() }, w)), reponses: [] };
    } else r = await rpc("mes_wizz", { p_code: code });
  } catch (e) { return; }
  if (!r) return;
  for (const w of r.recus) if (!WIZZ.file.some(x => x.id === w.id) && (!WIZZ.affiche || WIZZ.affiche.id !== w.id)) WIZZ.file.push(w);
  afficherWizz();
  const vus = lusRep();
  for (const x of r.reponses) {
    if (vus.has(x.id)) continue;
    vus.add(x.id); alerte(x.qui + " : " + x.reponse);   // alerte() affiche du texte brut
    if (navigator.vibrate) navigator.vibrate([80, 60, 80]);
  }
  try { STOCKAGE.setItem("mariage-wizz-rep", JSON.stringify([...vus].slice(-200))); } catch (e) {}
}
function sonWizz() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext; if (!Ctx) return;
    const ac = WIZZ.ac || (WIZZ.ac = new Ctx()); if (ac.state === "suspended") ac.resume();
    [0, .16, .32].forEach((t, i) => {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = "square"; o.frequency.value = [880, 660, 990][i];
      g.gain.setValueAtTime(.0001, ac.currentTime + t); g.gain.exponentialRampToValueAtTime(.18, ac.currentTime + t + .02);
      g.gain.exponentialRampToValueAtTime(.0001, ac.currentTime + t + .14);
      o.connect(g).connect(ac.destination); o.start(ac.currentTime + t); o.stop(ac.currentTime + t + .15);
    });
  } catch (e) {}
}
// Le son a besoin d'un premier toucher sur la page (règle des navigateurs) : on le « réveille » au premier clic
document.addEventListener("pointerdown", () => { if (!WIZZ.ac) try { const C = window.AudioContext || window.webkitAudioContext; if (C) WIZZ.ac = new C(); } catch (e) {} }, { once: true });

function afficherWizz() {
  if (WIZZ.affiche || !WIZZ.file.length) return;
  const w = WIZZ.affiche = WIZZ.file.shift();
  let ov = document.getElementById("wizz");
  if (!ov) { ov = document.createElement("div"); ov.id = "wizz"; ov.setAttribute("role", "alertdialog"); ov.setAttribute("aria-label", "Wizz"); document.body.appendChild(ov); }
  let heure = ""; try { heure = new Date(w.cree_le).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }); } catch (e) {}
  const photoDe = avatar({ prenom: w.de, photo: w.photo }, 64);   // avatar() échappe lui-même
  const [texteSeul, lieu] = String(w.message).split("\n📍 ");
  ov.innerHTML = `<div class="wz-boite">
      <p class="wz-eclair" aria-hidden="true">⚡</p>
      <p class="wz-de">${photoDe}<span>WIZZ de <b>${esc(w.de)}</b></span></p>
      <p class="wz-texte">${esc(texteSeul)}</p>
      ${lieu ? `<p class="wz-ou">📍 ${esc(lieu)}</p>` : ""}
      <p class="petit">${esc(heure)}</p>
      <div class="wz-reponses">
        <button type="button" class="btn plein" data-wizz-rep="J'arrive 🏃">J'arrive 🏃</button>
        <button type="button" class="btn" data-wizz-rep="Pas dispo ✋">Pas dispo ✋</button>
        <button type="button" class="btn" data-wizz-rep="Vu 👍">Vu 👍</button>
      </div>
    </div>`;
  ov.hidden = false; document.documentElement.classList.add("plein-ecran");
  ov.classList.remove("tremble"); void ov.offsetWidth; ov.classList.add("tremble");
  if (navigator.vibrate) navigator.vibrate([300, 120, 300, 120, 600]);
  sonWizz();
  const b = ov.querySelector("[data-wizz-rep]"); if (b) b.focus();
}
async function repondreWizz(reponse) {
  const w = WIZZ.affiche; if (!w) return;
  const ov = document.getElementById("wizz");
  if (ov) { ov.hidden = true; ov.innerHTML = ""; }
  document.documentElement.classList.remove("plein-ecran");
  WIZZ.affiche = null;
  try {
    if (DEMO_MODE) { const d = (window.DEMO.wizz || [])[Number(String(w.id).slice(1))]; if (d) d.vu = true; }
    else await rpc("repondre_wizz", { p_code: code, p_id: w.id, p_reponse: reponse });
    alerte("Réponse envoyée à " + w.de);
  } catch (e) { alerte("Réponse pas envoyée : vérifie ta connexion."); }
  afficherWizz();
}

setInterval(verifierWizz, 8000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) verifierWizz(); });

// ---------- Notifications : le wizz sonne même téléphone verrouillé (comme l'appli Vegas) ----------
const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const enApp = () => { try { return matchMedia("(display-mode: standalone)").matches || navigator.standalone === true; } catch (e) { return false; } };
const notifGardee = () => { try { return JSON.parse(STOCKAGE.getItem("mariage-notif") || "null"); } catch (e) { return null; } };
let notifOccupe = false, notifMsg = "";
function etatNotif() {
  if (DEMO_MODE || !CFG.vapidPub) return "cache";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return iOS && !enApp() ? "installer" : "impossible";
  if (iOS && !enApp()) return "installer";
  if (Notification.permission === "denied") return "bloque";
  const g = notifGardee();
  return Notification.permission === "granted" && g && g.code === code ? "on" : "off";
}
function bandeauNotif() {
  const e = etatNotif();
  if (e === "cache" || e === "on" || e === "impossible") return "";
  if (e === "installer") return `<p class="notif-barre">🔔 Pour recevoir les wizz même téléphone verrouillé : ajoute l'appli à l'écran d'accueil (Safari → Partager → « Sur l'écran d'accueil »), puis ouvre-la depuis l'icône.</p>`;
  if (e === "bloque") return `<p class="notif-barre">🔕 Notifications bloquées. Pour les réactiver : Réglages du téléphone → Notifications → Mariage (ou Chrome).</p>`;
  return `<div class="notif-barre"><span>🔔 Reçois les wizz même téléphone verrouillé.</span>
    <button type="button" class="btn plein" data-notif-on ${notifOccupe ? "disabled" : ""}>${notifOccupe ? "Activation…" : "Activer"}</button>
    ${notifMsg ? `<small class="err">${esc(notifMsg)}</small>` : ""}</div>`;
}
const b64uVersOctets = s => { const t = s.replace(/-/g, "+").replace(/_/g, "/"); const b = atob(t + "=".repeat((4 - t.length % 4) % 4)); return Uint8Array.from(b, c => c.charCodeAt(0)); };
async function activerNotif() {
  notifMsg = ""; notifOccupe = true; dessiner();
  let perm;
  try { perm = await Notification.requestPermission(); } catch (e) { perm = Notification.permission; }
  if (perm !== "granted") { notifOccupe = false; notifMsg = perm === "denied" ? "" : "Il faut accepter les notifications."; return dessiner(); }
  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uVersOctets(CFG.vapidPub) });
    if (!await rpc("push_enregistrer", { p_code: code, p_sub: sub.toJSON() })) throw new Error("refusé");
    STOCKAGE.setItem("mariage-notif", JSON.stringify({ e: sub.endpoint, code }));
    reg.showNotification("🔔 Notifications activées", { body: "Tu recevras les wizz même téléphone verrouillé.", icon: "icon-192.png", tag: "notif-test" }).catch(() => {});
  } catch (e) { notifMsg = "L'activation a échoué. Réessaie."; }
  notifOccupe = false; dessiner();
}
// Si le téléphone a renouvelé son abonnement, on le remet à jour sans rien demander
async function resyncNotif() {
  if (etatNotif() !== "on") return;
  try {
    const reg = await navigator.serviceWorker.ready, sub = await reg.pushManager.getSubscription(), g = notifGardee();
    if (!sub) { STOCKAGE.removeItem("mariage-notif"); return dessiner(); }
    if (g.e !== sub.endpoint) { await rpc("push_enregistrer", { p_code: code, p_sub: sub.toJSON() }); STOCKAGE.setItem("mariage-notif", JSON.stringify({ e: sub.endpoint, code })); }
  } catch (e) {}
}
document.addEventListener("click", e => { if (e.target.closest("[data-notif-on]")) activerNotif(); });
setTimeout(resyncNotif, 3000);
