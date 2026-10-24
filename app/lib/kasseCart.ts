// Warenkorb der Kasse auf dem Gerät (IndexedDB).
//
// Warum: der Warenkorb lag nur im React-State. Lief die Anmeldung ab oder verwarf das Handy die
// Seite im Hintergrund, war er weg – beim Basar 10/2026 musste zweimal ein Vorgang mit über 100
// Artikeln komplett neu gescannt werden. Der Schlüssel gilt pro Basar, NICHT pro Nutzer: er muss
// Abmelden und Neuanmeldung (auch durch eine andere Person) überstehen.

export interface ScannedArticle {
  id: string;
  title: string;
  sizeLabel?: string;
  price: number;
  salePrice: number;
  sellerId: number;
  sellerName: string;
  qrCode: string;
  basarId: string;
  saleId?: string; // set after successful kassieren
  status?: 'AVAILABLE' | 'SOLD' | 'RETURNED'; // as of last cache refresh – only set on cached (offline-lookup) entries
}

export const cartKey = (basarId: string) => `kasse-cart-${basarId}`;

const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Speicherformat. `v` erlaubt später eine Migration, ohne alte Stände falsch zu lesen. */
export function serializeCart(basarId: string, items: ScannedArticle[], now = Date.now()) {
  return { v: 1 as const, basarId, savedAt: now, items };
}

/**
 * Liest einen gespeicherten Stand. Falsches Format, falscher Basar oder kaputte Positionen
 * ergeben eine leere Liste bzw. werden einzeln verworfen – nie eine Ausnahme: ein beschädigter
 * Eintrag darf die Kasse nicht am Öffnen hindern. Doppelte QR-Codes fallen weg (der QR-Code
 * ist der Schlüssel im Warenkorb).
 */
export function parseCart(raw: unknown, basarId: string): ScannedArticle[] {
  if (!raw || typeof raw !== 'object') return [];
  const r = raw as Record<string, unknown>;
  if (r.v !== 1 || r.basarId !== basarId || !Array.isArray(r.items)) return [];
  const seen = new Set<string>();
  const out: ScannedArticle[] = [];
  for (const it of r.items) {
    if (!it || typeof it !== 'object') continue;
    const i = it as Record<string, unknown>;
    if (!isStr(i.id) || !isStr(i.title) || !isStr(i.qrCode) || i.qrCode === '') continue;
    if (!isNum(i.price) || !isNum(i.salePrice) || !isNum(i.sellerId) || !isStr(i.sellerName)) continue;
    if (i.basarId !== basarId || seen.has(i.qrCode)) continue;
    seen.add(i.qrCode);
    out.push({
      id: i.id,
      title: i.title,
      sizeLabel: isStr(i.sizeLabel) ? i.sizeLabel : undefined,
      price: i.price,
      salePrice: i.salePrice,
      sellerId: i.sellerId,
      sellerName: i.sellerName,
      qrCode: i.qrCode,
      basarId,
    });
  }
  return out;
}

/** Positionen, die schon in einem Offline-Vorgang liegen, gehören nicht zusätzlich in den Korb. */
export function withoutPending(items: ScannedArticle[], pendingQrCodes: Set<string>): ScannedArticle[] {
  return items.filter(i => !pendingQrCodes.has(i.qrCode));
}

/**
 * Was nach dem Kassieren im Warenkorb bleibt: alles, was der Server nicht als gebucht
 * bestätigt hat (results[i] gehört zu cart[i]). Gebuchte Positionen müssen raus – sonst
 * scheitert jeder weitere Versuch an ihnen mit "Bereits verkauft".
 */
export function unbookedItems(cart: ScannedArticle[], results: ({ success?: boolean; error?: string } | null | undefined)[]): ScannedArticle[] {
  return cart.filter((_, idx) => results[idx]?.success !== true);
}

/**
 * Scan ohne Server (offline oder Anmeldung abgelaufen): was sagt der lokale Artikelcache?
 * 'sold' = laut letztem Abgleich verkauft, 'use' = übernehmen, 'unknown' = nicht im Cache.
 */
export function cacheScanDecision(cached: { status?: string } | undefined): 'sold' | 'use' | 'unknown' {
  if (!cached) return 'unknown';
  return cached.status === 'SOLD' ? 'sold' : 'use';
}

// ─── IO (bewusst dünn) ────────────────────────────────────────────────────────

export async function loadCart(basarId: string): Promise<ScannedArticle[]> {
  try {
    const { get } = await import('idb-keyval');
    return parseCart(await get(cartKey(basarId)), basarId);
  } catch {
    return [];
  }
}

/** Leerer Warenkorb löscht den Eintrag. */
export async function saveCart(basarId: string, items: ScannedArticle[]): Promise<void> {
  try {
    const { set, del } = await import('idb-keyval');
    if (items.length === 0) await del(cartKey(basarId));
    else await set(cartKey(basarId), serializeCart(basarId, items));
  } catch { /* Speichern darf die Kasse nie blockieren */ }
}

/** QR-Codes aller Positionen in noch nicht übertragenen Offline-Vorgängen (auch "Prüfung"). */
export async function loadPendingQrCodes(): Promise<Set<string>> {
  const codes = new Set<string>();
  try {
    const { keys, get } = await import('idb-keyval');
    for (const key of (await keys()).filter(k => String(k).startsWith('pending-sale-'))) {
      const tx = await get<{ items?: { qrCode?: string }[] }>(key);
      for (const i of tx?.items ?? []) if (i?.qrCode) codes.add(i.qrCode);
    }
  } catch { /* ignore */ }
  return codes;
}
