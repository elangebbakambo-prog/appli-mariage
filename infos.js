// Ce que voient les invités (QR code) en plus du live : le programme public, « Trouve ta table » et le menu.
// Les fiches (fiche DJ, bar, menu…) servent aussi à l'organisation (onglet Fiches).
// Chargé AVANT app.js : utilise esc, rpc, DEMO_MODE, LIVE, dessiner… seulement dans ses fonctions.

const INFOS = { data: null, etat: "", q: "", resultats: null, timer: 0 };

// ---------- Les fiches : texte simple → HTML (toujours échappé d'abord) ----------
// « ## Titre » = sous-titre, « - texte » = puce, **gras**, ligne vide = espace.
function rendreFiche(texte) {
  const gras = s => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
  let html = "", liste = false;
  const fermer = () => { if (liste) { html += "</ul>"; liste = false; } };
  for (const brut of String(texte || "").split("\n")) {
    const l = brut.trim();
    if (l.startsWith("## ")) { fermer(); html += `<h4>${gras(l.slice(3))}</h4>`; }
    else if (l.startsWith("- ")) { if (!liste) { html += "<ul>"; liste = true; } html += `<li>${gras(l.slice(2))}</li>`; }
    else if (!l) fermer();
    else { fermer(); html += `<p>${gras(l)}</p>`; }
  }
  fermer();
  return html;
}
function vueFiches(fiches, vide) {
  if (!fiches || !fiches.length) return `<p class="vide">${vide || "Rien pour l'instant."}</p>`;
  return `<div class="fiches">${fiches.map((f, i) => `<details class="fiche" ${fiches.length === 1 || i === 0 ? "open" : ""}>
      <summary>${f.icone ? `<span class="ico-fiche" aria-hidden="true">${esc(f.icone)}</span>` : ""}${esc(f.titre)}</summary>
      <div class="fiche-corps">${rendreFiche(f.contenu)}</div>
    </details>`).join("")}</div>`;
}

// ---------- Le programme (frise), pour l'organisation comme pour les invités ----------
const jourDe = x => x.jour || CFG.date;
function etatMomentJour(x, L, i) {
  const n = new Date(), pad = v => String(v).padStart(2, "0");
  const maintenant = `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())} ${pad(n.getHours())}:${pad(n.getMinutes())}`;
  const cle = y => jourDe(y) + " " + String(y.debut).slice(0, 5);
  const debut = cle(x);
  const suivant = L.slice(i + 1).find(y => cle(y) > debut);
  const fin = x.fin ? jourDe(x) + " " + String(x.fin).slice(0, 5) : suivant ? cle(suivant) : jourDe(x) + " 23:59";
  if (maintenant >= debut && maintenant < fin) return "en-cours";
  if (maintenant >= fin) return "passe";
  return "";
}
function nomJour(iso) {
  try { const s = new Date(iso + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }); return s.charAt(0).toUpperCase() + s.slice(1); }
  catch (e) { return iso; }
}
function frise(L, montrerPour) {
  if (!L || !L.length) return `<p class="vide">Le programme arrive bientôt.</p>`;
  const plusieursJours = new Set(L.map(jourDe)).size > 1;
  let jourCourant = "";
  return `<ol class="frise">${L.map((x, i) => {
    const etat = etatMomentJour(x, L, i);
    let titreJour = "";
    if (plusieursJours && jourDe(x) !== jourCourant) {
      jourCourant = jourDe(x);
      titreJour = `<li class="titre-jour"><h3>${esc(jourDe(x) > CFG.date ? "Dans la nuit · " + nomJour(jourDe(x)) : nomJour(jourDe(x)))}</h3></li>`;
    }
    const pour = montrerPour && x.pour && x.pour.length ? `<span class="pastille">${esc(x.pour.join(", "))}</span>` : "";
    return `${titreJour}<li class="moment ${etat}">
      <div class="heure">${hhmm(x.debut)}${x.fin ? `<small>→ ${hhmm(x.fin)}</small>` : ""}</div>
      <div class="corps">
        ${etat === "en-cours" ? `<span class="live">Maintenant</span>` : ""}
        <h3>${esc(x.titre)}</h3>
        ${x.lieu ? `<a class="lieu" href="${maps(x.lieu)}" target="_blank" rel="noopener">📍 ${esc(x.lieu)}</a>` : ""}
        ${x.details ? `<p>${esc(x.details).replace(/\n/g, "<br>")}</p>` : ""}
        ${pour}
      </div>
    </li>`;
  }).join("")}</ol>`;
}

