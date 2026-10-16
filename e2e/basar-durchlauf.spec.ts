import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

/**
 * Ein ganzer Basar von vorn bis hinten, gegen echte Datenbank und gebauten Server (next start):
 * Registrierung samt Mail → Teilnahme → Artikel → Etiketten → Anlieferzettel → Testbasar →
 * Aktivieren → Kasse → Storno → Schließen → Abrechnung → Sicherung → Cron.
 *
 * Geprüft wird, was die gemockten Unit-Tests strukturell nicht sehen: SQL, Transaktionen,
 * Constraints, Middleware, Cookies, Mailversand – und Wettläufe, die nur mit echter
 * Datenbank überhaupt entstehen. Jeder Schritt prüft die Wirkung in der Datenbank, nicht nur
 * den Statuscode. Am Ende wird ErrorLog ausgewertet: jeder Serverfehler ist ein Befund.
 *
 * Mails gehen an Mailpit (SMTP_HOST=127.0.0.1, SMTP_PORT=1025, API auf 8025), nie an einen
 * echten Server – der Test bricht ab, wenn SMTP_HOST nicht lokal ist (siehe beforeAll).
 */

const BASE = 'http://localhost:3001';
const MAILPIT = 'http://127.0.0.1:8025';
const prisma = new PrismaClient();

// Alle Testpersonen tragen @example.test – daran erkennt e2e/seed.ts Reste als eigene.
const PW = 'E2E-Durchlauf-1234';
const S1 = { sellerId: 91001, email: 'e2e.s1@example.test', firstName: 'Sina', lastName: 'Eins' };
const S2 = { sellerId: 91002, email: 'e2e.s2@example.test', firstName: 'Stefan', lastName: 'Zwei' };
const OUT = { sellerId: 91003, email: 'e2e.aussen@example.test', firstName: 'Olga', lastName: 'Aussen' };
const KASSE = { sellerId: 91004, email: 'e2e.kasse@example.test', firstName: 'Karl', lastName: 'Kasse', isEmployee: true, isCashier: true };
const ORGA = { sellerId: 91005, email: 'e2e.orga@example.test', firstName: 'Ola', lastName: 'Orga', isEmployee: true, isOrga: true };
const REG_EMAIL = 'e2e.neu@example.test';

/** Gemeinsamer Zustand der seriell laufenden Schritte. */
const st: {
  basarId: string; testBasarId: string;
  regSellerId: number; regPassword: string;
  s1Articles: { id: string; qrCode: string; price: number }[];
  s2Articles: { id: string; qrCode: string }[];
  orgaArticles: number;
  saleIds: string[];
  startedAt: Date;
} = { basarId: '', testBasarId: '', regSellerId: 0, regPassword: '', s1Articles: [], s2Articles: [], orgaArticles: 0, saleIds: [], startedAt: new Date() };

/**
 * Befunde statt harter Abbrüche für Wettläufe: im seriellen Modus stoppt der erste rote Test alle
 * folgenden – ein Überbuchungs-Befund verdeckte sonst, ob Kasse und Abrechnung funktionieren.
 * Ausgewertet im letzten Test.
 */
const befunde: string[] = [];
function befund(ok: boolean, text: string) { console.log(`[${ok ? 'ok' : 'BEFUND'}] ${text}`); if (!ok) befunde.push(text); }

let admin: APIRequestContext, s1: APIRequestContext, s2: APIRequestContext, out: APIRequestContext;
let kasse: APIRequestContext, orga: APIRequestContext, reg: APIRequestContext, anon: APIRequestContext;

