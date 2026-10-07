import { prisma } from './prisma';

/**
 * Orga-Personen ohne BasarSeller-Zeile in diesem Basar, als Platzhalter-Einträge.
 *
 * Orga gilt in jedem Basar als teilnehmend, auch ohne Zeile (app/lib/participation.ts) – die
 * Zeile entsteht erst mit Anmeldung oder erstem Artikel. Alles, was nur aus Zeilen gebaut
 * wird, ließ solche Personen deshalb ganz weg (#1463, aufgefallen am 07.10.2026). Es wird
 * *keine* Zeile angelegt: die Teilnahme bleibt abgeleitet, wie gewollt.
 *
 * Zwei Aufrufer, die übereinstimmen *müssen*: die Teilnehmerliste (GET /api/basars/[id]) und
 * die Anlieferzettel (GET /api/basars/[id]/anlieferzettel.pdf). Die Seite zählt den Knopf aus
 * der Liste, das PDF druckt aus seiner eigenen Abfrage – stünde die Abfrage zweimal im Code,
 * zeigte der Knopf beim ersten Auseinanderlaufen eine andere Zahl, als das PDF Seiten hat.
 *
 * Eigene Datei statt participation.ts: die wird auch von der Seite im Browser importiert,
 * und Prisma darf nicht ins Client-Bundle.
 */
export async function orgaPlaceholders(basarId: string) {
  // `none` mit basarId ist der Kern: ohne ihn stünde jede Orga-Person mit Zeile doppelt in der
  // Liste, mit einer Zeile in *irgendeinem* Basar fehlte sie hier weiterhin.
  const sellers = await prisma.seller.findMany({
    where: { isOrga: true, basarSellers: { none: { basarId } } },
    select: { sellerId: true, firstName: true, lastName: true, email: true, isOrga: true, isEmployee: true },
  });

  return sellers.map((seller) => ({
    // Kein cuid: die ID existiert nicht in der Datenbank. Die Seite nutzt sie nur als
    // React-Key, und das Präfix macht sie für jeden anderen Leser als Platzhalter kenntlich.
    id: `orga-${seller.sellerId}`,
    basarId,
    sellerId: seller.sellerId,
    activated: false,
    isActive: true,
    viaOrga: true,
    seller,
    _count: { articles: 0 },
  }));
}
