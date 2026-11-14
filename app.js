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
const concerne = (pour, role, prenom) =>
  !pour || !pour.length || pour.some(r => [role.toLowerCase(), prenom.toLowerCase(), "tous"].includes(r.trim().toLowerCase()));

function demoEspace(c) {
  const D = window.DEMO;
  const m = D.personnes.find(p => p.code === c);
  if (!m) return null;
  let coches = {};
  try { coches = JSON.parse(localStorage.getItem("mariage-demo-coches") || "{}"); } catch (e) {}
  const mien = t => m.admin || (t.prenom ? t.prenom === m.prenom : t.role.toLowerCase() === m.role.toLowerCase());
  return {
    moi: { prenom: m.prenom, role: m.role, admin: m.admin },
    moments: D.moments.filter(x => m.admin || concerne(x.pour, m.role, m.prenom)),
    taches: D.taches.filter(mien).map(t => Object.assign({ pour: t.prenom || t.role, fait: false }, t, coches[t.id] || {})),
    equipe: m.admin ? D.personnes : null
  };
}

async function charger() {
  if (!code) { data = null; return dessiner(); }
  try {
    data = DEMO_MODE ? demoEspace(code) : await rpc("mon_espace", { p_code: code });
    erreur = data ? "" : "inconnu";
  } catch (e) {
    erreur = data ? "" : "reseau";   // si on avait déjà des données, on les garde
  }
  dessiner();
}

async function cocher(id, fait) {
  const t = data.taches.find(x => x.id === id);
  if (!t) return;
  t.fait = fait; t.fait_par = fait ? data.moi.prenom : null; t.fait_le = fait ? new Date().toISOString() : null;
  dessiner();
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
    t.fait = !fait;
    alerte("Pas enregistré : vérifie ta connexion et réessaie.");
  }
}