async function ctx() { return pwRequest.newContext({ baseURL: BASE }); }
async function login(c: APIRequestContext, email: string, password: string) {
  const r = await c.post('/api/login', { data: { email, password } });
  expect(r.status(), `Login ${email}: ${await r.text()}`).toBe(200);
}
/** Für Fehlermeldungen: Status plus Text, damit ein roter Lauf sagt, was zurückkam. */
async function show(r: { status(): number; text(): Promise<string> }) { return `${r.status()} ${(await r.text()).slice(0, 300)}`; }
const pdfPages = (b: Buffer) => (b.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  // Harte Sperre: ohne lokalen SMTP-Fänger gingen Registrierungsmails über den Server aus .env.
  if (!/^(127\.0\.0\.1|localhost)$/.test(process.env.SMTP_HOST ?? '')) {
    throw new Error('SMTP_HOST muss lokal sein (Mailpit, z. B. 127.0.0.1:1025). Sonst verschickt der Lauf echte Mails.');
  }
  st.startedAt = new Date();
  // Mailpit hält Nachrichten über Läufe hinweg; der Seed leert nur die Datenbank. Ohne das fand
  // die Suche die Teilnahmemail des vorigen Laufs statt der Registrierungsmail dieses Laufs.
  await fetch(`${MAILPIT}/api/v1/messages`, { method: 'DELETE' });
  const hash = await bcrypt.hash(PW, 10);
  for (const p of [S1, S2, OUT, KASSE, ORGA]) {
    await prisma.seller.create({ data: { ...p, password: hash } });
  }
  admin = await ctx(); s1 = await ctx(); s2 = await ctx(); out = await ctx();
  kasse = await ctx(); orga = await ctx(); reg = await ctx(); anon = await ctx();
  await login(admin, process.env.ADMIN_USER!, process.env.ADMIN_PASS!);
  for (const [c, p] of [[s1, S1], [s2, S2], [out, OUT], [kasse, KASSE], [orga, ORGA]] as const) await login(c, p.email, PW);
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

// ─── 1. Basar anlegen und öffnen ────────────────────────────────────────────
test('Admin legt einen Basar an und öffnet ihn', async () => {
  const r = await admin.post('/api/basars', {
    data: { title: 'E2E Durchlauf', dateFriday: '2026-11-13', dateSaturday: '2026-11-14', dateSunday: '2026-11-15',
      maxSellers: 2, maxArticlesPerSeller: 3, commissionPercent: 15, entryFee: 0 },
  });
  expect(r.status(), await show(r)).toBe(201);
  st.basarId = (await r.json()).id;
  const o = await admin.patch(`/api/basars/${st.basarId}/status`, { data: { status: 'OPEN' } });
  expect(o.status(), await show(o)).toBe(200);
  expect((await prisma.basar.findUnique({ where: { id: st.basarId } }))?.status).toBe('OPEN');
});

// ─── 2. Öffentlich und Rechte ───────────────────────────────────────────────
test('Ohne Anmeldung: Startseite zeigt den Basar, die Schnittstellen sind zu', async () => {
  const home = await anon.get('/');
  expect(home.status()).toBe(200);
  expect(await home.text()).toContain('E2E Durchlauf');
  for (const p of ['/api/basars', '/api/me', '/api/admin/backup', `/api/basars/${st.basarId}/scan-cache`]) {
    expect((await anon.get(p)).status(), p).toBe(401);
  }
});

test('Verkäufer kommen nicht an Admin- und Kassen-Schnittstellen', async () => {
  for (const p of ['/api/admin/backup', '/api/sellers', `/api/basars/${st.basarId}/anlieferzettel.pdf?set=activated`]) {
    expect((await s1.get(p)).status(), p).toBe(403);
  }
  expect((await s1.patch(`/api/basars/${st.basarId}/status`, { data: { status: 'ACTIVE' } })).status()).toBe(403);
  expect((await s1.get(`/api/basars/${st.basarId}/scan-cache`)).status()).toBe(403);
  expect((await s1.post(`/api/basars/${st.basarId}/sales`, { data: { qrCode: 'x' } })).status()).toBe(403);
});

// ─── 3. Registrierung mit echter Mail ───────────────────────────────────────
test('Registrierung: Nummer wird vergeben, die Mail mit Passwort kommt an, das Passwort funktioniert', async () => {
  const r = await reg.post('/api/register', { data: { email: REG_EMAIL, firstName: 'Rita', lastName: 'Neu' } });
  expect(r.status(), await show(r)).toBe(200);
  const { sellerId } = await r.json();
  expect(sellerId).toBeGreaterThanOrEqual(1000);
  expect(sellerId).toBeLessThanOrEqual(9999);
  st.regSellerId = sellerId;

  // Die Mail geht per after() nach der Antwort raus – kurz pollen statt fest warten.
  let html = '';
  for (let i = 0; i < 40 && !html; i++) {
    const query = `to:"${REG_EMAIL}" subject:"Ihre Registrierung"`;
    const list = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(query)}`)).json();
    if (list.messages?.length) {
      html = (await (await fetch(`${MAILPIT}/api/v1/message/${list.messages[0].ID}`)).json()).HTML ?? '';
    } else await new Promise(res => setTimeout(res, 250));
  }
  expect(html, 'Registrierungsmail kam nicht bei Mailpit an').not.toBe('');
  expect(html).toContain(String(sellerId));
  const pw = html.match(/Passwort:\s*<strong>([^<]+)<\/strong>/)?.[1];
  expect(pw, 'kein Passwort in der Mail').toBeTruthy();
  st.regPassword = pw!;
  await login(reg, REG_EMAIL, st.regPassword);

  const q = await prisma.mailQueue.findFirst({ where: { to: REG_EMAIL } });
  expect(q?.status).toBe('SENT');
});

test('Dieselbe Adresse ein zweites Mal: abgelehnt, keine zweite Nummer', async () => {
  const before = await prisma.seller.count();
  const r = await anon.post('/api/register', { data: { email: REG_EMAIL, firstName: 'Rita', lastName: 'Doppelt' } });
  expect(r.status()).toBeGreaterThanOrEqual(400);
  expect(await prisma.seller.count()).toBe(before);
});

// ─── 4. Teilnahme und Kapazität ─────────────────────────────────────────────
test('Teilnahme verlangt AGB-Zustimmung', async () => {
  const r = await s1.put(`/api/basars/${st.basarId}/participation`, { data: { isActive: true } });
  expect(r.status()).toBe(400);
  const ok = await s1.put(`/api/basars/${st.basarId}/participation`, { data: { isActive: true, acceptedTerms: true } });
  expect(ok.status(), await show(ok)).toBe(200);
  const bs = await prisma.basarSeller.findUnique({ where: { basarId_sellerId: { basarId: st.basarId, sellerId: S1.sellerId } } });
  expect(bs?.isActive).toBe(true);
  expect(bs?.termsAcceptedAt).not.toBeNull();
});

test('Letzter Platz, drei melden sich gleichzeitig an: höchstens einer darf durch', async () => {
  // maxSellers = 2, S1 belegt einen Platz. Bleibt einer frei, und drei klicken gleichzeitig.
  const res = await Promise.all([s2, out, reg].map(c =>
    c.put(`/api/basars/${st.basarId}/participation`, { data: { isActive: true, acceptedTerms: true } })));
  const angenommen = res.filter(r => r.status() === 200).length;
  const aktiv = await prisma.basarSeller.count({ where: { basarId: st.basarId, isActive: true } });
  // Befund wird in jedem Fall ausgegeben, damit der Bericht ihn hat.
  befund(aktiv <= 2, `Kapazität: max 2, ein Platz frei, 3 gleichzeitig – angenommen ${angenommen}, danach aktiv ${aktiv}`);
});

test('Platzlimit hochsetzen, damit der Rest des Durchlaufs Teilnehmer hat', async () => {
  const r = await admin.put(`/api/basars/${st.basarId}`, { data: { maxSellers: 10 } });
  expect(r.status(), await show(r)).toBe(200);
  for (const c of [s2, reg]) {
    const p = await c.put(`/api/basars/${st.basarId}/participation`, { data: { isActive: true, acceptedTerms: true } });
    expect([200], await show(p)).toContain(p.status());
  }
});

// ─── 5. Artikel ─────────────────────────────────────────────────────────────
test('Artikel: Pflichtfelder, Preis > 0, Limit 3 pro Verkäufer', async () => {
  expect((await s1.post(`/api/basars/${st.basarId}/articles`, { data: { title: 'Ohne Preis' } })).status()).toBe(400);
  expect((await s1.post(`/api/basars/${st.basarId}/articles`, { data: { title: 'Null', price: 0 } })).status()).toBe(400);
  for (const [title, price] of [['Jeansjacke', 12.5], ['Holzbausteine', 4], ['Buch', 0.5]] as const) {
    const r = await s1.post(`/api/basars/${st.basarId}/articles`, { data: { title, price, sizeLabel: '110/116' } });
    expect(r.status(), await show(r)).toBe(201);
    const a = (await r.json()).article;
    st.s1Articles.push({ id: a.id, qrCode: a.qrCode, price: Number(a.price) });
  }
  const vierter = await s1.post(`/api/basars/${st.basarId}/articles`, { data: { title: 'Zu viel', price: 1 } });
  expect(vierter.status()).toBe(400);
  expect(await prisma.article.count({ where: { basarSeller: { basarId: st.basarId, sellerId: S1.sellerId } } })).toBe(3);
  // Archiv entsteht mit: jeder Artikel hat seine Vorlage mit demselben QR-Code.
  const sa = await prisma.sellerArticle.findMany({ where: { sellerId: S1.sellerId } });
  expect(sa.map(x => x.qrCode).sort()).toEqual(st.s1Articles.map(a => a.qrCode).sort());
});

test('Artikellimit unter Gleichzeitigkeit: fünf auf einmal, nur bis zum Limit', async () => {
  const res = await Promise.all(Array.from({ length: 5 }, (_, i) =>
    s2.post(`/api/basars/${st.basarId}/articles`, { data: { title: `Parallel ${i}`, price: 2 } })));
  const n = await prisma.article.count({ where: { basarSeller: { basarId: st.basarId, sellerId: S2.sellerId } } });
  befund(n <= 3, `Artikellimit 3, 5 gleichzeitig – Status ${res.map(r => r.status()).join(',')}, angelegt ${n}`);
  st.s2Articles = (await prisma.article.findMany({ where: { basarSeller: { basarId: st.basarId, sellerId: S2.sellerId } } }))
    .map(a => ({ id: a.id, qrCode: a.qrCode }));
});

test('Orga hat kein Limit und braucht keine Anmeldung', async () => {
  for (let i = 0; i < 5; i++) {
    const r = await orga.post(`/api/basars/${st.basarId}/articles`, { data: { title: `Orga ${i}`, price: 1 } });
    expect(r.status(), await show(r)).toBe(201);
  }
  st.orgaArticles = 5;
});

// ─── 6. Etiketten und Anlieferzettel ────────────────────────────────────────
test('Etiketten-PDF: A4, eigene Auswahl ja, fremde Artikel nein', async () => {
  const r = await s1.get(`/api/basars/${st.basarId}/labels.pdf`);
  expect(r.status(), await show(r)).toBe(200);
  expect(r.headers()['content-type']).toBe('application/pdf');
  const buf = await r.body();
  expect(buf.subarray(0, 4).toString()).toBe('%PDF');
  const [, , w, h] = buf.toString('latin1').match(/\/MediaBox\s*\[([^\]]*)\]/)![1].trim().split(/\s+/).map(Number);
  expect(w).toBeCloseTo(595.28, 1);
  expect(h).toBeCloseTo(841.89, 1);
  const eins = await s1.get(`/api/basars/${st.basarId}/labels.pdf?ids=${st.s1Articles[0].id}`);
  expect(eins.status()).toBe(200);
  const fremd = await s1.get(`/api/basars/${st.basarId}/labels.pdf?ids=${st.s2Articles[0].id}`);
  expect(fremd.status(), 'Etiketten eines anderen Verkäufers abrufbar').not.toBe(200);
});

test('Anlieferzettel: Seitenzahl entspricht den Personen, Orga ist immer dabei', async () => {
  const angemeldet = await admin.get(`/api/basars/${st.basarId}/anlieferzettel.pdf?set=activated`);
  expect(angemeldet.status(), await show(angemeldet)).toBe(200);
  const aktiv = await prisma.basarSeller.count({ where: { basarId: st.basarId, isActive: true } });
  const orgaGesamt = await prisma.seller.count({ where: { isOrga: true } });
  expect(pdfPages(await angemeldet.body())).toBe(aktiv + orgaGesamt);
  const mitArtikeln = await admin.get(`/api/basars/${st.basarId}/anlieferzettel.pdf?set=withArticles`);
  expect(mitArtikeln.status()).toBe(200);
  // S1 und S2 haben Artikel, die Neue nicht; Orga immer.
  expect(pdfPages(await mitArtikeln.body())).toBe(2 + orgaGesamt);
  expect((await admin.get(`/api/basars/${st.basarId}/anlieferzettel.pdf?set=alle`)).status()).toBe(400);
});

// ─── 7. Testbasar ───────────────────────────────────────────────────────────
test('Testbasar: für Nicht-Eingeladene unsichtbar, für Eingeladene sichtbar', async () => {
  const r = await admin.post('/api/basars', { data: { title: 'E2E Geheimtest', isTest: true, dateFriday: '2026-12-04' } });
  expect(r.status(), await show(r)).toBe(201);
  st.testBasarId = (await r.json()).id;
  expect((await prisma.basar.findUnique({ where: { id: st.testBasarId } }))?.isTest).toBe(true);
  await admin.patch(`/api/basars/${st.testBasarId}/status`, { data: { status: 'OPEN' } });

  const titles = async (c: APIRequestContext) => ((await (await c.get('/api/basars')).json()).basars as { title: string }[]).map(b => b.title);
  expect(await titles(s1)).not.toContain('E2E Geheimtest');
  expect((await s1.get(`/api/basars/${st.testBasarId}`)).status()).toBe(404);
  expect(await (await anon.get('/')).text()).not.toContain('E2E Geheimtest');
  expect((await kasse.get(`/api/basars/${st.testBasarId}/scan-cache`)).status()).toBe(404);

  const inv = await admin.post(`/api/basars/${st.testBasarId}/invites`, { data: { sellerIds: [S1.sellerId, 99999] } });
  expect(await inv.json()).toEqual({ added: 1, unknown: [99999] });
  expect(await titles(s1)).toContain('E2E Geheimtest');
  expect((await s1.get(`/api/basars/${st.testBasarId}`)).status()).toBe(200);
  expect(await titles(s2)).not.toContain('E2E Geheimtest');
  expect(await titles(admin)).toContain('E2E Geheimtest');
  // Startseite bleibt auch für Eingeladene leer – sie kennt keinen Login.
  expect(await (await s1.get('/')).text()).not.toContain('E2E Geheimtest');

  // Orga ohne Einladung steht nicht in der Teilnehmerliste des Testbasars.
  const det = await (await admin.get(`/api/basars/${st.testBasarId}`)).json();
  expect(det.basarSellers.map((b: { sellerId: number }) => b.sellerId)).not.toContain(ORGA.sellerId);

  // Nachträglich zum echten Basar machen geht nicht – das Feld wird beim Ändern ignoriert.
  await admin.put(`/api/basars/${st.testBasarId}`, { data: { isTest: false } });
  expect((await prisma.basar.findUnique({ where: { id: st.testBasarId } }))?.isTest).toBe(true);
});

test('Testbasar mit denselben QR-Codes: Eingeladene übernimmt Artikel aus dem Archiv', async () => {
  const sa = await prisma.sellerArticle.findMany({ where: { sellerId: S1.sellerId } });
  const r = await s1.post(`/api/basars/${st.testBasarId}/articles/import`, { data: { sellerArticleIds: sa.map(x => x.id) } });
  expect(r.status(), await show(r)).toBe(201);
  const imported = await prisma.article.findMany({ where: { basarSeller: { basarId: st.testBasarId } } });
  expect(imported.map(a => a.qrCode).sort()).toEqual(st.s1Articles.map(a => a.qrCode).sort());
});

// ─── 8. Aktivieren, zurück, wieder aktivieren ───────────────────────────────
test('Aktivieren sperrt das Anlegen, zurück öffnet es wieder', async () => {
  expect((await admin.patch(`/api/basars/${st.basarId}/status`, { data: { status: 'ACTIVE' } })).status()).toBe(200);
  expect((await s2.post(`/api/basars/${st.basarId}/articles`, { data: { title: 'Zu spät', price: 1 } })).status()).toBe(400);
  expect((await admin.patch(`/api/basars/${st.basarId}/status`, { data: { status: 'OPEN' } })).status()).toBe(200);
  expect((await admin.patch(`/api/basars/${st.basarId}/status`, { data: { status: 'CLOSED' } })).status(), 'Sprung über zwei Stufen').toBe(400);
  expect((await admin.patch(`/api/basars/${st.basarId}/status`, { data: { status: 'ACTIVE' } })).status()).toBe(200);
  // Testbasar ebenfalls aktiv: ab jetzt laufen zwei Basare mit denselben QR-Codes gleichzeitig.
  expect((await admin.patch(`/api/basars/${st.testBasarId}/status`, { data: { status: 'ACTIVE' } })).status()).toBe(200);
});

// ─── 9. Kasse ───────────────────────────────────────────────────────────────
test('Kassierer: Scan-Cache enthält alle Artikel des Basars, ETag spart den zweiten Abruf', async () => {
  const r = await kasse.get(`/api/basars/${st.basarId}/scan-cache`);
  expect(r.status(), await show(r)).toBe(200);
  const { articles } = await r.json();
  expect(articles.length).toBe(st.s1Articles.length + st.s2Articles.length + st.orgaArticles);
  const etag = r.headers()['etag'];
  expect(etag).toBeTruthy();
  expect((await kasse.get(`/api/basars/${st.basarId}/scan-cache`, { headers: { 'If-None-Match': etag } })).status()).toBe(304);
});

test('Scan im echten Basar findet den echten Artikel, nicht den gleichnamigen im Testbasar', async () => {
  const qr = st.s1Articles[0].qrCode;
  const r = await kasse.get(`/api/articles/scan/${encodeURIComponent(qr)}?basarId=${st.basarId}`);
  expect(r.status(), await show(r)).toBe(200);
  expect((await r.json()).basarId).toBe(st.basarId);
});

test('Verkauf: per QR-Code, Preisgrenzen, Artikel aus dem anderen Basar wird abgewiesen', async () => {
  const sell = (data: object) => kasse.post(`/api/basars/${st.basarId}/sales`, { data });
  const ok = await (await sell({ items: [{ qrCode: st.s1Articles[0].qrCode }], clientTxId: 'tx-1' })).json();
  expect(ok.results[0].success, JSON.stringify(ok)).toBe(true);
  st.saleIds.push(ok.results[0].saleId);
  expect((await prisma.article.findUnique({ where: { id: st.s1Articles[0].id } }))?.status).toBe('SOLD');

  for (const salePrice of [0, -1, 1001]) {
    const bad = await (await sell({ items: [{ articleId: st.s1Articles[1].id, salePrice }] })).json();
    expect(bad.results[0].error, `Preis ${salePrice}`).toBeTruthy();
  }
  expect((await prisma.article.findUnique({ where: { id: st.s1Articles[1].id } }))?.status).toBe('AVAILABLE');

  // Artikel-ID aus dem Testbasar an der Kasse des echten Basars.
  const fremd = await prisma.article.findFirst({ where: { basarSeller: { basarId: st.testBasarId } } });
  const x = await (await sell({ items: [{ articleId: fremd!.id }] })).json();
  expect(x.results[0].error).toBe('Artikel nicht gefunden');
  expect((await prisma.article.findUnique({ where: { id: fremd!.id } }))?.status).toBe('AVAILABLE');
});

test('Zwei Kassen verkaufen gleichzeitig denselben Artikel: genau ein Verkauf', async () => {
  const id = st.s1Articles[1].id;
  const res = await Promise.all([kasse, admin].map(c =>
    c.post(`/api/basars/${st.basarId}/sales`, { data: { items: [{ articleId: id }] } }).then(r => r.json())));
  const erfolge = res.filter(r => r.results?.[0]?.success).length;
  expect(erfolge).toBe(1);
  expect(await prisma.sale.count({ where: { articleId: id, isCancelled: false } })).toBe(1);
  st.saleIds.push(res.find(r => r.results[0].success)!.results[0].saleId);
});

test('Storno: Artikel wieder verfügbar, erneut verkaufbar', async () => {
  const saleId = st.saleIds[1];
  const r = await kasse.delete(`/api/sales/${saleId}`);
  expect(r.status(), await show(r)).toBe(200);
  const sale = await prisma.sale.findUnique({ where: { id: saleId } });
  expect(sale?.isCancelled).toBe(true);
  expect(sale?.cancelledById).toBe(KASSE.sellerId);
  expect((await prisma.article.findUnique({ where: { id: st.s1Articles[1].id } }))?.status).toBe('AVAILABLE');
  const again = await (await kasse.post(`/api/basars/${st.basarId}/sales`, { data: { items: [{ articleId: st.s1Articles[1].id, salePrice: 10 }] } })).json();
  expect(again.results[0].success).toBe(true);
  st.saleIds.push(again.results[0].saleId);
});

test('Doppelter Storno gleichzeitig: der Artikel darf danach nicht zweimal verkaufbar sein', async () => {
  // Verkauf eines frischen Artikels, dann zwei Stornos auf einmal.
  const id = st.s1Articles[2].id;
  const s = await (await kasse.post(`/api/basars/${st.basarId}/sales`, { data: { items: [{ articleId: id }] } })).json();
  const saleId = s.results[0].saleId;
  const res = await Promise.all([kasse, admin].map(c => c.delete(`/api/sales/${saleId}`)));
  const ok = res.filter(r => r.status() === 200).length;
  befund(ok === 1, `Storno: zwei gleichzeitig auf denselben Verkauf – ${ok}× „erfolgreich"`);
  // Zustand muss stimmen, egal wie viele Antworten „ok" sagen: kein aktiver Verkauf, Artikel frei.
  expect(await prisma.sale.count({ where: { articleId: id, isCancelled: false } })).toBe(0);
  expect((await prisma.article.findUnique({ where: { id } }))?.status).toBe('AVAILABLE');
});

test('Kassierer ohne Einladung kann im Testbasar nicht kassieren', async () => {
  const fremd = await prisma.article.findFirst({ where: { basarSeller: { basarId: st.testBasarId } } });
  const r = await kasse.post(`/api/basars/${st.testBasarId}/sales`, { data: { items: [{ articleId: fremd!.id }] } });
  expect(r.status()).toBe(404);
});

// ─── 9b. Kassenverlauf ──────────────────────────────────────────────────────
test('Kassenverlauf: Kassierer sieht nur eigene Bons, Admin alle, Verkäufer nichts', async () => {
  const url = `/api/basars/${st.basarId}/transactions`;
  type Tx = { cashierId: number | null; items: unknown[] };
  const get = async (c: APIRequestContext, qs = '') => {
    const r = await c.get(url + qs);
    expect(r.status(), await show(r)).toBe(200);
    return (await r.json()).transactions as Tx[];
  };

  const eigene = await get(kasse);
  expect(eigene.length).toBeGreaterThanOrEqual(1);
  expect(eigene.every(t => t.cashierId === KASSE.sellerId)).toBe(true);
  // Wirkung in der Datenbank: genau die Verkäufe dieses Kassierers, keine fremden.
  expect(eigene.reduce((n, t) => n + t.items.length, 0))
    .toBe(await prisma.sale.count({ where: { basarId: st.basarId, cashierId: KASSE.sellerId } }));

  // Ein fremder Filter wird ignoriert, nicht befolgt.
  const mitFilter = await get(kasse, '?cashierId=1');
  expect(mitFilter.length).toBe(eigene.length);
  expect(mitFilter.every(t => t.cashierId === KASSE.sellerId)).toBe(true);

  // Admin sieht alle Verkäufe des Basars (im Wettlauf-Test hat er evtl. selbst verkauft,
  // das ist Zufall – deshalb wird gegen die Datenbank gezählt, nicht auf fremde Bons gehofft).
  const alle = await get(admin);
  expect(alle.length).toBeGreaterThanOrEqual(eigene.length);
  expect(alle.reduce((n, t) => n + t.items.length, 0)).toBe(await prisma.sale.count({ where: { basarId: st.basarId } }));

  expect((await s1.get(url)).status()).toBe(403);
});

test('Kassenverlauf in der Oberfläche: Letzter Bon, Bon-Detail, Verkaufsliste – nur Ansicht', async ({ browser }) => {
  const page = await (await browser.newContext({ baseURL: BASE, storageState: await kasse.storageState() })).newPage();
  try {
    await page.goto(`/admin/basars/${st.basarId}/kasse`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('button', { name: /Letzter Bon/ })).toHaveCount(0);

    // Ein noch verfügbarer Artikel der Orga (die S1-Artikel sind verkauft, die von S2 sind
    // wegen des Limit-Wettlaufs nicht vorhersagbar). Eingabe wie an der Kasse: Nummer, dann Titel.
    await page.getByRole('button', { name: /Manuell/ }).click();
    await page.getByLabel('Verkäufernummer').fill(String(ORGA.sellerId));
    await page.getByRole('button', { name: /Orga 0/ }).click();
    await page.getByRole('button', { name: /Kassieren/ }).click();

    const banner = page.getByRole('button', { name: /Letzter Bon/ });
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('1 Art.');
    await banner.click();

    const overlay = page.locator('div.fixed.inset-0.z-50', { hasText: 'Zurück zur Kasse' });
    await expect(overlay.getByText('Orga 0')).toBeVisible();
    await expect(overlay.getByText('Nur Ansicht')).toBeVisible();
    // Strikt read-only: weder Storno noch Eingabefelder im Overlay.
    await expect(overlay.getByRole('button', { name: /storn/i })).toHaveCount(0);
    await expect(overlay.locator('input, textarea, select')).toHaveCount(0);

    await page.getByRole('button', { name: /Alle meine Verkäufe/ }).click();
    await expect(page.getByRole('heading', { name: 'Meine Verkäufe' })).toBeVisible();
    await expect(page.getByText('Bons', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: /Zurück zur Kasse/ }).click();
    await expect(page.getByRole('heading', { name: 'Meine Verkäufe' })).toHaveCount(0);

    // Liste auch ohne Banner erreichbar, etwa nach einem Neuladen: Knopf im Scanner-Kopf.
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('button', { name: /Letzter Bon/ })).toHaveCount(0);
    await page.getByRole('button', { name: /Verkäufe/ }).click();
    await expect(page.getByRole('heading', { name: 'Meine Verkäufe' })).toBeVisible();
    await expect(page.getByText(/\d+ Art\./).first()).toBeVisible();
    await page.getByRole('button', { name: /Zurück zur Kasse/ }).click();
  } finally {
    await page.context().close();
  }

  // Aufräumen: der Verkauf gehört nicht zum Szenario der späteren Schritte (Abrechnung,
  // Zählungen). Storno stellt den Artikel wieder auf AVAILABLE; das Sale bleibt als
  // stornierte Zeile zurück, die keine Abrechnung mitzählt.
  const sale = await prisma.sale.findFirst({ where: { basarId: st.basarId, isCancelled: false, article: { title: 'Orga 0' } } });
  expect(sale, 'Verkauf aus der Oberfläche nicht in der Datenbank').not.toBeNull();
  const r = await admin.delete(`/api/sales/${sale!.id}`);
  expect(r.status(), await show(r)).toBe(200);
});

