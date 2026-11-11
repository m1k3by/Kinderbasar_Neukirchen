import { prisma } from '@/app/lib/prisma';

// Öffentlich, ohne Login – bewusst nicht im matcher von middleware.ts. Nur veröffentlichte Beiträge.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const post = await prisma.post.findUnique({
      where: { id },
      select: { isPublished: true, fileName: true, fileData: true },
    });
    if (!post || !post.isPublished || !post.fileData) {
      return new Response('Nicht gefunden', { status: 404 });
    }
    const safeName = (post.fileName ?? 'datei.pdf').replace(/[^A-Za-z0-9._-]/g, '_');
    return new Response(new Uint8Array(post.fileData), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${safeName}"`,
        // Jedes Mal beim Server nachfragen: mit max-age lieferte der Browser ein zurückgezogenes
        // PDF noch minutenlang aus dem Cache (im Klicktest am 11.11.2026 gemessen).
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error) {
    console.error('GET /api/posts/[id]/datei error:', error);
    return new Response('Fehler', { status: 500 });
  }
}
