// L'appli en vrai, dans un navigateur de téléphone, en mode démo (sans toucher à la vraie base).
const { test, expect } = require("@playwright/test");

const DEMO_CFG = `window.MARIAGE = { maries: "A & B", date: "2030-06-01", supabaseUrl: "", supabaseKey: "" };`;

test.beforeEach(async ({ page }) => {
  await page.route("**/config.js", r => r.fulfill({ contentType: "text/javascript", body: DEMO_CFG }));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  page.erreurs = [];
  page.on("pageerror", e => page.erreurs.push(e.message));
});
test.afterEach(async ({ page }) => { expect(page.erreurs, "erreurs JavaScript").toEqual([]); });

test("Sans lien : on demande d'ouvrir son lien perso", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Ouvre le lien perso")).toBeVisible();
});

test("Un lien inconnu est refusé", async ({ page }) => {
  await page.goto("/?code=nimportequoi");
  await expect(page.locator(".err")).toContainText("pas reconnu");
  await expect(page.locator(".moment")).toHaveCount(0);
});

test("Un témoin ne voit que ce qui le concerne", async ({ page }) => {
  await page.goto("/?code=temoin");
  await expect(page.getByText("Salut")).toContainText("Témoin 1");
  await expect(page.locator("[data-onglet=equipe]")).toHaveCount(0);   // pas d'onglet Équipe
  await page.click("[data-onglet=taches]");
  await expect(page.locator(".tache")).toHaveCount(4);
  await expect(page.getByText("Tester le son")).toHaveCount(0);        // tâche du DJ
  await expect(page.locator(".sous", { hasText: "Vendredi · Salle principale" })).toBeVisible();  // tâche du groupe Team
});

test("Le DJ ne voit pas l'installation réservée aux témoins", async ({ page }) => {
  await page.goto("/?code=dj");
  await expect(page.locator(".moment")).toHaveCount(5);
  await expect(page.getByText("Installation de la salle")).toHaveCount(0);
});

test("Cocher une tâche, puis la retrouver cochée après rechargement", async ({ page }) => {
  await page.goto("/?code=temoin");
  await page.click("[data-onglet=taches]");
  await page.locator(".tache label").first().click();
  await expect(page.locator(".tache.faite")).toHaveCount(1);
  await page.reload();
  await page.click("[data-onglet=taches]");
  await expect(page.locator(".tache.faite")).toHaveCount(1);
});

test("La mariée (admin) voit tout et les liens de l'équipe", async ({ page }) => {
  await page.goto("/?code=mariee");
  await expect(page.locator(".moment")).toHaveCount(6);
  await page.click("[data-onglet=equipe]");
  await expect(page.locator(".perso")).toHaveCount(6);
});

test("Le code reste dans l'adresse (pour l'icône de l'écran d'accueil)", async ({ page }) => {
  await page.goto("/?code=temoin");
  await page.goto("/");
  await expect(page).toHaveURL(/\?code=temoin$/);
});

test("Un texte piégé dans la base s'affiche comme du texte, sans s'exécuter", async ({ page }) => {
  await page.route("**/demo.js", async r => {
    const piege = `<img src=x onerror="window.pirate=1">`;
    const body = (await (await r.fetch()).text()).replace(`"Installation de la salle"`, JSON.stringify(piege));
    r.fulfill({ contentType: "text/javascript", body });
  });
  await page.goto("/?code=mariee");
  await expect(page.getByText(`<img src=x onerror="window.pirate=1">`)).toBeVisible();
  expect(await page.evaluate(() => window.pirate)).toBeUndefined();
  await expect(page.locator(".corps img")).toHaveCount(0);
});

test.describe(() => {
test.use({ serviceWorkers: "allow" });
test("Hors ligne, l'appli s'ouvre encore", async ({ page, context }) => {
  await page.goto("/?code=temoin");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();   // le service worker contrôle maintenant la page
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator(".moment").first()).toBeVisible();
});
});

// ---------- Le live ----------
test("Un invité (QR code) donne son prénom et ne voit que le live", async ({ page }) => {
  await page.goto("/?invite=invites");
  await expect(page.getByText("Bienvenue au live")).toBeVisible();
  await page.fill("#champPrenom", "Léa");
  await page.click("#formPrenom button");
  await expect(page.getByText("Salut")).toContainText("Léa");
  await expect(page.locator("[data-onglet]")).toHaveCount(0);       // pas de programme ni de tâches
  await expect(page.getByText("Lance-toi")).toBeVisible();
});