// ─── 10. Oberfläche: jede Hauptseite einmal echt laden ──────────────────────
test('Hauptseiten laden ohne Absturz und ohne Browserfehler', async ({ browser }) => {
  const seiten: [APIRequestContext, string[]][] = [
    [admin, ['/admin', '/admin/basars', `/admin/basars/${st.basarId}`, '/admin/list', '/admin/logs', `/admin/basars/${st.basarId}/kasse`, '/admin/basars/archiv']],
    [s1, ['/seller', `/seller/basars/${st.basarId}`, `/seller/basars/${st.testBasarId}`]],
    [kasse, ['/employee', `/admin/basars/${st.basarId}/kasse`]],
  ];
  const fehler: string[] = [];
  for (const [api, pfade] of seiten) {
    const page = await (await browser.newContext({ baseURL: BASE, storageState: await api.storageState() })).newPage();
    page.on('pageerror', e => fehler.push(`${page.url()} pageerror: ${e.message}`));
    page.on('console', m => { if (m.type() === 'error') fehler.push(`${page.url()} console: ${m.text().slice(0, 200)}`); });
    page.on('response', r => { if (r.status() >= 400) fehler.push(`${page.url().replace(BASE, '')} lädt ${r.url().replace(BASE, '')} → ${r.status()}`); });
    for (const p of pfade) {
      const r = await page.goto(p);
      expect(r?.status(), p).toBeLessThan(400);
      await page.waitForLoadState('networkidle');
      await expect(page.getByText('Da ist etwas schiefgegangen')).toHaveCount(0);
    }
    await page.context().close();
  }
  // Browserfehler als Befund, nicht als Abbruch: die Seiten haben geladen (oben hart geprüft),
  // und Schließen/Abrechnung dahinter sollen trotzdem laufen.
  befund(fehler.length === 0, `Browserfehler beim Laden der Hauptseiten:\n  ${fehler.join('\n  ')}`);
});

