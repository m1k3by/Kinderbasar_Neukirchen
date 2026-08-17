/**
 * Schlüssel des Offline-Artikelcaches der Kasse (IndexedDB, siehe
 * app/admin/basars/[id]/kasse/page.tsx).
 *
 * Der Cache enthält zu jedem Artikel des Basars auch Vor- und Nachnamen des Verkäufers. Er
 * liegt auf dem Privatgerät eines Helfers und wird pro Basar unter einem eigenen Schlüssel
 * abgelegt – ohne Aufräumen sammeln sich dort die Verkäuferlisten sämtlicher vergangener
 * Basare an, obwohl sie nie wieder gelesen werden (der Schlüssel enthält die basarId).
 */

const PREFIX = 'basar-articles-';

export const articleCacheKey = (basarId: string) => `${PREFIX}${basarId}`;
export const articleCacheEtagKey = (basarId: string) => `${PREFIX}etag-${basarId}`;

/**
 * Cache-Schlüssel, die zu einem anderen als dem gerade geöffneten Basar gehören.
 *
 * Rührt `pending-sale-*` nicht an: daran hängt eingenommenes, noch nicht übertragenes Geld –
 * diese Einträge dürfen ausschließlich nach erfolgreicher Synchronisierung verschwinden.
 */
export function staleArticleCacheKeys(allKeys: string[], currentBasarId: string): string[] {
  const keep = new Set([articleCacheKey(currentBasarId), articleCacheEtagKey(currentBasarId)]);
  return allKeys.filter(k => k.startsWith(PREFIX) && !keep.has(k));
}
