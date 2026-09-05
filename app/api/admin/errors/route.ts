import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { requireAdmin } from '../../../lib/apiAuth';

const LIST_LIMIT = 200;

/**
 * GET /api/admin/errors
 *   ?count=1 → nur `{ unresolved }` für die Zahl in der Navigation (app/components/Header).
 *   sonst    → die letzten Zeilen plus Kennzahlen, gelesen von app/admin/logs.
 */
export async function GET(request: Request) {
  try {
    const authResult = await requireAdmin();
    if (authResult.response) return authResult.response;

    if (new URL(request.url).searchParams.get('count') === '1') {
      const unresolved = await prisma.errorLog.count({ where: { resolved: false } });
      return NextResponse.json({ unresolved });
    }

    const [logs, total, unresolved, clientErrors] = await Promise.all([
      prisma.errorLog.findMany({ orderBy: { createdAt: 'desc' }, take: LIST_LIMIT }),
      prisma.errorLog.count(),
      prisma.errorLog.count({ where: { resolved: false } }),
      prisma.errorLog.count({ where: { source: 'CLIENT' } }),
    ]);

    return NextResponse.json({ logs, aggregates: { total, unresolved, clientErrors } });
  } catch (error) {
    console.error('GET /api/admin/errors error:', error);
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 });
  }
}

/** PATCH /api/admin/errors – einen Eintrag als erledigt (oder wieder offen) markieren. */
export async function PATCH(request: Request) {
  try {
    const authResult = await requireAdmin();
    if (authResult.response) return authResult.response;

    const { id, resolved } = await request.json();
    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: 'id ist erforderlich' }, { status: 400 });
    }
    if (typeof resolved !== 'boolean') {
      return NextResponse.json({ error: 'resolved muss ein Boolean sein' }, { status: 400 });
    }

    const updated = await prisma.errorLog.update({ where: { id }, data: { resolved } });
    return NextResponse.json({ id: updated.id, resolved: updated.resolved });
  } catch (error) {
    console.error('PATCH /api/admin/errors error:', error);
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/errors?resolved=1 – die erledigten Einträge löschen.
 *
 * Ohne den Parameter wird alles gelöscht. Das `where` ist deshalb Pflicht und wird nicht
 * weggelassen: ein `deleteMany({})` sieht im Erfolgsfall genauso aus wie das Gewollte.
 */
export async function DELETE(request: Request) {
  try {
    const authResult = await requireAdmin();
    if (authResult.response) return authResult.response;

    const onlyResolved = new URL(request.url).searchParams.get('resolved') === '1';
    const result = await prisma.errorLog.deleteMany({
      where: onlyResolved ? { resolved: true } : {},
    });

    return NextResponse.json({ deleted: result.count });
  } catch (error) {
    console.error('DELETE /api/admin/errors error:', error);
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 });
  }
}
