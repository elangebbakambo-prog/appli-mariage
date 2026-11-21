// Le live des invités : caméra façon Snap, fil de photos et vidéos, stories en plein écran.
// Repris de l'appli Vegas EVG, en plus léger pour ~125 invités (Supabase gratuit) :
//  - le fil n'affiche que des miniatures (~20 Ko) ; la photo ou la vidéo entière se charge quand on l'ouvre ;
//  - photos compressées (~250 Ko), vidéos de 10 s maximum en qualité réduite ;
//  - toutes les 15 s, on ne demande que les nouveaux posts.
// Ce fichier est chargé AVANT app.js ; il utilise esc, CFG, rpc, data, code… seulement dans ses fonctions.

const MAX_VID_SEC = 10;          // caméra de l'appli
const MAX_GAL_SEC = 15, MAX_GAL_MO = 20;   // vidéo choisie dans la galerie
const PHOTO_DUREE = 5000;        // durée d'une photo dans les stories

const LIVE = {
  invite: "",                    // le code commun des invités (QR code)
  posts: new Map(),              // id → post
  depuis: null,                  // heure du serveur au dernier chargement
  etat: "",                      // "" | "charge" | "erreur" | "refuse"
  envoi: null,                   // { pct } pendant un envoi
  demo: []
};

// ---------- Le code invités : dans l'adresse (?invite=…) ou mémorisé ----------
(() => {
  const p = new URLSearchParams(location.search).get("invite");
  try {
    if (p) STOCKAGE.setItem("mariage-invite", p);
    LIVE.invite = p || STOCKAGE.getItem("mariage-invite") || "";
  } catch (e) { LIVE.invite = p || ""; }
})();

function prenomLive() {
  if (data && data.moi) return data.moi.prenom;
  try { return STOCKAGE.getItem("mariage-prenom") || ""; } catch (e) { return ""; }
}
const urlMedia = chemin => DEMO_MODE || /^(blob|data):/.test(chemin) ? chemin : CFG.supabaseUrl + "/storage/v1/object/public/live/" + chemin;
const nouvelId = () => (crypto.randomUUID ? crypto.randomUUID()
  : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, c => (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)));

// ---------- Charger le fil (seulement les nouveautés) ----------
async function chargerLive(complet) {
  if (!LIVE.invite) return;
  const avant = signatureLive();
  try {
    let r;
    if (DEMO_MODE) {
      if (LIVE.invite !== "invites") r = null;
      else r = { maintenant: new Date().toISOString(), posts: LIVE.demo };
    } else {
      // 10 s de marge : un post enregistré pendant la requête précédente n'est jamais oublié
      const depuis = complet || !LIVE.depuis ? null : new Date(new Date(LIVE.depuis).getTime() - 10000).toISOString();
      r = await rpc("live_fil", { p_code: LIVE.invite, p_depuis: depuis });
    }
    if (!r) { LIVE.etat = "refuse"; }
    else {
      LIVE.etat = "";
      LIVE.depuis = r.maintenant;
      if (complet) LIVE.posts.clear();
      for (const p of r.posts) { if (p.cache) LIVE.posts.delete(p.id); else LIVE.posts.set(p.id, p); }
    }
  } catch (e) { LIVE.etat = LIVE.posts.size ? "" : "erreur"; }
  if (signatureLive() !== avant) dessiner();
}
const signatureLive = () => LIVE.etat + "|" + [...LIVE.posts.keys()].join(",");
const postsTries = () => [...LIVE.posts.values()].sort((a, b) => String(a.cree_le).localeCompare(String(b.cree_le)));

