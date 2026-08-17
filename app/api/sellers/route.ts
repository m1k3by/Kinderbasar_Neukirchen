import { NextResponse } from 'next/server';
import { prisma } from '../../lib/prisma';
import { requireAdmin } from '../../lib/apiAuth';

// GET /api/sellers – admin-only listing of all sellers.
// Non-admin self-lookups now go through /api/me instead (this endpoint used to be
// requireAuth-only so every seller/employee page could fetch the full table just to find its
// own record – at 2000+ sellers, each row also carried qrCode/barcode base64 PNGs (~5-8 KB
// each) plus full nested taskSignups/cakes, so that "find myself" lookup could be tens of MB).
//
// Supports cursor pagination (?cursor=<sellerId>&limit=<n>, default 100, max 500) and an
// optional ?search= over firstName/lastName/email/sellerId.
export async function GET(request: Request) {
  try {
    const authResult = await requireAdmin();
    if (authResult.response) return authResult.response;

    const url = new URL(request.url);

    // Optional: join this basar's participation (isActive) per seller, for the
    // admin seller-list page's per-basar "Teilnahme" column/toggle.
    const basarId = url.searchParams.get('basarId')?.trim() || undefined;

    const cursorParam = url.searchParams.get('cursor');
    const cursor = cursorParam !== null ? parseInt(cursorParam, 10) : null;
    if (cursorParam !== null && (cursor === null || isNaN(cursor))) {
      return NextResponse.json({ error: 'Ungültiger cursor' }, { status: 400 });
    }

    const limitParam = url.searchParams.get('limit');
    const parsedLimit = limitParam !== null ? parseInt(limitParam, 10) : 100;
    const limit = Math.min(Math.max(Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 100, 1), 500);

    const search = url.searchParams.get('search')?.trim();
    const searchAsId = search && /^\d+$/.test(search) ? parseInt(search, 10) : undefined;

    const where = search
      ? {
          OR: [
            { firstName: { contains: search, mode: 'insensitive' as const } },
            { lastName: { contains: search, mode: 'insensitive' as const } },
            { email: { contains: search, mode: 'insensitive' as const } },
            ...(searchAsId !== undefined ? [{ sellerId: searchAsId }] : []),
          ],
        }
      : {};

    const rows = await prisma.seller.findMany({
      where,
      select: {
        sellerId: true,
        firstName: true,
        lastName: true,
        email: true,
        isEmployee: true,
        isCashier: true,
        createdAt: true,
        _count: { select: { taskSignups: true, cakes: true } },
        ...(basarId
          ? {
              basarSellers: {
                where: { basarId },
                // termsAcceptedAt/-Version: Nachweis der Zustimmung zu AGB und
                // Datenschutzerklärung, damit der Admin in der Verkäuferliste sieht, wer
                // wann welcher Fassung zugestimmt hat – und wer gar nicht.
                select: {
                  isActive: true,
                  activatedAt: true,
                  termsAcceptedAt: true,
                  termsVersion: true,
                  privacyVersion: true,
                },
              },
            }
          : {}),
      },
      orderBy: { sellerId: 'asc' },
      take: limit + 1,
      ...(cursor !== null ? { cursor: { sellerId: cursor }, skip: 1 } : {}),
    });

    let nextCursor: number | null = null;
    if (rows.length > limit) {
      const next = rows.pop();
      nextCursor = next!.sellerId;
    }

    // Flatten basarSellers[0] into a single field so the client doesn't need to
    // know about the relation shape.
    type ParticipationRow = {
      isActive: boolean;
      activatedAt: Date | null;
      termsAcceptedAt: Date | null;
      termsVersion: string | null;
      privacyVersion: string | null;
    };

    const sellers = basarId
      ? rows.map((r) => {
          const { basarSellers, ...rest } = r as typeof r & { basarSellers?: ParticipationRow[] };
          return { ...rest, participation: basarSellers?.[0] ?? null };
        })
      : rows;

    return NextResponse.json({ sellers, nextCursor });
  } catch (error: any) {
    console.error('Error fetching sellers:', error);
    return NextResponse.json(
      { error: 'Fehler beim Laden der Verkäufer' },
      { status: 500 }
    );
  }
}
