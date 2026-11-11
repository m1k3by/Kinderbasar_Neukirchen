import { NextResponse } from 'next/server';
import { requireAdmin } from '@/app/lib/apiAuth';
import { prisma } from '@/app/lib/prisma';
import { readPdf, validateBody, validateTitle } from '@/app/lib/posts';

export async function GET() {
  const { response } = await requireAdmin();
  if (response) return response;
  try {
    // fileData nie mitschicken: bis zu 4 MB je Zeile.
    const rows = await prisma.post.findMany({
      orderBy: { createdAt: 'desc' },
      select: { id: true, title: true, body: true, fileName: true, isPublished: true, publishedAt: true, createdAt: true },
    });
    return NextResponse.json({ posts: rows.map(p => ({ ...p, hasFile: p.fileName !== null })) });
  } catch (error) {
    console.error('GET /api/admin/posts error:', error);
    return NextResponse.json({ error: 'Beiträge konnten nicht geladen werden' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { response } = await requireAdmin();
  if (response) return response;
  try {
    const form = await request.formData();
    const title = String(form.get('title') ?? '').trim();
    const body = String(form.get('body') ?? '').trim();
    const publish = form.get('isPublished') === 'true';
    const bad = validateTitle(title) ?? validateBody(body);
    if (bad) return NextResponse.json({ error: bad }, { status: 400 });

    let file: { fileName: string; fileData: Uint8Array<ArrayBuffer> } | null = null;
    const upload = form.get('file');
    if (upload instanceof File && upload.size > 0) {
      const pdf = await readPdf(upload);
      if (!pdf.ok) return NextResponse.json({ error: pdf.error }, { status: 400 });
      file = { fileName: pdf.fileName, fileData: pdf.data };
    }

    const post = await prisma.post.create({
      data: {
        title,
        body,
        fileName: file?.fileName ?? null,
        fileData: file?.fileData ?? null,
        isPublished: publish,
        publishedAt: publish ? new Date() : null,
      },
      select: { id: true },
    });
    return NextResponse.json({ id: post.id }, { status: 201 });
  } catch (error) {
    console.error('POST /api/admin/posts error:', error);
    return NextResponse.json({ error: 'Beitrag konnte nicht gespeichert werden' }, { status: 500 });
  }
}
