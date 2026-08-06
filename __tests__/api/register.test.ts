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
const prismaMock = vi.hoisted(() => ({
  basar: { findUnique: vi.fn() },
  basarSeller: { count: vi.fn(), create: vi.fn() },
  seller: { findUnique: vi.fn(), create: vi.fn() },
  mailQueue: { create: vi.fn() },
  $transaction: vi.fn(),
  $queryRaw: vi.fn(),
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

function makeRequest(body: object, token?: string) {
  const cookieVal = token ? `token=${token}` : '';
  return new Request('http://localhost/api/register', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(cookieVal ? { Cookie: cookieVal } : {}),
      'x-forwarded-for': '127.0.0.1',
    },
    body: JSON.stringify(body),
  }) as any; // cast as NextRequest - cookies.get is polyfilled by the test env
}

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

// allocateSellerId() does `prisma.$transaction(async (tx) => tx.$queryRaw\`UPDATE ...
// RETURNING "nextId" - 1 AS "allocated"\`)`. Mock $transaction to run the callback against the
// same mock client, and $queryRaw to resolve to the allocated id row (or [] to simulate the
// 1000-9999 range being exhausted, mirroring the WHERE ... AND "nextId" <= 9999 clause
// matching zero rows).
function mockAllocateSellerId(id: number | null) {
  prismaMock.$transaction.mockImplementation(async (fn: any) => fn(prismaMock));
  prismaMock.$queryRaw.mockResolvedValue(id === null ? [] : [{ allocated: id }]);
}

// A basar with every window field null: isRegistrationOpen/isWindowOpen treats a missing
// window as "always open" (see app/lib/basarWindows.ts), so this is the permissive default.
const openBasar = {
  id: 'basar-1',
  status: 'OPEN',
  isArchived: false,
  maxSellers: 100,
  registrationSellerStart: null,
  registrationSellerEnd: null,
  registrationEmployeeStart: null,
  registrationEmployeeEnd: null,
  deliveryStart: null,
  deliveryEnd: null,
  deliveryStart2: null,
  deliveryEnd2: null,
  pickupStart: null,
  pickupEnd: null,
  pickupStart2: null,
  pickupEnd2: null,
};

// Admin registrations may omit basarId (account-only, e.g. from the admin helper list).
const validBody = { email: 'test@example.com', firstName: 'Max', lastName: 'Muster' };
// Non-admin registration is bound to a basar since app/api/register creates the
// participation (BasarSeller) directly instead of relying on the old global
// Seller.sellerStatusActive flag.
const sellerBody = { ...validBody, basarId: 'basar-1' };
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
    prismaMock.basar.findUnique.mockResolvedValue(openBasar);
    prismaMock.basarSeller.count.mockResolvedValue(0);
    prismaMock.basarSeller.create.mockResolvedValue({});
    mockAllocateSellerId(1000);
  });

  it('returns 400 when basarId is missing for a non-admin registration', async () => {
    const res = await POST(makeNextRequest(validBody));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Basar/i);
  });

  it('returns 400 when fields are missing', async () => {
    const res = await POST(makeNextRequest({ email: 'test@example.com', basarId: 'basar-1' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Pflichtfelder/i);
  });

  it('returns 400 for invalid email format', async () => {
    const res = await POST(makeNextRequest({ email: 'notanemail', firstName: 'Max', lastName: 'Muster', basarId: 'basar-1' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/E-Mail/i);
  });

  it('returns 429 when rate limit exceeded', async () => {
    rateLimitMock.mockResolvedValue(false);
    const res = await POST(makeNextRequest(sellerBody));
    expect(res.status).toBe(429);
  });

  it('returns 404 when the basar does not exist', async () => {
    prismaMock.basar.findUnique.mockResolvedValue(null);
    const res = await POST(makeNextRequest(sellerBody));
    expect(res.status).toBe(404);
  });

  it('returns 403 when the basar is not open for registration (DRAFT/CLOSED/archived)', async () => {
    prismaMock.basar.findUnique.mockResolvedValue({ ...openBasar, status: 'DRAFT' });
    const res = await POST(makeNextRequest(sellerBody));
    expect(res.status).toBe(403);
  });

  it('returns 400 when email already exists', async () => {
    prismaMock.seller.findUnique.mockResolvedValue({ sellerId: 1234, email: 'test@example.com' });
    const res = await POST(makeNextRequest(sellerBody));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/bereits registriert/i);
  });

  it('returns 403 when seller registration period closed', async () => {
    // Use format "YYYY-MM-DDTHH:MM" that parseAsGermanTime understands
    prismaMock.basar.findUnique.mockResolvedValue({
      ...openBasar,
      registrationSellerStart: '2020-01-01T00:00',
      registrationSellerEnd: '2020-01-02T00:00',
    });
    const res = await POST(makeNextRequest(sellerBody));
    expect(res.status).toBe(403);
  });

  it('returns 400 when the basar\'s seller capacity is reached', async () => {
    prismaMock.basarSeller.count.mockResolvedValue(100); // equals maxSellers
    const res = await POST(makeNextRequest(sellerBody));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Verkäufern/i);
  });

  it('creates seller successfully and returns 201', async () => {
    prismaMock.seller.findUnique.mockResolvedValue(null); // email not found
    prismaMock.seller.create.mockResolvedValue(createdSeller);
    const res = await POST(makeNextRequest(sellerBody));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.sellerId).toBe(1000); // allocateSellerId() resolves to the mocked 1000
  });

  it('creates an active BasarSeller row for the chosen basar', async () => {
    prismaMock.seller.findUnique.mockResolvedValue(null);
    prismaMock.seller.create.mockResolvedValue(createdSeller);
    await POST(makeNextRequest(sellerBody));
    expect(prismaMock.basarSeller.create).toHaveBeenCalledWith({
      data: { basarId: 'basar-1', sellerId: 1010, isActive: true, activatedAt: expect.any(Date) },
    });
  });

  it('admin registration without basarId does not create a BasarSeller row', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.seller.findUnique.mockResolvedValue(null);
    prismaMock.seller.create.mockResolvedValue(createdSeller);
    const res = await POST(makeNextRequest(validBody, adminToken()));
    expect(res.status).toBe(200);
    expect(prismaMock.basarSeller.create).not.toHaveBeenCalled();
  });

  it('enqueues the confirmation email in MailQueue instead of sending it synchronously', async () => {
    prismaMock.seller.findUnique.mockResolvedValue(null);
    prismaMock.seller.create.mockResolvedValue(createdSeller);
    await POST(makeNextRequest(sellerBody));
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

  it('registration still succeeds (201) even if enqueueing the confirmation email fails', async () => {
    prismaMock.seller.findUnique.mockResolvedValue(null);
    prismaMock.seller.create.mockResolvedValue(createdSeller);
    prismaMock.mailQueue.create.mockRejectedValue(new Error('DB down'));
    const res = await POST(makeNextRequest(sellerBody));
    expect(res.status).toBe(200);
    expect((await res.json()).sellerId).toBe(1000);
  });

  it('admin can bypass rate limit and registration periods', async () => {
    rateLimitMock.mockResolvedValue(false); // rate limit would block, but admin bypasses
    prismaMock.seller.findUnique.mockResolvedValue(null);
    prismaMock.seller.create.mockResolvedValue(createdSeller);
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    const res = await POST(makeNextRequest(validBody, adminToken()));
    expect(res.status).toBe(200);
  });

  it('returns 500 on DB error', async () => {
    prismaMock.basar.findUnique.mockRejectedValue(new Error('DB error'));
    const res = await POST(makeNextRequest(sellerBody));
    expect(res.status).toBe(500);
  });

  it('retries with a fresh sellerId on a sellerId collision (P2002, not email)', async () => {
    prismaMock.seller.findUnique.mockResolvedValue(null); // email not found
    prismaMock.seller.create
      .mockRejectedValueOnce({ code: 'P2002', meta: { target: ['sellerId'] } })
      .mockResolvedValueOnce(createdSeller);
    const res = await POST(makeNextRequest(sellerBody));
    expect(res.status).toBe(200);
    expect(prismaMock.seller.create).toHaveBeenCalledTimes(2);
    // Each retry allocates a fresh id via the atomic counter rather than recomputing from a scan
    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it('returns 400 when P2002 collision is on the email field', async () => {
    prismaMock.seller.findUnique.mockResolvedValue(null);
    prismaMock.seller.create.mockRejectedValue({ code: 'P2002', meta: { target: ['email'] } });
    const res = await POST(makeNextRequest(sellerBody));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/bereits registriert/i);
    // No pointless further retries once we know it's an email collision, not a sellerId one.
    expect(prismaMock.seller.create).toHaveBeenCalledTimes(1);
  });

  it('isEmployee is strictly coerced to boolean (truthy non-true values rejected)', async () => {
    prismaMock.seller.findUnique.mockResolvedValue(null);
    prismaMock.seller.create.mockResolvedValue(createdSeller);
    const res = await POST(makeNextRequest({ ...sellerBody, isEmployee: 'yes', isCashier: true }));
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
    it('allocates the id via one $queryRaw call wrapped in a $transaction (no more scanning all existing ids)', async () => {
      prismaMock.seller.findUnique.mockResolvedValue(null);
      prismaMock.seller.create.mockResolvedValue(createdSeller);
      await POST(makeNextRequest(sellerBody));
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
      expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1);
    });

    it('returns 400 "Alle Verkäufer-IDs sind vergeben" when the counter is exhausted', async () => {
      prismaMock.seller.findUnique.mockResolvedValue(null);
      mockAllocateSellerId(null); // WHERE "nextId" <= 9999 matches nothing → range exhausted
      const res = await POST(makeNextRequest(sellerBody));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/Alle Verkäufer-IDs sind vergeben/i);
      expect(prismaMock.seller.create).not.toHaveBeenCalled();
    });

    it('uses whatever id the counter returns, not a hardcoded value', async () => {
      prismaMock.seller.findUnique.mockResolvedValue(null);
      mockAllocateSellerId(4321);
      prismaMock.seller.create.mockResolvedValue({ ...createdSeller, sellerId: 4321 });
      const res = await POST(makeNextRequest(sellerBody));
      const data = await res.json();
      expect(data.sellerId).toBe(4321);
      expect(prismaMock.seller.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ sellerId: 4321 }) })
      );
    });
  });
});