// ---------- Les infos des invités (programme public + fiches publiques) ----------
async function chargerInfos() {
  if (!LIVE.invite) return;
  if (!INFOS.data) { try { INFOS.data = JSON.parse(localStorage.getItem("mariage-infos") || "null"); } catch (e) {} }
  try {
    const r = DEMO_MODE ? demoInfos(LIVE.invite) : await rpc("infos_invites", { p_code: LIVE.invite });
    if (r) { INFOS.data = r; INFOS.etat = ""; try { localStorage.setItem("mariage-infos", JSON.stringify(r)); } catch (e) {} }
  } catch (e) { INFOS.etat = INFOS.data ? "" : "erreur"; }
  dessiner();
}

// ---------- Trouve ta table ----------
function vueTable() {
  const R = INFOS.resultats;
  let res = "";
  if (INFOS.q.trim().length >= 2 && R) {
    res = R.length ? R.map(r => `<article class="carte table-trouvee">
        <p class="eyebrow">${esc(r.nom)}</p>
        <p class="num-table">${r.detail && r.detail.nom && !/^Table \d+$/.test(r.detail.nom) ? esc(r.detail.nom) : `Table <b>${esc(r.table)}</b>`}</p>
        ${r.detail ? dessinTable(r.detail, r.nom) : r.voisins && r.voisins.length ? `<p class="petit">Avec ${esc(r.voisins.join(", "))}</p>` : ""}
      </article>`).join("")
      : `<p class="vide">Personne à ce nom. Essaie avec ton nom de famille, ou demande aux témoins 😊</p>`;
  } else if (INFOS.q.trim().length === 1) res = `<p class="vide">Encore une lettre…</p>`;
  return `<section class="carte">
      <h2>Trouve ta table 🍽️</h2>
      <p>Tape ton prénom ou ton nom de famille.</p>
      <input id="champTable" type="search" placeholder="Ex. Chloé" autocomplete="off" value="${esc(INFOS.q)}" enterkeyhint="search">
    </section>
    <div id="resultatsTable">${res}</div>`;
}
function chercherTable(q) {
  INFOS.q = q; clearTimeout(INFOS.timer);
  const zone = () => { const z = document.getElementById("resultatsTable"); if (z) z.outerHTML = vueTable().split("</section>").pop(); };
  if (q.trim().length < 2) { INFOS.resultats = null; return zone(); }
  INFOS.timer = setTimeout(async () => {
    try { INFOS.resultats = DEMO_MODE ? demoTable(q) : await rpc("trouver_table", { p_code: LIVE.invite, p_nom: q }); }
    catch (e) { INFOS.resultats = null; alerte("Pas de réseau : réessaie dans un instant."); }
    if (INFOS.q === q) zone();
  }, 250);
}
document.addEventListener("input", e => { if (e.target.id === "champTable") chercherTable(e.target.value); });

// ---------- Ce que voit un invité : 4 onglets ----------
let ongletInvite = "live";
function vueInvite() {
  const D = INFOS.data || { moments: [], fiches: [] };
  const onglets = [["live", "Live"], ["programme", "Programme"], ["table", "Ma table"], ["menu", "Menu"]];
  const vue = ongletInvite === "programme" ? frise(D.moments, false)
    : ongletInvite === "table" ? vueTable()
    : ongletInvite === "menu" ? vueFiches(D.fiches, "Le menu arrive bientôt.")
    : vueLive(true);
  return `<nav class="onglets" role="tablist">${onglets.map(([id, nom]) =>
      `<button type="button" role="tab" class="onglet" data-onglet-invite="${id}" aria-selected="${id === ongletInvite}">${nom}</button>`).join("")}
    </nav>
    ${INFOS.etat === "erreur" && ongletInvite !== "live" ? `<p class="err">Impossible de charger : vérifie ta connexion.</p>` : ""}
    <section class="vue">${vue}</section>`;
}
document.addEventListener("click", e => {
  const o = e.target.closest("[data-onglet-invite]");
  if (!o) return;
  ongletInvite = o.dataset.ongletInvite;
  dessiner(); window.scrollTo({ top: 0 });
  if (ongletInvite === "live") chargerLive(); else chargerInfos();
  if (ongletInvite === "table") { const c = document.getElementById("champTable"); if (c && !INFOS.q) c.focus(); }
});

