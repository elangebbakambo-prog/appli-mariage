// Appli du mariage : chacun ouvre SON lien (…/?code=XXXX) et voit son programme et ses tâches.
// Les données viennent de Supabase (fonctions mon_espace et cocher, voir supabase/schema.sql),
// ou de demo.js tant que Supabase n'est pas branché.

const CFG = window.MARIAGE || {};
const DEMO_MODE = !CFG.supabaseUrl;
const app = document.getElementById("app");
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const hhmm = t => (t ? String(t).slice(0, 5).replace(":", "h") : "");
const maps = q => "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(q);

// ---------- Le code perso : dans l'adresse, sinon mémorisé sur le téléphone ----------
const params = new URLSearchParams(location.search);
let code = params.get("code") || "";
try {
  if (code) localStorage.setItem("mariage-code", code);
  else code = localStorage.getItem("mariage-code") || "";
} catch (e) {}
if (code && !params.get("code")) history.replaceState(null, "", "?code=" + encodeURIComponent(code));
// Invité (QR code) : le code invités reste aussi dans l'adresse, pour l'icône de l'écran d'accueil
if (!code && LIVE.invite && !params.get("invite")) history.replaceState(null, "", "?invite=" + encodeURIComponent(LIVE.invite));
// Un invité n'a pas de lien perso : il ne voit que le live
const modeInvite = () => !code && !!LIVE.invite;

let data = null;         // ce que mon_espace renvoie
let onglet = "programme";
let erreur = "";

// ---------- Accès aux données ----------
async function rpc(nom, corps) {
  const r = await fetch(CFG.supabaseUrl + "/rest/v1/rpc/" + nom, {
    method: "POST",
    headers: { apikey: CFG.supabaseKey, "Content-Type": "application/json" },
    body: JSON.stringify(corps),
    cache: "no-store"
  });
  if (!r.ok) throw new Error("Supabase " + r.status);
  return r.json();
}

// Même règle que la fonction SQL concerne()
const concerne = (pour, role, prenom, groupes) =>
  !pour || !pour.length || pour.some(r => [role.toLowerCase(), prenom.toLowerCase(), "tous", ...(groupes || []).map(g => g.toLowerCase())]
    .includes(r.trim().toLowerCase()));

function demoEspace(c) {
  const D = window.DEMO;
  const m = D.personnes.find(p => p.code === c);
  if (!m) return null;
  let coches = {};
  try { coches = JSON.parse(localStorage.getItem("mariage-demo-coches") || "{}"); } catch (e) {}
  const mien = t => m.admin || (t.prenom ? t.prenom === m.prenom : t.role ? t.role.toLowerCase() === m.role.toLowerCase()
    : (t.pour || []).length > 0 && concerne(t.pour, m.role, m.prenom, m.groupes));
  return {
    moi: { prenom: m.prenom, role: m.role, admin: m.admin, photo: m.photo || null },
    ma_table: m.nom_plan ? (() => { const p = (D.plan || []).find(x => x.nom === m.nom_plan); return p ? { nom: p.nom, detail: demoDetail(p.table) } : null; })() : null,
    moments: D.moments.filter(x => m.admin || concerne(x.pour, m.role, m.prenom, m.groupes)),
    taches: D.taches.filter(mien).map(t => Object.assign({ pour: t.prenom || t.role, fait: false }, t, coches[t.id] || {})),
    fiches: (D.fiches || []).filter(f => m.admin || f.public || (f.pour.length && concerne(f.pour, m.role, m.prenom))),
    equipe: m.admin ? D.personnes : null,
    invite: "invites"
  };
}

// Dernières données reçues, gardées sur le téléphone : l'appli marche même sans réseau
const CLE_COPIE = () => "mariage-copie-" + code;
function lireCopie() { try { return JSON.parse(localStorage.getItem(CLE_COPIE()) || "null"); } catch (e) { return null; } }
function garderCopie() { try { localStorage.setItem(CLE_COPIE(), JSON.stringify(data)); } catch (e) {} }
let horsLigne = false;

async function charger() {
  if (modeInvite()) { dessiner(); chargerInfos(); return chargerLive(); }
  if (!code) { data = null; return dessiner(); }
  if (!data) { data = lireCopie(); if (data) dessiner(); }
  try {
    const frais = DEMO_MODE ? demoEspace(code) : await rpc("mon_espace", { p_code: code });
    data = frais; horsLigne = false;
    erreur = data ? "" : "inconnu";
    if (data) garderCopie();
    if (data && data.invite) LIVE.invite = data.invite;
  } catch (e) {
    horsLigne = !!data;
    erreur = data ? "" : "reseau";   // si on avait déjà des données, on les garde
  }
  dessiner();
}

