import { existsSync, readFileSync } from 'node:fs';
import { defineConfig } from '@playwright/test';
import { config as loadEnv } from 'dotenv';

// .env.test statt .env: der E2E-Lauf leert Tabellen und darf die Produktivdatenbank niemals
// sehen. Die Datei ist nicht eingecheckt, .env.test.example zeigt, was hineingehoert.
//
// Harter Abbruch bei fehlender Datei: dotenv meldet das nicht, und sowohl `next start` als
// auch Prisma laden dann von sich aus `.env` – der Lauf zeigte damit auf die
// Produktivdatenbank. Ein stiller Fallback ist hier der gefaehrlichste Fall, den es gibt.
if (!existsSync('.env.test')) {
  throw new Error(
    '.env.test fehlt. Ohne diese Datei wuerde der E2E-Lauf auf die Datenbank aus .env ' +
    'zeigen – also moeglicherweise auf die Produktivdatenbank. Vorlage: .env.test.example'
  );
}
// Die unveraendert kopierte Vorlage ist der haeufigste Fall: die Datei existiert, die
// Verbindungsstrings fehlen. Ohne diese Pruefung endet der Lauf erst Minuten spaeter in
// einem DNS-Fehler auf "TEST-HOST" – hier steht sofort da, was zu tun ist.
if (/TEST-HOST|USER:PASS/.test(readFileSync('.env.test', 'utf8'))) {
  throw new Error(
    '.env.test enthaelt noch die Platzhalter aus .env.test.example. Trage die ' +
    'Verbindungsstrings deiner *leeren* Testdatenbank in POSTGRES_PRISMA_URL und ' +
    'POSTGRES_URL_NON_POOLING ein.'
  );
}
loadEnv({ path: '.env.test', override: true });

const PORT = 3001;

export default defineConfig({
  testDir: 'e2e',
  // Eine gemeinsame Datenbank vertraegt keine parallelen Laeufe: zwei Tests, die sich in
  // dieselbe Schicht eintragen, wuerden sich gegenseitig die Helferzahlen verschieben.
  workers: 1,
  fullyParallel: false,
  // Ein gruener Lauf soll gruen sein, weil es funktioniert – nicht weil ein Retry es
  // irgendwann getroffen hat.
  retries: 0,
  timeout: 30_000,
  globalSetup: './e2e/seed.ts',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  webServer: {
    // next start, nicht next dev: geprueft werden soll, was deployt wird.
    command: `npx next build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    timeout: 300_000,
    reuseExistingServer: false,
  },
});
