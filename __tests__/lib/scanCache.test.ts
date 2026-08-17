import { describe, it, expect } from 'vitest';
import { articleCacheKey, articleCacheEtagKey, staleArticleCacheKeys } from '@/app/lib/scanCache';

const A = 'cmsxe945n0006uteosw6ftmhk'; // aktueller Basar
const B = 'cmold111n0006uteosw6ftmhk'; // vergangener Basar

describe('staleArticleCacheKeys', () => {
  it('behält Datenliste und ETag des aktuellen Basars', () => {
    const keys = [articleCacheKey(A), articleCacheEtagKey(A)];
    expect(staleArticleCacheKeys(keys, A)).toEqual([]);
  });

  it('meldet Datenliste und ETag vergangener Basare', () => {
    const keys = [articleCacheKey(A), articleCacheEtagKey(A), articleCacheKey(B), articleCacheEtagKey(B)];
    expect(staleArticleCacheKeys(keys, A)).toEqual([articleCacheKey(B), articleCacheEtagKey(B)]);
  });

  // Der wichtigste Fall: an pending-sale-* hängt eingenommenes, noch nicht übertragenes Geld.
  // Würde das Aufräumen diese Einträge mitnehmen, wären die Verkäufe unwiederbringlich weg –
  // und zwar unbemerkt, weil die Kasse danach einfach "0 Sync ausstehend" anzeigt.
  it('rührt ausstehende Offline-Verkäufe niemals an', () => {
    const pending = ['pending-sale-1755000000000-abc', 'pending-sale-1755000009999-xyz'];
    const keys = [...pending, articleCacheKey(B), articleCacheEtagKey(B)];
    const stale = staleArticleCacheKeys(keys, A);
    expect(stale).not.toContain(pending[0]);
    expect(stale).not.toContain(pending[1]);
    expect(stale).toHaveLength(2);
  });

  it('lässt fremde Schlüssel anderer Anwendungen in Ruhe', () => {
    const keys = ['irgendwas', 'basar-settings', articleCacheKey(B)];
    expect(staleArticleCacheKeys(keys, A)).toEqual([articleCacheKey(B)]);
  });

  it('kommt mit leerem Speicher klar', () => {
    expect(staleArticleCacheKeys([], A)).toEqual([]);
  });
});
