/**
 * Manuelle Artikelsuche an der Kasse – für den Fall, dass ein QR-Code nicht lesbar ist.
 *
 * Gesucht wird im Offline-Artikelcache der Kasse (GET /api/basars/[id]/scan-cache), nicht
 * per eigener API: der Cache enthält ohnehin jeden Artikel des Basars mit Verkäufernummer,
 * und so funktioniert die Suche auch ohne Netz. Der Cache führt nur AVAILABLE und SOLD –
 * zurückgegebene Artikel kommen gar nicht erst an.
 *
 * Die Statusangabe im Cache kann veraltet sein (Verkauf an einer anderen Kasse seit dem
 * letzten Abgleich). Das ist hier unkritisch: die Auswahl läuft über denselben Weg wie ein
 * Scan, und der fragt online beim Server nach, ob der Artikel noch zu haben ist.
 */

export interface LookupArticle {
  qrCode: string;
  title: string;
  sizeLabel?: string;
  price: number;
  sellerId: number;
  sellerName: string;
  status?: 'AVAILABLE' | 'SOLD' | 'RETURNED';
}

/**
 * Bezeichnung, Größe und Preis getrennt – so, wie sie auf dem Etikett stehen. Ein
 * gemeinsames Suchfeld wäre unscharf: „8" träfe Preis 8,00 ebenso wie Größe 86.
 * Leere Felder schränken nicht ein; gefüllte gelten alle zugleich.
 */
export interface LookupFilter {
  title?: string;
  size?: string;
  price?: string;
}

export interface LookupResult {
  /** Aus dem ersten Artikel des Verkäufers – null, wenn der Basar keinen von ihm führt. */
  sellerName: string | null;
  /** Alle Artikel dieses Verkäufers im Cache, verkaufte eingeschlossen. */
  total: number;
  /** Davon noch nicht verkauft. */
  available: number;
  /** Nicht verkauft und passend zu allen gefüllten Feldern, sortiert nach Bezeichnung, dann Preis. */
  matches: LookupArticle[];
}

/**
 * Preis aus der Eingabe in Cent. Komma wie auf dem Etikett („3,50") und Punkt (Handy-Tastatur)
 * werden beide angenommen; „3,5" ist 3,50. Unbrauchbares ergibt null – dann filtert das Feld
 * nicht, statt alles auszublenden, während jemand noch tippt.
 */
export function parsePriceCents(input: string): number | null {
  const s = input.trim().replace(/\s*€$/, '').replace(',', '.');
  if (!/^\d+(\.\d{0,2})?$/.test(s)) return null;
  return Math.round(parseFloat(s) * 100);
}

export function lookupSellerArticles(
  articles: Iterable<LookupArticle>,
  sellerId: number,
  filter: LookupFilter = {}
): LookupResult {
  const own = [...articles].filter(a => a.sellerId === sellerId);
  const available = own.filter(a => a.status !== 'SOLD');

  // Bezeichnung: jedes Wort muss vorkommen – „jacke blau" findet „Winterjacke blau".
  const titleWords = (filter.title ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  const size = (filter.size ?? '').trim().toLowerCase();
  const cents = parsePriceCents(filter.price ?? '');

  const matches = available
    .filter(a => {
      const title = a.title.toLowerCase();
      if (!titleWords.every(w => title.includes(w))) return false;
      // Größe: ganzer Wert oder einer seiner Teile – „116" findet „116" und „116/122",
      // „6" aber weder 116 noch 86. Teilstring wäre zu unscharf, um auf einen Artikel zu kommen.
      if (size) {
        const label = (a.sizeLabel ?? '').toLowerCase();
        if (label !== size && !label.split(/[^a-z0-9]+/).includes(size)) return false;
      }
      if (cents !== null && Math.round(a.price * 100) !== cents) return false;
      return true;
    })
    .sort((a, b) => a.title.localeCompare(b.title, 'de') || a.price - b.price);

  return {
    sellerName: own[0]?.sellerName ?? null,
    total: own.length,
    available: available.length,
    matches,
  };
}