async function cocher(id, fait) {
  const t = data.taches.find(x => x.id === id);
  if (!t) return;
  t.fait = fait; t.fait_par = fait ? data.moi.prenom : null; t.fait_le = fait ? new Date().toISOString() : null;
  dessiner();
  garderCopie();
  if (DEMO_MODE) {
    let c = {};
    try { c = JSON.parse(localStorage.getItem("mariage-demo-coches") || "{}"); } catch (e) {}
    c[id] = { fait, fait_par: t.fait_par, fait_le: t.fait_le };
    try { localStorage.setItem("mariage-demo-coches", JSON.stringify(c)); } catch (e) {}
    return;
  }
  try {
    const ok = await rpc("cocher", { p_code: code, p_tache: id, p_fait: fait });
    if (!ok) throw new Error("refusé");
  } catch (e) {
    t.fait = !fait; garderCopie(); dessiner();
    alerte("Pas enregistré : vérifie ta connexion et réessaie.");
  }
}

// ---------- Le temps : compte à rebours, et « maintenant » le jour J ----------
function jourJ() {
  const auj = new Date(); auj.setHours(0, 0, 0, 0);
  const j = new Date(CFG.date + "T00:00:00");
  return Math.round((j - auj) / 86400000);   // 0 = aujourd'hui
}
// ---------- Affichage ----------
function entete() {
  const j = jourJ();
  const quand = j > 1 ? `J-${j}` : j === 1 ? "C'est demain !" : j === 0 ? "C'est aujourd'hui ✨" : "";
  let date = "";
  try { date = new Date(CFG.date + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }); } catch (e) {}
  return `<header class="hero">
    <p class="eyebrow">Le mariage de</p>
    <h1>${esc(CFG.maries)}</h1>
    <p class="date">${esc(date)}${quand ? ` · <b>${quand}</b>` : ""}</p>
    ${DEMO_MODE ? `<p class="demo">Mode démo : les données sont des exemples.</p>` : ""}
  </header>`;
}

function ecranCode() {
  const msg = erreur === "inconnu" ? `<p class="err">Ce lien n'est pas reconnu. Vérifie que tu as bien ouvert le lien reçu en entier.</p>`
    : erreur === "reseau" ? `<p class="err">Impossible de charger : vérifie ta connexion.</p>` : "";
  return `${entete()}
  <section class="carte">
    <h2>Bienvenue 👋</h2>
    <p>Ouvre le lien perso que tu as reçu par message : il t'amène directement à ton programme.</p>
    ${msg}
    <form id="formCode" class="ligne">
      <input id="champCode" placeholder="Ou colle ton code ici" autocomplete="off" autocapitalize="off" required>
      <button class="btn plein" type="submit">Entrer</button>
    </form>
    ${DEMO_MODE ? `<p class="petit">Démo : essaie <a href="?code=mariee">la mariée</a>, <a href="?code=temoin">un témoin</a> ou <a href="?code=dj">le DJ</a>.</p>` : ""}
  </section>`;
}

function vueProgramme() { return carteMaTable() + frise(data.moments, data.moi.admin); }

function ligneTache(t) {
  const qui = t.fait && t.fait_par ? ` · fait par ${esc(t.fait_par)}` : "";
  return `<li class="tache ${t.fait ? "faite" : ""}">
    <label>
      <input type="checkbox" data-tache="${t.id}" ${t.fait ? "checked" : ""}>
      <span class="case" aria-hidden="true"></span>
      <span class="txt">
        <b>${esc(t.titre)}</b>
        ${t.details ? `<small>${esc(t.details)}</small>` : ""}
        <small class="meta">${t.heure ? "🕒 " + hhmm(t.heure) : ""}${data.moi.admin && t.pour ? (t.heure ? " · " : "") + esc([].concat(t.pour).join(", ")) : ""}${qui}</small>
      </span>
    </label>
  </li>`;
}

