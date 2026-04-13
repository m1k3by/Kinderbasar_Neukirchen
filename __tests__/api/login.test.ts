import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

// ─── Prisma mock ────────────────────────────────────────────────────────────
const prismaMock = vi.hoisted(() => ({
  seller: {
    findUnique: vi.fn(),
  },
}));
vi.mock('@/app/lib/prisma', () => ({ prisma: prismaMock }));

// ─── bcrypt mock ─────────────────────────────────────────────────────────────
const bcryptCompareMock = vi.hoisted(() => vi.fn());
vi.mock('bcrypt', () => ({ default: { compare: bcryptCompareMock } }));

import { POST } from '@/app/api/login/route';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function makeRequest(body: object, ip = '127.0.0.1') {
  return new Request('http://localhost/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify(body),
  });
}

describe('POST /api/login', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bcryptCompareMock.mockResolvedValue(false);
  });

  it('logs in admin with correct credentials → 200 + role=admin', async () => {
    const req = makeRequest({ email: 'testadmin', password: 'test-admin-pass' });
    const res = await POST(req);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json).toMatchObject({ success: true, role: 'admin' });
  });

  it('admin login is case-insensitive', async () => {
    const req = makeRequest({ email: 'TESTADMIN', password: 'test-admin-pass' });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect((await res.json()).role).toBe('admin');
  });

  it('returns 401 for unknown email', async () => {
    prismaMock.seller.findUnique.mockResolvedValue(null);
    const res = await POST(makeRequest({ email: 'nobody@example.com', password: 'pw' }));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBeDefined();
  });

  it('returns 401 when seller has no password set', async () => {
    prismaMock.seller.findUnique.mockResolvedValue({ sellerId: 1001, email: 'a@b.com', password: null, isEmployee: false, isCashier: false });
    const res = await POST(makeRequest({ email: 'a@b.com', password: 'anything' }));
    expect(res.status).toBe(401);
  });

  it('returns 401 for wrong password', async () => {
    prismaMock.seller.findUnique.mockResolvedValue({ sellerId: 1001, email: 'a@b.com', password: 'hashed', isEmployee: false, isCashier: false });
    bcryptCompareMock.mockResolvedValue(false);
    const res = await POST(makeRequest({ email: 'a@b.com', password: 'wrong' }));
    expect(res.status).toBe(401);
  });

  it('logs in regular seller → 200 + role=seller + sellerId', async () => {
    prismaMock.seller.findUnique.mockResolvedValue({ sellerId: 1234, email: 'seller@test.de', password: 'hashed', isEmployee: false, isCashier: false });
    bcryptCompareMock.mockResolvedValue(true);
    const res = await POST(makeRequest({ email: 'seller@test.de', password: 'secret' }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json).toMatchObject({ success: true, role: 'seller', sellerId: 1234 });
  });

  it('logs in employee → 200 + role=employee', async () => {
    prismaMock.seller.findUnique.mockResolvedValue({ sellerId: 2000, email: 'emp@test.de', password: 'hashed', isEmployee: true, isCashier: false });
    bcryptCompareMock.mockResolvedValue(true);
    const res = await POST(makeRequest({ email: 'emp@test.de', password: 'secret' }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.role).toBe('employee');
  });

  it('returns 429 after 30 attempts from same IP', async () => {
    prismaMock.seller.findUnique.mockResolvedValue(null);
    const uniqueIp = `10.0.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
    // Exhaust the 30-attempt window
    for (let i = 0; i < 30; i++) {
      await POST(makeRequest({ email: `user${i}@test.de`, password: 'pw' }, uniqueIp));
    }
    const res = await POST(makeRequest({ email: 'x@test.de', password: 'pw' }, uniqueIp));
    expect(res.status).toBe(429);
  });

  it('returns 500 on prisma error', async () => {
    prismaMock.seller.findUnique.mockRejectedValue(new Error('DB down'));
    const res = await POST(makeRequest({ email: 'err@test.de', password: 'pw' }));
    expect(res.status).toBe(500);
  });
});
