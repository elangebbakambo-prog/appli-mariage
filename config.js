// Réglages de l'appli du mariage.
// La clé « publishable » de Supabase est faite pour être publique : elle peut être sur GitHub.
// Ne mets JAMAIS ici la clé secrète (secret / service_role).
// Tant que supabaseUrl est vide, l'appli tourne en MODE DÉMO (données de demo.js).
window.MARIAGE = {
  maries: "Prénom & Prénom",   // affiché en grand en haut
  date: "2026-12-12",          // jour du mariage (AAAA-MM-JJ), sert au compte à rebours et à « maintenant »
  supabaseUrl: "",
  supabaseKey: ""
};