// ---------- Affichage du fil ----------
function vueLive(invite) {
  if (!LIVE.invite) return `<p class="vide">Le live arrive bientôt.</p>`;
  if (LIVE.etat === "refuse") return `<p class="err">Ce QR code n'est plus valable. Demande le bon aux mariés.</p>`;
  const nom = prenomLive();
  if (invite && !nom) return `<section class="carte">
    <h2>Bienvenue au live 📸</h2>
    <p>Partage tes photos et vidéos du mariage avec tous les invités. Les mariés récupèrent tout à la fin.</p>
    <form id="formPrenom" class="ligne">
      <input id="champPrenom" placeholder="Ton prénom" maxlength="30" autocomplete="given-name" required>
      <button class="btn plein" type="submit">C'est moi</button>
    </form>
  </section>`;
  const L = postsTries().reverse();
  const envoi = LIVE.envoi ? `<div class="envoi"><span>Envoi… <b id="envoiPct">${LIVE.envoi.pct}</b> %</span><div class="barre"><i id="envoiBarre" style="width:${LIVE.envoi.pct}%"></i></div></div>` : "";
  return `${invite ? `<section class="bonjour">Salut <b>${esc(nom)}</b> 👋 <button class="lien" type="button" data-changer-prenom>Changer</button></section>` : ""}
    <div class="live-tete"><h2>Le live</h2><small>${L.length ? `${L.length} photo${L.length > 1 ? "s" : ""} et vidéo${L.length > 1 ? "s" : ""}` : ""}</small></div>
    ${envoi}
    ${LIVE.etat === "erreur" ? `<p class="err">Impossible de charger le live : vérifie ta connexion.</p>` : ""}
    ${L.length ? `<div class="grille">${L.map(p => `<button type="button" class="vignette" data-post="${esc(p.id)}" aria-label="${p.type === "video" ? "Vidéo" : "Photo"} de ${esc(p.auteur)}">
        <img src="${esc(urlMedia(p.miniature))}" alt="" loading="lazy" decoding="async">
        ${p.type === "video" ? `<span class="lecture" aria-hidden="true">▶</span>` : ""}
        <span class="qui">${esc(p.auteur)}</span></button>`).join("")}</div>`
      : `<p class="vide">Personne n'a encore posté. Lance-toi ! 🥂</p>`}
    <button class="poster" type="button" data-poster>📸 Poster</button>`;
}

// QR code à imprimer pour les tables (onglet Équipe des admins)
function carteQr() {
  if (!data || !data.invite) return "";
  const lien = location.origin + location.pathname + "?invite=" + encodeURIComponent(data.invite);
  let img = "";
  try { const q = qrcode(0, "M"); q.addData(lien); q.make(); img = q.createDataURL(8, 2); } catch (e) {}
  return `<section class="carte qr">
    <h3>QR code des invités</h3>
    <p class="petit">À imprimer sur les tables ou les menus : en le scannant, les invités arrivent sur le live, tapent leur prénom et postent. Ils ne voient pas l'organisation.</p>
    ${img ? `<img src="${img}" alt="QR code du live" width="200" height="200">` : ""}
    <div class="actions">
      <button class="btn" type="button" data-copier="${esc(lien)}">Copier le lien</button>
      ${img ? `<a class="btn" href="${img}" download="qr-code-mariage.gif">Télécharger le QR code</a>` : ""}
    </div>
  </section>`;
}

// ---------- Préparer les fichiers (compression) ----------
async function chargerImage(fichier) {
  if (window.createImageBitmap) {
    try { return await createImageBitmap(fichier, { imageOrientation: "from-image" }); } catch (e) {}
  }
  return new Promise((ok, ko) => {
    const u = URL.createObjectURL(fichier), i = new Image();
    i.onload = () => ok(i); i.onerror = () => ko(new Error("image")); i.src = u;
  });
}
function versJpeg(source, cote, maxOctets, q0) {
  const w = source.videoWidth || source.width, h = source.videoHeight || source.height;
  const k = Math.min(1, cote / Math.max(w, h)), c = document.createElement("canvas");
  c.width = Math.round(w * k); c.height = Math.round(h * k);
  c.getContext("2d").drawImage(source, 0, 0, c.width, c.height);
  return new Promise(ok => {
    const essai = q => c.toBlob(b => (b.size > maxOctets && q > .4) ? essai(q - .1) : ok(b), "image/jpeg", q);
    essai(q0);
  });
}
const photoEtMiniature = async src => ({ fichier: await versJpeg(src, 1280, 350000, .8), miniature: await versJpeg(src, 360, 30000, .6) });

function infosVideo(fichier) {
  return new Promise(ok => {
    const url = URL.createObjectURL(fichier), v = document.createElement("video");
    let fini = false; const fin = r => { if (!fini) { fini = true; ok(Object.assign({ url }, r)); } };
    v.muted = true; v.playsInline = true; v.setAttribute("playsinline", ""); v.preload = "auto"; v.src = url;
    v.onloadedmetadata = () => { if (!isFinite(v.duration)) return fin({ duree: 0 }); v.currentTime = Math.min(.5, v.duration / 2); };
    v.onseeked = async () => { try { fin({ duree: v.duration, miniature: await versJpeg(v, 360, 30000, .6) }); } catch (e) { fin({ duree: v.duration }); } };
    v.onerror = () => fin({ duree: 0, erreur: true });
    setTimeout(() => fin({ duree: isFinite(v.duration) ? v.duration : 0 }), 7000);
  });
}
const miniatureVide = () => new Promise(ok => { const c = document.createElement("canvas"); c.width = 360; c.height = 640;
  const x = c.getContext("2d"); x.fillStyle = "#2E2A26"; x.fillRect(0, 0, 360, 640); c.toBlob(ok, "image/jpeg", .6); });

// Photo ou vidéo choisie dans la galerie
async function depuisGalerie(f) {
  if (!f) return;
  try {
    if (f.type.startsWith("video/")) {
      if (f.size > MAX_GAL_MO * 1048576) return alerte(`Vidéo trop lourde (${Math.round(f.size / 1048576)} Mo). Filme-la avec la caméra de l'appli.`);
      const i = await infosVideo(f);
      if (i.duree > MAX_GAL_SEC + .5) return alerte(`Vidéo trop longue : ${MAX_GAL_SEC} secondes maximum.`);
      await publier({ type: "video", fichier: f, miniature: i.miniature || await miniatureVide() });
    } else {
      const img = await chargerImage(f);
      await publier(Object.assign({ type: "photo" }, await photoEtMiniature(img)));
    }
  } catch (e) { alerte("Ce fichier ne peut pas être envoyé."); }
}

