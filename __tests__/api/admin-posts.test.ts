import { describe, it, expect, vi, beforeEach } from 'vitest';
import { adminToken, sellerToken } from '../helpers/tokens';

const cookiesGetMock = vi.hoisted(() => vi.fn());
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve({ get: cookiesGetMock })),
}));

const prismaMock = vi.hoisted(() => ({
  post: { findMany: vi.fn(), create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
}));
vi.mock('@/app/lib/prisma', () => ({ prisma: prismaMock }));

import { GET, POST } from '@/app/api/admin/posts/route';
import { PATCH, DELETE } from '@/app/api/admin/posts/[id]/route';

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a]); // %PDF-1.4

const ascii = (s: string) => [...s].map(c => c.charCodeAt(0));
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
const GIF = new Uint8Array(ascii('GIF89a') .concat([0, 0]));
const WEBP = new Uint8Array([...ascii('RIFF'), 1, 2, 3, 4, ...ascii('WEBP')]);
const ZIP = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0]);
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function form(fields: Record<string, string | File>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}
const req = (method: string, body?: FormData) =>
  new Request('http://localhost/api/admin/posts', { method, body });
const ctx = { params: Promise.resolve({ id: 'p1' }) };

beforeEach(() => {
  vi.clearAllMocks();
  cookiesGetMock.mockReturnValue({ value: adminToken() });
  prismaMock.post.findMany.mockResolvedValue([
    { id: 'p1', title: 'T', body: 'B', fileName: 'a.pdf', fileType: 'application/pdf', isPublished: true, publishedAt: null, createdAt: new Date() },
    { id: 'p2', title: 'T2', body: 'B', fileName: null, isPublished: false, publishedAt: null, createdAt: new Date() },
  ]);
  prismaMock.post.create.mockResolvedValue({ id: 'new' });
  prismaMock.post.findUnique.mockResolvedValue({ publishedAt: null });
  prismaMock.post.update.mockResolvedValue({ id: 'p1' });
  prismaMock.post.delete.mockResolvedValue({ id: 'p1' });
});

describe('Auth', () => {
  it('401 ohne Token, nichts wird geschrieben', async () => {
    cookiesGetMock.mockReturnValue(undefined);
    expect((await GET()).status).toBe(401);
    expect((await POST(req('POST', form({ title: 'x', body: '' })))).status).toBe(401);
    expect((await DELETE(req('DELETE'), ctx)).status).toBe(401);
    expect(prismaMock.post.create).not.toHaveBeenCalled();
    expect(prismaMock.post.delete).not.toHaveBeenCalled();
  });

  it('403 für Verkäufer, nichts wird geschrieben', async () => {
    cookiesGetMock.mockReturnValue({ value: sellerToken(1234) });
    expect((await GET()).status).toBe(403);
    expect((await POST(req('POST', form({ title: 'x', body: '' })))).status).toBe(403);
    expect((await PATCH(req('PATCH', form({ title: 'x' })), ctx)).status).toBe(403);
    expect(prismaMock.post.create).not.toHaveBeenCalled();
    expect(prismaMock.post.update).not.toHaveBeenCalled();
  });
});

describe('GET /api/admin/posts', () => {
  it('selektiert fileData nie und liefert hasFile', async () => {
    const res = await GET();
    const arg = prismaMock.post.findMany.mock.calls[0][0];
    expect(arg.select.fileData).toBeUndefined();
    expect(arg.select.fileName).toBe(true);
    expect(arg.select.fileType).toBe(true);
    const { posts } = await res.json();
    expect(posts.map((p: { hasFile: boolean }) => p.hasFile)).toEqual([true, false]);
  });
});

