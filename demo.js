// Lien de démo : …/?demo=1&code=mariee montre l'appli avec ces données d'exemple, même quand Supabase est branché.
// En démo, rien n'est gardé sur le téléphone (pour ne pas écraser le vrai lien de quelqu'un).
window.DEMO_URL = new URLSearchParams(location.search).has("demo");
window.STOCKAGE = (() => {
  if (!window.DEMO_URL) { try { return window.localStorage; } catch (e) {} }
  const m = {};
  return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; } };
})();

// Données de démonstration, utilisées seulement tant que Supabase n'est pas branché (config.js).
// Liens de test : ?code=mariee (admin), ?code=temoin, ?code=dj
window.DEMO = {
  personnes: [
    { prenom: "La mariée", role: "Mariée", admin: true, tel: "", code: "mariee" },
    { prenom: "Elange", role: "Organisation", admin: true, tel: "", code: "elange", groupes: ["Team"] },
    { prenom: "Témoin 1", role: "Témoin", admin: false, tel: "", code: "temoin", groupes: ["Team"], nom_plan: "Témoin Un" },
    { prenom: "Témoin 2", role: "Témoin", admin: false, tel: "", code: "temoin2", groupes: ["Team"] },
    { prenom: "DJ", role: "DJ", admin: false, tel: "", code: "dj" },
    { prenom: "Traiteur", role: "Traiteur", admin: false, tel: "", code: "traiteur" }
  ],
  moments: [
    { id: 1, debut: "08:00", fin: "10:00", titre: "Installation de la salle", lieu: "Salle de réception", details: "Déco des tables, plan de table, livre d'or.", pour: ["Témoin", "Traiteur"] },
    { id: 2, debut: "14:00", fin: "15:00", titre: "Cérémonie", public: true, lieu: "Mairie", details: "Arriver 15 min avant. Les témoins signent le registre.", pour: [] },
    { id: 3, debut: "16:00", fin: "18:30", titre: "Vin d'honneur", public: true, lieu: "Salle de réception", details: "", pour: [] },
    { id: 4, debut: "19:30", fin: null, titre: "Entrée des mariés", public: true, lieu: "Salle de réception", details: "Le DJ lance la musique d'entrée au signal des témoins.", pour: [] },
    { id: 5, debut: "20:00", fin: "22:30", titre: "Dîner", public: true, lieu: "Salle de réception", details: "", pour: [] },
    { id: 6, debut: "23:00", fin: null, titre: "Ouverture du bal", public: true, lieu: "Piste de danse", details: "", pour: [] }
  ],
  taches: [
    { id: 1, titre: "Récupérer les alliances", details: "Chez la mariée, la veille au soir.", heure: null, role: "Témoin" },
    { id: 2, titre: "Donner le signal au DJ pour l'entrée des mariés", details: "", heure: "19:25", role: "Témoin" },
    { id: 3, titre: "Tester le son et le micro", details: "", heure: "15:30", role: "DJ" },
    { id: 4, titre: "Dresser le buffet du vin d'honneur", details: "", heure: "15:30", role: "Traiteur" },
    { id: 5, titre: "Préparer le discours des témoins", details: "", heure: null, prenom: "Témoin 1" },
    { id: 6, titre: "Installer les sapins de la salle", details: "", heure: null, section: "Vendredi · Salle principale", pour: ["Team"] },
    { id: 7, titre: "Les mariés avec les témoins", details: "Les mariés, Témoin 1 et Témoin 2.", heure: "14:00", section: "Photos de groupe", pour: ["Team"] },
    { id: 8, titre: "Famille proche", details: "Les parents, les grands-parents et les cousins.", heure: null, section: "Photos de groupe", pour: ["Team"] }
  ],
  fiches: [
    { id: 1, titre: "Fiche DJ", icone: "🎧", pour: ["DJ"], public: false,
      contenu: "## Déroulé\n- **21h00** : entrée des mariés\n## Blacklist\n- Pas de macarena" },
    { id: 2, titre: "Le bar", icone: "🍸", pour: [], public: true,
      contenu: "## The Bar\n- **Soupe de champagne**\n- Sans alcool" }
  ],
  plan: [
    { nom: "Léa Martin", table: 1 }, { nom: "Chloé Durand", table: 1 },
    { nom: "Paul Petit", table: 2 }, { nom: "Hugo Petit", table: 2 },
    { nom: "Témoin Un", table: 2 }, { nom: "Marc Leroy", table: 2 }
  ],
  tables: { 1: { forme: "ronde" }, 2: { forme: "rect" } }
};
