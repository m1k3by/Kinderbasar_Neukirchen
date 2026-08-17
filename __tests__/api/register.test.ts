import { describe, it, expect, vi, beforeEach } from 'vitest';
import { adminToken } from '../helpers/tokens';

// ─── next/headers mock (getAuth reads the token via next/headers cookies()) ──
const cookiesGetMock = vi.hoisted(() => vi.fn());
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve({ get: cookiesGetMock })),
}));

// ─── Mock rateLimit ───────────────────────────────────────────────────────────
const rateLimitMock = vi.hoisted(() => vi.fn().mockResolvedValue(true));
vi.mock('@/app/lib/rateLimit', () => ({ rateLimit: rateLimitMock }));

// ─── Mock Prisma ──────────────────────────────────────────────────────────────
// Registration is basar-independent: it only ever touches Seller/SellerIdCounter/MailQueue.
// Basar participation is a separate step (PUT /api/basars/[id]/participation).
const prismaMock = vi.hoisted(() => ({
  // findMany ist bewusst gemockt, obwohl die Route es nicht mehr aufruft: Der Test unten
  // hält damit fest, dass die alte O(n)-Scanlogik ("alle vorhandenen IDs laden und die erste
  // Lücke suchen") nicht zurückkehrt.
  seller: { findUnique: vi.fn(), create: vi.fn(), findMany: vi.fn() },
  mailQueue: { create: vi.fn() },
  $queryRaw: vi.fn(),
  $executeRaw: vi.fn(),
}));
vi.mock('@/app/lib/prisma', () => ({ prisma: prismaMock }));

// ─── Mock QR/barcode ─────────────────────────────────────────────────────────
const generateQRMock = vi.hoisted(() => vi.fn().mockResolvedValue('data:image/png;base64,qr'));
const generateBarcodeMock = vi.hoisted(() => vi.fn().mockResolvedValue('data:image/png;base64,bc'));
vi.mock('@/app/lib/qr', () => ({ generateQR: generateQRMock, generateBarcode: generateBarcodeMock }));

// ─── Mock bcrypt ──────────────────────────────────────────────────────────────
const bcryptHashMock = vi.hoisted(() => vi.fn().mockResolvedValue('$2b$10$hashedpassword'));
vi.mock('bcrypt', () => ({ default: { hash: bcryptHashMock } }));

import { POST } from '@/app/api/register/route';

// Helper to create a proper NextRequest-like object with cookies.get
function makeNextRequest(body: object, token?: string) {
  const req = {
    headers: new Headers({
      'Content-Type': 'application/json',
      'x-forwarded-for': '127.0.0.1',
    }),
    cookies: {
      get: (name: string) =>
        name === 'token' && token ? { value: token } : undefined,
    },
    json: () => Promise.resolve(body),
  } as any;
  return req;
}

// allocateSellerId() setzt `prisma.$queryRaw\`UPDATE "SellerIdCounter" ... RETURNING\`` ab.
// Kommt nichts zurück, wird die Zählerzeile per $executeRaw nachgesät und genau einmal erneut
// versucht. Erst wenn auch der zweite Lauf leer bleibt, ist der Bereich wirklich erschöpft.
//
// `id: null` heißt hier deshalb ausdrücklich "beide Läufe leer" und nicht bloß "irgendein
// leeres Ergebnis" – die frühere Fassung dieses Helpers deutete ein einzelnes leeres Ergebnis
// als "Bereich erschöpft" und hat damit denselben Denkfehler kodiert wie der Produktivcode.
// Die leere Zählertabelle sah dadurch im Test korrekt aus und blockierte produktiv jede
// Registrierung mit der Falschmeldung "Alle Verkäufer-IDs sind vergeben".
function mockAllocateSellerId(id: number | null) {
  prismaMock.$executeRaw.mockResolvedValue(1);
  prismaMock.$queryRaw.mockResolvedValue(id === null ? [] : [{ allocated: id }]);
}

/**
 * SQL-Text eines getaggten Template-Aufrufs, normalisiert auf einfache Leerzeichen.
 * Damit prüfen die Tests, *welche* Anweisung abgesetzt wurde, statt nur zu zählen –
 * sonst könnte ein Mock erneut unbemerkt eine falsche Annahme über die Datenbank festschreiben.
 */
function sqlOf(mock: { mock: { calls: unknown[][] } }, callIndex: number): string {
  const strings = mock.mock.calls[callIndex][0] as string[];
  return strings.join(' ? ').replace(/\s+/g, ' ').trim();
}

