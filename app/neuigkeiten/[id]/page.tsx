import Link from 'next/link';
import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import type { Metadata } from 'next';
import { prisma } from '../../lib/prisma';
import { fileTypeLabel, fileTypeOrPdf, isImageType } from '../../lib/posts';

export const dynamic = 'force-dynamic';

// Eigene Seite je Beitrag, Ziel des <link> im RSS-Feed. Vorher zeigte der Feed auf die
// Startseite (/#post-…): Feed-Widgets, die eine Vorschau von der verlinkten Seite holen,
// nahmen dort den größten Textblock („Hinweise“) und irgendein Bild – nicht den Beitrag.
// Öffentlich ohne Login, nur veröffentlichte Beiträge.
async function load(id: string) {
  return prisma.post.findFirst({
    where: { id, isPublished: true },
    select: { id: true, title: true, body: true, fileName: true, fileType: true, publishedAt: true },
  });
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const post = await load((await params).id);
  if (!post) return {};
  const description = post.body.slice(0, 300);
  // Absolut wie im Feed (Origin aus dem Request): ohne metadataBase setzte Next sonst localhost ein.
  const h = await headers();
  const origin = `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('x-forwarded-host') ?? h.get('host')}`;
  const image = post.fileName && isImageType(fileTypeOrPdf(post.fileType)) ? `${origin}/api/posts/${post.id}/datei` : undefined;
  return {
    title: `${post.title} – Kinderbasar Neukirchen`,
    description,
    openGraph: { title: post.title, description, type: 'article', ...(image ? { images: [image] } : {}) },
  };
}

export default async function NeuigkeitPage({ params }: { params: Promise<{ id: string }> }) {
  const post = await load((await params).id);
  if (!post) notFound();
  const type = fileTypeOrPdf(post.fileType);
  const fileUrl = `/api/posts/${post.id}/datei`;

  return (
    <div className="basar-background">
      <div className="basar-content">
        <header className="sticky top-0 z-50 bg-yellow-500 text-gray-800 p-4 shadow-md">
          <div className="max-w-6xl mx-auto">
            <Link href="/" className="text-2xl font-bold hover:underline">Kinderbasar Neukirchen</Link>
          </div>
        </header>
        <div className="max-w-3xl mx-auto p-8">
          <article className="bg-white/90 backdrop-blur-sm rounded-lg shadow-lg p-6">
            {post.publishedAt && (
              <p className="text-xs text-gray-500">
                {post.publishedAt.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Berlin' })}
              </p>
            )}
            <h1 className="text-xl font-semibold text-gray-800">{post.title}</h1>
            <p className="mt-2 text-sm text-gray-700 whitespace-pre-line">{post.body}</p>
            {post.fileName && isImageType(type) && (
              // eslint-disable-next-line @next/next/no-img-element -- eigene API-Route, Größe unbekannt: next/image bringt hier nichts
              <img src={fileUrl} alt={post.title} className="mt-3 max-h-[32rem] rounded-md" />
            )}
            {post.fileName && (
              <a href={fileUrl} target="_blank" rel="noopener" className="mt-2 inline-block text-sm text-blue-700 hover:underline">
                {post.fileName} ({fileTypeLabel(type)})
              </a>
            )}
          </article>
          <p className="mt-4 text-sm">
            <Link href="/" className="text-blue-700 hover:underline">← Zur Startseite</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