// ---------- Le temps : compte à rebours, et « maintenant » le jour J ----------
function jourJ() {
  const auj = new Date(); auj.setHours(0, 0, 0, 0);
  const j = new Date(CFG.date + "T00:00:00");
  return Math.round((j - auj) / 86400000);   // 0 = aujourd'hui
}
const minutes = t => { const [h, m] = String(t).split(":").map(Number); return h * 60 + m; };
function etatMoment(x, liste, i) {
  if (jourJ() !== 0) return "";
  const n = new Date(), maintenant = n.getHours() * 60 + n.getMinutes();
  const debut = minutes(x.debut);
  const suivant = liste[i + 1] ? minutes(liste[i + 1].debut) : 24 * 60;
  const fin = x.fin ? minutes(x.fin) : suivant;
  if (maintenant >= debut && maintenant < fin) return "en-cours";
  if (maintenant >= fin) return "passe";
  return "";
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

function vueProgramme() {
  const L = data.moments;
  if (!L.length) return `<p class="vide">Le programme arrive bientôt.</p>`;
  return `<ol class="frise">${L.map((x, i) => {
    const etat = etatMoment(x, L, i);
    const pour = data.moi.admin && x.pour && x.pour.length ? `<span class="pastille">${esc(x.pour.join(", "))}</span>` : "";
    return `<li class="moment ${etat}">
      <div class="heure">${hhmm(x.debut)}${x.fin ? `<small>→ ${hhmm(x.fin)}</small>` : ""}</div>
      <div class="corps">
        ${etat === "en-cours" ? `<span class="live">Maintenant</span>` : ""}
        <h3>${esc(x.titre)}</h3>
        ${x.lieu ? `<a class="lieu" href="${maps(x.lieu)}" target="_blank" rel="noopener">📍 ${esc(x.lieu)}</a>` : ""}
        ${x.details ? `<p>${esc(x.details)}</p>` : ""}
        ${pour}
      </div>
    </li>`;
  }).join("")}</ol>`;
}

function ligneTache(t) {
  const qui = t.fait && t.fait_par ? ` · fait par ${esc(t.fait_par)}` : "";
  return `<li class="tache ${t.fait ? "faite" : ""}">
    <label>
      <input type="checkbox" data-tache="${t.id}" ${t.fait ? "checked" : ""}>
      <span class="case" aria-hidden="true"></span>
      <span class="txt">
        <b>${esc(t.titre)}</b>
        ${t.details ? `<small>${esc(t.details)}</small>` : ""}
        <small class="meta">${t.heure ? "🕒 " + hhmm(t.heure) : "Avant le jour J"}${data.moi.admin ? " · " + esc(t.pour) : ""}${qui}</small>
      </span>
    </label>
  </li>`;
}

function vueTaches() {
  const T = data.taches;
  if (!T.length) return `<p class="vide">Rien à faire pour toi pour l'instant. Profite ! 🥂</p>`;
  const reste = T.filter(t => !t.fait).length;
  const avant = T.filter(t => !t.heure), jour = T.filter(t => t.heure);
  const bloc = (titre, L) => L.length ? `<h3 class="sous">${titre}</h3><ul class="taches">${L.map(ligneTache).join("")}</ul>` : "";
  return `<p class="resume">${reste ? `<b>${reste}</b> à faire sur ${T.length}` : "Tout est fait 🎉"}</p>
    ${bloc("Avant le jour J", avant)}${bloc("Le jour J", jour)}`;
}

function vueEquipe() {
  const base = location.origin + location.pathname;
  return `<p class="petit">Chaque personne a son lien : envoie-le-lui, elle ne verra que ce qui la concerne.
    Ne partage pas les liens admin (ils voient et cochent tout).</p>
  <ul class="equipe">${data.equipe.map(p => {
    const lien = base + "?code=" + encodeURIComponent(p.code);
    const sesTaches = data.taches.filter(t => t.pour === p.prenom || (t.pour || "").toLowerCase() === p.role.toLowerCase());
    const faites = sesTaches.filter(t => t.fait).length;
    const msg = `Salut ${p.prenom} ! Voici ton lien pour le mariage de ${CFG.maries} : ton programme et tes tâches sont dedans 👉 ${lien}`;
    const tel = (p.tel || "").replace(/[^\d]/g, "").replace(/^0/, "33");
    return `<li class="perso">
      <div class="qui"><b>${esc(p.prenom)}</b> <span class="pastille ${p.admin ? "or" : ""}">${esc(p.role)}${p.admin ? " · admin" : ""}</span></div>
      ${sesTaches.length ? `<div class="barre" title="${faites} sur ${sesTaches.length}"><i style="width:${Math.round(100 * faites / sesTaches.length)}%"></i></div>
        <small>${faites} / ${sesTaches.length} tâches faites</small>` : `<small>Aucune tâche</small>`}
      <div class="actions">
        <button class="btn" type="button" data-copier="${esc(lien)}">Copier le lien</button>
        <a class="btn" href="https://wa.me/${tel}?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener">WhatsApp</a>
      </div>
    </li>`;
  }).join("")}</ul>`;
}

function dessiner() {
  if (!data) { app.innerHTML = ecranCode(); return; }
  const reste = data.taches.filter(t => !t.fait).length;
  const onglets = [["programme", "Programme"], ["taches", data.moi.admin ? "Tâches" : "Mes tâches", reste]];
  if (data.moi.admin && data.equipe) onglets.push(["equipe", "Équipe"]);
  if (!onglets.some(o => o[0] === onglet)) onglet = "programme";
  const vue = onglet === "taches" ? vueTaches() : onglet === "equipe" ? vueEquipe() : vueProgramme();
  app.innerHTML = `${entete()}
    <section class="bonjour">Salut <b>${esc(data.moi.prenom)}</b> <span class="pastille ${data.moi.admin ? "or" : ""}">${esc(data.moi.role)}</span></section>
    <nav class="onglets" role="tablist">${onglets.map(([id, nom, n]) =>
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
  if (o) { onglet = o.dataset.onglet; dessiner(); window.scrollTo({ top: 0 }); return; }
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
setInterval(() => { if (data && onglet === "programme" && jourJ() === 0) dessiner(); }, 60000);