// ---------- Envoyer ----------
function envoyerFichier(chemin, blob, onp) {
  return new Promise((ok, ko) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", CFG.supabaseUrl + "/storage/v1/object/live/" + chemin);
    xhr.setRequestHeader("apikey", CFG.supabaseKey);
    xhr.setRequestHeader("Content-Type", blob.type || "application/octet-stream");
    xhr.setRequestHeader("x-upsert", "false");
    if (onp) xhr.upload.onprogress = e => { if (e.lengthComputable) onp(Math.round(e.loaded / e.total * 100)); };
    xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? ok() : ko(new Error(xhr.status + " " + xhr.responseText));
    xhr.onerror = () => ko(new Error("reseau"));
    xhr.send(blob);
  });
}
function majEnvoi(pct) {
  if (!LIVE.envoi) return;
  LIVE.envoi.pct = pct;
  const t = document.getElementById("envoiPct"), b = document.getElementById("envoiBarre");
  if (t) t.textContent = pct; if (b) b.style.width = pct + "%";
}
async function publier({ type, fichier, miniature, texte }) {
  if (LIVE.envoi) return alerte("Un envoi est déjà en cours, patiente.");
  const auteur = prenomLive();
  if (!auteur) return dessiner();
  const id = nouvelId(), base = LIVE.invite + "/" + id;
  const ext = type === "photo" ? "jpg" : /webm/.test(fichier.type) ? "webm" : /quicktime/.test(fichier.type) ? "mov" : "mp4";
  LIVE.envoi = { pct: 0 };
  if (typeof onglet !== "undefined") onglet = "live";
  dessiner();
  try {
    if (DEMO_MODE) {
      LIVE.demo.push({ id, auteur, type, fichier: URL.createObjectURL(fichier), miniature: URL.createObjectURL(miniature),
        texte: texte || null, cree_le: new Date().toISOString() });
    } else {
      await envoyerFichier(base + "-m.jpg", miniature);
      await envoyerFichier(base + "." + ext, fichier, majEnvoi);
      await rpc("live_poster", { p_code: LIVE.invite, p_auteur: auteur, p_type: type,
        p_fichier: base + "." + ext, p_miniature: base + "-m.jpg", p_texte: texte || null });
    }
    LIVE.envoi = null;
    alerte(type === "photo" ? "Photo postée ✅" : "Vidéo postée ✅");
    await chargerLive();
    dessiner();
  } catch (e) {
    LIVE.envoi = null; dessiner();
    alerte(/413|size|large/i.test(e.message) ? "Fichier trop lourd." : /trop de posts/.test(e.message) ? "Doucement 😄 Attends quelques minutes."
      : "Pas envoyé (réseau trop faible ?). Réessaie.");
  }
}

