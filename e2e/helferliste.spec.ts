import { test, expect, Page } from '@playwright/test';
import { BASAR_A, BASAR_B, HELFER, AUFBAU, VORSORTIEREN } from './fixtures';

/**
 * Der Ablauf, den kein Unit-Test abdecken kann: ein Helfer meldet sich an, traegt sich in
 * mehrere Schichten ein, und der Admin sieht dieselben Zahlen – getrennt nach Basar.
 *
 * Anlass: /admin/tasks zeigte monatelang "0 / 8 Helfer", waehrend der Mitarbeiterbereich
 * fuer dieselbe Schicht "2 / 8" zeigte. Die Seite las ein Feld, das die API nicht mehr
 * lieferte. Beide Seiten waren fuer sich genommen "getestet"; kaputt war die Naht dazwischen,
 * und die sieht man nur, wenn beide Seiten dieselben echten Daten anzeigen muessen.
 */

async function login(page: Page, user: string, password: string) {
  await page.goto('/login');
  await page.locator('input[type="text"]').first().fill(user);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: 'Anmelden' }).click();
}

// Es gibt keine Logout-Route – der "Logout"-Link fuehrt nur auf die Startseite und laesst
// das Cookie stehen. Fuer einen echten Benutzerwechsel muss das Cookie weg.
async function logout(page: Page) {
  await page.context().clearCookies();
}

/** Die Karte/Zeile einer Schicht – ueber data-task-title, nicht ueber Layout-Klassen. */
function card(page: Page, title: string) {
  return page.locator(`[data-task-title="${title}"]`);
}

// Die option-Werte sind die Basar-IDs, die der Seed vergibt.
async function chooseBasar(page: Page, basarId: string) {
  await page.locator('select').first().selectOption(basarId);
}

test('Helferschichten und ihre Zahlen sind pro Basar getrennt', async ({ page }) => {
  // ── Helfer traegt sich in Basar A in zwei Schichten ein ────────────────────
  await login(page, HELFER.email, HELFER.password);
  await page.waitForURL('**/employee');
  await chooseBasar(page, BASAR_A.id);

  await expect(card(page, AUFBAU.title)).toContainText(`0 / ${AUFBAU.capacity}`);

  await card(page, AUFBAU.title).getByRole('button').click();
  await expect(card(page, AUFBAU.title).getByRole('button')).toHaveText('Austragen');
  await card(page, VORSORTIEREN.title).getByRole('button').click();
  await expect(card(page, VORSORTIEREN.title).getByRole('button')).toHaveText('Austragen');

  await expect(card(page, AUFBAU.title)).toContainText(`1 / ${AUFBAU.capacity}`);
  await expect(card(page, VORSORTIEREN.title)).toContainText(`1 / ${VORSORTIEREN.capacity}`);

  // ── Derselbe Helfer, dieselben Schichten, anderer Basar ────────────────────
  // Traegt der Unique-Key basarId nicht, scheitert die Eintragung hier mit
  // "Bereits fuer diese Aufgabe angemeldet".
  await chooseBasar(page, BASAR_B.id);
  await expect(card(page, AUFBAU.title)).toContainText(`0 / ${AUFBAU.capacity}`);
  await expect(card(page, AUFBAU.title).getByRole('button')).toHaveText('Jetzt eintragen');

  await card(page, AUFBAU.title).getByRole('button').click();
  await expect(card(page, AUFBAU.title).getByRole('button')).toHaveText('Austragen');
  await expect(card(page, AUFBAU.title)).toContainText(`1 / ${AUFBAU.capacity}`);
  // Vorsortieren blieb in A – Basar B kennt dort niemanden.
  await expect(card(page, VORSORTIEREN.title)).toContainText(`0 / ${VORSORTIEREN.capacity}`);

  // Basar A ist davon unberuehrt geblieben.
  await chooseBasar(page, BASAR_A.id);
  await expect(card(page, VORSORTIEREN.title)).toContainText(`1 / ${VORSORTIEREN.capacity}`);

  // ── Der Admin sieht dieselben Zahlen ───────────────────────────────────────
  await logout(page);
  await login(page, process.env.ADMIN_USER || 'admin', process.env.ADMIN_PASS!);
  await page.waitForURL('**/admin');

  await page.goto('/admin/tasks');
  await chooseBasar(page, BASAR_A.id);
  const aufbauRow = card(page, AUFBAU.title);
  await expect(aufbauRow).toContainText(`1 / ${AUFBAU.capacity} Helfer`);
  await expect(card(page, VORSORTIEREN.title)).toContainText(`1 / ${VORSORTIEREN.capacity} Helfer`);

  // Der gemeldete Fehler zeigte sich auch im Auslastungsbalken: Breite blieb 0 %.
  await expect(aufbauRow.locator('.rounded-full > div')).not.toHaveAttribute('style', /width: 0%/);

  await chooseBasar(page, BASAR_B.id);
  await expect(card(page, AUFBAU.title)).toContainText(`1 / ${AUFBAU.capacity} Helfer`);
  await expect(card(page, VORSORTIEREN.title)).toContainText(`0 / ${VORSORTIEREN.capacity} Helfer`);

  // ── Helferliste auf /admin nennt den Namen, wieder pro Basar ───────────────
  await page.goto('/admin');
  await chooseBasar(page, BASAR_A.id);
  await expect(card(page, AUFBAU.title)).toContainText(`${HELFER.firstName} ${HELFER.lastName}`);
  await expect(card(page, VORSORTIEREN.title)).toContainText(`${HELFER.firstName} ${HELFER.lastName}`);

  await chooseBasar(page, BASAR_B.id);
  await expect(card(page, AUFBAU.title)).toContainText(`${HELFER.firstName} ${HELFER.lastName}`);
  await expect(card(page, VORSORTIEREN.title)).not.toContainText(`${HELFER.firstName} ${HELFER.lastName}`);
});

test('"Alle Anmeldungen löschen" trifft nur den gewählten Basar', async ({ page }) => {
  // Baut auf dem Zustand des ersten Tests auf: A hat zwei Anmeldungen, B eine.
  // workers: 1 und fullyParallel: false halten die Reihenfolge – ohne das waere dieser
  // Test von Zufall abhaengig.
  await login(page, process.env.ADMIN_USER || 'admin', process.env.ADMIN_PASS!);
  await page.goto('/admin/tasks');

  await chooseBasar(page, BASAR_B.id);
  // Der Handler quittiert den Erfolg mit alert() – ohne Handler blockiert der Klick.
  page.on('dialog', d => d.accept());
  await page.getByRole('button', { name: 'Alle Anmeldungen löschen' }).click();
  await page.getByRole('button', { name: 'Ja, alle löschen' }).click();

  await expect(card(page, AUFBAU.title)).toContainText(`0 / ${AUFBAU.capacity} Helfer`);

  await chooseBasar(page, BASAR_A.id);
  await expect(card(page, AUFBAU.title)).toContainText(`1 / ${AUFBAU.capacity} Helfer`);
  await expect(card(page, VORSORTIEREN.title)).toContainText(`1 / ${VORSORTIEREN.capacity} Helfer`);
});