// ─── 11. Schließen und abrechnen ────────────────────────────────────────────
test('Schließen, Abrechnung erzeugen: Beträge stimmen auf den Cent', async () => {
  expect((await admin.patch(`/api/basars/${st.basarId}/status`, { data: { status: 'CLOSED' } })).status()).toBe(200);
  const r = await admin.post(`/api/basars/${st.basarId}/settlements`);
  expect(r.status(), await show(r)).toBe(200);

  const s1Sales = await prisma.sale.findMany({ where: { basarId: st.basarId, isCancelled: false, article: { basarSeller: { sellerId: S1.sellerId } } } });
  const brutto = s1Sales.reduce((s, x) => s + Number(x.salePrice), 0);
  const res = await (await s1.get(`/api/basars/${st.basarId}/settlements/${S1.sellerId}`)).json();
  const set = res.basarSeller.settlement;
  expect(Number(set.grossRevenue)).toBeCloseTo(brutto, 2);
  expect(Number(set.commissionAmount)).toBeCloseTo(Math.round(brutto * 0.15 * 100) / 100, 2);
  // Auszahlung auf 10 Cent gerundet (bar ausgezahlt).
  expect(Math.round(Number(set.netPayout) * 100) % 10).toBe(0);

  const pdf = await s1.get(`/api/basars/${st.basarId}/settlements/${S1.sellerId}/abrechnung.pdf`);
  expect(pdf.status()).toBe(200);
  expect((await s2.get(`/api/basars/${st.basarId}/settlements/${S1.sellerId}`)).status(), 'fremde Abrechnung').toBe(403);
  const alle = await admin.get(`/api/basars/${st.basarId}/settlements/abrechnungen.pdf`);
  expect(alle.status(), await show(alle)).toBe(200);
});

