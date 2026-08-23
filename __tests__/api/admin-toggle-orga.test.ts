import { describe, it, expect, vi, beforeEach } from 'vitest';
import { adminToken, sellerToken } from '../helpers/tokens';

const cookiesGetMock = vi.hoisted(() => vi.fn());
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve({ get: cookiesGetMock })),
}));

const prismaMock = vi.hoisted(() => ({
  seller: { findUnique: vi.fn(), update: vi.fn() },
}));
vi.mock('@/app/lib/prisma', () => ({ prisma: prismaMock }));

import { POST } from '@/app/api/admin/toggle-orga-status/route';

function makeRequest(body: object) {
  return new Request('http://localhost/api/admin/toggle-orga-status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/admin/toggle-orga-status', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when no token', async () => {
    cookiesGetMock.mockReturnValue(undefined);
    expect((await POST(makeRequest({ sellerId: 1234 }))).status).toBe(401);
  });

  it('returns 403 for non-admin', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    expect((await POST(makeRequest({ sellerId: 1234 }))).status).toBe(403);
  });

  it('returns 400 when sellerId missing', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    expect((await POST(makeRequest({}))).status).toBe(400);
  });

  it('returns 404 when seller not found', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.seller.findUnique.mockResolvedValue(null);
    expect((await POST(makeRequest({ sellerId: 9999 }))).status).toBe(404);
  });

  // Orga ist ein Zusatz zum Mitarbeiter. Ohne diese Sperre bekäme ein reiner Verkäufer über
  // einen einzigen Klick unbegrenzt Artikel und wäre in jedem Basar angemeldet – genau die
  // beiden Grenzen, für die es die Verkäuferrolle gibt.
  it('lehnt einen reinen Verkäufer ab und schreibt nichts', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.seller.findUnique.mockResolvedValue({ sellerId: 1234, isEmployee: false, isOrga: false });
    const res = await POST(makeRequest({ sellerId: 1234 }));
    expect(res.status).toBe(400);
    expect(prismaMock.seller.update).not.toHaveBeenCalled();
  });

  it('setzt das Kennzeichen für einen Mitarbeiter', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.seller.findUnique.mockResolvedValue({ sellerId: 1234, isEmployee: true, isOrga: false });
    prismaMock.seller.update.mockResolvedValue({ sellerId: 1234, isOrga: true });
    const res = await POST(makeRequest({ sellerId: 1234 }));
    expect(res.status).toBe(200);
    expect((await res.json()).isOrga).toBe(true);
    expect(prismaMock.seller.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isOrga: true } })
    );
  });

  it('entfernt das Kennzeichen wieder', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.seller.findUnique.mockResolvedValue({ sellerId: 1234, isEmployee: true, isOrga: true });
    prismaMock.seller.update.mockResolvedValue({ sellerId: 1234, isOrga: false });
    const res = await POST(makeRequest({ sellerId: 1234 }));
    expect((await res.json()).isOrga).toBe(false);
    expect(prismaMock.seller.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isOrga: false } })
    );
  });

  // Sonst wäre ein Altbestand mit isOrga=true, aber isEmployee=false, nicht mehr abschaltbar:
  // die Sperre für Verkäufer würde das Entfernen mitblockieren.
  it('lässt das Entfernen auch zu, wenn die Person kein Mitarbeiter mehr ist', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.seller.findUnique.mockResolvedValue({ sellerId: 1234, isEmployee: false, isOrga: true });
    prismaMock.seller.update.mockResolvedValue({ sellerId: 1234, isOrga: false });
    const res = await POST(makeRequest({ sellerId: 1234 }));
    expect(res.status).toBe(200);
    expect((await res.json()).isOrga).toBe(false);
  });

  it('accepts string sellerId', async () => {
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.seller.findUnique.mockResolvedValue({ sellerId: 1234, isEmployee: true, isOrga: false });
    prismaMock.seller.update.mockResolvedValue({ sellerId: 1234, isOrga: true });
    expect((await POST(makeRequest({ sellerId: '1234' }))).status).toBe(200);
  });
});
