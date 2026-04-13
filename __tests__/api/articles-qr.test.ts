import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sellerToken } from '../helpers/tokens';

// ─── next/headers mock ────────────────────────────────────────────────────────
const cookiesGetMock = vi.hoisted(() => vi.fn());
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve({ get: cookiesGetMock })),
}));

// ─── Prisma mock ──────────────────────────────────────────────────────────────
const prismaMock = vi.hoisted(() => ({
  article: { findFirst: vi.fn() },
}));
vi.mock('@/app/lib/prisma', () => ({ prisma: prismaMock }));

// ─── QRCode mock ──────────────────────────────────────────────────────────────
const qrToBufferMock = vi.hoisted(() => vi.fn().mockResolvedValue(Buffer.from('PNG_DATA')));
vi.mock('qrcode', () => ({ default: { toBuffer: qrToBufferMock } }));

import { GET } from '@/app/api/articles/[qrCode]/qr/route';

function makeContext(qrCode = 'QR_1234') {
  return { params: Promise.resolve({ qrCode }) };
}

describe('GET /api/articles/[qrCode]/qr', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when no token', async () => {
    cookiesGetMock.mockReturnValue(undefined);
    const res = await GET(new Request('http://localhost/api/articles/QR_1234/qr'), makeContext());
    expect(res.status).toBe(401);
  });

  it('returns 404 when article not found', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.article.findFirst.mockResolvedValue(null);
    const res = await GET(new Request('http://localhost/api/articles/QR_1234/qr'), makeContext());
    expect(res.status).toBe(404);
  });

  it('returns PNG buffer for valid article → 200', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.article.findFirst.mockResolvedValue({ id: 'art-1', qrCode: 'QR_1234' });
    const res = await GET(new Request('http://localhost/api/articles/QR_1234/qr'), makeContext());
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/png');
  });

  it('returns 500 on error', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    prismaMock.article.findFirst.mockRejectedValue(new Error('DB error'));
    const res = await GET(new Request('http://localhost/api/articles/QR_1234/qr'), makeContext());
    expect(res.status).toBe(500);
  });
});