test('Storno nach der Abrechnung ist gesperrt', async () => {
  const r = await admin.delete(`/api/sales/${st.saleIds[0]}`);
  expect(r.status()).toBe(409);
  expect((await prisma.sale.findUnique({ where: { id: st.saleIds[0] } }))?.isCancelled).toBe(false);
});

// ─── 12. Sicherung und Cron ─────────────────────────────────────────────────
test('Sicherung: vollständiges JSON mit allen Tabellen, auch den Einladungen', async () => {
  const r = await admin.get('/api/admin/backup');
  expect(r.status()).toBe(200);
  const json = JSON.parse((await r.body()).toString('utf8'));
  expect(json.format).toBe(1);
  expect(json.tables.BasarInvite.length).toBe(await prisma.basarInvite.count());
  expect(json.tables.Sale.length).toBe(await prisma.sale.count());
  expect(json.tables.Basar.map((b: { id: string }) => b.id)).toEqual(expect.arrayContaining([st.basarId, st.testBasarId]));
});

test('Cron: ohne Geheimnis zu, mit Geheimnis läuft er', async () => {
  test.skip(!process.env.CRON_SECRET, 'CRON_SECRET nicht gesetzt');
  expect((await anon.get('/api/cron/mail-queue')).status()).toBe(401);
  const r = await anon.get('/api/cron/mail-queue', { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } });
  expect(r.status(), await show(r)).toBe(200);
});

// ─── 13. Fehlerprotokoll ────────────────────────────────────────────────────
test('Während des ganzen Laufs kein einziger Serverfehler im Fehlerprotokoll', async () => {
  const rows = await prisma.errorLog.findMany({ where: { createdAt: { gte: st.startedAt } }, orderBy: { createdAt: 'asc' } });
  const text = rows.map(r => `${r.source} ${r.route ?? '-'} | ${r.message.slice(0, 200)}`).join('\n');
  expect(rows, `Fehler im Protokoll:\n${text}`).toEqual([]);
});

// ─── 14. Befunde ────────────────────────────────────────────────────────────
test('Keine Befunde aus den Gleichzeitigkeits-Tests', async () => {
  expect(befunde, befunde.join('\n')).toEqual([]);
});
