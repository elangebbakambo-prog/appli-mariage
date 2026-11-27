// Les numéros importants : un appui pour appeler, un autre pour écrire ou appeler sur WhatsApp.
// Les numéros sont dans Supabase (table contacts), jamais dans le code. Ils restent sur le téléphone : ça marche sans réseau.
const mesContacts = () => (data && data.contacts) || [];

// « 06 12 34 56 78 » → « +33612345678 » (appel) et « 33612345678 » (WhatsApp)
function numeroInter(tel) {
  let n = String(tel || "").replace(/[^\d+]/g, "");
  if (n.startsWith("+")) return n;
  if (n.startsWith("00")) return "+" + n.slice(2);
  if (n.startsWith("0")) return "+33" + n.slice(1);
  return n ? "+" + n : "";
}
function vueContacts() {
  const C = mesContacts();
  if (!C.length) return `<p class="vide">Pas de numéros pour l'instant.</p>`;
  const sections = new Map();
  for (const c of C) { const s = c.section || "Important"; if (!sections.has(s)) sections.set(s, []); sections.get(s).push(c); }
  const ligne = c => {
    const inter = numeroInter(c.tel), wa = inter.replace("+", "");
    const nom = c.nom || c.role, role = c.nom && c.role ? c.role : "";
    return `<li class="ct">
      <span class="ct-txt"><b>${esc(nom)}</b>${role ? `<small>${esc(role)}</small>` : ""}<small class="ct-num">${esc(c.tel)}</small></span>
      <a class="ct-btn ct-tel" href="tel:${esc(inter)}" aria-label="Appeler ${esc(nom)}">${ICONE_TEL}</a>
      <a class="ct-btn ct-wa" href="https://wa.me/${esc(wa)}" target="_blank" rel="noopener" aria-label="WhatsApp ${esc(nom)}">${ICONE_WA}</a>
    </li>`;
  };
  return `<section class="carte ph-tete"><h2>📞 Numéros importants</h2>
      <p class="petit">Le bouton foncé pour appeler, le vert pour WhatsApp. Ça marche même sans réseau internet.</p></section>
    ${[...sections].map(([s, L]) => `<h3 class="sous">${esc(s)}</h3><ul class="cts">${L.map(ligne).join("")}</ul>`).join("")}`;
}
const ICONE_WA = `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2c-1.5 0-3-.4-4.3-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.4.1-.7.3-.2.3-.9.9-.9 2.2s.9 2.5 1 2.7c.1.2 1.8 2.8 4.4 3.9 1.6.7 2.3.8 3.1.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3Z"/></svg>`;
const ICONE_TEL = `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1l-2.3 2.2Z"/></svg>`;
