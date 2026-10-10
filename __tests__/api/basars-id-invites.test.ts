import { describe, it, expect, vi, beforeEach } from 'vitest';
import { adminToken, sellerToken } from '../helpers/tokens';

const cookiesGetMock = vi.hoisted(() => vi.fn());
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve({ get: cookiesGetMock })),
}));

const prismaMock = vi.hoisted(() => ({
  basar: { findUnique: vi.fn() },
  seller: { findMany: vi.fn() },
  basarInvite: { findMany: vi.fn(), createMany: vi.fn(), deleteMany: vi.fn() },
}));
vi.mock('@/app/lib/prisma', () => ({ prisma: prismaMock }));

import { GET, POST, DELETE } from '@/app/api/basars/[id]/invites/route';

const ctx = { params: Promise.resolve({ id: 'test-basar' }) };
const post = (body: object) => new Request('http://localhost/api/basars/test-basar/invites', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
const del = (q: string) => new Request(`http://localhost/api/basars/test-basar/invites${q}`, { method: 'DELETE' });

describe('/api/basars/[id]/invites', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cookiesGetMock.mockReturnValue({ value: adminToken() });
    prismaMock.basar.findUnique.mockResolvedValue({ isTest: true });
  });

  // ── Zugriff ────────────────────────────────────────────────────────────────
  it('nur der Admin – ein Verkäufer kann sich nicht selbst einladen', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1046) });
    expect((await POST(post({ sellerIds: [1046] }), ctx)).status).toBe(403);
    expect((await GET(new Request('http://localhost'), ctx)).status).toBe(403);
    expect((await DELETE(del('?sellerId=1046'), ctx)).status).toBe(403);
    expect(prismaMock.basarInvite.createMany).not.toHaveBeenCalled();
    expect(prismaMock.basarInvite.deleteMany).not.toHaveBeenCalled();
  });

  // ── Einladen ───────────────────────────────────────────────────────────────
  it('lädt bekannte Nummern ein und nennt unbekannte ausdrücklich', async () => {
    prismaMock.seller.findMany.mockResolvedValue([{ sellerId: 1001 }, { sellerId: 1046 }]);
    prismaMock.basarInvite.createMany.mockResolvedValue({ count: 2 });

    const res = await POST(post({ sellerIds: [1001, 1046, 9998] }), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ added: 2, unknown: [9998] });

    // Wirkung prüfen, nicht nur den Status: genau diese Einladungen, in genau diesen Basar.
    const args = prismaMock.basarInvite.createMany.mock.calls[0][0];
    expect(args.data).toEqual([
      { basarId: 'test-basar', sellerId: 1001 },
      { basarId: 'test-basar', sellerId: 1046 },
    ]);
    // Zweimal einladen ist kein Fehler.
    expect(args.skipDuplicates).toBe(true);
  });

  it('entfernt doppelte und unbrauchbare Einträge vor der Abfrage', async () => {
    prismaMock.seller.findMany.mockResolvedValue([{ sellerId: 1001 }]);
    prismaMock.basarInvite.createMany.mockResolvedValue({ count: 1 });
    await POST(post({ sellerIds: [1001, '1001', 'abc', -5, 0, 1.5] }), ctx);
    expect(prismaMock.seller.findMany.mock.calls[0][0].where).toEqual({ sellerId: { in: [1001] } });
  });

  it('ohne gültige Nummer: 400, nichts angelegt', async () => {
    expect((await POST(post({ sellerIds: ['abc'] }), ctx)).status).toBe(400);
    expect((await POST(post({}), ctx)).status).toBe(400);
    expect(prismaMock.basarInvite.createMany).not.toHaveBeenCalled();
  });

  it('in einen echten Basar einzuladen wird abgelehnt – die Einladung hätte keine Wirkung', async () => {
    prismaMock.basar.findUnique.mockResolvedValue({ isTest: false });
    const res = await POST(post({ sellerIds: [1001] }), ctx);
    expect(res.status).toBe(400);
    expect(prismaMock.basarInvite.createMany).not.toHaveBeenCalled();
  });

  it('unbekannter Basar: 404', async () => {
    prismaMock.basar.findUnique.mockResolvedValue(null);
    expect((await POST(post({ sellerIds: [1001] }), ctx)).status).toBe(404);
  });

  // ── Zurücknehmen ───────────────────────────────────────────────────────────
  it('nimmt genau diese eine Einladung in genau diesem Basar zurück', async () => {
    prismaMock.basarInvite.deleteMany.mockResolvedValue({ count: 1 });
    const res = await DELETE(del('?sellerId=1046'), ctx);
    expect(await res.json()).toEqual({ removed: 1 });
    // Ein deleteMany ohne basarId löschte die Einladungen aller Testbasare – und lieferte
    // dabei genauso 200. Deshalb das where wörtlich.
    expect(prismaMock.basarInvite.deleteMany.mock.calls[0][0]).toEqual({
      where: { basarId: 'test-basar', sellerId: 1046 },
    });
  });

  it('ohne sellerId: 400, nichts gelöscht', async () => {
    expect((await DELETE(del(''), ctx)).status).toBe(400);
    expect((await DELETE(del('?sellerId=abc'), ctx)).status).toBe(400);
    expect(prismaMock.basarInvite.deleteMany).not.toHaveBeenCalled();
  });

  // ── Liste ──────────────────────────────────────────────────────────────────
  it('listet nur die Einladungen dieses Basars, nach Nummer sortiert', async () => {
    prismaMock.basarInvite.findMany.mockResolvedValue([]);
    await GET(new Request('http://localhost'), ctx);
    const args = prismaMock.basarInvite.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ basarId: 'test-basar' });
    expect(args.orderBy).toEqual({ sellerId: 'asc' });
  });
});