describe('POST /api/admin/posts', () => {
  it('legt veröffentlichten Beitrag mit PDF an', async () => {
    const file = new File([PDF], 'spenden.pdf', { type: 'application/pdf' });
    const res = await POST(req('POST', form({ title: ' Spenden ', body: 'Text', isPublished: 'true', file })));
    expect(res.status).toBe(201);
    const data = prismaMock.post.create.mock.calls[0][0].data;
    expect(data.title).toBe('Spenden');
    expect(data.isPublished).toBe(true);
    expect(data.publishedAt).toBeInstanceOf(Date);
    expect(data.fileName).toBe('spenden.pdf');
    expect(data.fileType).toBe('application/pdf');
    expect(Buffer.from(data.fileData)).toEqual(Buffer.from(PDF));
  });

  it('Entwurf ohne Datei: publishedAt, fileName und fileData null', async () => {
    await POST(req('POST', form({ title: 'A', body: '' })));
    expect(prismaMock.post.create.mock.calls[0][0].data).toMatchObject({
      isPublished: false,
      publishedAt: null,
      fileName: null,
      fileData: null,
      fileType: null,
    });
  });

  it.each([
    ['PNG', PNG, 'a.png', 'image/png'],
    ['JPEG', JPEG, 'a.jpg', 'image/jpeg'],
    ['GIF', GIF, 'a.gif', 'image/gif'],
    ['WebP', WEBP, 'a.webp', 'image/webp'],
    ['docx', ZIP, 'a.docx', DOCX_MIME],
    ['xlsx', ZIP, 'a.XLSX', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    ['pptx', ZIP, 'a.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  ])('%s wird mit erkanntem fileType gespeichert', async (_n, bytes, name, mime) => {
    // Client meldet bewusst einen falschen Typ: gespeichert wird, was die Bytes sagen.
    const file = new File([bytes], name, { type: 'application/octet-stream' });
    expect((await POST(req('POST', form({ title: 'A', body: '', file })))).status).toBe(201);
    const data = prismaMock.post.create.mock.calls[0][0].data;
    expect(data.fileType).toBe(mime);
    expect(Buffer.from(data.fileData)).toEqual(Buffer.from(bytes));
  });

  it.each([
    ['SVG', new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'a.svg', 'image/svg+xml'],
    ['HTML', new TextEncoder().encode('<html><script>1</script></html>'), 'a.html', 'text/html'],
    ['HTML, als image/png gemeldet', new TextEncoder().encode('<html>boom</html>'), 'a.png', 'image/png'],
    ['ZIP mit Endung .zip', ZIP, 'a.zip', 'application/zip'],
  ])('%s -> 400, create nicht aufgerufen', async (_n, bytes, name, mime) => {
    const file = new File([bytes], name, { type: mime });
    const res = await POST(req('POST', form({ title: 'A', body: '', file })));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('nicht erlaubt');
    expect(prismaMock.post.create).not.toHaveBeenCalled();
  });

  it.each([
    [
      'falsche Magic Bytes',
      () => new File([new TextEncoder().encode('<html>boom</html>')], 'a.pdf', { type: 'application/pdf' }),
    ],
    [
      'größer als 4 MB',
      () => new File([new Uint8Array(4 * 1024 * 1024 + 1).fill(0x25)], 'a.pdf', { type: 'application/pdf' }),
    ],
  ])('%s -> 400, create nicht aufgerufen', async (_n, mk) => {
    const res = await POST(req('POST', form({ title: 'A', body: '', file: mk() })));
    expect(res.status).toBe(400);
    expect(prismaMock.post.create).not.toHaveBeenCalled();
  });

  it('leerer Titel und zu langer Text -> 400', async () => {
    expect((await POST(req('POST', form({ title: ' ', body: '' })))).status).toBe(400);
    expect((await POST(req('POST', form({ title: 'A', body: 'x'.repeat(5001) })))).status).toBe(400);
    expect(prismaMock.post.create).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/admin/posts/[id]', () => {
  it('erstes Veröffentlichen setzt publishedAt', async () => {
    await PATCH(req('PATCH', form({ isPublished: 'true' })), ctx);
    const arg = prismaMock.post.update.mock.calls[0][0];
    expect(arg.where).toEqual({ id: 'p1' });
    expect(arg.data.isPublished).toBe(true);
    expect(arg.data.publishedAt).toBeInstanceOf(Date);
  });

  it('erneutes Veröffentlichen behält publishedAt', async () => {
    prismaMock.post.findUnique.mockResolvedValue({ publishedAt: new Date('2026-01-01') });
    await PATCH(req('PATCH', form({ isPublished: 'true' })), ctx);
    expect(prismaMock.post.update.mock.calls[0][0].data).toEqual({ isPublished: true });
  });

  it('Zurückziehen lässt publishedAt unberührt', async () => {
    await PATCH(req('PATCH', form({ isPublished: 'false' })), ctx);
    expect(prismaMock.post.update.mock.calls[0][0].data).toEqual({ isPublished: false });
  });

  it('removeFile leert fileName, fileData und fileType', async () => {
    await PATCH(req('PATCH', form({ removeFile: 'true' })), ctx);
    expect(prismaMock.post.update.mock.calls[0][0].data).toEqual({ fileName: null, fileData: null, fileType: null });
  });

  it('PATCH mit PNG speichert fileType', async () => {
    const png = new File([PNG], 'a.png', { type: 'image/png' });
    await PATCH(req('PATCH', form({ file: png })), ctx);
    expect(prismaMock.post.update.mock.calls[0][0].data).toMatchObject({ fileName: 'a.png', fileType: 'image/png' });
  });

  it('ungültige Datei -> 400 ohne update', async () => {
    const bad = new File([new TextEncoder().encode('nope')], 'a.pdf', { type: 'application/pdf' });
    expect((await PATCH(req('PATCH', form({ file: bad })), ctx)).status).toBe(400);
    expect(prismaMock.post.update).not.toHaveBeenCalled();
  });

  it('unbekannte id -> 404', async () => {
    prismaMock.post.findUnique.mockResolvedValue(null);
    expect((await PATCH(req('PATCH', form({ title: 'x' })), ctx)).status).toBe(404);
    expect(prismaMock.post.update).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/admin/posts/[id]', () => {
  it('löscht genau diese id', async () => {
    expect((await DELETE(req('DELETE'), ctx)).status).toBe(200);
    expect(prismaMock.post.delete).toHaveBeenCalledWith({ where: { id: 'p1' } });
  });
});
