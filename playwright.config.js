// Tests automatiques : un petit serveur sert le site, puis Chromium utilise l'appli
// comme sur un téléphone, en mode démo. Lancer : npm test
const { defineConfig, devices } = require("@playwright/test");

const PORT = 8124;
module.exports = defineConfig({
  testDir: "tests",
  timeout: 30000,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    ...devices["Pixel 7"],
    // Le service worker contourne les faux fichiers des tests : bloqué, sauf pour le test hors-ligne
    serviceWorkers: "block",
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  },
  projects: [{ name: "telephone", use: { browserName: "chromium",
    // Fausse caméra et faux micro, pour tester la caméra de l'appli
    launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] },
    permissions: ["camera", "microphone"] } }],
  webServer: { command: `node tests/serveur.js ${PORT}`, port: PORT, reuseExistingServer: !process.env.CI }
});
