# Appli du mariage

Appli web pour le jour J, en HTML, CSS et JavaScript sans framework, avec Supabase et GitHub Pages.

**Partie 1 : l'organisation (faite).** Chaque personne (mariés, témoins, garçons d'honneur, prestataires) reçoit **son lien perso** (`…/?code=XXXX`). En l'ouvrant, elle voit le programme qui la concerne et ses tâches à cocher. Pas de compte ni de mot de passe.

**Partie 2 : le live des invités (faite).** Un QR code commun (onglet **Équipe** des admins, à imprimer sur les tables) mène au live : l'invité tape son prénom, puis prend des photos et des vidéos avec la caméra façon Snap (filtres, texte), ou les choisit dans sa galerie. Tout le monde voit le fil et les stories en plein écran. Ceux qui ont un lien perso ont un onglet **Live**. Les admins peuvent masquer un post (🚫 dans la story).

Récupération des souvenirs et montages : à venir.

## Ce qu'il y a dans l'appli

- **Organisation** (lien perso) : Programme (vendredi et samedi, par jour), Live, Tâches par section (« Vendredi · Salle principale », « Photos de groupe », « Samedi · Ton rôle »…), Fiches (fiche DJ, bar, menu, influenceuse), Équipe pour les admins.
- **Invités** (QR code) : Live, Programme (seulement les moments publics), Ma table (« Trouve ta table » : on tape son prénom ou son nom, sans se soucier des accents), Menu (les fiches publiques).
- **Groupes** : une personne peut être dans des groupes (`groupes`, ex. `{Team,Filles}`). Un moment, une tâche ou une fiche avec `pour = {Filles}` est vu par tout le groupe.

## Les vraies données (privées)

Les noms des invités et le plan de table ne sont **jamais** sur GitHub (dépôt public). Ils sont dans un fichier `donnees-mariage.sql` gardé à part, à coller dans Supabase → SQL Editor après `schema.sql`. Le `.gitignore` bloque ce fichier par sécurité.

## Les fichiers

| Fichier | Rôle |
| --- | --- |
| `index.html` | La page, presque vide : tout est dessiné par `app.js` |
| `style.css` | Le style. **Les couleurs du mariage sont en haut**, dans `:root` |
| `app.js` | La logique : programme, tâches, équipe |
| `live.js` | Le live : caméra, envoi, fil, stories |
| `infos.js` | Programme (frise par jour), fiches, « Trouve ta table », onglets des invités |
| `vendor/qrcode.js` | Générateur de QR code (copié ici plutôt que chargé depuis un autre site) |
| `config.js` | Prénoms des mariés, date, connexion Supabase |
| `demo.js` | Données d'exemple, utilisées tant que Supabase n'est pas branché |
| `supabase/schema.sql` | Les tables et les deux fonctions sécurisées |
| `supabase/exemple.sql` | Des données d'exemple pour tester |

## Qui voit quoi

- **Programme** : un moment avec `pour` vide est pour tout le monde. Sinon `pour` liste des rôles ou des prénoms (ex. `{Témoin,Traiteur}`).
- **Tâches** : soit pour une personne précise (`personne_id`), soit pour tout un rôle (`role`). Une tâche de rôle est partagée : si un témoin la coche, elle est cochée pour tous les témoins, avec « fait par … ».
- **Admin** (`admin = true`, pour les mariés et l'organisation) : voit et coche tout, et a l'onglet **Équipe** avec le lien de chacun (bouton « Copier » et « WhatsApp »).

## Le live et le Supabase gratuit

Avec ~125 invités, le plus gros risque est la limite de **5 Go téléchargés par mois** du plan gratuit. L'appli est réglée pour économiser :
- le fil n'affiche que des **miniatures** (~20 Ko) ; la photo ou la vidéo entière ne se charge qu'à l'ouverture ;
- photos compressées (~250 Ko max), vidéos de la caméra limitées à **10 s** en qualité réduite (~1,5 Mo) ; galerie : 15 s et 20 Mo max ;
- toutes les 15 s, l'appli ne demande que les **nouveaux** posts.

Réglages en haut de `live.js`. Si besoin, passer Supabase en Pro pour le mois du mariage (rien à changer dans le code).

## Sécurité

Les tables sont fermées (RLS activé, aucune règle) : la clé publique ne permet pas de les lire. Le live a son propre code (le QR code des invités), rangé dans la table `reglages` : il ne donne accès qu'au live, jamais à l'organisation. Les fichiers vont dans le stockage `live` (20 Mo max, photos et vidéos seulement) : on ne peut y envoyer qu'avec le bon code invités, et on ne peut ni lister, ni remplacer, ni supprimer. Anti-spam : 15 posts max en 5 minutes par prénom. L'appli passe uniquement par deux fonctions, `mon_espace(code)` et `cocher(code, tache, fait)`, qui vérifient le code et ne renvoient que ce qui concerne la personne. Les codes font 12 caractères aléatoires : impossible de deviner celui d'un autre.

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