function vueTaches() {
  const T = data.taches;
  if (!T.length) return `<p class="vide">Rien à faire pour toi pour l'instant. Profite ! 🥂</p>`;
  const reste = T.filter(t => !t.fait).length;
  // Par section (« Vendredi · Salle principale »…), dans l'ordre d'arrivée ; sinon « Avant le jour J » / « Le jour J »
  const groupes = new Map();
  for (const t of T) {
    const g = t.section || (t.heure ? "Le jour J" : "Avant le jour J");
    if (!groupes.has(g)) groupes.set(g, []);
    groupes.get(g).push(t);
  }
  const parHeure = L => L.slice().sort((a, b) => (a.heure ? 1 : 0) - (b.heure ? 1 : 0) || String(a.heure || "").localeCompare(String(b.heure || "")));
  return `<p class="resume">${reste ? `<b>${reste}</b> à faire sur ${T.length}` : "Tout est fait 🎉"}</p>
    ${[...groupes].map(([g, L]) => {
      const faites = L.filter(t => t.fait).length;
      return `<h3 class="sous">${esc(g)} <small>${faites}/${L.length}</small></h3><ul class="taches">${parHeure(L).map(ligneTache).join("")}</ul>`;
    }).join("")}`;
}

function vueEquipe() {
  const base = location.origin + location.pathname;
  return `<p class="petit">Chaque personne a son lien : envoie-le-lui, elle ne verra que ce qui la concerne.
    Ne partage pas les liens admin (ils voient et cochent tout).</p>
  <ul class="equipe">${data.equipe.map(p => {
    const lien = base + "?code=" + encodeURIComponent(p.code);
    // Ses tâches perso (ou de son rôle) ; les tâches de groupe (Team, Photo…) ne comptent pas ici
    const pourTxt = t => (Array.isArray(t.pour) ? t.pour.join(", ") : String(t.pour || "")).toLowerCase();
    const sesTaches = data.taches.filter(t => pourTxt(t) === p.prenom.toLowerCase() || pourTxt(t) === p.role.toLowerCase());
    const faites = sesTaches.filter(t => t.fait).length;
    const msg = `Salut ${p.prenom} ! Voici ton lien pour le mariage de ${CFG.maries} : ton programme et tes tâches sont dedans 👉 ${lien}`;
    const tel = (p.tel || "").replace(/[^\d]/g, "").replace(/^0/, "33");
    return `<li class="perso">
      <div class="qui">${avatar(p, 40, data.moi.admin ? `data-photo="${esc(p.prenom)}"` : "")}<b>${esc(p.prenom)}</b> <span class="pastille ${p.admin ? "or" : ""}">${esc(p.role)}${p.admin ? " · admin" : ""}</span></div>
      ${sesTaches.length ? `<div class="barre" title="${faites} sur ${sesTaches.length}"><i style="width:${Math.round(100 * faites / sesTaches.length)}%"></i></div>
        <small>${faites} / ${sesTaches.length} tâches faites</small>` : `<small>Aucune tâche</small>`}
      <div class="actions">
        <button class="btn" type="button" data-copier="${esc(lien)}">Copier le lien</button>
        <a class="btn" href="https://wa.me/${tel}?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener">WhatsApp</a>
      </div>
    </li>`;
  }).join("")}</ul>`;
}

// ---------- Installer l'appli sur l'écran d'accueil ----------
const installee = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const iphone = /iphone|ipad|ipod/i.test(navigator.userAgent);
let invite = null;   // Android : la proposition d'installation de Chrome
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); invite = e; dessiner(); });
function bandeauInstall() {
  let ferme = false;
  try { ferme = localStorage.getItem("mariage-install-ferme") === "1"; } catch (e) {}
  if (installee() || ferme) return "";
  const comment = invite ? `<button class="btn plein" type="button" data-installer>Installer</button>`
    : iphone ? `<small>Touche <b>Partager</b> <span aria-hidden="true">⎙</span> en bas de Safari, puis <b>Sur l'écran d'accueil</b>.</small>`
    : `<small>Dans le menu du navigateur (⋮), choisis <b>Installer l'application</b> ou <b>Ajouter à l'écran d'accueil</b>.</small>`;
  return `<section class="install">
    <img src="icon-192.png" alt="" width="44" height="44">
    <div><b>Mets l'appli sur ton écran d'accueil</b>${comment}</div>
    <button class="fermer" type="button" data-fermer-install aria-label="Fermer">×</button>
  </section>`;
}

