// La check-list des photos de groupe : chaque photo à faire, qui doit être dessus, et on coche quand c'est fait.
// Ce sont les tâches de la section « Photos de groupe » : cochées par l'un, cochées pour tout le monde.
const SECTION_PHOTOS = "Photos de groupe";
const photosGroupe = () => (data && data.taches || []).filter(t => t.section === SECTION_PHOTOS);

// « Véro et Domi, Brian, les cousins. » → ["Véro", "Domi", "Brian", "les cousins"]
const gensDe = txt => String(txt || "").replace(/\.\s*$/, "").split(/,\s*|\s+et\s+|\s*\+\s*/).map(s => s.trim()).filter(Boolean);

function compteurPhotos() {
  const L = photosGroupe();
  return L.length ? `${L.filter(t => t.fait).length}/${L.length}` : "";
}
function lienChecklistPhotos() {
  const L = photosGroupe(); if (!L.length) return "";
  const reste = L.filter(t => !t.fait).length;
  return `<button type="button" class="carte lien-photos" data-aller="o:photos">
    <span aria-hidden="true">📸</span><span><b>Check-list des photos de groupe</b><br><small>${reste ? `${reste} photo${reste > 1 ? "s" : ""} à faire sur ${L.length}` : "Toutes les photos sont faites 🎉"}</small></span><i aria-hidden="true">›</i></button>`;
}
function vuePhotos() {
  const L = photosGroupe();
  if (!L.length) return `<p class="vide">Pas de photos de groupe pour toi.</p>`;
  const faites = L.filter(t => t.fait).length, pc = Math.round(faites / L.length * 100);
  const aFaire = L.filter(t => !t.fait), fini = L.filter(t => t.fait);
  const carte = (t, i) => {
    const gens = gensDe(t.details);
    const qui = t.fait && t.fait_par ? `✓ Faite${t.fait_le ? " à " + new Date(t.fait_le).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : ""} · ${t.fait_par}` : "";
    return `<li class="ph ${t.fait ? "faite" : ""}">
      <label>
        <input type="checkbox" data-tache="${t.id}" ${t.fait ? "checked" : ""}>
        <span class="ph-no" aria-hidden="true">${t.fait ? "✓" : i}</span>
        <span class="ph-txt"><b>${esc(t.titre)}</b>
          ${t.heure ? `<small class="meta">🕒 ${esc(hhmm(t.heure))}</small>` : ""}
          ${gens.length ? `<span class="ph-gens">${gens.map(g => `<span>${esc(g)}</span>`).join("")}</span>` : ""}
          ${qui ? `<small class="meta">${esc(qui)}</small>` : ""}</span>
      </label></li>`;
  };
  return `<section class="carte ph-tete">
      <h2>📸 Photos de groupe</h2>
      <p class="petit">Appelle les gens de la photo, fais-la, puis coche : tout le monde voit qu'elle est faite.</p>
      <div class="ph-barre" role="progressbar" aria-valuenow="${pc}" aria-valuemin="0" aria-valuemax="100" aria-label="Photos faites"><i style="width:${pc}%"></i></div>
      <p class="resume">${faites < L.length ? `<b>${faites}</b> faite${faites > 1 ? "s" : ""} sur ${L.length}` : "Toutes les photos sont faites 🎉"}</p>
    </section>
    ${aFaire.length ? `<h3 class="sous">À faire <small>${aFaire.length}</small></h3><ul class="phs">${aFaire.map((t, i) => carte(t, i + 1)).join("")}</ul>` : ""}
    ${fini.length ? `<h3 class="sous">Déjà faites <small>${fini.length}</small></h3><ul class="phs">${fini.map(t => carte(t, "✓")).join("")}</ul>` : ""}`;
}
