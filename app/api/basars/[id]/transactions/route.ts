import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '../../../../lib/prisma';
import { requireCashier } from '../../../../lib/apiAuth';
import { requireBasarAccess } from '../../../../lib/basarAccess';

// Gruppieren, Sortieren und Seitenschnitt laufen in Postgres: früher wurden die 5.000 neuesten
// Sale-Zeilen geladen und im Speicher gruppiert – ab 5.000 Verkäufen fehlten die ältesten
// Vorgänge stillschweigend (11.11.2026: ein Basar mit ~6.150). Jetzt lädt eine Seite nur
// ihre eigenen Positionen, egal wie groß der Basar ist.
// Ein Vorgang ist alles mit derselben clientTxId; Zeilen ohne clientTxId (Altbestand/
// Einzelverkauf) sind je ein eigener Vorgang mit Schlüssel `__single__<saleId>`.

// Höchstens sechs Wörter je Feld – schützt davor, dass ein eingefügter Absatz zu einer
// Abfrage mit hunderten UND-verknüpften LIKE-Bedingungen wird.
function tokenize(q: string | undefined): string[] {
  return q ? q.split(/\s+/).filter(Boolean).slice(0, 6) : [];
}

function asNumber(token: string): number | undefined {
  return /^\d+$/.test(token) ? parseInt(token, 10) : undefined;
}

