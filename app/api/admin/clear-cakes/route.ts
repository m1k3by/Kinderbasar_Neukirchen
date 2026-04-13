import { NextResponse, NextRequest } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { verifyToken } from '../../../lib/auth';

export async function POST(request: NextRequest) {
  const token = request.cookies.get('token')?.value;
  if (!token) return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 });
  try {
    const decoded = verifyToken(token) as { role?: string };
    if (decoded.role !== 'admin') return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 403 });
  } catch {
    return NextResponse.json({ error: 'Ungültiger Token' }, { status: 401 });
  }

  try {
    // Delete all cakes
    const result = await prisma.cake.deleteMany({});

    return NextResponse.json({
      message: `Alle Kuchen wurden gelöscht. ${result.count} Einträge entfernt.`,
      count: result.count,
    });
  } catch (error: any) {
    console.error('Error clearing cakes:', error);
    return NextResponse.json(
      { error: 'Fehler beim Löschen der Kuchen: ' + error.message },
      { status: 500 }
    );
  }
}