const validBody = { email: 'test@example.com', firstName: 'Max', lastName: 'Muster' };
const createdSeller = { sellerId: 1010, email: 'test@example.com', firstName: 'Max', lastName: 'Muster', isEmployee: false, qrCode: 'data:image/png;base64,qr', barcode: 'data:image/png;base64,bc', password: '$2b$10$hash' };

describe('POST /api/register', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    rateLimitMock.mockResolvedValue(true);
    cookiesGetMock.mockReturnValue(undefined);
    bcryptHashMock.mockResolvedValue('$2b$10$hashedpassword');
    generateQRMock.mockResolvedValue('data:image/png;base64,qr');
    generateBarcodeMock.mockResolvedValue('data:image/png;base64,bc');
    prismaMock.mailQueue.create.mockResolvedValue({});
    mockAllocateSellerId(1000);
  });

  it('returns 400 when fields are missing', async () => {
    const res = await POST(makeNextRequest({ email: 'test@example.com' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Pflichtfelder/i);
  });

  it('returns 400 for invalid email format', async () => {
    const res = await POST(makeNextRequest({ email: 'notanemail', firstName: 'Max', lastName: 'Muster' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/E-Mail/i);
  });

  it('returns 429 when rate limit exceeded', async () => {
    rateLimitMock.mockResolvedValue(false);
    const res = await POST(makeNextRequest(validBody));
    expect(res.status).toBe(429);
  });

  it('returns 400 when email already exists', async () => {
    prismaMock.seller.findUnique.mockResolvedValue({ sellerId: 1234, email: 'test@example.com' });
    const res = await POST(makeNextRequest(validBody));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/bereits registriert/i);
  });

  it('creates seller successfully and returns 201', async () => {
    prismaMock.seller.findUnique.mockResolvedValue(null); // email not found
    prismaMock.seller.create.mockResolvedValue(createdSeller);
    const res = await POST(makeNextRequest(validBody));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.sellerId).toBe(1000); // allocateSellerId() resolves to the mocked 1000
  });

  // Leerzeichen aus Copy&Paste/Autofill dürfen nicht in die Datenbank gelangen: " a@b.de "
  // wird gespeichert, der spätere Login sendet "a@b.de" und findet die Zeile nicht mehr.
  it('trims surrounding whitespace from email and names before storing', async () => {
    prismaMock.seller.findUnique.mockResolvedValue(null);
    prismaMock.seller.create.mockResolvedValue(createdSeller);
    const res = await POST(makeNextRequest({ email: '  Test@Example.com \n', firstName: ' Max ', lastName: ' Muster ' }));
    expect(res.status).toBe(200);
    expect(prismaMock.seller.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ email: 'test@example.com', firstName: 'Max', lastName: 'Muster' }),
      })
    );
    // Auch die Eindeutigkeitsprüfung muss auf der getrimmten Adresse laufen, sonst legt
    // " a@b.de " eine zweite Zeile neben dem bestehenden "a@b.de" an.
    expect(prismaMock.seller.findUnique).toHaveBeenCalledWith({ where: { email: 'test@example.com' } });
  });

  it('rejects whitespace-only names as missing fields', async () => {
    const res = await POST(makeNextRequest({ email: 'test@example.com', firstName: '   ', lastName: 'Muster' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Pflichtfelder/i);
  });

  it('registration has no notion of a basar at all – no basar/basarSeller lookups happen', async () => {
    prismaMock.seller.findUnique.mockResolvedValue(null);
    prismaMock.seller.create.mockResolvedValue(createdSeller);
    const res = await POST(makeNextRequest({ ...validBody, basarId: 'some-basar' }));
    expect(res.status).toBe(200);
    // A basarId in the body is simply ignored – it plays no role in registration anymore.
    expect(prismaMock.seller.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.not.objectContaining({ basarId: expect.anything() }) })
    );
  });

  it('is available for a non-admin at any time (no registration window of any kind)', async () => {
    prismaMock.seller.findUnique.mockResolvedValue(null);
    prismaMock.seller.create.mockResolvedValue(createdSeller);
    const res = await POST(makeNextRequest(validBody));
    expect(res.status).toBe(200);
  });

  it('enqueues the confirmation email in MailQueue instead of sending it synchronously', async () => {
    prismaMock.seller.findUnique.mockResolvedValue(null);
    prismaMock.seller.create.mockResolvedValue(createdSeller);
    await POST(makeNextRequest(validBody));
    expect(prismaMock.mailQueue.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          to: 'test@example.com',
          subject: expect.stringContaining('Registrierung'),
          html: expect.any(String),
        }),
      })
    );
    // status isn't set explicitly by the route – it defaults to PENDING at the schema level.
    const enqueueCallData = prismaMock.mailQueue.create.mock.calls[0][0].data;
    expect(enqueueCallData.status).toBeUndefined();
  });

  it('the confirmation email does not mention delivery/pickup logistics (that moved to basar participation)', async () => {
    prismaMock.seller.findUnique.mockResolvedValue(null);
    prismaMock.seller.create.mockResolvedValue(createdSeller);
    await POST(makeNextRequest(validBody));
    const html = prismaMock.mailQueue.create.mock.calls[0][0].data.html as string;
    expect(html).not.toMatch(/Anlieferung/i);
    expect(html).not.toMatch(/Abholung/i);
  });

  it('registration still succeeds (201) even if enqueueing the confirmation email fails', async () => {
    prismaMock.seller.findUnique.mockResolvedValue(null);
    prismaMock.seller.create.mockResolvedValue(createdSeller);
    prismaMock.mailQueue.create.mockRejectedValue(new Error('DB down'));
    const res = await POST(makeNextRequest(validBody));
    expect(res.status).toBe(200);
    expect((await res.json()).sellerId).toBe(1000);
  });

  it('admin can bypass rate limit', async () => {
    rateLimitMock.mockResolvedValue(false); // rate limit would block, but admin bypasses
    prismaMock.seller.findUnique.mockResolvedValue(null);
    prismaMock.seller.create.mockResolvedValue(createdSeller);
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    const res = await POST(makeNextRequest(validBody, adminToken()));
    expect(res.status).toBe(200);
  });

  it('returns 500 on DB error', async () => {
    prismaMock.seller.findUnique.mockRejectedValue(new Error('DB error'));
    const res = await POST(makeNextRequest(validBody));
    expect(res.status).toBe(500);
  });

  it('retries with a fresh sellerId on a sellerId collision (P2002, not email)', async () => {
    prismaMock.seller.findUnique.mockResolvedValue(null); // email not found
    prismaMock.seller.create
      .mockRejectedValueOnce({ code: 'P2002', meta: { target: ['sellerId'] } })
      .mockResolvedValueOnce(createdSeller);
    const res = await POST(makeNextRequest(validBody));
    expect(res.status).toBe(200);
    expect(prismaMock.seller.create).toHaveBeenCalledTimes(2);
    // Each retry allocates a fresh id via the atomic counter rather than recomputing from a scan
    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it('returns 400 when P2002 collision is on the email field', async () => {
    prismaMock.seller.findUnique.mockResolvedValue(null);
    prismaMock.seller.create.mockRejectedValue({ code: 'P2002', meta: { target: ['email'] } });
    const res = await POST(makeNextRequest(validBody));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/bereits registriert/i);
    // No pointless further retries once we know it's an email collision, not a sellerId one.
    expect(prismaMock.seller.create).toHaveBeenCalledTimes(1);
  });

  it('isEmployee is strictly coerced to boolean (truthy non-true values rejected)', async () => {
    prismaMock.seller.findUnique.mockResolvedValue(null);
    prismaMock.seller.create.mockResolvedValue(createdSeller);
    const res = await POST(makeNextRequest({ ...validBody, isEmployee: 'yes', isCashier: true }));
    expect(res.status).toBe(200);
    expect(prismaMock.seller.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isEmployee: false }) })
    );
    // isCashier must never be settable through registration
    const createCallData = prismaMock.seller.create.mock.calls[0][0].data;
    expect(createCallData.isCashier).toBeUndefined();
  });

  // ─── Atomic sellerId allocation ──────────────────────────────────────────────

  describe('atomic sellerId allocation', () => {
    it('vergibt die ID mit einer einzigen UPDATE-Anweisung (kein Scannen aller vorhandenen IDs)', async () => {
      prismaMock.seller.findUnique.mockResolvedValue(null);
      prismaMock.seller.create.mockResolvedValue(createdSeller);

      await POST(makeNextRequest(validBody));

      expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1);
      const sql = sqlOf(prismaMock.$queryRaw, 0);
      expect(sql).toContain('UPDATE "SellerIdCounter"');
      expect(sql).toContain('SET "nextId" = "nextId" + 1');
      expect(sql).toContain('"nextId" <= 9999');   // Obergrenze des Bereichs 1000-9999
      expect(sql).toContain('RETURNING');
      // Im Normalfall wird nicht nachgesät – das kostet sonst eine Anweisung pro Registrierung
      expect(prismaMock.$executeRaw).not.toHaveBeenCalled();
      // Und schon gar nicht wird wieder die komplette Verkäufertabelle gelesen
      expect(prismaMock.seller.findMany).not.toHaveBeenCalled();
    });

    // ── Regression zum Produktionsvorfall vom 11.08.2026 ───────────────────────
    // Die Zählerzeile fehlte in der Produktivdatenbank: Die Tabelle war zwar angelegt, das
    // seedende INSERT der Migration lief aber nie. Das UPDATE traf damit 0 Zeilen – genau
    // wie bei einem erschöpften Bereich. Der Code deutete das als "alle 9000 IDs vergeben"
    // und blockierte jede Registrierung, obwohl der Bereich praktisch leer war.
    //
    // Entscheidend ist deshalb nicht, dass 0 Zeilen zu irgendeinem Verhalten führen, sondern
    // dass die beiden Ursachen *unterschieden* werden.
    describe('0 betroffene Zeilen sind zweideutig – fehlende Zählerzeile vs. erschöpfter Bereich', () => {
      it('fehlende Zählerzeile: legt sie an und registriert danach normal weiter', async () => {
        prismaMock.seller.findUnique.mockResolvedValue(null);
        prismaMock.seller.create.mockResolvedValue(createdSeller);
        prismaMock.$executeRaw.mockResolvedValue(1);
        prismaMock.$queryRaw
          .mockResolvedValueOnce([])                     // Zeile fehlt → 0 Treffer
          .mockResolvedValueOnce([{ allocated: 1042 }]); // nach dem Nachsäen

        const res = await POST(makeNextRequest(validBody));

        expect(res.status).toBe(200);
        expect(prismaMock.$executeRaw).toHaveBeenCalledTimes(1);
        expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(2);
        expect(prismaMock.seller.create).toHaveBeenCalledWith(
          expect.objectContaining({ data: expect.objectContaining({ sellerId: 1042 }) })
        );
      });

      it('sät die Zeile idempotent und leitet den Startwert aus der höchsten vergebenen Nummer ab', async () => {
        prismaMock.seller.findUnique.mockResolvedValue(null);
        prismaMock.seller.create.mockResolvedValue(createdSeller);
        prismaMock.$executeRaw.mockResolvedValue(1);
        prismaMock.$queryRaw
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([{ allocated: 1042 }]);

        await POST(makeNextRequest(validBody));

        const seed = sqlOf(prismaMock.$executeRaw, 0);
        expect(seed).toContain('INSERT INTO "SellerIdCounter"');
        // Ohne ON CONFLICT würde eine parallele Registrierung hier auf einen Primärschlüssel-
        // konflikt laufen, statt einfach weiterzumachen.
        expect(seed).toContain('ON CONFLICT ("id") DO NOTHING');
        // Der Startwert MUSS aus MAX("sellerId") kommen. Ein fest verdrahtetes 1000 würde die
        // nächsten Registrierungen mit längst bestehenden Verkäufern kollidieren lassen.
        expect(seed).toContain('MAX("sellerId")');
        expect(seed).toContain('GREATEST(1000');
      });

      it('wirklich erschöpfter Bereich: meldet 400 erst, nachdem das Nachsäen nichts geändert hat', async () => {
        prismaMock.seller.findUnique.mockResolvedValue(null);
        mockAllocateSellerId(null); // beide Läufe leer

        const res = await POST(makeNextRequest(validBody));

        expect(res.status).toBe(400);
        expect((await res.json()).error).toMatch(/Alle Verkäufer-IDs sind vergeben/i);
        // Genau ein Nachsäe-Versuch – keine Endlosschleife, kein zweiter Anlauf
        expect(prismaMock.$executeRaw).toHaveBeenCalledTimes(1);
        expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(2);
        expect(prismaMock.seller.create).not.toHaveBeenCalled();
      });

      it('meldet nicht mehr "vergeben", solange das Nachsäen noch eine ID liefern kann', async () => {
        prismaMock.seller.findUnique.mockResolvedValue(null);
        prismaMock.seller.create.mockResolvedValue(createdSeller);
        prismaMock.$executeRaw.mockResolvedValue(1);
        prismaMock.$queryRaw
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([{ allocated: 1000 }]);

        const res = await POST(makeNextRequest(validBody));

        // Der eigentliche Fehler von damals: hier kam ein 400 heraus.
        expect(res.status).toBe(200);
        expect((await res.json()).error).toBeUndefined();
      });
    });

    it('uses whatever id the counter returns, not a hardcoded value', async () => {
      prismaMock.seller.findUnique.mockResolvedValue(null);
      mockAllocateSellerId(4321);
      prismaMock.seller.create.mockResolvedValue({ ...createdSeller, sellerId: 4321 });
      const res = await POST(makeNextRequest(validBody));
      const data = await res.json();
      expect(data.sellerId).toBe(4321);
      expect(prismaMock.seller.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ sellerId: 4321 }) })
      );
    });
  });
});
