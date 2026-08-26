import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Warteschlangen-Bibliothek mocken ────────────────────────────────────────
// Geprüft wird die Cron-Route: Autorisierung und Schleifensteuerung. Dass drainMailQueue()
// richtig versendet, deckt admin-mail-queue.test.ts ab.
const drainMock = vi.hoisted(() => vi.fn());
vi.mock('@/app/lib/mailQueue', () => ({
  drainMailQueue: drainMock,
  MAIL_QUEUE_BATCH_SIZE: 20,
  MAIL_QUEUE_MAX_ATTEMPTS: 5,
}));

import { GET } from '@/app/api/cron/mail-queue/route';

const SECRET = 'geheim-und-lang-genug';

function makeRequest(token?: string) {
  return new Request('http://localhost/api/cron/mail-queue', {
    headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
  });
}

/** Ein voller Stapel signalisiert "da ist noch mehr", ein angebrochener das Ende. */
const vollerStapel = { processed: 20, sent: 20, failed: 0 };
const restStapel = { processed: 3, sent: 3, failed: 0 };

describe('GET /api/cron/mail-queue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = SECRET;
  });
  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  // ── Autorisierung ──────────────────────────────────────────────────────────
  // Hier ist der Statuscode nicht der ganze Vertrag: entscheidend ist, dass die
  // Warteschlange *nicht angefasst* wird. Ein offener Endpunkt, der SMTP auslöst, wäre
  // von außen als Mailversand missbrauchbar.
  it('ohne CRON_SECRET in der Umgebung: 503 und kein Versand', async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(makeRequest(SECRET));
    expect(res.status).toBe(503);
    expect(drainMock).not.toHaveBeenCalled();
  });

  it('ohne Authorization-Header: 401 und kein Versand', async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
    expect(drainMock).not.toHaveBeenCalled();
  });

  it('mit falschem Geheimnis: 401 und kein Versand', async () => {
    const res = await GET(makeRequest('falsch'));
    expect(res.status).toBe(401);
    expect(drainMock).not.toHaveBeenCalled();
  });

  it('mit einem Präfix des richtigen Geheimnisses: 401', async () => {
    // Längenungleichheit muss vor timingSafeEqual abgefangen werden – sonst wirft es.
    const res = await GET(makeRequest(SECRET.slice(0, 5)));
    expect(res.status).toBe(401);
    expect(drainMock).not.toHaveBeenCalled();
  });

  // ── Schleifensteuerung ─────────────────────────────────────────────────────
  it('hört auf, sobald ein angebrochener Stapel kommt', async () => {
    drainMock.mockResolvedValue(restStapel);
    const res = await GET(makeRequest(SECRET));
    expect(res.status).toBe(200);
    expect(drainMock).toHaveBeenCalledTimes(1);
    expect(await res.json()).toEqual({ processed: 3, sent: 3, failed: 0 });
  });

  it('holt weitere Stapel, solange volle zurückkommen, und summiert sie', async () => {
    // Der Rückstand vom 26.08.2026 waren 36 Zeilen bei Stapelgröße 20 – ein einzelner
    // Durchgang hätte ihn nicht abgearbeitet, und der nächste Lauf kommt erst am Folgetag.
    drainMock
      .mockResolvedValueOnce(vollerStapel)
      .mockResolvedValueOnce({ processed: 16, sent: 15, failed: 1 });

    const res = await GET(makeRequest(SECRET));

    expect(drainMock).toHaveBeenCalledTimes(2);
    expect(await res.json()).toEqual({ processed: 36, sent: 35, failed: 1 });
  });

  it('läuft nicht endlos, wenn immer volle Stapel zurückkommen', async () => {
    drainMock.mockResolvedValue(vollerStapel);
    const res = await GET(makeRequest(SECRET));
    expect(res.status).toBe(200);
    expect(drainMock).toHaveBeenCalledTimes(5); // MAX_BATCHES
  });

  it('meldet 500, wenn der Stapellauf wirft', async () => {
    drainMock.mockRejectedValue(new Error('SMTP kaputt'));
    const res = await GET(makeRequest(SECRET));
    expect(res.status).toBe(500);
  });
});