// ---------- Mode démo ----------
function demoInfos(c) {
  if (c !== "invites") return null;
  const D = window.DEMO;
  return { moments: D.moments.filter(x => x.public), fiches: (D.fiches || []).filter(f => f.public) };
}
const sansAccent = s => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
function demoTable(q) {
  const P = window.DEMO.plan || [], n = sansAccent(q.trim());
  return P.filter(p => sansAccent(p.nom).includes(n)).slice(0, 8)
    .map(p => ({ nom: p.nom, table: p.table, voisins: P.filter(v => v.table === p.table && v !== p).map(v => v.nom), detail: demoDetail(p.table) }));
}
function demoDetail(t) {
  const P = (window.DEMO.plan || []).filter(p => p.table === t), F = (window.DEMO.tables || {})[t] || {};
  return { table: t, nom: F.nom || "Table " + t, forme: F.forme || "ronde", places: P.map((p, k) => ({ place: k + 1, nom: p.nom })) };
}

// ---------- Le dessin d'une table : chaque place, la sienne en rouge, qui est en face et à côté ----------
// Ronde : place 1 en haut, puis dans le sens des aiguilles d'une montre.
// Rectangle (« rect » ou « honneur ») : 1re moitié en haut (1 à droite), 2e moitié en bas, face à face (1 en face de la 1re du bas).
function voisinsDePlace(forme, n, i) {
  if (forme === "ronde") {
    const tour = k => ((k - 1 + n) % n) + 1;
    return { face: n > 2 ? tour(i + Math.floor(n / 2)) : null, cotes: n > 1 ? [...new Set([tour(i - 1), tour(i + 1)])].filter(k => k !== i) : [] };
  }
  const moitie = Math.ceil(n / 2), haut = i <= moitie;
  const face = haut ? (i + moitie <= n ? i + moitie : null) : i - moitie;
  const debut = haut ? 1 : moitie + 1, fin = haut ? moitie : n;
  return { face, cotes: [i - 1, i + 1].filter(k => k >= debut && k <= fin) };
}
const initiales = nom => String(nom).split(/[\s-]+/).filter(Boolean).slice(0, 2).map(m => m[0]).join("").toUpperCase();
function dessinTable(d, moiNom) {
  if (!d || !d.places || !d.places.length) return "";
  const P = d.places, n = P.length, forme = d.forme || "ronde";
  const moi = P.find(p => p.nom === moiNom);
  const pos = [];   // coordonnées de chaque place (dans l'ordre des places)
  let fond = "";
  if (forme === "ronde") {
    fond = `<circle cx="160" cy="130" r="62" class="t-table"/><text x="160" y="138" class="t-num">${esc(d.table)}</text>`;
    P.forEach((p, k) => { const a = -Math.PI / 2 + 2 * Math.PI * k / n; pos.push([160 + 98 * Math.cos(a), 130 + 98 * Math.sin(a)]); });
  } else {
    const moitie = Math.ceil(n / 2), larg = Math.max(120, moitie * 46);
    const x0 = 160 - larg / 2;
    fond = `<rect x="${x0}" y="100" width="${larg}" height="60" rx="8" class="t-table"/><text x="160" y="138" class="t-num">${esc(d.table || "")}</text>`;
    P.forEach((p, k) => {
      const haut = k < moitie, j = haut ? k : k - moitie, nb = haut ? moitie : n - moitie;
      const x = x0 + larg - (larg / nb) * (j + 0.5);          // de droite à gauche, comme sur les fiches de Chaïna
      pos.push([x, haut ? 70 : 190]);
    });
  }
  const vb = forme === "ronde" ? "0 0 320 260" : "0 30 320 200";
  const sieges = P.map((p, k) => {
    const [x, y] = pos[k], c = p.nom === moiNom ? "t-siege moi" : "t-siege";
    return `<g class="${c}"><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="19"/><text x="${x.toFixed(1)}" y="${(y + 5).toFixed(1)}">${esc(initiales(p.nom))}</text></g>`;
  }).join("");
  let phrase = "";
  if (moi) {
    const v = voisinsDePlace(forme, n, moi.place), nomDe = k => (P.find(p => p.place === k) || {}).nom;
    const face = v.face && nomDe(v.face), cotes = v.cotes.map(nomDe).filter(Boolean);
    phrase = `<p class="t-phrase">${face ? `En face de toi : <b>${esc(face)}</b>` : ""}${face && cotes.length ? "<br>" : ""}${cotes.length ? `À côté de toi : <b>${esc(cotes.join(" et "))}</b>` : ""}</p>`;
  }
  return `<div class="t-dessin">
      <svg viewBox="${vb}" role="img" aria-label="Dessin de la ${esc(d.nom || "table")}">${fond}${sieges}</svg>
      ${phrase}
      <ol class="t-liste">${P.map(p => `<li class="${p.nom === moiNom ? "moi" : ""}"><span>${esc(initiales(p.nom))}</span>${esc(p.nom)}${p.nom === moiNom ? " (toi)" : ""}</li>`).join("")}</ol>
    </div>`;
}
// Carte « Ta place » en haut du programme, pour ceux qui ont un lien perso
function carteMaTable() {
  if (!data) return "";
  if (data.ma_table && data.ma_table.detail) {
    const d = data.ma_table.detail;
    return `<details class="carte ma-table" open><summary><span>🍽️ Ta place</span><b>${esc(d.nom)}</b></summary>${dessinTable(d, data.ma_table.nom)}</details>`;
  }
  return "";
}

