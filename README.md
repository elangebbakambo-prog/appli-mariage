# Appli du mariage

Appli web pour le jour J, en HTML, CSS et JavaScript sans framework, avec Supabase et GitHub Pages.

**Partie 1 : l'organisation (faite).** Chaque personne (mariés, témoins, garçons d'honneur, prestataires) reçoit **son lien perso** (`…/?code=XXXX`). En l'ouvrant, elle voit le programme qui la concerne et ses tâches à cocher. Pas de compte ni de mot de passe.

**Partie 2 : le live des invités** (caméra, stories, photos, vidéos, montages) : à venir.

## Les fichiers

| Fichier | Rôle |
| --- | --- |
| `index.html` | La page, presque vide : tout est dessiné par `app.js` |
| `style.css` | Le style. **Les couleurs du mariage sont en haut**, dans `:root` |
| `app.js` | Toute la logique : programme, tâches, équipe |
| `config.js` | Prénoms des mariés, date, connexion Supabase |
| `demo.js` | Données d'exemple, utilisées tant que Supabase n'est pas branché |
| `supabase/schema.sql` | Les tables et les deux fonctions sécurisées |
| `supabase/exemple.sql` | Des données d'exemple pour tester |

## Qui voit quoi

- **Programme** : un moment avec `pour` vide est pour tout le monde. Sinon `pour` liste des rôles ou des prénoms (ex. `{Témoin,Traiteur}`).
- **Tâches** : soit pour une personne précise (`personne_id`), soit pour tout un rôle (`role`). Une tâche de rôle est partagée : si un témoin la coche, elle est cochée pour tous les témoins, avec « fait par … ».
- **Admin** (`admin = true`, pour les mariés et l'organisation) : voit et coche tout, et a l'onglet **Équipe** avec le lien de chacun (bouton « Copier » et « WhatsApp »).

## Sécurité

Les tables sont fermées (RLS activé, aucune règle) : la clé publique ne permet pas de les lire. L'appli passe uniquement par deux fonctions, `mon_espace(code)` et `cocher(code, tache, fait)`, qui vérifient le code et ne renvoient que ce qui concerne la personne. Les codes font 12 caractères aléatoires : impossible de deviner celui d'un autre.

Ne partage jamais un lien admin, et ne mets jamais la clé secrète de Supabase dans le code.

## Brancher Supabase

1. Crée un nouveau projet sur supabase.com (séparé de celui de l'EVG).
2. SQL Editor → colle `supabase/schema.sql` → Run.
3. Pour tester : colle `supabase/exemple.sql` → Run (ou ajoute les vraies données dans Table Editor).
4. Project Settings → API Keys : copie l'URL du projet et la clé **publishable** dans `config.js`.
5. Les liens de chacun : onglet **Équipe** avec un lien admin, ou `select prenom, role, code from personnes;`

## Tester en local

Ouvre le dossier dans VS Code, puis clic droit sur `index.html` → « Open with Live Server ». Sans Supabase, le mode démo marche avec `?code=mariee` (admin), `?code=temoin` ou `?code=dj`.
