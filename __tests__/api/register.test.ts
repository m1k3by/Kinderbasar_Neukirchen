import { describe, it, expect, vi, beforeEach } from 'vitest';
import { adminToken } from '../helpers/tokens';

// ─── Mock rateLimit ───────────────────────────────────────────────────────────
const rateLimitMock = vi.hoisted(() => vi.fn().mockReturnValue(true));
vi.mock('@/app/lib/rateLimit', () => ({ rateLimit: rateLimitMock }));

// ─── Mock Prisma ──────────────────────────────────────────────────────────────
const prismaMock = vi.hoisted(() => ({
  settings: { findMany: vi.fn() },
  seller: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn() },
}));
vi.mock('@/app/lib/prisma', () => ({ prisma: prismaMock }));

// ─── Mock QR/barcode ─────────────────────────────────────────────────────────
const generateQRMock = vi.hoisted(() => vi.fn().mockResolvedValue('data:image/png;base64,qr'));
const generateBarcodeMock = vi.hoisted(() => vi.fn().mockResolvedValue('data:image/png;base64,bc'));
vi.mock('@/app/lib/qr', () => ({ generateQR: generateQRMock, generateBarcode: generateBarcodeMock }));

// ─── Mock sendMail ────────────────────────────────────────────────────────────
const sendMailMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock('@/app/lib/mail', () => ({ sendMail: sendMailMock }));

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

const validBody = { email: 'test@example.com', firstName: 'Max', lastName: 'Muster' };
const createdSeller = { sellerId: 1010, email: 'test@example.com', firstName: 'Max', lastName: 'Muster', isEmployee: false, qrCode: 'data:image/png;base64,qr', barcode: 'data:image/png;base64,bc', password: '$2b$10$hash' };

describe('POST /api/register', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rateLimitMock.mockReturnValue(true);
  });

  it('returns 400 when fields are missing', async () => {
    prismaMock.settings.findMany.mockResolvedValue([]);
    const res = await POST(makeNextRequest({ email: 'test@example.com' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Pflichtfelder/i);
  });

  it('returns 400 for invalid email format', async () => {
    prismaMock.settings.findMany.mockResolvedValue([]);
    const res = await POST(makeNextRequest({ email: 'notanemail', firstName: 'Max', lastName: 'Muster' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/E-Mail/i);
  });

  it('returns 429 when rate limit exceeded', async () => {
    rateLimitMock.mockReturnValue(false);
    prismaMock.settings.findMany.mockResolvedValue([]);
    const res = await POST(makeNextRequest(validBody));
    expect(res.status).toBe(429);
  });

  it('returns 400 when email already exists', async () => {
    prismaMock.settings.findMany.mockResolvedValue([]);
    prismaMock.seller.findUnique
      .mockResolvedValueOnce(null) // email lookup
      .mockResolvedValueOnce({ sellerId: 1234 }); // actually returns existing email
    prismaMock.seller.findUnique.mockResolvedValue({ sellerId: 1234, email: 'test@example.com' });
    const res = await POST(makeNextRequest(validBody));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/bereits registriert/i);
  });

  it('returns 403 when seller registration period closed', async () => {
    // Use format "YYYY-MM-DDTHH:MM" that parseAsGermanTime understands
    prismaMock.settings.findMany.mockResolvedValue([
      { key: 'registration_seller_start', value: '2020-01-01T00:00' },
      { key: 'registration_seller_end', value: '2020-01-02T00:00' },
    ]);
    const res = await POST(makeNextRequest(validBody));
    expect(res.status).toBe(403);
  });

  it('creates seller successfully and returns 201', async () => {
    prismaMock.settings.findMany.mockResolvedValue([]);
    prismaMock.seller.findUnique.mockResolvedValue(null); // email not found
    prismaMock.seller.findMany.mockResolvedValue([]); // no existing sellerId
    prismaMock.seller.create.mockResolvedValue(createdSeller);
    const res = await POST(makeNextRequest(validBody));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.sellerId).toBe(1010);
  });

  it('admin can bypass rate limit and registration periods', async () => {
    rateLimitMock.mockReturnValue(false); // rate limit would block, but admin bypasses
    const futureStart = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 16);
    const futureEnd = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 16);
    prismaMock.settings.findMany.mockResolvedValue([
      { key: 'registration_seller_start', value: futureStart },
      { key: 'registration_seller_end', value: futureEnd },
    ]);
    prismaMock.seller.findUnique.mockResolvedValue(null);
    prismaMock.seller.findMany.mockResolvedValue([]);
    prismaMock.seller.create.mockResolvedValue(createdSeller);
    const res = await POST(makeNextRequest(validBody, adminToken()));
    expect(res.status).toBe(200);
  });

  it('returns 500 on DB error', async () => {
    prismaMock.settings.findMany.mockRejectedValue(new Error('DB error'));
    const res = await POST(makeNextRequest(validBody));
    expect(res.status).toBe(500);
  });
});