// ---------- Les photos de l'équipe ----------
function avatar(p, taille, attr) {
  const t = taille || 40, img = p && p.photo ? `<img src="${esc(urlMedia(p.photo))}" alt="" loading="lazy">` : `<span>${esc(initiales((p && p.prenom) || "?"))}</span>`;
  return `<button type="button" class="avatar" style="--t:${t}px" ${attr || "disabled"} aria-label="Photo de ${esc((p && p.prenom) || "")}">${img}</button>`;
}
async function carreJpeg(fichier) {
  const img = await chargerImage(fichier);
  const w = img.width, h = img.height, c = Math.min(w, h), k = document.createElement("canvas");
  k.width = k.height = 400;
  k.getContext("2d").drawImage(img, (w - c) / 2, (h - c) / 2, c, c, 0, 0, 400, 400);
  return new Promise(ok => k.toBlob(ok, "image/jpeg", .82));
}
let photoPour = null;   // null = moi ; sinon le prénom (admin)
function choisirPhoto(prenom) {
  photoPour = prenom || null;
  let f = document.getElementById("photoFichier");
  if (!f) {
    f = document.createElement("input"); f.type = "file"; f.id = "photoFichier"; f.accept = "image/*"; f.hidden = true;
    f.onchange = () => { const x = f.files[0]; f.value = ""; if (x) envoyerPhoto(x); };
    document.body.appendChild(f);
  }
  f.click();
}
async function envoyerPhoto(fichier) {
  const cible = photoPour;
  try {
    const blob = await carreJpeg(fichier);
    alerte("Envoi de la photo…");
    let chemin;
    if (DEMO_MODE) chemin = URL.createObjectURL(blob);
    else {
      chemin = LIVE.invite + "/equipe/" + nouvelId() + ".jpg";
      await envoyerFichier(chemin, blob);
      if (!await rpc("changer_photo", { p_code: code, p_prenom: cible, p_chemin: chemin })) throw new Error("refusé");
    }
    const p = cible ? (data.equipe || []).find(x => x.prenom === cible) : data.moi;
    if (p) p.photo = chemin;
    if (!cible || cible === data.moi.prenom) data.moi.photo = chemin;
    (data.equipe || []).forEach(x => { if (x.prenom === (cible || data.moi.prenom)) x.photo = chemin; });
    if (DEMO_MODE) (window.DEMO.personnes.find(x => x.prenom === (cible || data.moi.prenom)) || {}).photo = chemin;
    garderCopie(); dessiner(); alerte("Photo enregistrée ✅");
  } catch (e) { alerte("La photo n'a pas pu être envoyée. Réessaie."); }
}
document.addEventListener("click", e => {
  const a = e.target.closest("[data-photo]");
  if (a) choisirPhoto(a.dataset.photo || null);
});
