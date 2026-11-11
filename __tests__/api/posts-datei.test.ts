import { describe, it, expect, vi, beforeEach } from 'vitest';

const prismaMock = vi.hoisted(() => ({ post: { findUnique: vi.fn() } }));
vi.mock('@/app/lib/prisma', () => ({ prisma: prismaMock }));

import { GET } from '@/app/api/posts/[id]/datei/route';

const call = () => GET(new Request('http://localhost/api/posts/p1/datei'), { params: Promise.resolve({ id: 'p1' }) });
const bytes = Buffer.from('%PDF-1.4 test');

beforeEach(() => vi.clearAllMocks());

describe('GET /api/posts/[id]/datei', () => {
  it('unveröffentlicht -> 404, keine Bytes', async () => {
    prismaMock.post.findUnique.mockResolvedValue({ isPublished: false, fileName: 'a.pdf', fileData: bytes });
    const res = await call();
    expect(res.status).toBe(404);
    expect(res.headers.get('Content-Type')).not.toBe('application/pdf');
  });

  it('unbekannt oder ohne Datei -> 404', async () => {
    prismaMock.post.findUnique.mockResolvedValue(null);
    expect((await call()).status).toBe(404);
    prismaMock.post.findUnique.mockResolvedValue({ isPublished: true, fileName: null, fileData: null });
    expect((await call()).status).toBe(404);
  });

  it('veröffentlicht -> 200 mit PDF-Bytes und sicherem Dateinamen', async () => {
    prismaMock.post.findUnique.mockResolvedValue({ isPublished: true, fileName: 'Spenden Übersicht"x.pdf', fileData: bytes });
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
    expect(res.headers.get('Content-Disposition')).toBe('inline; filename="Spenden__bersicht_x.pdf"');
    expect(res.headers.get('Cache-Control')).toBe('no-cache');
    expect(Buffer.from(await res.arrayBuffer())).toEqual(bytes);
    expect(prismaMock.post.findUnique.mock.calls[0][0].where).toEqual({ id: 'p1' });
  });
});
