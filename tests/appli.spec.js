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
  await page.click("[data-onglet-invite=menu]");
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
  await page.click("[data-onglet-invite=menu]");
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