// ---------- Les stories en plein écran ----------
let story = null, storyMuet = true;
function ouvrirStory(id) {
  const list = postsTries(); const i = list.findIndex(p => p.id === id);
  if (i < 0) return;
  story = { list, i, t0: Date.now(), pause: false, ecoule: 0 };
  let ov = document.getElementById("story");
  if (!ov) { ov = document.createElement("div"); ov.id = "story"; ov.setAttribute("role", "dialog"); ov.setAttribute("aria-label", "Stories"); document.body.appendChild(ov); }
  ov.hidden = false; document.documentElement.classList.add("plein-ecran");
  dessinerStory(0);
  clearInterval(story.timer);
  story.timer = setInterval(() => {
    if (!story || story.pause) return;
    const v = document.getElementById("stVid"), barre = document.getElementById("stBarre");
    if (v) { if (barre && v.duration) barre.style.width = (v.currentTime / v.duration * 100) + "%"; return; }
    const p = Math.min(1, (story.ecoule + Date.now() - story.t0) / PHOTO_DUREE);
    if (barre) barre.style.width = (p * 100) + "%";
    if (p >= 1) pasStory(1);
  }, 50);
}
let storyFermeeA = 0;
function fermerStory() {
  if (!story) return; clearInterval(story.timer); story = null; storyFermeeA = Date.now();
  const ov = document.getElementById("story"); if (ov) { ov.hidden = true; ov.innerHTML = ""; }
  document.documentElement.classList.remove("plein-ecran");
}
// Après fermeture, l'iPhone envoie un « clic fantôme » sous le doigt : on l'ignore
document.addEventListener("click", e => { if (Date.now() - storyFermeeA < 400) { e.stopPropagation(); e.preventDefault(); } }, true);
function pasStory(d) {
  if (!story) return; const n = story.i + d;
  story.pause = false; story.t0 = Date.now(); story.ecoule = 0;
  if (n < 0) return dessinerStory(0);
  if (n >= story.list.length) return fermerStory();
  story.i = n; dessinerStory(d);
}
function dessinerStory(dir) {
  const ov = document.getElementById("story"); if (!ov || !story) return;
  const p = story.list[story.i], anim = dir > 0 ? "in-r" : dir < 0 ? "in-l" : "";
  let heure = ""; try { heure = new Date(p.cree_le).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }); } catch (e) {}
  const admin = data && data.moi && data.moi.admin && !DEMO_MODE;
  ov.innerHTML = `<div class="st-cadre">
    <div class="st-barre"><i id="stBarre"></i></div>
    <div class="st-tete"><div><b>${esc(p.auteur)}</b> <span>${esc(heure)} · ${story.i + 1} / ${story.list.length}</span></div>
      <div class="st-btns">
        ${admin ? `<button type="button" class="st-btn" id="stMasquer" aria-label="Masquer ce post">🚫</button>` : ""}
        ${p.type === "video" ? `<button type="button" class="st-btn" id="stSon" aria-label="Son">${storyMuet ? "🔇" : "🔊"}</button>` : ""}
        <button type="button" class="st-btn" id="stFermer" aria-label="Fermer">✕</button></div></div>
    <div class="st-media" id="stZone">${p.type === "video"
      ? `<video id="stVid" class="${anim}" src="${esc(urlMedia(p.fichier))}" poster="${esc(urlMedia(p.miniature))}" playsinline ${storyMuet ? "muted" : ""}></video>`
      : `<img id="stImg" class="${anim}" src="${esc(urlMedia(p.miniature))}" alt="Photo de ${esc(p.auteur)}" draggable="false">`}</div>
    ${p.texte ? `<p class="st-texte">${esc(p.texte)}</p>` : ""}
    <p class="st-aide">Touche à droite ou à gauche pour changer · glisse vers le bas pour fermer</p>
  </div>`;
  const img = document.getElementById("stImg"), v = document.getElementById("stVid");
  if (img) {   // la miniature s'affiche tout de suite, la vraie photo la remplace dès qu'elle est là
    const vraie = new Image(); vraie.onload = () => { if (img.isConnected) img.src = vraie.src; }; vraie.src = urlMedia(p.fichier);
  }
  // On prépare la photo suivante pour que ça enchaîne sans attente
  const suiv = story.list[story.i + 1]; if (suiv && suiv.type === "photo") new Image().src = urlMedia(suiv.fichier);
  if (v) {
    const lire = () => v.play().catch(() => { if (!v.muted) { v.muted = storyMuet = true; v.play().catch(() => {}); } });
    v.onended = () => pasStory(1);
    v.onerror = () => { const t = document.createElement("p"); t.className = "st-texte"; t.textContent = "Cette vidéo ne peut pas être lue sur ce téléphone."; v.replaceWith(t); };
    lire();
    document.getElementById("stSon").onclick = () => { storyMuet = !storyMuet; v.muted = storyMuet; document.getElementById("stSon").textContent = storyMuet ? "🔇" : "🔊"; if (v.paused) lire(); };
  }
  document.getElementById("stFermer").onclick = fermerStory;
  const m = document.getElementById("stMasquer");
  if (m) m.onclick = async () => {
    if (!confirm("Masquer ce post pour tout le monde ?")) return;
    try { if (!await rpc("live_cacher", { p_code: code, p_post: p.id, p_cache: true })) throw 0;
      LIVE.posts.delete(p.id); story.list.splice(story.i, 1);
      if (!story.list.length) fermerStory(); else { story.i = Math.min(story.i, story.list.length - 1); dessinerStory(0); }
      dessiner(); alerte("Post masqué");
    } catch (e) { alerte("Pas réussi à masquer, réessaie."); }
  };
  // Gestes façon Insta : toucher gauche/droite, glisser ← →, glisser vers le bas pour fermer, doigt appuyé = pause
  const zone = document.getElementById("stZone"), media = img || v; let g = null;
  const reprendre = () => { if (!story || !story.pause) return; story.pause = false; story.t0 = Date.now(); if (v && v.paused && !v.ended) v.play().catch(() => {}); };
  zone.onpointerdown = e => { g = { x: e.clientX, y: e.clientY, t: Date.now() }; if (v) v.pause();
    story.pause = true; story.ecoule += Date.now() - story.t0; try { zone.setPointerCapture(e.pointerId); } catch (err) {} };
  zone.onpointermove = e => { if (!g) return; const dx = e.clientX - g.x, dy = e.clientY - g.y;
    media.style.transition = "none"; media.style.transform = Math.abs(dx) > Math.abs(dy) ? `translateX(${dx}px)` : dy > 0 ? `translateY(${dy}px) scale(${Math.max(.8, 1 - dy / 1200)})` : ""; };
  zone.onpointerup = e => { if (!g || !story) return; const dx = e.clientX - g.x, dy = e.clientY - g.y, dt = Date.now() - g.t; g = null;
    media.style.transition = ""; media.style.transform = "";
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) return pasStory(dx < 0 ? 1 : -1);
    if (dy > 90 && dy > Math.abs(dx)) return fermerStory();
    if (dt < 500 && Math.abs(dx) < 15 && Math.abs(dy) < 15) { const r = zone.getBoundingClientRect(); return pasStory(e.clientX - r.left < r.width * .35 ? -1 : 1); }
    reprendre(); };
  zone.onpointercancel = () => { g = null; media.style.transition = ""; media.style.transform = ""; reprendre(); };
}
document.addEventListener("keydown", e => { if (!story) return; if (e.key === "Escape") fermerStory(); else if (e.key === "ArrowRight") pasStory(1); else if (e.key === "ArrowLeft") pasStory(-1); });

