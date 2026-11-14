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
  await expect(page.locator(".tache")).toHaveCount(3);
  await expect(page.getByText("Tester le son")).toHaveCount(0);        // tâche du DJ
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

test("Hors ligne, l'appli s'ouvre encore", async ({ page, context }) => {
  await page.goto("/?code=temoin");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();   // le service worker contrôle maintenant la page
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator(".moment").first()).toBeVisible();
});
