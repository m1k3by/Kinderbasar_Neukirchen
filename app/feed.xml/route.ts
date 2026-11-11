import { prisma } from '@/app/lib/prisma';
import { fileTypeOrPdf } from '@/app/lib/posts';

export const dynamic = 'force-dynamic';

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

export async function GET(request: Request) {
  try {
    const origin = new URL(request.url).origin;
    // fileData wird nur für enclosure length mitgeladen (max. 20 Zeilen).
    // ponytail: bei großen Dateien stattdessen octet_length per $queryRaw.
    const posts = await prisma.post.findMany({
      where: { isPublished: true },
      orderBy: { publishedAt: 'desc' },
      take: 20,
      select: { id: true, title: true, body: true, fileType: true, fileData: true, publishedAt: true },
    });
    const items = posts
      .map(p => {
        const enclosure = p.fileData
          ? `\n      <enclosure url="${esc(`${origin}/api/posts/${p.id}/datei`)}" type="${esc(fileTypeOrPdf(p.fileType))}" length="${p.fileData.length}"/>`
          : '';
        return `    <item>
      <title>${esc(p.title)}</title>
      <description>${esc(p.body)}</description>
      <pubDate>${(p.publishedAt ?? new Date(0)).toUTCString()}</pubDate>
      <guid isPermaLink="false">${esc(p.id)}</guid>
      <link>${esc(`${origin}/#post-${p.id}`)}</link>${enclosure}
    </item>`;
      })
      .join('\n');
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Kinderbasar Neukirchen – Neuigkeiten</title>
    <link>${esc(origin)}/</link>
    <description>Neuigkeiten vom Kinderbasar Neukirchen</description>
    <language>de-de</language>
    <atom:link href="${esc(origin)}/feed.xml" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>
`;
    return new Response(xml, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } });
  } catch (error) {
    console.error('GET /feed.xml error:', error);
    return new Response('Fehler', { status: 500 });
  }
}