// Teilwort-Suche ohne Groß-/Kleinschreibung; % und _ im Suchwort gelten wörtlich.
function like(token: string): string {
  return `%${token.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

// Felder, die zum Artikel gehören – einschließlich des Verkäufers, dem er gehört.
function articleClause(token: string): Prisma.Sql {
  const p = like(token);
  const n = asNumber(token);
  return Prisma.sql`(a."title" ILIKE ${p} OR a."qrCode" ILIKE ${p} OR a."sizeLabel" ILIKE ${p}
    OR vs."firstName" ILIKE ${p} OR vs."lastName" ILIKE ${p}${n !== undefined ? Prisma.sql` OR bs."sellerId" = ${n}` : Prisma.empty})`;
}

// Felder des Kassierers, der den Vorgang gescannt hat.
function cashierClause(token: string): Prisma.Sql {
  const p = like(token);
  const n = asNumber(token);
  return Prisma.sql`(c."firstName" ILIKE ${p} OR c."lastName" ILIKE ${p}${n !== undefined ? Prisma.sql` OR s."cashierId" = ${n}` : Prisma.empty})`;
}

// GET /api/basars/:id/transactions – Kassenvorgänge (gruppiert nach clientTxId) für die
// aufklappbare Kassierertabelle in der Admin-Statistik und die Verkaufsliste an der Kasse.
// Admin sieht alle Vorgänge (mit allen Filtern); ein Kassierer nur die eigenen – dafür wird
// cashierId serverseitig auf die eigene Nummer erzwungen, ein übergebener Wert zählt nicht.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authResult = await requireCashier();
    if (authResult.response) return authResult.response;
    const { auth } = authResult;
    const { id: basarId } = await params;
    const denied = await requireBasarAccess(auth, basarId);
    if (denied) return denied;
    const isAdmin = auth.role === 'admin';
    if (!isAdmin && !auth.sellerId) {
      return NextResponse.json({ error: 'Keine Kassierernummer im Login' }, { status: 403 });
    }

    const url = new URL(request.url);
    const cashierIdParam = url.searchParams.get('cashierId');
    // Zwei getrennte Suchfelder statt eines gemeinsamen mit Bereichsumschalter. Mit einem
    // Feld ließ sich „dieser Kassierer UND dieser Artikel“ nicht ausdrücken: dort musste
    // jedes Wort irgendwo treffen, egal wo. „hans jeans“ fand deshalb auch Jeans eines
    // *Verkäufers* namens Hans, verkauft von einem beliebigen Kassierer. Beide Felder sind
    // einzeln optional und werden miteinander UND-verknüpft.
    const qArticle = url.searchParams.get('article')?.trim() || undefined;
    const qCashier = url.searchParams.get('cashier')?.trim() || undefined;
    const txId = url.searchParams.get('txId');
    const cursor = url.searchParams.get('cursor');
    const limitParam = parseInt(url.searchParams.get('limit') || '50', 10);
    const limit = Math.min(Math.max(Number.isFinite(limitParam) && limitParam > 0 ? limitParam : 50, 1), 200);

    const conditions: Prisma.Sql[] = [Prisma.sql`s."basarId" = ${basarId}`];

    if (txId) conditions.push(Prisma.sql`s."clientTxId" = ${txId}`);

    if (!isAdmin) {
      conditions.push(Prisma.sql`s."cashierId" = ${auth.sellerId}`);
    } else if (cashierIdParam !== null) {
      if (cashierIdParam === 'null') {
        conditions.push(Prisma.sql`s."cashierId" IS NULL`);
      } else {
        const parsedCashierId = parseInt(cashierIdParam, 10);
        if (Number.isNaN(parsedCashierId)) {
          return NextResponse.json({ error: 'Ungültige cashierId' }, { status: 400 });
        }
        conditions.push(Prisma.sql`s."cashierId" = ${parsedCashierId}`);
      }
    }

    // Wortweise UND-Verknüpfung innerhalb eines Feldes: „jeans blau“ findet „Jeans blau“
    // wie auch „Blaue Jeanshose“. Die Bedingungen beider Felder landen in derselben
    // UND-Liste, damit Artikel- und Kassiererfilter gleichzeitig gelten.
    // ponytail: kein Postgres-tsvector/GIN – ILIKE je Token reicht bei ein paar tausend
    // Sales pro Basar und braucht keine Migration. Wird die Suche spürbar langsam, ist der
    // Umstieg auf Full-Text-Index der nächste Schritt.
    conditions.push(...tokenize(qArticle).map(articleClause), ...tokenize(qCashier).map(cashierClause));

    // f = alle gefilterten Positionen mit Vorgangsschlüssel, g = ein Eintrag je Vorgang.
    const filtered = Prisma.sql`
      f AS (
        SELECT s."id", COALESCE(s."clientTxId", '__single__' || s."id") AS "key",
               s."soldAt", s."salePrice", s."isCancelled"
        FROM "Sale" s
        JOIN "Article" a ON a."id" = s."articleId"
        JOIN "BasarSeller" bs ON bs."id" = a."basarSellerId"
        JOIN "Seller" vs ON vs."sellerId" = bs."sellerId"
        LEFT JOIN "Seller" c ON c."sellerId" = s."cashierId"
        WHERE ${Prisma.join(conditions, ' AND ')}
      ),
      g AS (SELECT "key", min("soldAt") AS "t" FROM f GROUP BY "key")`;

    // Cursor = Schlüssel des letzten Vorgangs der vorigen Seite. Unbekannter Cursor (z. B.
    // Filter seither geändert) fängt vorne an, wie bisher.
    const [pageRows, summaryRows] = await Promise.all([
      prisma.$queryRaw<{ key: string; ids: string[] }[]>`
        WITH ${filtered},
        cur AS (SELECT "t", "key" FROM g WHERE "key" = ${cursor}),
        p AS (
          SELECT "key", "t" FROM g
          WHERE NOT EXISTS (SELECT 1 FROM cur) OR ("t", "key") < (SELECT "t", "key" FROM cur)
          ORDER BY "t" DESC, "key" DESC
          LIMIT ${limit + 1}
        )
        SELECT p."key", array_agg(f."id") AS "ids"
        FROM p JOIN f ON f."key" = p."key"
        GROUP BY p."key", p."t"
        ORDER BY p."t" DESC, p."key" DESC`,
      prisma.$queryRaw<{ bons: number; articles: number; total: number }[]>`
        WITH ${filtered}
        SELECT (SELECT count(*) FROM g)::int AS "bons",
               (count(*) FILTER (WHERE NOT "isCancelled"))::int AS "articles",
               COALESCE(sum("salePrice") FILTER (WHERE NOT "isCancelled"), 0)::float8 AS "total"
        FROM f`,
    ]);

    const pageGroups = pageRows.slice(0, limit);
    const nextCursor = pageRows.length > limit ? pageGroups[pageGroups.length - 1].key : null;

    const sales = await prisma.sale.findMany({
      where: { id: { in: pageGroups.flatMap((g) => g.ids) } },
      select: {
        id: true,
        clientTxId: true,
        cashierId: true,
        salePrice: true,
        soldAt: true,
        isCancelled: true,
        cashier: { select: { firstName: true, lastName: true } },
        article: {
          select: {
            title: true,
            sizeLabel: true,
            qrCode: true,
            basarSeller: { select: { sellerId: true, seller: { select: { firstName: true, lastName: true } } } },
          },
        },
      },
      orderBy: { soldAt: 'desc' },
    });

    type TxGroup = {
      key: string;
      txId: string | null;
      cashierId: number | null;
      cashierName: string;
      soldAtMin: number;
      items: {
        saleId: string;
        articleTitle: string;
        sizeLabel: string | null;
        qrCode: string;
        salePrice: number;
        isCancelled: boolean;
        sellerId: number;
        sellerName: string;
      }[];
    };

    const groups = new Map<string, TxGroup>();
    for (const s of sales) {
      // clientTxId=null wird NICHT zusammengefasst (Altbestand/Einzelverkauf) – jede solche
      // Zeile bekommt einen eigenen, auf saleId basierenden Gruppenschlüssel.
      const key = s.clientTxId ?? `__single__${s.id}`;
      let group = groups.get(key);
      if (!group) {
        group = {
          key,
          txId: s.clientTxId,
          cashierId: s.cashierId,
          cashierName: s.cashier ? `${s.cashier.firstName} ${s.cashier.lastName}` : 'Ohne Zuordnung',
          soldAtMin: s.soldAt.getTime(),
          items: [],
        };
        groups.set(key, group);
      }
      group.soldAtMin = Math.min(group.soldAtMin, s.soldAt.getTime());
      group.items.push({
        saleId: s.id,
        articleTitle: s.article.title,
        sizeLabel: s.article.sizeLabel,
        qrCode: s.article.qrCode,
        salePrice: Number(s.salePrice),
        isCancelled: s.isCancelled,
        sellerId: s.article.basarSeller.sellerId,
        sellerName: `${s.article.basarSeller.seller.firstName} ${s.article.basarSeller.seller.lastName}`,
      });
    }

    // Reihenfolge der Seite kommt aus der Datenbank (ORDER BY t, key).
    const page = pageGroups.map((p) => groups.get(p.key)).filter((g): g is TxGroup => g !== undefined);

    const round2 = (x: number) => Math.round(x * 100) / 100;
    const totals = summaryRows[0];
    const summary = { bons: totals?.bons ?? 0, articles: totals?.articles ?? 0, total: round2(totals?.total ?? 0) };

    const transactions = page.map((g) => ({
      txId: g.txId,
      cashierId: g.cashierId,
      cashierName: g.cashierName,
      soldAt: new Date(g.soldAtMin).toISOString(),
      total: round2(g.items.filter((i) => !i.isCancelled).reduce((sum, i) => sum + i.salePrice, 0)),
      items: g.items,
    }));

    return NextResponse.json({ transactions, nextCursor, summary });
  } catch (error) {
    console.error('GET /api/basars/[id]/transactions error:', error);
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 });
  }
}
