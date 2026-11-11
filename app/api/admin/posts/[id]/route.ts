import { NextResponse } from 'next/server';
import { requireAdmin } from '@/app/lib/apiAuth';
import { prisma } from '@/app/lib/prisma';
import { readPdf, validateBody, validateTitle } from '@/app/lib/posts';

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Ctx) {
  const { response } = await requireAdmin();
  if (response) return response;
  try {
    const { id } = await params;
    const existing = await prisma.post.findUnique({ where: { id }, select: { publishedAt: true } });
    if (!existing) return NextResponse.json({ error: 'Beitrag nicht gefunden' }, { status: 404 });

    const form = await request.formData();
    const data: Record<string, unknown> = {};

    if (form.has('title')) {
      const title = String(form.get('title')).trim();
      const bad = validateTitle(title);
      if (bad) return NextResponse.json({ error: bad }, { status: 400 });
      data.title = title;
    }
    if (form.has('body')) {
      const body = String(form.get('body')).trim();
      const bad = validateBody(body);
      if (bad) return NextResponse.json({ error: bad }, { status: 400 });
      data.body = body;
    }
    if (form.has('isPublished')) {
      const publish = form.get('isPublished') === 'true';
      data.isPublished = publish;
      // Datum des ersten Veröffentlichens bleibt beim Zurückziehen und Wiederveröffentlichen erhalten.
      if (publish && !existing.publishedAt) data.publishedAt = new Date();
    }
    const upload = form.get('file');
    if (upload instanceof File && upload.size > 0) {
      const pdf = await readPdf(upload);
      if (!pdf.ok) return NextResponse.json({ error: pdf.error }, { status: 400 });
      data.fileName = pdf.fileName;
      data.fileData = pdf.data;
    } else if (form.get('removeFile') === 'true') {
      data.fileName = null;
      data.fileData = null;
    }

    await prisma.post.update({ where: { id }, data, select: { id: true } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('PATCH /api/admin/posts/[id] error:', error);
    return NextResponse.json({ error: 'Beitrag konnte nicht gespeichert werden' }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: Ctx) {
  const { response } = await requireAdmin();
  if (response) return response;
  try {
    const { id } = await params;
    await prisma.post.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('DELETE /api/admin/posts/[id] error:', error);
    return NextResponse.json({ error: 'Beitrag konnte nicht gelöscht werden' }, { status: 500 });
  }
}
