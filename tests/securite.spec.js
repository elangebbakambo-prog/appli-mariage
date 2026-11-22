// Vérifications de sécurité, sans navigateur : on lit les fichiers du site.
const { test, expect } = require("@playwright/test");
const fs = require("fs"), path = require("path"), { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const fichiers = ext => {
  const out = [];
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).forEach(f => {
    if ([".git", "node_modules", "tests", "test-results", "playwright-report"].includes(f.name)) return;
    const p = path.join(d, f.name);
    if (f.isDirectory()) walk(p); else if (p.endsWith(ext)) out.push(p);
  });
  walk(ROOT); return out;
};
const rel = p => path.relative(ROOT, p);
const htmls = fichiers(".html"), jss = fichiers(".js"), sqls = fichiers(".sql");
const lire = f => fs.readFileSync(f, "utf8");

test("Aucun fichier JavaScript n'a d'erreur de syntaxe", () => {
  for (const f of jss) execFileSync(process.execPath, ["--check", f]);
});

test("Pas de clé secrète Supabase ni de mot de passe dans le code", () => {
  for (const f of [...jss, ...htmls, ...sqls]) {
    const t = lire(f);
    expect(t, `${rel(f)} contient une clé secrète`).not.toMatch(/sb_secret_[A-Za-z0-9_-]+/);
    expect(t, `${rel(f)} contient une clé privée de notifications (VAPID)`).not.toMatch(/priv\w*["']?\s*[:=,]\s*["'][A-Za-z0-9_-]{40,}["']/i);
    expect(t, `${rel(f)} contient une adresse de connexion à la base avec mot de passe`).not.toMatch(/postgres(ql)?:\/\/[^\s:]+:[^\s@]+@/);
    for (const [, payload] of t.matchAll(/eyJ[A-Za-z0-9_-]{10,}\.(eyJ[A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+/g)) {
      let role = ""; try { role = JSON.parse(Buffer.from(payload, "base64url").toString()).role; } catch (e) {}
      expect(role, `${rel(f)} contient une clé service_role`).not.toBe("service_role");
    }
  }
  const cle = (lire(path.join(ROOT, "config.js")).match(/supabaseKey:\s*"([^"]*)"/) || [])[1] || "";
  expect(cle === "" || cle.startsWith("sb_publishable_"), "config.js doit contenir la clé publishable, jamais la secrète").toBe(true);
});

test("Aucun script chargé depuis un autre site", () => {
  for (const f of htmls) {
    const ext = [...lire(f).matchAll(/<script\b[^>]*\bsrc="(https?:[^"]+)"/g)].map(m => m[1]);
    expect(ext, `${rel(f)} charge un script externe : ajoute-lui une empreinte integrity`).toEqual([]);
    expect(lire(f), `${rel(f)} a du JavaScript écrit directement dans la page`).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/);
  }
});

test("La page a sa politique de sécurité (CSP)", () => {
  const t = lire(path.join(ROOT, "index.html"));
  const csp = (t.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/) || [])[1] || "";
  expect(csp, "index.html doit avoir une Content-Security-Policy").not.toBe("");
  expect(csp).toMatch(/script-src 'self'(;|$)/);
  expect(csp).not.toMatch(/script-src[^;]*'unsafe-(inline|eval)'/);
  expect(csp).toMatch(/object-src 'none'/);
  const url = (lire(path.join(ROOT, "config.js")).match(/supabaseUrl:\s*"([^"]*)"/) || [])[1] || "";
  if (url) expect(url, "l'adresse Supabase doit être autorisée dans connect-src").toMatch(/^https:\/\/[a-z0-9]+\.supabase\.co$/);
});

test("Tout ce qui vient de la base passe par esc() avant d'être affiché", () => {
  for (const fichier of ["app.js", "live.js", "infos.js", "wizz.js"]) {
  const t = lire(path.join(ROOT, fichier));
  // Les champs écrits par les gens (prénoms, titres, lieux…) ne doivent jamais être insérés tels quels
  const champs = ["prenom", "role", "titre", "lieu", "details", "fait_par", "pour", "auteur", "texte", "fichier", "miniature", "de", "message", "qui", "reponse"];
  for (const [, expr] of t.matchAll(/\$\{([^}]+)\}/g)) {
    const brut = champs.some(c => new RegExp(`\\.${c}\\b`).test(expr)) && !/\besc\(|encodeURIComponent\(|hhmm\(|maps\(|\.length|join\(""\)|\?/.test(expr);
    expect(brut, `${fichier} affiche \${${expr}} sans esc()`).toBe(false);
  }
  }
});

test("La base : tables fermées, accès seulement par les fonctions", () => {
  const t = lire(path.join(ROOT, "supabase", "schema.sql"));
  for (const table of ["personnes", "moments", "taches"]) {
    expect(t, `RLS doit être activé sur ${table}`).toMatch(new RegExp(`alter table ${table}\\s+enable row level security`));
  }
  // Une seule règle : l'envoi de fichiers dans le stockage « live », vérifiée par le code invités
  const regles = [...t.matchAll(/create policy[^;]*/gi)].map(m => m[0]);
  expect(regles.length, "une seule règle (policy) attendue").toBe(1);
  expect(regles[0]).toMatch(/on storage\.objects for insert/);
  expect(regles[0]).toMatch(/bucket_id = ''live'' and public\.code_invites_ok/);
  expect(t).toMatch(/revoke all on personnes, moments, taches from anon, authenticated/);
  expect(t).toMatch(/revoke all on reglages, posts from anon, authenticated/);
  for (const table of ["reglages", "posts"]) expect(t).toMatch(new RegExp(`alter table ${table}\\s+enable row level security`));
  for (const [, nom] of t.matchAll(/create or replace function (\w+)\([^)]*\)[^$]*security definer/g)) {
    expect(t, `${nom} doit fixer son search_path`).toMatch(new RegExp(`function ${nom}\\([^)]*\\)[^$]*set search_path`));
  }
});
