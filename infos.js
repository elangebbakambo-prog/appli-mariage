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
  if (!INFOS.data) { try { INFOS.data = JSON.parse(STOCKAGE.getItem("mariage-infos") || "null"); } catch (e) {} }
  try {
    const r = DEMO_MODE ? demoInfos(LIVE.invite) : await rpc("infos_invites", { p_code: LIVE.invite });
    if (r) { INFOS.data = r; INFOS.etat = ""; try { STOCKAGE.setItem("mariage-infos", JSON.stringify(r)); } catch (e) {} }
  } catch (e) { INFOS.etat = INFOS.data ? "" : "erreur"; }
  dessiner();
}

// ---------- Trouve ta table : petite case en haut de l'accueil, résultat dans une pop-up ----------
function carteRecherche() {
  if (!LIVE.invite) return "";
  return `<form class="carte recherche-table" id="formTable" role="search">
      <label for="champTable"><span aria-hidden="true">🍽️</span> <b>Trouve ta table</b> <small>et qui est à côté de toi</small></label>
      <div class="ligne">
        <input id="champTable" type="search" placeholder="Ton prénom ou ton nom" autocomplete="off" value="${esc(INFOS.q)}" enterkeyhint="search">
        <button class="btn plein" type="submit">Voir</button>
      </div>
    </form>`;
}
function popupTable(html, titre) {
  let ov = document.getElementById("popupTable");
  if (!ov) {
    ov = document.createElement("div"); ov.id = "popupTable"; ov.setAttribute("role", "dialog"); ov.setAttribute("aria-modal", "true"); ov.setAttribute("aria-label", "Ta table");
    ov.addEventListener("click", e => { if (e.target === ov || e.target.closest("[data-fermer-popup]")) fermerPopupTable(); });
    document.body.appendChild(ov);
  }
  ov.setAttribute("aria-label", titre || "Ta table");
  ov.innerHTML = `<div class="popup-boite">
      <button type="button" class="popup-x" data-fermer-popup aria-label="Fermer">✕</button>
      ${html}
    </div>`;
  ov.hidden = false; document.documentElement.classList.add("plein-ecran");
  const x = ov.querySelector(".popup-x"); if (x) x.focus();
}
function fermerPopupTable() {
  const ov = document.getElementById("popupTable"); if (!ov) return;
  ov.hidden = true; ov.innerHTML = ""; document.documentElement.classList.remove("plein-ecran");
}
function resultatsTable(R) {
  if (!R.length) return `<h2>Personne à ce nom 🤔</h2><p>Essaie avec ton nom de famille, ou demande aux témoins 😊</p>`;
  return R.map(r => `<article class="table-trouvee">
      <p class="eyebrow">${esc(r.nom)}</p>
      <p class="num-table">${r.detail && r.detail.nom && !/^Table \d+$/.test(r.detail.nom) ? esc(r.detail.nom) : `Table <b>${esc(r.table)}</b>`}</p>
      ${r.detail ? dessinTable(r.detail, r.nom) : r.voisins && r.voisins.length ? `<p class="petit">Avec ${esc(r.voisins.join(", "))}</p>` : ""}
    </article>`).join(`<hr class="popup-sep">`);
}
async function chercherTable(q) {
  INFOS.q = q;
  if (q.trim().length < 2) return alerte("Tape au moins 2 lettres de ton prénom ou de ton nom.");
  try {
    const R = DEMO_MODE ? demoTable(q) : await rpc("trouver_table", { p_code: LIVE.invite, p_nom: q });
    popupTable(resultatsTable(R || []));
  } catch (e) { alerte("Pas de réseau : réessaie dans un instant."); }
}
document.addEventListener("submit", e => {
  if (e.target.id !== "formTable") return;
  e.preventDefault();
  const c = document.getElementById("champTable");
  if (c) { c.blur(); chercherTable(c.value); }
});
document.addEventListener("keydown", e => { if (e.key === "Escape") fermerPopupTable(); });

// ---------- Ce que voit un invité : 4 onglets ----------
let ongletInvite = "live";
function vueInvite() {
  const D = INFOS.data || { moments: [], fiches: [] };
  const onglets = [["live", "Live"], ["programme", "Programme"], ["menu", "Menu"]];
  if (!onglets.some(o => o[0] === ongletInvite)) ongletInvite = "live";
  const vue = ongletInvite === "programme" ? frise(D.moments, false)
    : ongletInvite === "menu" ? vueFiches(D.fiches, "Le menu arrive bientôt.")
    : vueLive(true);
  return `${prenomLive() ? carteRecherche() : ""}
    <nav class="onglets" role="tablist">${onglets.map(([id, nom]) =>
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
  let fond = "", W = 320;
  if (forme === "ronde") {
    fond = `<circle cx="160" cy="130" r="62" class="t-table"/><text x="160" y="138" class="t-num">${esc(d.table)}</text>`;
    P.forEach((p, k) => { const a = -Math.PI / 2 + 2 * Math.PI * k / n; pos.push([160 + 98 * Math.cos(a), 130 + 98 * Math.sin(a)]); });
  } else {
    const moitie = Math.ceil(n / 2), larg = Math.max(120, moitie * 46);
    W = Math.max(320, larg + 50);
    const x0 = W / 2 - larg / 2, centre = forme === "honneur" ? "♥" : d.table;
    fond = `<rect x="${x0}" y="100" width="${larg}" height="60" rx="8" class="t-table"/><text x="${W / 2}" y="138" class="t-num">${esc(centre)}</text>`;
    P.forEach((p, k) => {
      const haut = k < moitie, j = haut ? k : k - moitie, nb = haut ? moitie : n - moitie;
      const x = x0 + larg - (larg / nb) * (j + 0.5);          // de droite à gauche, comme sur les fiches de Chaïna
      pos.push([x, haut ? 70 : 190]);
    });
  }
  const vb = forme === "ronde" ? "0 0 320 260" : `0 30 ${W} 200`;
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
  // Avec une action (changer la photo) : un bouton ; sinon une simple image (on peut alors la mettre dans un autre bouton)
  return attr ? `<button type="button" class="avatar" style="--t:${t}px" ${attr} aria-label="Photo de ${esc((p && p.prenom) || "")}">${img}</button>`
    : `<span class="avatar" style="--t:${t}px" aria-hidden="true">${img}</span>`;
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

// ---------- QR code du lien perso de quelqu'un (onglet Équipe) : il le scanne avec son appareil photo ----------
document.addEventListener("click", e => {
  const b = e.target.closest("[data-qr-lien]");
  if (!b) return;
  let img = "";
  try { const q = qrcode(0, "M"); q.addData(b.dataset.qrLien); q.make(); img = q.createDataURL(10, 2); } catch (err) {}
  popupTable(`<div class="qr-perso">
      <p class="eyebrow">Le lien de</p>
      <h2>${esc(b.dataset.qrNom)}</h2>
      ${img ? `<img src="${img}" alt="QR code du lien de ${esc(b.dataset.qrNom)}">` : ""}
      <p>Ouvre l'appareil photo et vise le code, puis touche le lien qui apparaît.</p>
      <p class="petit">⚠ Ce lien est personnel : ne le montre qu'à ${esc(b.dataset.qrNom)}.</p>
    </div>`, "QR code de " + b.dataset.qrNom);
});