// ---------- Caméra façon Snap (reprise de Vegas) ----------
// Appui = photo, appui long = vidéo (10 s max). Ensuite : glisser pour changer de filtre, toucher pour écrire, Envoyer.
const FILTRES = [
  ["Normal", null],
  ["Noir & blanc", (r, g, b) => { const y = (.299 * r + .587 * g + .114 * b - 128) * 1.15 + 128; return [y, y, y]; }],
  ["Doré", (r, g, b) => [r * 1.08 + 14, g * 1.02 + 6, b * .82]],
  ["Vintage", (r, g, b) => { const sr = r * .393 + g * .769 + b * .189, sg = r * .349 + g * .686 + b * .168, sb = r * .272 + g * .534 + b * .131;
    return [(r * .35 + sr * .65) * .88 + 26, (g * .35 + sg * .65) * .88 + 22, (b * .35 + sb * .65) * .88 + 18]; }],
  ["Doux", (r, g, b) => [r * .96 + 14, g * .96 + 12, b * .96 + 16]],
  ["Hiver", (r, g, b) => [r * .92 + 6, g * .98 + 10, b * 1.1 + 22]]
];
const CAM_REC = typeof MediaRecorder !== "undefined";
let cam = null;
const camQ = id => document.getElementById(id);

function ouvrirCamera() {
  if (!prenomLive()) return dessiner();
  if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) return choisirGalerie();
  fermerStory();
  if (!cam) cam = { facing: "environment", tok: 0 };
  Object.assign(cam, { shot: null, vid: null, filter: 0, cache: {}, text: "", ty: .62, busy: false, discard: false, swiped: false });
  camBuild();
  cam.el.hidden = false; document.documentElement.classList.add("plein-ecran");
  camLive();
}
function choisirGalerie() {
  let f = document.getElementById("liveFichier");
  if (!f) {
    f = document.createElement("input"); f.type = "file"; f.id = "liveFichier"; f.accept = "image/*,video/*"; f.hidden = true;
    f.onchange = () => { const x = f.files[0]; f.value = ""; depuisGalerie(x); };
    document.body.appendChild(f);
  }
  f.click();
}
function fermerCamera(garderVid) {
  if (!cam || !cam.el || cam.el.hidden) return;
  if (cam.rec) { cam.discard = true; camRecStop(); }
  camStop();
  const pv = camQ("camPV"); pv.pause(); pv.removeAttribute("src"); pv.load();
  if (cam.vid && !garderVid) URL.revokeObjectURL(cam.vid.url);
  cam.vid = null; cam.shot = null; cam.cache = {};
  cam.el.hidden = true; document.documentElement.classList.remove("plein-ecran");
}
function camBuild() {
  if (cam.el) return;
  const el = document.createElement("div");
  el.id = "cam"; el.hidden = true; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "Caméra");
  el.innerHTML = `<video id="camV" playsinline muted autoplay></video>
    <div class="cam-flash" id="camFlash"></div>
    <div id="camUi">
      <div class="cam-top"><button type="button" class="cam-ico cam-hide" id="camClose" aria-label="Fermer la caméra">✕</button><span class="cam-tag" id="camTag"></span><button type="button" class="cam-ico cam-hide" id="camTorch" aria-label="Lampe" hidden>⚡</button></div>
      <p class="cam-hint cam-hide" id="camHint"></p>
      <div class="cam-bot">
        <button type="button" class="cam-ico cam-hide" id="camGal" aria-label="Choisir dans mes photos">🖼</button>
        <button type="button" class="cam-shut" id="camShut" aria-label="Prendre une photo (garder appuyé pour filmer)"><svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="44" class="rg"/><circle cx="50" cy="50" r="44" class="pr" id="camProg"/></svg></button>
        <button type="button" class="cam-ico cam-hide" id="camFlip" aria-label="Changer de caméra">🔄</button>
      </div>
    </div>
    <div class="cam-edit" id="camEdit" hidden>
      <div class="cam-stage" id="camStage"><canvas id="camC"></canvas><video id="camPV" playsinline loop hidden></video>
        <div class="cam-cap" id="camCap" hidden><input id="camTxt" maxlength="80" enterkeyhint="done" autocomplete="off" aria-label="Texte sur la photo"></div>
        <p class="cam-fname" id="camFname"></p></div>
      <div class="cam-top"><button type="button" class="cam-ico" id="camBack" aria-label="Reprendre">✕</button><span class="cam-dots" id="camDots"></span><button type="button" class="cam-ico" id="camAa" aria-label="Écrire un texte">Aa</button></div>
      <p class="cam-hint" id="camHint2"></p>
      <div class="cam-send-row"><button type="button" class="cam-ico" id="camSave" aria-label="Enregistrer sur mon téléphone">⬇</button><button type="button" class="cam-send" id="camSend">Envoyer ➤</button></div>
    </div>
    <div class="cam-msg" id="camMsg" hidden></div>`;
  document.body.appendChild(el); cam.el = el;
  el.addEventListener("contextmenu", e => e.preventDefault());

  camQ("camClose").onclick = () => fermerCamera();
  camQ("camFlip").onclick = () => { if (cam.rec) return; cam.facing = cam.facing === "user" ? "environment" : "user"; camStart(); };
  camQ("camTorch").onclick = async () => { const t = cam.stream && cam.stream.getVideoTracks()[0]; if (!t) return;
    try { await t.applyConstraints({ advanced: [{ torch: !cam.torch }] }); cam.torch = !cam.torch; camQ("camTorch").classList.toggle("on", cam.torch); } catch (e) {} };
  camQ("camGal").onclick = () => { fermerCamera(); choisirGalerie(); };

  const sh = camQ("camShut");
  sh.onpointerdown = e => { e.preventDefault(); if (!cam.stream || cam.rec || cam.pressT) return;
    try { sh.setPointerCapture(e.pointerId); } catch (err) {}
    cam.pressT = setTimeout(() => { cam.pressT = 0; if (CAM_REC) camRecStart(); }, 280); };
  const up = () => { if (cam.pressT) { clearTimeout(cam.pressT); cam.pressT = 0; camSnap(); } else if (cam.rec) camRecStop(); };
  sh.onpointerup = up; sh.onpointercancel = up;
  sh.onclick = e => { if (e.detail === 0) camSnap(); };   // clavier

  camQ("camBack").onclick = () => { if (cam.vid) { URL.revokeObjectURL(cam.vid.url); cam.vid = null; } camQ("camPV").pause(); camLive(); };
  camQ("camAa").onclick = () => camCaption(cam.ty);
  camQ("camSave").onclick = camSave;
  camQ("camSend").onclick = camSend;

  const st = camQ("camStage"); let p0 = null;
  st.onpointerdown = e => { if (e.target.closest("#camCap")) return; p0 = { x: e.clientX, y: e.clientY }; };
  st.onpointerup = e => { if (!p0) return; const dx = e.clientX - p0.x, dy = e.clientY - p0.y; p0 = null;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) && cam.shot) { camFilter(cam.filter + (dx < 0 ? 1 : -1)); return; }
    if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
      const inp = camQ("camTxt");
      if (document.activeElement === inp) inp.blur(); else camCaption(e.clientY / window.innerHeight);
    } };
  const cap = camQ("camCap"), inp = camQ("camTxt"); let d0 = null;
  cap.onpointerdown = e => { if (cap.classList.contains("typing")) return; e.preventDefault(); d0 = { y: e.clientY, ty: cam.ty, moved: false }; try { cap.setPointerCapture(e.pointerId); } catch (err) {} };
  cap.onpointermove = e => { if (!d0) return; const dy = e.clientY - d0.y; if (Math.abs(dy) > 6) d0.moved = true;
    cam.ty = Math.min(.9, Math.max(.1, d0.ty + dy / window.innerHeight)); cap.style.top = (cam.ty * 100) + "%"; };
  cap.onpointerup = () => { if (d0 && !d0.moved) camCaption(cam.ty); d0 = null; };
  inp.oninput = () => { cam.text = inp.value; };
  inp.onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); inp.blur(); } };
  inp.onblur = () => { cap.classList.remove("typing"); cam.text = inp.value.trim(); if (!cam.text) cap.hidden = true; };

  document.addEventListener("visibilitychange", () => {
    if (!cam || cam.el.hidden) return;
    if (document.hidden) { if (cam.rec) camRecStop(); camStop(); }
    else if (camQ("camEdit").hidden) camStart();
  });
}
const camAide = () => CAM_REC ? "Appuie : photo · Garde appuyé : vidéo" : "Appuie pour prendre la photo";
function camLive() {
  camQ("camEdit").hidden = true; camQ("camUi").hidden = false; camQ("camV").hidden = false;
  camQ("camTag").textContent = ""; camQ("camHint").textContent = camAide();
  camStart();
}
function camStop() {
  if (cam && cam.stream) { cam.stream.getTracks().forEach(t => t.stop()); cam.stream = null; }
  const v = camQ("camV"); if (v) v.srcObject = null;
}
async function camStart() {
  camStop();
  const tok = ++cam.tok, v = camQ("camV"), msg = camQ("camMsg"); msg.hidden = true;
  const video = { facingMode: cam.facing, width: { ideal: 1280 }, height: { ideal: 720 } };
  let s;
  try { s = await navigator.mediaDevices.getUserMedia({ video, audio: CAM_REC }); }
  catch (e) {
    try { s = await navigator.mediaDevices.getUserMedia({ video, audio: false }); }   // micro refusé : vidéos muettes
    catch (e2) { if (tok === cam.tok) camErr(e2); return; }
  }
  if (tok !== cam.tok || cam.el.hidden || !camQ("camEdit").hidden) { s.getTracks().forEach(t => t.stop()); return; }
  cam.stream = s; cam.torch = false; v.srcObject = s; v.classList.toggle("mir", cam.facing === "user");
  try { await v.play(); } catch (e) {}
  const tr = s.getVideoTracks()[0]; let caps = {}; try { caps = tr.getCapabilities ? tr.getCapabilities() : {}; } catch (e) {}
  const tb = camQ("camTorch"); tb.hidden = !caps.torch; tb.classList.remove("on");
}
function camErr(e) {
  const msg = camQ("camMsg"), n = e && e.name;
  const txt = n === "NotAllowedError" || n === "SecurityError"
    ? "La caméra est bloquée pour l'appli.<br>Sur iPhone : <b>Réglages → Apps → Safari → Caméra → Autoriser</b>, puis rouvre la caméra."
    : n === "NotFoundError" || n === "OverconstrainedError" ? "Pas de caméra trouvée sur cet appareil."
    : "La caméra ne s'ouvre pas (une autre appli l'utilise peut-être ?).";
  msg.innerHTML = `<p style="margin:0">${txt}</p><button type="button" class="btn" id="camMsgGal">🖼 Prendre dans mes photos</button> <button type="button" class="btn" id="camMsgX">Fermer</button>`;
  msg.hidden = false;
  camQ("camMsgGal").onclick = () => camQ("camGal").onclick();
  camQ("camMsgX").onclick = () => fermerCamera();
}
// Photo : on garde exactement ce qu'on voit à l'écran (même cadrage, selfie en miroir)
function camSnap() {
  const v = camQ("camV"); if (!cam.stream || !v.videoWidth) return;
  const W = window.innerWidth, H = window.innerHeight, vw = v.videoWidth, vh = v.videoHeight, ar = W / H;
  let sw = vw, sh = vw / ar; if (sh > vh) { sh = vh; sw = vh * ar; }
  const k = Math.min(1, 1280 / Math.max(sw, sh)), c = document.createElement("canvas");
  c.width = Math.round(sw * k); c.height = Math.round(sh * k);
  const x = c.getContext("2d"); if (cam.facing === "user") { x.translate(c.width, 0); x.scale(-1, 1); }
  x.drawImage(v, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, c.width, c.height);
  const fl = camQ("camFlash"); fl.classList.remove("go"); void fl.offsetWidth; fl.classList.add("go");
  cam.shot = { base: c.getContext("2d").getImageData(0, 0, c.width, c.height), w: c.width, h: c.height };
  cam.vid = null; cam.filter = 0; cam.cache = {};
  camEdit();
}
function camMime() {
  for (const m of ["video/mp4;codecs=avc1,mp4a.40.2", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"])
    try { if (MediaRecorder.isTypeSupported(m)) return m; } catch (e) {}
  return "";
}
function camRecStart() {
  let r; const m = camMime();
  // Qualité réduite exprès (1,2 Mb/s) : ~1,5 Mo pour 10 s, pour ne pas épuiser le Supabase gratuit
  try { r = new MediaRecorder(cam.stream, m ? { mimeType: m, videoBitsPerSecond: 1200000, audioBitsPerSecond: 64000 } : undefined); }
  catch (e) { try { r = new MediaRecorder(cam.stream); } catch (e2) { return camSnap(); } }
  cam.chunks = []; cam.rec = r; cam.recT0 = Date.now(); cam.discard = false;
  r.ondataavailable = e => { if (e.data && e.data.size) cam.chunks.push(e.data); };
  r.onstop = () => camRecDone(r);
  try { r.start(500); } catch (e) { cam.rec = null; return camSnap(); }
  cam.el.classList.add("rec");
  const pr = camQ("camProg"), tag = camQ("camTag"), max = MAX_VID_SEC * 1000;
  const tick = () => { if (cam.rec !== r) return; const t = Date.now() - cam.recT0;
    pr.style.strokeDashoffset = 276.5 * (1 - Math.min(1, t / max));
    tag.textContent = "● " + Math.floor(t / 1000) + " s";
    if (t >= max) camRecStop(); else requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
}
function camRecStop() {
  const r = cam.rec; if (!r) return; cam.rec = null;
  cam.recDur = (Date.now() - cam.recT0) / 1000;
  cam.el.classList.remove("rec"); camQ("camProg").style.strokeDashoffset = 276.5; camQ("camTag").textContent = "";
  try { if (r.state !== "inactive") r.stop(); } catch (e) {}
}
function camRecDone(r) {
  if (cam.discard) { cam.discard = false; cam.chunks = []; return; }
  const type = ((r.mimeType || (cam.chunks[0] && cam.chunks[0].type) || "video/mp4").split(";")[0]) || "video/mp4";
  const blob = new Blob(cam.chunks, { type }); cam.chunks = [];
  if (!blob.size) return camToast("La vidéo n'a pas pu être enregistrée. Réessaie.");
  if (blob.size > MAX_GAL_MO * 1048576) return camToast("Vidéo trop lourde. Filme plus court.");
  cam.vid = { file: new File([blob], "mariage." + (/webm/.test(type) ? "webm" : "mp4"), { type }), url: URL.createObjectURL(blob) }; cam.shot = null;
  camEdit();
}
function camToast(t) { const h = camQ("camHint"); h.textContent = t; setTimeout(() => { if (cam && !cam.rec) h.textContent = camAide(); }, 3500); }

function camEdit() {
  camStop();
  camQ("camUi").hidden = true; camQ("camV").hidden = true; camQ("camEdit").hidden = false;
  const c = camQ("camC"), pv = camQ("camPV"), cap = camQ("camCap"), inp = camQ("camTxt");
  cam.text = ""; inp.value = ""; cap.hidden = true; cap.classList.remove("typing");
  if (cam.shot) {
    c.hidden = false; pv.hidden = true; c.width = cam.shot.w; c.height = cam.shot.h; camPaint(false);
    camQ("camHint2").textContent = cam.swiped ? "Touche la photo pour écrire" : "← Glisse pour les filtres · Touche pour écrire →";
  } else {
    c.hidden = true; pv.hidden = false; pv.src = cam.vid.url; pv.muted = false;
    pv.play().catch(() => { pv.muted = true; pv.play().catch(() => {}); });
    camQ("camHint2").textContent = "Touche la vidéo pour ajouter un texte";
  }
  camQ("camDots").innerHTML = cam.shot ? FILTRES.map((f, i) => `<i class="${i === cam.filter ? "on" : ""}"></i>`).join("") : "";
  const sd = camQ("camSend"); sd.disabled = false; sd.textContent = "Envoyer ➤";
}
function camFilter(i) {
  const n = FILTRES.length; cam.filter = (i + n) % n; cam.swiped = true;
  camQ("camHint2").textContent = "Touche la photo pour écrire";
  camPaint(true);
  camQ("camDots").querySelectorAll("i").forEach((d, k) => d.classList.toggle("on", k === cam.filter));
}
function camPaint(nom) {
  const c = camQ("camC"), x = c.getContext("2d"), f = FILTRES[cam.filter][1];
  if (!f) x.putImageData(cam.shot.base, 0, 0);
  else {
    if (!cam.cache[cam.filter]) {
      const img = new ImageData(new Uint8ClampedArray(cam.shot.base.data), cam.shot.w, cam.shot.h), d = img.data;
      for (let i = 0; i < d.length; i += 4) { const o = f(d[i], d[i + 1], d[i + 2]); d[i] = o[0]; d[i + 1] = o[1]; d[i + 2] = o[2]; }
      cam.cache[cam.filter] = img;
    }
    x.putImageData(cam.cache[cam.filter], 0, 0);
  }
  if (nom) { const el = camQ("camFname"); el.textContent = FILTRES[cam.filter][0]; el.classList.add("show");
    clearTimeout(cam.nameT); cam.nameT = setTimeout(() => el.classList.remove("show"), 900); }
}
function camCaption(ty) {
  const cap = camQ("camCap"), inp = camQ("camTxt");
  if (cap.hidden) { cam.ty = Math.min(.9, Math.max(.1, ty)); cap.style.top = (cam.ty * 100) + "%"; }
  cap.hidden = false; cap.classList.add("typing"); inp.focus();
}
// La photo finale : filtre + bandeau de texte « imprimés » dans l'image
function camFinal() {
  const c = camQ("camC"), o = document.createElement("canvas"); o.width = c.width; o.height = c.height;
  const x = o.getContext("2d"); x.drawImage(c, 0, 0);
  const t = (cam.text || "").trim();
  if (t) {
    const fs = Math.max(16, Math.round(o.width * .052)), bh = Math.round(fs * 1.84), y = Math.round(Math.min(o.height - bh, Math.max(0, cam.ty * o.height - bh / 2)));
    x.fillStyle = "rgba(0,0,0,.5)"; x.fillRect(0, y, o.width, bh);
    x.fillStyle = "#fff"; x.font = `500 ${fs}px Inter, system-ui, -apple-system, sans-serif`; x.textAlign = "center"; x.textBaseline = "middle";
    x.fillText(t, o.width / 2, y + bh / 2, o.width * .92);
  }
  return o;
}
async function camSave() {
  const inp = camQ("camTxt"); if (document.activeElement === inp) inp.blur();
  const file = cam.shot ? new File([await versJpeg(camFinal(), 1920, 2e6, .9)], "mariage.jpg", { type: "image/jpeg" }) : cam.vid && cam.vid.file;
  if (!file) return;
  try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file] }); return; } } catch (e) { if (e && e.name === "AbortError") return; }
  const a = document.createElement("a"), u = URL.createObjectURL(file); a.href = u; a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 4000);
}
async function camSend() {
  if (cam.busy) return; cam.busy = true;
  const inp = camQ("camTxt"); if (document.activeElement === inp) inp.blur();
  const sd = camQ("camSend"); sd.disabled = true; sd.textContent = "…";
  let envoi;
  if (cam.shot) envoi = Object.assign({ type: "photo" }, await photoEtMiniature(camFinal()));
  else {
    const i = await infosVideo(cam.vid.file);
    envoi = { type: "video", fichier: cam.vid.file, miniature: i.miniature || await miniatureVide(), texte: (cam.text || "").trim() };
  }
  fermerCamera();
  cam.busy = false;
  publier(envoi);
}

// ---------- Interactions du live ----------
document.addEventListener("click", e => {
  if (e.target.closest("[data-poster]")) return ouvrirCamera();
  const v = e.target.closest("[data-post]");
  if (v) return ouvrirStory(v.dataset.post);
  if (e.target.closest("[data-changer-prenom]")) {
    try { STOCKAGE.removeItem("mariage-prenom"); } catch (err) {}
    dessiner();
  }
});
document.addEventListener("submit", e => {
  if (e.target.id !== "formPrenom") return;
  e.preventDefault();
  const v = document.getElementById("champPrenom").value.trim().slice(0, 30);
  if (!v) return;
  try { STOCKAGE.setItem("mariage-prenom", v); } catch (err) {}
  dessiner();
});