function dessiner() {
  if (cam && cam.el && !cam.el.hidden) return;   // ne pas redessiner sous la caméra
  const actif = document.activeElement;            // ni pendant qu'on tape
  if (actif && ["champTable", "champPrenom", "champCode"].includes(actif.id)) return;
  if (modeInvite()) {
    app.innerHTML = `${entete()}${bandeauInstall()}${vueInvite()}`;
    return;
  }
  if (!data) { app.innerHTML = ecranCode(); return; }
  const reste = data.taches.filter(t => !t.fait).length;
  const onglets = [["programme", "Programme"], ["taches", data.moi.admin ? "Tâches" : "Mes tâches", reste]];
  if (data.invite) onglets.splice(1, 0, ["live", "Live"]);
  if (data.fiches && data.fiches.length) onglets.push(["fiches", "Fiches"]);
  if (data.moi.admin && data.equipe) onglets.push(["equipe", "Équipe"]);
  if (!onglets.some(o => o[0] === onglet)) onglet = "programme";
  const vue = onglet === "taches" ? vueTaches() : onglet === "equipe" ? carteQr() + vueEquipe()
    : onglet === "live" ? vueLive(false) : onglet === "fiches" ? vueFiches(data.fiches) + vueTable() : vueProgramme();
  app.innerHTML = `${entete()}
    ${horsLigne ? `<p class="horsligne">Pas de réseau : tu vois la dernière version enregistrée.</p>` : ""}
    ${bandeauInstall()}
    <section class="bonjour">${avatar(data.moi, 46, 'data-photo=""')}<div>Salut <b>${esc(data.moi.prenom)}</b> <span class="pastille ${data.moi.admin ? "or" : ""}">${esc(data.moi.role)}</span>
      ${data.moi.photo ? "" : `<button type="button" class="lien" data-photo="">📷 Ajoute ta photo</button>`}</div></section>
    <nav class="onglets ${onglets.length > 4 ? "serres" : ""}" role="tablist">${onglets.map(([id, nom, n]) =>
      `<button type="button" role="tab" class="onglet" data-onglet="${id}" aria-selected="${id === onglet}">${nom}${n ? ` <span class="nb">${n}</span>` : ""}</button>`).join("")}
    </nav>
    <section class="vue">${vue}</section>`;
}

function alerte(txt) {
  const a = document.createElement("div");
  a.className = "toast"; a.textContent = txt;
  document.body.appendChild(a);
  setTimeout(() => a.remove(), 3000);
}

// ---------- Interactions ----------
app.addEventListener("click", async e => {
  const o = e.target.closest("[data-onglet]");
  if (o) { onglet = o.dataset.onglet; dessiner(); window.scrollTo({ top: 0 }); if (onglet === "live") chargerLive(); return; }
  if (e.target.closest("[data-installer]") && invite) { invite.prompt(); invite = null; return; }
  if (e.target.closest("[data-fermer-install]")) {
    try { localStorage.setItem("mariage-install-ferme", "1"); } catch (err) {}
    dessiner(); return;
  }
  const c = e.target.closest("[data-copier]");
  if (c) {
    try { await navigator.clipboard.writeText(c.dataset.copier); alerte("Lien copié ✅"); }
    catch (err) { prompt("Copie ce lien :", c.dataset.copier); }
  }
});
app.addEventListener("change", e => {
  const b = e.target.closest("[data-tache]");
  if (b) cocher(Number(b.dataset.tache), b.checked);
});
app.addEventListener("submit", e => {
  if (e.target.id !== "formCode") return;
  e.preventDefault();
  const v = document.getElementById("champCode").value.trim();
  const m = v.match(/code=([^&\s]+)/);   // on accepte aussi le lien entier
  code = m ? decodeURIComponent(m[1]) : v;
  try { localStorage.setItem("mariage-code", code); } catch (err) {}
  history.replaceState(null, "", "?code=" + encodeURIComponent(code));
  charger();
});

// Mise à jour toute seule : toutes les 30 s, et quand on revient sur l'appli
charger();
setInterval(() => { if (!document.hidden && data) charger(); }, 30000);
document.addEventListener("visibilitychange", () => { if (!document.hidden && data) charger(); });
setInterval(() => { if (jourJ() <= 0 && ((data && onglet === "programme") || (modeInvite() && ongletInvite === "programme"))) dessiner(); }, 60000);
// Le live : les nouveaux posts toutes les 15 s (seulement les nouveautés, c'est tout petit)
setInterval(() => { if (!document.hidden && !story && (modeInvite() || (data && onglet === "live"))) chargerLive(); }, 15000);

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
