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

En plus :
- **CSP** (`Content-Security-Policy` dans `index.html`) : la page ne peut exécuter que ses propres scripts et ne parle qu'à Supabase. Pas de JavaScript écrit dans la page, pas de script externe.
- **`esc()`** : tout texte venant de la base (prénoms, titres, lieux…) est échappé avant d'être affiché, donc un texte piégé reste du texte.
- **Pas de référent** (`no-referrer`) : le lien avec le code n'est jamais envoyé aux autres sites (Google Maps, WhatsApp…).

## Tests automatiques

À chaque push et à chaque pull request, GitHub lance les tests (onglet **Actions**, et ✅ ou ❌ en bas de chaque PR). Un ❌ veut dire qu'une modification a cassé quelque chose ou ouvert une faille : ne pas fusionner avant de comprendre pourquoi.

- `tests/appli.spec.js` : l'appli sur un téléphone, en mode démo : chacun ne voit que ce qui le concerne, cocher, lien inconnu refusé, texte piégé non exécuté, hors-ligne.
- `tests/securite.spec.js` : lit le code : pas de clé secrète, pas de script externe, CSP présente, `esc()` partout, tables fermées dans `schema.sql`.
- `tests/base.sql` : installe la base sur un Postgres vide et joue le rôle de n'importe qui avec la clé publique : impossible de lire les tables, de voir la tâche ou le code d'un autre, de cocher pour un autre, de s'ajouter en admin.

En local : `npm install` puis `npm test`.

## Brancher Supabase

1. Crée un nouveau projet sur supabase.com (séparé de celui de l'EVG).
2. SQL Editor → colle `supabase/schema.sql` → Run.
3. Pour tester : colle `supabase/exemple.sql` → Run (ou ajoute les vraies données dans Table Editor).
4. Project Settings → API Keys : copie l'URL du projet et la clé **publishable** dans `config.js`.
5. Les liens de chacun : onglet **Équipe** avec un lien admin, ou `select prenom, role, code from personnes;`

## Tester en local

Ouvre le dossier dans VS Code, puis clic droit sur `index.html` → « Open with Live Server ». Sans Supabase, le mode démo marche avec `?code=mariee` (admin), `?code=temoin` ou `?code=dj`.

## Appli sur l'écran d'accueil (PWA)

- `manifest.webmanifest` + icônes `icon-*.png` : l'appli s'installe comme une vraie appli. Le manifest n'a volontairement **pas** de `start_url` : l'icône garde l'adresse avec le code de la personne, donc chacun retombe sur son espace.
- `sw.js` : garde une copie des fichiers. Les dernières données reçues sont aussi gardées sur le téléphone : sans réseau, on voit la dernière version (avec un bandeau jaune).
- Un bandeau propose l'installation (bouton sur Android, explication sur iPhone) ; il disparaît une fois l'appli installée ou fermé avec ×.
- Après une grosse modification, changer `CACHE = "mariage-v1"` en `v2` dans `sw.js` pour forcer la mise à jour.
