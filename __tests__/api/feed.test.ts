import { describe, it, expect, vi, beforeEach } from 'vitest';

const prismaMock = vi.hoisted(() => ({ post: { findMany: vi.fn() } }));
vi.mock('@/app/lib/prisma', () => ({ prisma: prismaMock }));

import { GET } from '@/app/feed.xml/route';

const get = () => GET(new Request('https://basar.example/feed.xml'));

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.post.findMany.mockResolvedValue([
    {
      id: 'a1',
      title: `T <&> "'`,
      body: 'Zeile <b>1</b> & 2',
      fileData: Buffer.from('%PDF-xyz'),
      publishedAt: new Date('2026-11-01T10:00:00Z'),
    },
    { id: 'b2', title: 'Ohne Datei', body: 'x', fileData: null, publishedAt: new Date('2026-10-01T10:00:00Z') },
  ]);
});

describe('GET /feed.xml', () => {
  it('fragt nur veröffentlichte Beiträge ab, neueste 20', async () => {
    await get();
    const arg = prismaMock.post.findMany.mock.calls[0][0];
    expect(arg.where).toEqual({ isPublished: true });
    expect(arg.orderBy).toEqual({ publishedAt: 'desc' });
    expect(arg.take).toBe(20);
  });

  it('Content-Type RSS und absolute URLs', async () => {
    const res = await get();
    expect(res.headers.get('Content-Type')).toBe('application/rss+xml; charset=utf-8');
    const xml = await res.text();
    expect(xml).toContain('<rss version="2.0"');
    expect(xml).toContain('<atom:link href="https://basar.example/feed.xml" rel="self"');
    expect(xml).toContain('<link>https://basar.example/#post-a1</link>');
    expect(xml).toContain('<guid isPermaLink="false">a1</guid>');
    expect(xml).toContain('<pubDate>Sun, 01 Nov 2026 10:00:00 GMT</pubDate>');
  });

  it('escaped alle fünf Zeichen in Titel und Text', async () => {
    const xml = await (await get()).text();
    expect(xml).toContain('<title>T &lt;&amp;&gt; &quot;&apos;</title>');
    expect(xml).toContain('Zeile &lt;b&gt;1&lt;/b&gt; &amp; 2');
    expect(xml).not.toContain('<b>');
  });

  it('enclosure nur bei Datei, mit Länge', async () => {
    const xml = await (await get()).text();
    expect(xml.match(/<enclosure /g)).toHaveLength(1);
    expect(xml).toContain(
      '<enclosure url="https://basar.example/api/posts/a1/datei" type="application/pdf" length="8"/>',
    );
  });
});
