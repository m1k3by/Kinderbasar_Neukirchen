import { defineConfig } from '@playwright/test';
import { config as loadEnv } from 'dotenv';

// .env.test statt .env: der E2E-Lauf leert Tabellen und darf die Produktivdatenbank niemals
// sehen. Die Datei ist nicht eingecheckt, .env.test.example zeigt, was hineingehoert.
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
