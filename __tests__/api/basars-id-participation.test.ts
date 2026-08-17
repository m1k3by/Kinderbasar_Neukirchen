import { describe, it, expect, vi, beforeEach } from 'vitest';
import { adminToken, sellerToken } from '../helpers/tokens';
import { TERMS_VERSION, PRIVACY_VERSION } from '@/app/lib/legalDocs';

const cookiesGetMock = vi.hoisted(() => vi.fn());
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve({ get: cookiesGetMock })),
}));

const prismaMock = vi.hoisted(() => ({
  basar: { findUnique: vi.fn() },
  seller: { findUnique: vi.fn() },
  basarSeller: { findUnique: vi.fn(), count: vi.fn(), upsert: vi.fn() },
  mailQueue: { create: vi.fn() },
}));
vi.mock('@/app/lib/prisma', () => ({ prisma: prismaMock }));

import { PUT } from '@/app/api/basars/[id]/participation/route';

function makeContext(id = 'basar-1') {
  return { params: Promise.resolve({ id }) };
}
function makeRequest(body: object) {
  return new Request('http://localhost/api/basars/basar-1/participation', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// All window fields null → isActivationOpen treats it as unrestricted (see basarWindows.ts).
const openBasar = {
  id: 'basar-1',
  title: 'Herbst Basar',
  status: 'OPEN',
  isArchived: false,
  maxSellers: 100,
  activationSellerStart: null,
  activationSellerEnd: null,
  activationEmployeeStart: null,
  activationEmployeeEnd: null,
  deliveryStart: null,
  deliveryEnd: null,
  deliveryStart2: null,
  deliveryEnd2: null,
  pickupStart: null,
  pickupEnd: null,
  pickupStart2: null,
  pickupEnd2: null,
};

const seller = { sellerId: 1234, email: 'seller@example.com', firstName: 'Max', isEmployee: false };
const inactiveBasarSeller = { id: 'bs-1', basarId: 'basar-1', sellerId: 1234, isActive: false };
const activeBasarSeller = { id: 'bs-1', basarId: 'basar-1', sellerId: 1234, isActive: true };

describe('PUT /api/basars/[id]/participation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.basar.findUnique.mockResolvedValue(openBasar);
    prismaMock.seller.findUnique.mockResolvedValue(seller);
    prismaMock.basarSeller.findUnique.mockResolvedValue(null); // no existing row by default
    prismaMock.basarSeller.count.mockResolvedValue(0);
    prismaMock.mailQueue.create.mockResolvedValue({});
  });

  it('returns 401 when no token', async () => {
    cookiesGetMock.mockReturnValue(undefined);
    prismaMock.basarSeller.upsert.mockResolvedValue(activeBasarSeller);
    const res = await PUT(makeRequest({ isActive: true }), makeContext());
    expect(res.status).toBe(401);
  });

  it('returns 400 when isActive is missing or not a boolean', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    const res = await PUT(makeRequest({}), makeContext());
    expect(res.status).toBe(400);
  });

  it("returns 403 when a non-admin targets someone else's sellerId", async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    const res = await PUT(makeRequest({ sellerId: 9999, isActive: true }), makeContext());
    expect(res.status).toBe(403);
  });

  it('returns 404 when the basar does not exist', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.basar.findUnique.mockResolvedValue(null);
    const res = await PUT(makeRequest({ isActive: true }), makeContext());
    expect(res.status).toBe(404);
  });

  it('returns 403 when activating on a DRAFT/CLOSED/archived basar', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.basar.findUnique.mockResolvedValue({ ...openBasar, status: 'DRAFT' });
    const res = await PUT(makeRequest({ isActive: true }), makeContext());
    expect(res.status).toBe(403);
    expect(prismaMock.mailQueue.create).not.toHaveBeenCalled();
  });

  it('returns 403 when the activation window is closed for a seller', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.basar.findUnique.mockResolvedValue({
      ...openBasar,
      activationSellerStart: '2020-01-01T00:00',
      activationSellerEnd: '2020-01-02T00:00',
    });
    const res = await PUT(makeRequest({ isActive: true }), makeContext());
    expect(res.status).toBe(403);
    expect(prismaMock.mailQueue.create).not.toHaveBeenCalled();
  });

  it('returns 400 when the basar is already at capacity', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.basarSeller.count.mockResolvedValue(100); // equals maxSellers
    const res = await PUT(makeRequest({ isActive: true }), makeContext());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Verkäufern/i);
  });

  it('activates participation and returns isActive: true', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.basarSeller.upsert.mockResolvedValue(activeBasarSeller);
    const res = await PUT(makeRequest({ isActive: true, acceptedTerms: true }), makeContext());
    expect(res.status).toBe(200);
    expect((await res.json()).isActive).toBe(true);
    expect(prismaMock.basarSeller.upsert).toHaveBeenCalledWith({
      where: { basarId_sellerId: { basarId: 'basar-1', sellerId: 1234 } },
      update: {
        isActive: true,
        activatedAt: expect.any(Date),
        termsAcceptedAt: expect.any(Date),
        termsVersion: TERMS_VERSION,
        privacyVersion: PRIVACY_VERSION,
      },
      create: {
        basarId: 'basar-1',
        sellerId: 1234,
        isActive: true,
        activatedAt: expect.any(Date),
        termsAcceptedAt: expect.any(Date),
        termsVersion: TERMS_VERSION,
        privacyVersion: PRIVACY_VERSION,
      },
    });
  });

  it('deactivating is always allowed, even outside the activation window or at capacity', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.basar.findUnique.mockResolvedValue({
      ...openBasar,
      activationSellerStart: '2020-01-01T00:00',
      activationSellerEnd: '2020-01-02T00:00',
    });
    prismaMock.basarSeller.findUnique.mockResolvedValue(activeBasarSeller);
    prismaMock.basarSeller.upsert.mockResolvedValue({ ...activeBasarSeller, isActive: false });
    const res = await PUT(makeRequest({ isActive: false }), makeContext());
    expect(res.status).toBe(200);
    expect((await res.json()).isActive).toBe(false);
  });

  it('admin bypasses the activation window and capacity check', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.basar.findUnique.mockResolvedValue({
      ...openBasar,
      activationSellerStart: '2020-01-01T00:00',
      activationSellerEnd: '2020-01-02T00:00',
    });
    prismaMock.basarSeller.count.mockResolvedValue(100);
    prismaMock.basarSeller.upsert.mockResolvedValue(activeBasarSeller);
    const res = await PUT(makeRequest({ sellerId: 1234, isActive: true }), makeContext());
    expect(res.status).toBe(200);
  });

  // ─── AGB- und Datenschutz-Zustimmung ─────────────────────────────────────────

  describe('terms consent on self-activation', () => {
    it('returns 400 and writes nothing when acceptedTerms is missing', async () => {
      cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
      const res = await PUT(makeRequest({ isActive: true }), makeContext());
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/AGB/);
      expect(prismaMock.basarSeller.upsert).not.toHaveBeenCalled();
      expect(prismaMock.mailQueue.create).not.toHaveBeenCalled();
    });

    it('returns 400 when acceptedTerms is false', async () => {
      cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
      const res = await PUT(makeRequest({ isActive: true, acceptedTerms: false }), makeContext());
      expect(res.status).toBe(400);
      expect(prismaMock.basarSeller.upsert).not.toHaveBeenCalled();
    });

    it('returns 400 when acceptedTerms is truthy but not the boolean true', async () => {
      cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
      const res = await PUT(makeRequest({ isActive: true, acceptedTerms: 'ja' }), makeContext());
      expect(res.status).toBe(400);
      expect(prismaMock.basarSeller.upsert).not.toHaveBeenCalled();
    });

    it('re-activating after a deactivation requires consent again and stamps it anew', async () => {
      cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
      prismaMock.basarSeller.findUnique.mockResolvedValue({
        ...inactiveBasarSeller,
        termsAcceptedAt: new Date('2026-01-01T10:00:00Z'),
      });

      const denied = await PUT(makeRequest({ isActive: true }), makeContext());
      expect(denied.status).toBe(400);

      prismaMock.basarSeller.upsert.mockResolvedValue(activeBasarSeller);
      const res = await PUT(makeRequest({ isActive: true, acceptedTerms: true }), makeContext());
      expect(res.status).toBe(200);
      expect(prismaMock.basarSeller.upsert.mock.calls[0][0].update.termsAcceptedAt).toBeInstanceOf(Date);
    });

    it('does not require consent when deactivating and leaves termsAcceptedAt untouched', async () => {
      cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
      prismaMock.basarSeller.findUnique.mockResolvedValue(activeBasarSeller);
      prismaMock.basarSeller.upsert.mockResolvedValue({ ...activeBasarSeller, isActive: false });

      const res = await PUT(makeRequest({ isActive: false }), makeContext());

      expect(res.status).toBe(200);
      expect(prismaMock.basarSeller.upsert.mock.calls[0][0].update).not.toHaveProperty('termsAcceptedAt');
    });

    it('does not require consent when re-submitting an already-active participation', async () => {
      cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
      prismaMock.basarSeller.findUnique.mockResolvedValue(activeBasarSeller);
      prismaMock.basarSeller.upsert.mockResolvedValue(activeBasarSeller);

      const res = await PUT(makeRequest({ isActive: true }), makeContext());

      expect(res.status).toBe(200);
      expect(prismaMock.basarSeller.upsert.mock.calls[0][0].update).not.toHaveProperty('termsAcceptedAt');
    });

    it('an admin activating on behalf of a seller needs no consent and records none', async () => {
      cookiesGetMock.mockReturnValue({ value: adminToken() });
      prismaMock.basarSeller.upsert.mockResolvedValue(activeBasarSeller);

      const res = await PUT(makeRequest({ sellerId: 1234, isActive: true }), makeContext());

      expect(res.status).toBe(200);
      const call = prismaMock.basarSeller.upsert.mock.calls[0][0];
      expect(call.update).not.toHaveProperty('termsAcceptedAt');
      expect(call.create.termsAcceptedAt).toBeNull();
    });

    it('consent is only accepted after the eligibility checks – a closed basar still returns 403', async () => {
      cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
      prismaMock.basar.findUnique.mockResolvedValue({ ...openBasar, status: 'CLOSED' });

      const res = await PUT(makeRequest({ isActive: true, acceptedTerms: true }), makeContext());

      expect(res.status).toBe(403);
      expect(prismaMock.basarSeller.upsert).not.toHaveBeenCalled();
    });
  });

  // ─── Aktivierungs-Bestätigungsmail ───────────────────────────────────────────

  describe('confirmation email on activation', () => {
    it('enqueues a confirmation email with delivery/pickup times when freshly activating', async () => {
      cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
      prismaMock.basar.findUnique.mockResolvedValue({
        ...openBasar,
        deliveryStart: '2026-03-13T16:00',
        deliveryEnd: '2026-03-13T18:00',
        pickupStart: '2026-03-15T19:00',
        pickupEnd: '2026-03-15T19:30',
      });
      prismaMock.basarSeller.upsert.mockResolvedValue(activeBasarSeller);

      await PUT(makeRequest({ isActive: true, acceptedTerms: true }), makeContext());

      expect(prismaMock.mailQueue.create).toHaveBeenCalledTimes(1);
      const data = prismaMock.mailQueue.create.mock.calls[0][0].data;
      expect(data.to).toBe('seller@example.com');
      expect(data.subject).toMatch(/Herbst Basar/);
      expect(data.html).toMatch(/Anlieferung/);
      expect(data.html).toMatch(/Abholung/);
    });

    it('does not enqueue an email when deactivating', async () => {
      cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
      prismaMock.basarSeller.findUnique.mockResolvedValue(activeBasarSeller);
      prismaMock.basarSeller.upsert.mockResolvedValue({ ...activeBasarSeller, isActive: false });

      await PUT(makeRequest({ isActive: false }), makeContext());

      expect(prismaMock.mailQueue.create).not.toHaveBeenCalled();
    });

    it('does not re-send the email when re-submitting an already-active participation (idempotent)', async () => {
      cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
      prismaMock.basarSeller.findUnique.mockResolvedValue(activeBasarSeller); // already active
      prismaMock.basarSeller.upsert.mockResolvedValue(activeBasarSeller);

      await PUT(makeRequest({ isActive: true }), makeContext());

      expect(prismaMock.mailQueue.create).not.toHaveBeenCalled();
    });

    it('a mail-enqueue failure does not fail the activation itself', async () => {
      cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
      prismaMock.basarSeller.upsert.mockResolvedValue(activeBasarSeller);
      prismaMock.mailQueue.create.mockRejectedValue(new Error('DB down'));

      const res = await PUT(makeRequest({ isActive: true, acceptedTerms: true }), makeContext());

      expect(res.status).toBe(200);
      expect((await res.json()).isActive).toBe(true);
    });
  });

  it('returns 500 on unexpected DB error', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.basar.findUnique.mockRejectedValue(new Error('DB error'));
    const res = await PUT(makeRequest({ isActive: true }), makeContext());
    expect(res.status).toBe(500);
  });
});

