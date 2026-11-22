// Souvenirs : télécharger toutes les photos et vidéos du live dans des fichiers .zip (admins).
// Les fichiers sont rangés par heure, avec le prénom de l'auteur (et le Moment s'il y en a un).
// Au-delà de 300 Mo, on fait plusieurs .zip (partie 1, partie 2…) pour ne pas saturer le téléphone ou l'ordi.
// Chargé AVANT app.js : utilise data, LIVE, urlMedia, esc… seulement dans ses fonctions.

const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(u) { let c = 0xFFFFFFFF; for (let i = 0; i < u.length; i++) c = CRC_T[(c ^ u[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
// Un .zip simple (sans compression : les photos et vidéos sont déjà compressées). Repris de l'appli Vegas.
function faireZip(fichiers) {
  const parts = [], central = [], enc = new TextEncoder(); let off = 0;
  const dosT = d => ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xFFFF, dosD = d => (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF;
  fichiers.forEach(f => {
    const name = enc.encode(f.nom), crc = crc32(f.data), n = f.data.length, d = f.date || new Date();
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
    h.setUint16(10, dosT(d), true); h.setUint16(12, dosD(d), true); h.setUint32(14, crc, true); h.setUint32(18, n, true); h.setUint32(22, n, true);
    h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
    parts.push(h.buffer, name, f.data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
    c.setUint16(12, dosT(d), true); c.setUint16(14, dosD(d), true); c.setUint32(16, crc, true); c.setUint32(20, n, true); c.setUint32(24, n, true);
    c.setUint16(28, name.length, true); c.setUint32(42, off, true);
    central.push(c.buffer, name);
    off += 30 + name.length + n;
  });
  const csize = central.reduce((a, p) => a + (p.byteLength || p.length), 0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, fichiers.length, true); e.setUint16(10, fichiers.length, true); e.setUint32(12, csize, true); e.setUint32(16, off, true);
  return new Blob(parts.concat(central, [e.buffer]), { type: "application/zip" });
}
const propre = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w-]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "x";
function enregistrer(blob, nom) {
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = nom; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 60000);
}
let zipOccupe = false;
async function telechargerSouvenirs(bouton) {
  if (zipOccupe) return; zipOccupe = true;
  const dire = t => { if (bouton) bouton.textContent = t; };
  try {
    await chargerLive(true);
    const L = [...LIVE.posts.values()].sort((a, b) => String(a.cree_le).localeCompare(String(b.cree_le)));
    if (!L.length) { dire("Pas encore de photos"); zipOccupe = false; return; }
    const LIMITE = 300 * 1048576, vus = {};
    let lot = [], taille = 0, partie = 1, total = 0;
    const fermerLot = () => {
      if (!lot.length) return;
      enregistrer(faireZip(lot), `Mariage-Chaina-Chris-souvenirs${partie > 1 || taille >= LIMITE ? "-partie" + partie : ""}.zip`);
      lot = []; taille = 0; partie++;
    };
    for (let k = 0; k < L.length; k++) {
      const p = L[k]; dire(`Préparation… ${k + 1}/${L.length}`);
      try {
        const r = await fetch(urlMedia(p.fichier)); if (!r.ok) continue;
        const d = new Uint8Array(await r.arrayBuffer()), date = new Date(p.cree_le);
        const ext = (String(p.fichier).split(".").pop() || "jpg").slice(0, 4);
        const h = String(date.getHours()).padStart(2, "0") + "h" + String(date.getMinutes()).padStart(2, "0");
        let nom = `Mariage Chaina & Chris/${h} ${propre(p.auteur)}${p.moment ? " - " + propre(p.moment) : ""}`;
        vus[nom] = (vus[nom] || 0) + 1; if (vus[nom] > 1) nom += "-" + vus[nom];
        if (taille + d.length > LIMITE && lot.length) fermerLot();
        lot.push({ nom: nom + "." + ext, data: d, date }); taille += d.length; total++;
      } catch (e) {}
    }
    if (partie === 1 && taille < LIMITE) { enregistrer(faireZip(lot), "Mariage-Chaina-Chris-souvenirs.zip"); lot = []; }
    else fermerLot();
    dire(`✓ ${total} souvenirs téléchargés`);
  } catch (e) { dire("Échec du téléchargement, réessaie en wifi"); }
  zipOccupe = false;
}

// Pour les admins : en haut du Live, télécharger tout ; dans Équipe, le lien de l'écran géant
function carteSouvenirs() {
  if (!data || !data.moi || !data.moi.admin) return "";
  return `<section class="carte souvenirs">
      <p><b>📦 Les souvenirs</b><br><small>Toutes les photos et vidéos du live dans un .zip (sur ordinateur, en wifi, c'est mieux).</small></p>
      <button type="button" class="btn plein" data-souvenirs>⬇ Tout télécharger</button>
    </section>`;
}
function carteEcran() {
  if (!data || !data.moi || !data.moi.admin || !data.invite) return "";
  const lien = new URL("ecran.html?invite=" + encodeURIComponent(data.invite), location.href).href;
  return `<section class="carte ecran-carte">
      <h3>📺 Écran géant</h3>
      <p class="petit">Ouvre ce lien sur l'ordinateur branché à la télé ou au vidéoprojecteur de la salle : les photos et vidéos du live défilent en direct, avec un QR code pour inviter tout le monde à poster.</p>
      <div class="actions">
        <a class="btn plein" href="${esc(lien)}" target="_blank" rel="noopener">Ouvrir l'écran géant</a>
        <button class="btn" type="button" data-copier="${esc(lien)}">Copier le lien</button>
      </div>
    </section>`;
}
document.addEventListener("click", e => { const b = e.target.closest("[data-souvenirs]"); if (b) telechargerSouvenirs(b); });