test("Un mauvais QR code est refusé", async ({ page }) => {
  await page.goto("/?invite=faux");
  await expect(page.getByText("n'est plus valable")).toBeVisible();
});

test("Prendre une photo avec la caméra, la poster, puis l'ouvrir en story", async ({ page }) => {
  await page.goto("/?invite=invites");
  await page.fill("#champPrenom", "Léa"); await page.click("#formPrenom button");
  await page.click("[data-poster]");
  await expect(page.locator("#cam")).toBeVisible();
  await page.waitForFunction(() => document.getElementById("camV").videoWidth > 0);
  await page.locator("#camShut").focus(); await page.keyboard.press("Enter");     // une photo
  await expect(page.locator("#camEdit")).toBeVisible();
  await page.click("#camSend");
  await expect(page.locator(".vignette")).toHaveCount(1);
  await expect(page.locator(".vignette .qui")).toHaveText("Léa");
  await page.click(".vignette");
  await expect(page.locator("#story")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#story")).toBeHidden();
});

test("Filmer une vidéo (appui long) et la poster", async ({ page }) => {
  await page.goto("/?invite=invites");
  await page.fill("#champPrenom", "Léa"); await page.click("#formPrenom button");
  await page.click("[data-poster]");
  await page.waitForFunction(() => document.getElementById("camV").videoWidth > 0);
  const b = await page.locator("#camShut").boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down(); await page.waitForTimeout(1600); await page.mouse.up();
  await expect(page.locator("#camPV")).toBeVisible();
  await page.click("#camSend");
  await expect(page.locator(".vignette .lecture")).toHaveCount(1);
});

test("Poster une photo depuis la galerie", async ({ page }) => {
  await page.goto("/?invite=invites");
  await page.fill("#champPrenom", "Léa"); await page.click("#formPrenom button");
  await page.evaluate(() => choisirGalerie = () => {});            // pas de vraie fenêtre de fichiers en test
  await page.evaluate(() => { const f = document.createElement("input"); f.type = "file"; f.id = "galerieTest"; f.onchange = () => depuisGalerie(f.files[0]); document.body.appendChild(f); });
  await page.setInputFiles("#galerieTest", require("path").join(__dirname, "..", "icon-512.png"));
  await expect(page.locator(".vignette")).toHaveCount(1);
});

test("L'organisation a un onglet Live, et les admins le QR code des invités", async ({ page }) => {
  await page.goto("/?code=temoin");
  await page.click("[data-onglet=live]");
  await expect(page.locator("[data-poster]")).toBeVisible();
  await page.goto("/?code=mariee");
  await page.click("[data-onglet=equipe]");
  await expect(page.locator(".qr img")).toBeVisible();
  await expect(page.locator(".qr [data-copier]")).toHaveAttribute("data-copier", /\?invite=invites$/);
});

// ---------- Version 2 : programme des invités, Trouve ta table, fiches ----------
test("Un invité trouve sa table dès l'accueil, dans une pop-up, sans se soucier des accents", async ({ page }) => {
  await page.goto("/?invite=invites");
  await page.fill("#champPrenom", "Léa"); await page.click("#formPrenom button");
  await expect(page.locator("#champTable")).toBeVisible();                  // en haut de l'accueil, sans changer d'onglet
  await page.fill("#champTable", "chloe"); await page.press("#champTable", "Enter");
  await expect(page.locator("#popupTable .num-table")).toHaveText(/Table\s*1/);
  await expect(page.locator("#popupTable")).toContainText("Léa Martin");
  await page.click("#popupTable [data-fermer-popup]");
  await expect(page.locator("#popupTable")).toBeHidden();
  await page.fill("#champTable", "petit"); await page.click("#formTable button");
  await expect(page.locator("#popupTable .table-trouvee")).toHaveCount(2);
  await page.keyboard.press("Escape");
  await page.fill("#champTable", "zzz"); await page.press("#champTable", "Enter");
  await expect(page.locator("#popupTable")).toContainText("Personne à ce nom");
});

test("Le programme des invités ne montre que les moments publics", async ({ page }) => {
  await page.goto("/?invite=invites");
  await page.fill("#champPrenom", "Léa"); await page.click("#formPrenom button");
  await page.click("[data-onglet-invite=programme]");
  await expect(page.locator(".moment")).toHaveCount(5);
  await expect(page.getByText("Installation de la salle")).toHaveCount(0);
  await page.click("[data-onglet-invite=infos]");
  await expect(page.locator(".fiche summary")).toHaveText(/Le bar/);
  await expect(page.getByText("Fiche DJ")).toHaveCount(0);
});

test("Le DJ a sa fiche ; un témoin voit le bar mais pas la fiche DJ", async ({ page }) => {
  await page.goto("/?code=dj");
  await page.click("[data-onglet=fiches]");
  await expect(page.locator(".fiche summary", { hasText: "Fiche DJ" })).toBeVisible();
  await expect(page.locator(".fiche-corps b").first()).toHaveText("21h00");
  await page.goto("/?code=temoin");
  await page.click("[data-onglet=fiches]");
  await expect(page.locator(".fiche summary", { hasText: "Le bar" })).toBeVisible();
  await expect(page.getByText("Fiche DJ")).toHaveCount(0);
});

test("Un texte piégé dans une fiche reste du texte", async ({ page }) => {
  await page.route("**/demo.js", async r => {
    const body = (await (await r.fetch()).text()).replace("Sans alcool", `<img src=x onerror=window.pirate=1> **<b>gras</b>**`);
    r.fulfill({ contentType: "text/javascript", body });
  });
  await page.goto("/?invite=invites");
  await page.fill("#champPrenom", "Léa"); await page.click("#formPrenom button");
  await page.click("[data-onglet-invite=infos]");
  await expect(page.locator(".fiche-corps")).toContainText("<img src=x");
  expect(await page.evaluate(() => window.pirate)).toBeUndefined();
  await expect(page.locator(".fiche-corps img")).toHaveCount(0);
});

// ---------- Version 3 : dessin des tables, ma place, photos ----------
test("La pop-up montre la table, qui est en face et à côté", async ({ page }) => {
  await page.goto("/?invite=invites");
  await page.fill("#champPrenom", "Léa"); await page.click("#formPrenom button");
  await page.fill("#champTable", "hugo"); await page.press("#champTable", "Enter");
  await expect(page.locator("#popupTable .t-siege")).toHaveCount(4);
  await expect(page.locator("#popupTable .t-siege.moi")).toHaveCount(1);
  // Table rectangle de 4 : Paul (1), Hugo (2) en haut ; Témoin Un (3), Marc (4) en bas → Hugo est en face de Marc, à côté de Paul
  await expect(page.locator("#popupTable .t-phrase")).toContainText("En face de toi : Marc Leroy");
  await expect(page.locator("#popupTable .t-phrase")).toContainText("À côté de toi : Paul Petit");
});

test("L'équipe a aussi « Trouve ta table » en haut de l'accueil", async ({ page }) => {
  await page.goto("/?code=temoin");
  await page.fill("#champTable", "paul"); await page.press("#champTable", "Enter");
  await expect(page.locator("#popupTable .num-table")).toHaveText(/Table\s*2/);
});

test("Un témoin voit sa place en haut de son programme", async ({ page }) => {
  await page.goto("/?code=temoin");
  await expect(page.locator(".ma-table summary")).toContainText("Table 2");
  await expect(page.locator(".ma-table .t-liste li.moi")).toContainText("Témoin Un");
  await expect(page.locator(".ma-table .t-phrase")).toContainText("En face de toi : Paul Petit");
});

test("Ajouter sa photo, et l'admin peut changer celle des autres", async ({ page }) => {
  await page.goto("/?code=temoin");
  const photo = require("path").join(__dirname, "..", "icon-512.png");
  const [choix] = await Promise.all([page.waitForEvent("filechooser"), page.click(".bonjour [data-photo]")]);
  await choix.setFiles(photo);
  await expect(page.locator(".bonjour .avatar img")).toBeVisible();
  await page.goto("/?code=mariee");
  await page.click("[data-onglet=equipe]");
  const [choix2] = await Promise.all([page.waitForEvent("filechooser"), page.click('[data-photo="DJ"]')]);
  await choix2.setFiles(photo);
  await expect(page.locator('[data-photo="DJ"] img')).toBeVisible();
});

// ---------- Lien de démo pour montrer l'appli sans donner de vrai code ----------
test.describe(() => {
  test("…/?demo=1 montre les données d'exemple même avec Supabase branché, sans toucher au vrai lien gardé", async ({ page }) => {
    await page.route("**/config.js", r => r.fulfill({ contentType: "text/javascript",
      body: `window.MARIAGE = { maries: "A & B", date: "2030-06-01", supabaseUrl: "https://test.supabase.co", supabaseKey: "x" };` }));
    let appels = 0;
    await page.route("https://test.supabase.co/**", r => { appels++; r.abort(); });
    await page.goto("/");
    await page.evaluate(() => localStorage.setItem("mariage-code", "VRAICODE"));
    await page.goto("/?demo=1&code=mariee");
    await expect(page.getByText("Mode démo")).toBeVisible();
    await expect(page.locator(".bonjour")).toContainText("La mariée");
    await page.reload();
    await expect(page).toHaveURL(/demo=1/);
    await expect(page.locator(".bonjour")).toContainText("La mariée");
    expect(await page.evaluate(() => localStorage.getItem("mariage-code"))).toBe("VRAICODE");
    expect(appels).toBe(0);
  });
});

// ---------- Le Wizz ----------
test("Envoyer un wizz à un groupe, puis recevoir un wizz qui fait trembler l'écran et y répondre", async ({ page }) => {
  await page.goto("/?code=mariee");
  await page.click("[data-wizz-ouvrir]");
  await page.click('[data-wizz-pour="Team"]');
  await page.click('[data-wizz-msg="Besoin de toi ici 🙏"]');
  await expect(page.locator(".toast").first()).toContainText("Wizz envoyé à 3 personnes");
  expect(await page.evaluate(() => window.DEMO.wizz.map(w => w.pour).sort())).toEqual(["Elange", "Témoin 1", "Témoin 2"]);
  // Un wizz arrive pour la mariée
  await page.evaluate(() => window.DEMO.wizz.push({ pour: "La mariée", de: "Témoin 1", message: "Tu es où ?" }));
  await page.evaluate(() => verifierWizz());
  await expect(page.locator("#wizz")).toBeVisible();
  await expect(page.locator("#wizz .wz-texte")).toHaveText("Tu es où ?");
  await expect(page.locator("#wizz.tremble")).toHaveCount(1);
  await page.click('#wizz [data-wizz-rep="J\'arrive 🏃"]');
  await expect(page.locator("#wizz")).toBeHidden();
  await page.evaluate(() => verifierWizz());
  await expect(page.locator("#wizz")).toBeHidden();       // déjà répondu : il ne revient pas
});

test("Un wizz sans destinataire ne part pas", async ({ page }) => {
  await page.goto("/?code=temoin");
  await page.click("[data-wizz-ouvrir]");
  await page.click('[data-wizz-msg="Tu es où ?"]');
  await expect(page.locator(".toast").first()).toContainText("Choisis d'abord");
});

test.describe(() => {
test.use({ serviceWorkers: "allow", permissions: ["camera", "microphone", "notifications"] });
test("Le bandeau « Activer les notifications » s'affiche pour l'équipe (pas en démo)", async ({ page }) => {
  await page.route("**/config.js", r => r.fulfill({ contentType: "text/javascript",
    body: `window.MARIAGE = { maries: "A & B", date: "2030-06-01", supabaseUrl: "https://test.supabase.co", supabaseKey: "x", vapidPub: "BOEhk" };` }));
  await page.route("https://test.supabase.co/**", r => {
    const u = r.request().url();
    const rep = u.includes("mon_espace") ? { moi: { prenom: "Eva", role: "Témoin", admin: false }, moments: [], taches: [], fiches: [], annuaire: [], invite: null }
      : u.includes("mes_wizz") ? { recus: [], reponses: [] } : null;
    r.fulfill({ contentType: "application/json", body: JSON.stringify(rep) });
  });
  // Chromium sans écran répond toujours « denied » : on simule un téléphone qui n'a pas encore répondu
  await page.addInitScript(() => Object.defineProperty(Notification, "permission", { get: () => "default" }));
  await page.goto("/?code=abc");
  await expect(page.locator(".notif-barre")).toContainText("Reçois les wizz");
  await expect(page.locator("[data-notif-on]")).toBeVisible();
  await page.goto("/?demo=1&code=temoin");
  await expect(page.locator(".bonjour")).toBeVisible();
  await expect(page.locator(".notif-barre")).toHaveCount(0);
});
});

test("Wizz avec un endroit : il s'affiche en gros chez la personne", async ({ page }) => {
  await page.goto("/?code=mariee");
  await page.click("[data-wizz-ouvrir]");
  await page.click('[data-wizz-pour="DJ"]');
  await page.click('[data-wizz-lieu="Salle du vin d\'honneur"]');
  await page.click('[data-wizz-msg="Besoin de toi ici 🙏"]');
  expect(await page.evaluate(() => window.DEMO.wizz[0].message)).toBe("Besoin de toi ici 🙏\n📍 Salle du vin d'honneur");
  await page.evaluate(() => { window.DEMO.wizz.push({ pour: "La mariée", de: "Témoin 1", message: "Viens vite !\n📍 Vestiaire" }); verifierWizz(); });
  await expect(page.locator("#wizz .wz-texte")).toHaveText("Viens vite !");
  await expect(page.locator("#wizz .wz-ou")).toHaveText("📍 Vestiaire");
});

test("Équipe : afficher le QR code du lien perso de quelqu'un", async ({ page }) => {
  await page.goto("/?code=mariee");
  await page.click("[data-onglet=equipe]");
  await page.click('[data-qr-nom="DJ"]');
  await expect(page.locator(".qr-perso h2")).toHaveText("DJ");
  await expect(page.locator(".qr-perso img")).toBeVisible();
});

// ---------- Annonces, Moment, livre d'or ----------
test("La mariée envoie une annonce et lance un Moment ; l'invité les voit", async ({ page }) => {
  page.on("dialog", d => d.accept());
  await page.goto("/?code=mariee");
  await page.click("[data-annonce-ouvrir]");
  await page.click('[data-annonce="📸 Photo de groupe dehors dans 5 min !"]');
  await expect(page.locator(".annonce-barre")).toContainText("Photo de groupe dehors");
  await page.click("[data-annonce-ouvrir]");
  await page.click('[data-moment="Entrée des mariés"]');
  await expect(page.locator(".moment-barre")).toContainText("MOMENT : Entrée des mariés");
  await expect(page.locator("#momentReste")).toHaveText(/^[12]:\d\d$/);
  // Côté invité (même téléphone, même démo)
  const annonces = await page.evaluate(() => window.DEMO.annonces);
  await page.goto("/?demo=1&invite=invites");
  await page.evaluate(A => { window.DEMO.annonces = A; STOCKAGE.setItem("mariage-prenom", "Léa"); }, annonces);
  await page.evaluate(() => chargerInfos());
  await expect(page.locator(".moment-barre")).toContainText("Entrée des mariés");
  await expect(page.locator(".annonce-barre")).toContainText("Photo de groupe");
  await page.click("[data-annonce-fermer]");
  await expect(page.locator(".annonce-barre")).toHaveCount(0);
});

test("Un témoin n'a pas le bouton d'annonce", async ({ page }) => {
  await page.goto("/?code=temoin");
  await expect(page.locator("[data-wizz-ouvrir]")).toBeVisible();
  await expect(page.locator("[data-annonce-ouvrir]")).toHaveCount(0);
});

test("Livre d'or : un invité écrit, la mariée lit", async ({ page }) => {
  await page.goto("/?invite=invites");
  await page.fill("#champPrenom", "Léa"); await page.click("#formPrenom button");
  await page.click("[data-onglet-invite=infos]");
  await page.fill("#champLivre", "Tous nos vœux ❤️");
  await page.click("#formLivre button");
  await expect(page.locator(".toast").first()).toContainText("Merci");
  const livre = await page.evaluate(() => window.DEMO.livre);
  await page.goto("/?code=mariee");
  await page.evaluate(L => { window.DEMO.livre = L; }, livre);
  await page.click("[data-onglet=fiches]");
  await page.click("#livreAdmin summary");
  await expect(page.locator("#livreAdmin .mot")).toContainText("Tous nos vœux ❤️");
  await expect(page.locator("#livreAdmin .mot cite")).toHaveText("Léa");
});