// ─── Zustimmungsnachweis: Fassung der Dokumente ──────────────────────────────
// Ein Zeitstempel allein belegt nur "hat irgendwann geklickt". Erst zusammen mit der
// Fassung von AGB und Datenschutzerklärung ist die Zustimmung nachweisbar (DSGVO Art. 7
// Abs. 1) – nach der ersten Textänderung wäre ein Nachweis ohne Fassung wertlos.
describe('PUT /api/basars/[id]/participation – Fassungen im Zustimmungsnachweis', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.basar.findUnique.mockResolvedValue(openBasar);
    prismaMock.seller.findUnique.mockResolvedValue(seller);
    prismaMock.basarSeller.findUnique.mockResolvedValue(null);
    prismaMock.basarSeller.count.mockResolvedValue(0);
    prismaMock.basarSeller.upsert.mockResolvedValue(activeBasarSeller);
    prismaMock.mailQueue.create.mockResolvedValue({ id: 'mail-1' });
  });

  it('schreibt bei Selbstanmeldung Zeitpunkt und beide Fassungen', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    await PUT(makeRequest({ isActive: true, acceptedTerms: true }), makeContext());
    const call = prismaMock.basarSeller.upsert.mock.calls[0][0];
    expect(call.update.termsAcceptedAt).toBeInstanceOf(Date);
    expect(call.update.termsVersion).toBe(TERMS_VERSION);
    expect(call.update.privacyVersion).toBe(PRIVACY_VERSION);
  });

  // Sonst könnte ein manipulierter Client behaupten, einer längst ersetzten Fassung
  // zugestimmt zu haben – und der Nachweis wäre wertlos.
  it('übernimmt keine vom Client gesendeten Fassungen', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    await PUT(
      makeRequest({ isActive: true, acceptedTerms: true, termsVersion: '1999-01-01', privacyVersion: '1999-01-01' }),
      makeContext()
    );
    const call = prismaMock.basarSeller.upsert.mock.calls[0][0];
    expect(call.update.termsVersion).toBe(TERMS_VERSION);
    expect(call.update.privacyVersion).toBe(PRIVACY_VERSION);
  });

  // Ein Admin kann die Zustimmung eines anderen nicht abgeben. Statt eine fremde
  // Zustimmung zu fingieren, bleibt der Nachweis leer.
  it('legt bei Admin-Aktivierung für einen Dritten keinen Nachweis an', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    await PUT(makeRequest({ isActive: true, sellerId: 1234 }), makeContext());
    const call = prismaMock.basarSeller.upsert.mock.calls[0][0];
    expect(call.update).not.toHaveProperty('termsVersion');
    expect(call.create.termsVersion).toBeNull();
    expect(call.create.privacyVersion).toBeNull();
    expect(call.create.termsAcceptedAt).toBeNull();
  });

  it('lässt den Nachweis beim Abmelden unangetastet', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.basarSeller.findUnique.mockResolvedValue({ isActive: true });
    await PUT(makeRequest({ isActive: false }), makeContext());
    const call = prismaMock.basarSeller.upsert.mock.calls[0][0];
    expect(call.update).not.toHaveProperty('termsVersion');
    expect(call.update).not.toHaveProperty('privacyVersion');
    expect(call.update).not.toHaveProperty('termsAcceptedAt');
  });
});
