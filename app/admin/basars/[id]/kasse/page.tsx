'use client';

import { useState, useEffect, useRef, use, useCallback } from 'react';
import Header from '../../../../components/Header';
import { getNavLinks, type NavUser } from '../../../../lib/navLinks';
import { articleCacheKey, articleCacheEtagKey, staleArticleCacheKeys } from '../../../../lib/scanCache';
import { buildScannerConfig, hasNativeBarcodeDetector, scannerRecoveryAction, scannerTuning, type ScannerTuning } from '../../../../lib/scannerConfig';

interface ScannedArticle {
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

interface PendingTransaction {
  id: string; // idempotency key
  basarId: string;
  items: ScannedArticle[];
  timestamp: number;
  // Set when a sync attempt got a response from the server but some items could not be
  // resolved (e.g. "Artikel nicht gefunden" for a manually-entered offline QR code, or
  // "Ungültiger Preis"). These items are kept so the cash is not silently lost, but they
  // will never resolve automatically — a human has to record the sale manually and then
  // delete the entry.
  needsReview?: boolean;
}

export default function KassePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: basarId } = use(params);
  const [cart, setCart] = useState<ScannedArticle[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scannerError, setScannerError] = useState('');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error' | 'info'>('info');
  const [kassieren, setKassieren] = useState(false);
  const [cashInput, setCashInput] = useState('');
  const [isOnline, setIsOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  // Pending transactions that got a server response but still contain unresolved items
  // (e.g. a manually-entered offline QR code that doesn't exist server-side). These
  // require a human to record the sale manually and then delete the entry.
  const [pendingReview, setPendingReview] = useState<{ key: string; tx: PendingTransaction }[]>([]);
  // Manual offline entry state
  const [pendingManualQr, setPendingManualQr] = useState<string | null>(null);
  const [manualTitle, setManualTitle] = useState('');
  const [manualPrice, setManualPrice] = useState('');
  // Visual scan feedback overlay
  const [scanFlash, setScanFlash] = useState<'success' | 'error' | null>(null);
  const [scanLastTitle, setScanLastTitle] = useState('');
  const [scanFlashMessage, setScanFlashMessage] = useState('');
  // Default to admin nav until /api/me resolves – this page is reachable by both admins
  // and cashiers (see middleware.ts), so the nav must be corrected as soon as we know
  // who's asking, to avoid showing a cashier links the middleware would immediately block.
  const [navUser, setNavUser] = useState<NavUser>({ role: 'admin' });

  useEffect(() => {
    fetch('/api/me').then(res => res.ok ? res.json() : null).then(me => {
      if (!me) return;
      if (me.role === 'admin') {
        setNavUser({ role: 'admin' });
      } else {
        setNavUser({ role: me.isEmployee ? 'employee' : 'seller', isEmployee: me.isEmployee, isCashier: me.isCashier });
      }
    }).catch(() => { /* ignore – keep admin default */ });
  }, []);

  function showErrorFlash(msg: string, durationMs = 1200) {
    setScanFlashMessage(msg);
    setScanFlash('error');
    setTimeout(() => setScanFlash(null), durationMs);
    playScanError();
  }
  const scannerRef = useRef<any>(null);
  // Wartezeit nach einem Treffer – hängt davon ab, wie teuer das Dekodieren auf diesem
  // Gerät ist (siehe app/lib/scannerConfig.ts).
  const tuningRef = useRef<ScannerTuning | null>(null);
  const scannerDivRef = useRef<HTMLDivElement>(null);
  // Ref-based Set tracks scanned codes independently of React state batching
  // This prevents duplicate scans from rapid re-fires of the scanner callback
  const scannedCodesRef = useRef<Set<string>>(new Set());
  const audioCtxRef = useRef<AudioContext | null>(null);
  // In-memory article cache for offline scan lookups
  const articleCacheRef = useRef<Map<string, Omit<ScannedArticle, 'salePrice'>>>(new Map());
  // Tracks when each qrCode was last successfully added (to suppress rapid re-fire noise)
  const scanTimestampsRef = useRef<Map<string, number>>(new Map());

  function getAudioCtx(): AudioContext {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return audioCtxRef.current;
  }

  function playBeep(frequency: number, duration: number, type: OscillatorType = 'sine', volume = 0.4) {
    try {
      const ctx = getAudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = type;
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(volume, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + duration);
    } catch { /* ignore – AudioContext blocked */ }
  }

  function playScanSuccess() {
    playBeep(1200, 0.12, 'sine', 0.35);
  }

  function playScanError() {
    playBeep(300, 0.15, 'square', 0.3);
    setTimeout(() => playBeep(250, 0.2, 'square', 0.3), 170);
  }

  function playKassierenSound() {
    // Cash register "ding": two ascending tones
    playBeep(880, 0.15, 'sine', 0.45);
    setTimeout(() => playBeep(1320, 0.25, 'sine', 0.45), 160);
  }

  // Track online status + keep article cache warm
  useEffect(() => {
    setIsOnline(navigator.onLine);
    purgeForeignCaches();
    loadArticleCache();
    if (navigator.onLine) cacheBasarArticles();
    const handleOnline = () => { setIsOnline(true); syncPending(); cacheBasarArticles(); };
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => { window.removeEventListener('online', handleOnline); window.removeEventListener('offline', handleOffline); };
  }, []);

  // Load pending count + review list from IndexedDB on mount
  useEffect(() => { loadPendingCount(); loadPendingReview(); }, []);

  async function loadPendingCount() {
    try {
      const { keys, get } = await import('idb-keyval');
      const allKeys = await keys();
      const pendingKeys = allKeys.filter(k => String(k).startsWith('pending-sale-'));
      let count = 0;
      for (const key of pendingKeys) {
        const tx = await get<PendingTransaction>(key);
        if (tx && !tx.needsReview) count++;
      }
      setPendingCount(count);
    } catch { /* ignore */ }
  }

  async function loadPendingReview() {
    try {
      const { keys, get } = await import('idb-keyval');
      const allKeys = await keys();
      const pendingKeys = allKeys.filter(k => String(k).startsWith('pending-sale-'));
      const reviews: { key: string; tx: PendingTransaction }[] = [];
      for (const key of pendingKeys) {
        const tx = await get<PendingTransaction>(key);
        if (tx?.needsReview) reviews.push({ key: String(key), tx });
      }
      setPendingReview(reviews);
    } catch { /* ignore */ }
  }

  async function handleDeletePendingReview(key: string) {
    if (!confirm('Eintrag wirklich löschen? Stelle sicher, dass der Verkauf manuell nachgetragen wurde.')) return;
    try {
      const { del } = await import('idb-keyval');
      await del(key);
      loadPendingReview();
    } catch { /* ignore */ }
  }

  // Load cached article list from IndexedDB into memory (fast, no network)
  async function loadArticleCache() {
    try {
      const { get } = await import('idb-keyval');
      const cached = await get<Array<Omit<ScannedArticle, 'salePrice'>>>(articleCacheKey(basarId));
      if (cached) articleCacheRef.current = new Map(cached.map(a => [a.qrCode, a]));
    } catch { /* ignore */ }
  }

  // Artikelcaches vergangener Basare löschen – sie werden nie wieder gelesen, enthalten aber
  // die Verkäufernamen und liegen auf dem Privatgerät eines Helfers.
  // ponytail: läuft beim Öffnen der Kasse. Wer die Kasse nach dem letzten Basar nie wieder
  // öffnet, behält dessen Cache – dafür bräuchte es einen Service Worker oder eine
  // Ablauf-Prüfung beim Login.
  async function purgeForeignCaches() {
    try {
      const { keys, del } = await import('idb-keyval');
      const stale = staleArticleCacheKeys((await keys()).map(String), basarId);
      for (const key of stale) await del(key);
    } catch { /* ignore */ }
  }

  // Fetch all articles for this basar and persist them in IndexedDB for offline use.
  // Uses the minimal scan-cache projection (same shape for admin and cashier callers – see
  // app/api/basars/[id]/scan-cache/route.ts) and sends the last stored ETag so a 304 short-
  // circuits the download when nothing changed. handleOnline fires on every WiFi flap, so
  // avoiding a repeated multi-MB re-fetch here matters.
  async function cacheBasarArticles() {
    try {
      const { get, set } = await import('idb-keyval');
      const storedEtag = await get<string>(articleCacheEtagKey(basarId));
      const res = await fetch(`/api/basars/${basarId}/scan-cache`, {
        headers: storedEtag ? { 'If-None-Match': storedEtag } : {},
      });
      if (res.status === 304) return; // cache already up to date – keep existing IndexedDB contents
      if (!res.ok) return;
      const data = await res.json();
      const articles: Array<Omit<ScannedArticle, 'salePrice'>> = (data.articles ?? []).map((a: any) => ({
        id: a.id,
        title: a.title,
        sizeLabel: a.sizeLabel ?? undefined,
        price: Number(a.price),
        sellerId: a.sellerId ?? 0,
        sellerName: a.sellerName ?? '',
        qrCode: a.qrCode,
        basarId,
        status: a.status,
      }));
      await set(articleCacheKey(basarId), articles);
      const newEtag = res.headers.get('etag');
      if (newEtag) await set(articleCacheEtagKey(basarId), newEtag);
      articleCacheRef.current = new Map(articles.map(a => [a.qrCode, a]));
    } catch { /* ignore */ }
  }

  const syncPending = useCallback(async () => {
    try {
      const { keys, get, set, del } = await import('idb-keyval');
      const allKeys = await keys();
      const pendingKeys = allKeys.filter(k => String(k).startsWith('pending-sale-'));
      for (const key of pendingKeys) {
        const tx = await get<PendingTransaction>(key);
        // needsReview entries require manual handling – never auto-retried
        if (!tx || tx.needsReview) continue;
        try {
          const clientTxId = String(key);
          const res = await fetch(`/api/basars/${tx.basarId}/sales`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: tx.items.map(i => ({ qrCode: i.qrCode, salePrice: i.salePrice })), clientTxId }),
          });
          if (res.ok) {
            const data = await res.json().catch(() => ({ results: [] }));
            const results: { success?: boolean; error?: string }[] = data.results ?? [];
            // Items that succeeded, or failed because they were already sold (someone
            // else recorded it first), are resolved. Anything else – especially
            // "Artikel nicht gefunden" (client-generated offline QR code that doesn't
            // exist server-side) or "Ungültiger Preis" – means the cash was collected
            // but never recorded, so it must be kept for manual follow-up.
            const unresolved: ScannedArticle[] = [];
            results.forEach((r, idx) => {
              const resolved = r.success === true || /bereits verkauft/i.test(r.error ?? '');
              if (!resolved) unresolved.push(tx.items[idx]);
            });

            if (unresolved.length === 0) {
              await del(key);
            } else {
              await set(key, { ...tx, items: unresolved, needsReview: true } as PendingTransaction);
            }
          }
          // non-ok response → keep the pending record untouched for the next sync attempt
        } catch { /* keep for next sync */ }
      }
    } catch { /* ignore */ } finally {
      loadPendingCount();
      loadPendingReview();
    }
  }, []);

  async function startScanner() {
    setScannerError('');
    setScanning(true);
    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      const scanner = new Html5Qrcode('qr-reader-container');
      scannerRef.current = scanner;
      // Einstellungen richten sich danach, ob das Gerät einen nativen Decoder hat – ohne ihn
      // (iOS Safari) läuft ZXing in JavaScript auf dem Hauptthread. Begründung der Werte in
      // app/lib/scannerConfig.ts.
      const tuning = scannerTuning(hasNativeBarcodeDetector());
      tuningRef.current = tuning;
      await scanner.start(
        { facingMode: 'environment' },
        buildScannerConfig(tuning),
        async (decodedText: string) => {
          try { await scanner.pause(); } catch { /* ignore */ }
          const resumeDelay = await handleQrScan(decodedText);
          if (resumeDelay > 0) await new Promise(r => setTimeout(r, resumeDelay));
          try { await scanner.resume(); } catch { /* ignore */ }
        },
        (_error: any) => { /* ignore frequent scan errors */ }
      );
    } catch (err: any) {
      setScannerError('Kamera nicht verfügbar: ' + (err?.message || String(err)));
      setScanning(false);
    }
  }

  async function stopScanner() {
    if (scannerRef.current) {
      try { await scannerRef.current.stop(); } catch { /* ignore */ }
      scannerRef.current = null;
    }
    setScanning(false);
  }

  useEffect(() => { return () => { stopScanner(); }; }, []);

  // iOS Safari hält den Kamerastream an, sobald die Seite in den Hintergrund geht (App-Wechsel,
  // Sperrbildschirm, Anruf). Beim Zurückkehren bleibt das <video> pausiert oder der Track ist
  // beendet – html5-qrcode merkt davon nichts und dekodiert weiter dasselbe Standbild.
  // Ohne diese Behandlung bleibt die Kasse eingefroren, bis jemand die Seite neu lädt.
  useEffect(() => {
    async function recover() {
      if (document.visibilityState !== 'visible') return;
      if (!scannerRef.current) return; // Scanner gar nicht gestartet – nichts zu tun
      const video = scannerDivRef.current?.querySelector('video');
      switch (scannerRecoveryAction(video)) {
        case 'ok':
          return;
        case 'resume':
          try { await video!.play(); } catch { await stopScanner(); await startScanner(); }
          return;
        case 'restart':
          await stopScanner();
          await startScanner();
      }
    }
    document.addEventListener('visibilitychange', recover);
    return () => document.removeEventListener('visibilitychange', recover);
  }, []);

  async function handleQrScan(qrCode: string): Promise<number> {
    // Deduplicate: code already in cart
    if (scannedCodesRef.current.has(qrCode)) {
      // Rapid re-fire from scanner (same code still in frame) → silent ignore
      const lastTime = scanTimestampsRef.current.get(qrCode) ?? 0;
      if (Date.now() - lastTime < 3000) return 0;
      // Intentional re-scan after some time → show error flash
      showErrorFlash('Bereits im Warenkorb');
      return 1000;
    }
    // Reserve immediately to block concurrent scans of the same code
    scannedCodesRef.current.add(qrCode);
    try {
      const res = await fetch(`/api/articles/scan/${encodeURIComponent(qrCode)}`);
      const data = await res.json();
      if (!res.ok) {
        scannedCodesRef.current.delete(qrCode);
        const msg = data.error || 'Fehler beim Laden des Artikels';
        showMessage(msg, 'error');
        showErrorFlash(msg);
        return 1000;
      }
      setCart(prev => [...prev, { ...data, salePrice: data.price }]);
      scanTimestampsRef.current.set(qrCode, Date.now());
      setScanLastTitle(data.title);
      setScanFlash('success');
      setTimeout(() => setScanFlash(null), 1400);
      playScanSuccess();
      // Kurze Pause, damit derselbe Code nicht sofort erneut auslöst.
      return tuningRef.current?.resumeDelayMs ?? 600;
    } catch {
      // When offline: try the local article cache first
      const cached = articleCacheRef.current.get(qrCode);
      if (cached && cached.status === 'SOLD') {
        // Cache says this article was already sold as of the last sync – don't let it be
        // scanned into the cart again (it would just get rejected once synced anyway).
        scannedCodesRef.current.delete(qrCode);
        showErrorFlash('Bereits verkauft (laut Cache)');
        return 1000;
      } else if (cached) {
        setCart(prev => [...prev, { ...cached, salePrice: cached.price }]);
        scanTimestampsRef.current.set(qrCode, Date.now());
        setScanLastTitle(cached.title + ' (offline)');
        setScanFlash('success');
        setTimeout(() => setScanFlash(null), 1400);
        playScanSuccess();
        return tuningRef.current?.resumeDelayMs ?? 600;
      } else if (!navigator.onLine) {
        setPendingManualQr(qrCode);
        showMessage('Offline: Artikel nicht im Cache – bitte manuell eingeben', 'info');
        return 0;
      } else {
        scannedCodesRef.current.delete(qrCode);
        showErrorFlash('Netzwerkfehler beim Scannen');
        showMessage('Netzwerkfehler beim Scannen', 'error');
        return 1000;
      }
    }
  }

  function showMessage(text: string, type: 'success' | 'error' | 'info') {
    setMessage(text);
    setMessageType(type);
    setTimeout(() => setMessage(''), 3000);
  }

  function handleManualAdd() {
    if (!pendingManualQr || !manualTitle) return;
    const price = parseFloat(manualPrice);
    if (isNaN(price) || price < 0) return;
    setCart(prev => [...prev, {
      id: `manual-${Date.now()}`,
      title: manualTitle,
      price,
      salePrice: price,
      sellerId: 0,
      sellerName: 'Manuell',
      qrCode: pendingManualQr,
      basarId,
    }]);
    scannedCodesRef.current.add(pendingManualQr);
    showMessage(`✓ "${manualTitle}" manuell hinzugefügt`, 'success');
    playScanSuccess();
    setPendingManualQr(null);
    setManualTitle('');
    setManualPrice('');
  }

  async function handleKassieren() {
    if (cart.length === 0) return;
    setKassieren(true);
    const items = cart.map(i => ({ qrCode: i.qrCode, salePrice: i.salePrice }));
    const clientTxId = crypto.randomUUID();
    try {
      const res = await fetch(`/api/basars/${basarId}/sales`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, clientTxId }),
      });
      if (res.ok) {
        const data = await res.json();
        const failedCount = data.results.filter((r: any) => r.error).length;
        if (failedCount > 0) {
          showMessage(`${cart.length - failedCount} kassiert, ${failedCount} Fehler`, 'error');
        } else {
          showMessage(`✓ ${cart.length} Artikel kassiert – Gesamt: ${totalAmount.toFixed(2)} €`, 'success');
          playKassierenSound();
        setCart([]);
        scannedCodesRef.current.clear();
        scanTimestampsRef.current.clear();
        setCashInput('');
        }
      } else if (!navigator.onLine) {
        // Genuinely offline → queue for later sync
        await saveOffline(items);
      } else {
        // Online but the server rejected/failed the request (4xx or 5xx). Do NOT queue
        // this offline – a 5xx while online is retryable and queuing it could poison an
        // offline transaction forever. Show the error and keep the cart so the cashier
        // can just press "Kassieren" again.
        const data = await res.json().catch(() => ({}));
        showMessage(data.error || `Fehler beim Kassieren (${res.status})`, 'error');
      }
    } catch {
      // Network error (fetch threw) → save offline
      await saveOffline(items);
    } finally {
      setKassieren(false);
    }
  }

  async function saveOffline(items: { qrCode: string; salePrice: number }[]) {
    try {
      const { set } = await import('idb-keyval');
      const key = `pending-sale-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      await set(key, { id: key, basarId, items: cart, timestamp: Date.now() } as PendingTransaction);
      setPendingCount(p => p + 1);
      playKassierenSound();
    setCart([]);
    scannedCodesRef.current.clear();
    scanTimestampsRef.current.clear();
    setCashInput('');
    showMessage('Offline gespeichert – wird synchronisiert wenn du wieder online bist', 'info');
    } catch {
      showMessage('Fehler beim Offline-Speichern', 'error');
    }
  }

  async function handleStorno(item: ScannedArticle) {
    if (!item.saleId) {
      setCart(prev => prev.filter(c => c.id !== item.id));
      scannedCodesRef.current.delete(item.qrCode);
      return;
    }
    if (!confirm('Verkauf stornieren?')) return;
    const res = await fetch(`/api/sales/${item.saleId}`, { method: 'DELETE' });
    if (res.ok) {
      setCart(prev => prev.filter(c => c.id !== item.id));
      scannedCodesRef.current.delete(item.qrCode);
      showMessage('Storno erfolgreich', 'success');
    } else {
      const data = await res.json();
      showMessage(data.error || 'Storno fehlgeschlagen', 'error');
    }
  }

  const totalAmount = cart.reduce((sum, i) => sum + i.salePrice, 0);
  const change = cashInput ? Math.max(0, parseFloat(cashInput) - totalAmount) : null;

  const msgColors = { success: 'bg-green-100 text-green-800 border-green-200', error: 'bg-red-100 text-red-800 border-red-200', info: 'bg-blue-100 text-blue-800 border-blue-200' };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header links={getNavLinks(navUser, 'kasse')} />
      {/* Status bar */}
      <div className={`text-center text-xs py-1 font-medium ${isOnline ? 'bg-green-500 text-white' : 'bg-orange-500 text-white'}`}>
        {isOnline
          ? `● Online${articleCacheRef.current.size > 0 ? ` · ${articleCacheRef.current.size} gecacht` : ''}`
          : `● Offline · ${articleCacheRef.current.size > 0 ? `${articleCacheRef.current.size} im Cache` : 'Kein Cache'}`}
        {pendingCount > 0 && ` · ${pendingCount} Sync ausstehend`}
      </div>

      <div className="max-w-2xl mx-auto p-2">
        {message && (
          <div className={`mb-2 px-3 py-2 rounded-lg text-sm font-medium border ${msgColors[messageType]}`}>
            {message}
          </div>
        )}

        {/* QR Scanner */}
        <div className="bg-white rounded-xl shadow-md p-3 mb-2">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-600">QR-Scanner</span>
              {cart.length > 0 && (
                <span className="text-sm font-bold text-green-600">{totalAmount.toFixed(2)} €</span>
              )}
            </div>
            <button
              onClick={scanning ? stopScanner : startScanner}
              className={`px-3 py-1 rounded-lg font-medium text-xs transition-colors ${scanning ? 'bg-red-100 text-red-700 hover:bg-red-200' : 'bg-yellow-500 hover:bg-yellow-600 text-gray-900'}`}
            >
              {scanning ? '■ Stop' : '▶ Scannen'}
            </button>
          </div>

          {scannerError && <p className="text-red-600 text-sm mb-2">{scannerError}</p>}

          {/* Offline manual entry – shown when scanned QR is not in local cache */}
          {pendingManualQr && (
            <div className="mb-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-sm font-medium text-yellow-800 mb-2">⚠ Offline: Artikel nicht im Cache – manuell eingeben:</p>
              <input
                type="text"
                placeholder="Artikelbezeichnung"
                value={manualTitle}
                onChange={e => setManualTitle(e.target.value)}
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm mb-2 focus:outline-none focus:ring-1 focus:ring-yellow-500"
              />
              <div className="flex gap-2 items-center">
                <input
                  type="number"
                  placeholder="Preis"
                  min="0"
                  step="0.10"
                  value={manualPrice}
                  onChange={e => setManualPrice(e.target.value)}
                  className="w-24 border border-gray-300 rounded px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-1 focus:ring-yellow-500"
                />
                <span className="text-sm text-gray-500">€</span>
                <button
                  onClick={handleManualAdd}
                  disabled={!manualTitle || !manualPrice}
                  className="flex-1 px-3 py-1.5 bg-yellow-500 text-white text-sm font-medium rounded hover:bg-yellow-600 disabled:opacity-50"
                >
                  Hinzufügen
                </button>
                <button
                  onClick={() => { setPendingManualQr(null); setManualTitle(''); setManualPrice(''); scannedCodesRef.current.delete(pendingManualQr!); }}
                  className="px-2 py-1.5 bg-gray-200 text-gray-600 text-sm rounded hover:bg-gray-300"
                >✕</button>
              </div>
            </div>
          )}

          <div
            id="qr-reader-container"
            ref={scannerDivRef}
            className={`w-full rounded-lg bg-gray-100 relative ${scanning ? 'block' : 'hidden'}`}
            style={{ minHeight: scanning ? '280px' : '0' }}
          >
            {scanFlash && (
              <div className={`absolute inset-0 z-10 flex flex-col items-center justify-center pointer-events-none
                ${scanFlash === 'success' ? 'bg-green-500/85' : 'bg-red-500/85'}`}>
                {scanFlash === 'success' ? (
                  <>
                    <span className="text-white font-bold" style={{ fontSize: '4rem', lineHeight: 1 }}>✓</span>
                    <span className="text-white font-bold text-base text-center px-6 mt-2 drop-shadow">{scanLastTitle}</span>
                  </>
                ) : (
                  <>
                    <span className="text-white font-bold" style={{ fontSize: '3.5rem', lineHeight: 1 }}>✕</span>
                    <span className="text-white font-bold text-sm text-center px-6 mt-2 drop-shadow">{scanFlashMessage}</span>
                  </>
                )}
              </div>
            )}
          </div>

          {!scanning && (
            <p className="text-gray-400 text-xs text-center py-3">▶ Scannen drücken um Artikel zu scannen</p>
          )}
        </div>

        {/* Cart */}
        <div className="bg-white rounded-xl shadow-md p-3 mb-2">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-gray-700">Warenkorb ({cart.length}){cart.length > 0 && <span className="ml-2 font-bold text-green-600">{totalAmount.toFixed(2)} €</span>}</h2>
            {cart.length > 0 && (
              <button onClick={() => { if (confirm('Warenkorb leeren?')) { setCart([]); scannedCodesRef.current.clear(); scanTimestampsRef.current.clear(); setCashInput(''); } }}
                className="text-xs text-red-500 hover:underline">Leeren</button>
            )}
          </div>

          {cart.length === 0 ? (
            <p className="text-gray-400 text-xs text-center py-3">Noch keine Artikel gescannt</p>
          ) : (
            <div className="space-y-1.5">
              {cart.map(item => (
                <div key={item.qrCode} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{item.title}</p>
                    <p className="text-xs text-gray-400">#{item.sellerId}{item.sizeLabel && ` · ${item.sizeLabel}`}</p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <input
                      type="number"
                      min="0"
                      step="0.10"
                      value={item.salePrice}
                      onChange={e => setCart(prev => prev.map(c => c.qrCode === item.qrCode ? { ...c, salePrice: parseFloat(e.target.value) || 0 } : c))}
                      className="w-16 text-right border border-gray-300 rounded px-1.5 py-1 text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-yellow-500"
                    />
                    <span className="text-xs text-gray-500">€</span>
                    <button type="button" onClick={() => handleStorno(item)} className="text-red-400 hover:text-red-600 transition-colors" title="Entfernen">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Checkout */}
        {cart.length > 0 && (
          <div className="bg-white rounded-xl shadow-md p-3 mb-2">
            {/* Change calculator */}
            <div className="mb-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">Betrag erhalten:</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  step="0.10"
                  value={cashInput}
                  onChange={e => setCashInput(e.target.value)}
                  placeholder="0,00"
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-right font-semibold focus:outline-none focus:ring-2 focus:ring-yellow-500"
                />
                <span className="text-sm font-medium text-gray-700">€</span>
              </div>
            </div>
            {change !== null && cashInput !== '' && (
              <div className={`text-center font-bold text-lg py-2 rounded-lg mb-3 ${change >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                {change >= 0 ? `Rückgeld: ${change.toFixed(2)} €` : `Zu wenig: ${Math.abs(change).toFixed(2)} €`}
              </div>
            )}

            <button
              onClick={handleKassieren}
              disabled={kassieren}
              className="w-full py-3 bg-green-500 hover:bg-green-600 text-white text-lg font-bold rounded-xl shadow-lg transition-all hover:scale-[1.01] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {kassieren ? 'Kassiert…' : `✓ Kassieren (${totalAmount.toFixed(2)} €)`}
            </button>
          </div>
        )}

        {pendingCount > 0 && isOnline && (
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 text-center">
            <p className="text-orange-700 text-sm font-medium">{pendingCount} Offline-Transaktion(en) ausstehend</p>
            <button onClick={syncPending} className="mt-1.5 px-4 py-1 bg-orange-500 hover:bg-orange-600 text-white text-sm rounded-lg transition-colors">
              Jetzt synchronisieren
            </button>
          </div>
        )}

        {/* Pending-review: items whose cash was collected but could not be recorded server-side */}
        {pendingReview.length > 0 && (
          <div className="bg-red-50 border border-red-300 rounded-xl p-3 mt-2">
            <p className="text-red-700 text-sm font-bold mb-1">⚠ Manuelle Prüfung erforderlich</p>
            <p className="text-red-600 text-xs mb-2">
              Diese Verkäufe konnten nicht automatisch übertragen werden (z. B. unbekannter QR-Code). Das Geld wurde bereits eingenommen – bitte manuell nachtragen und den Eintrag danach löschen.
            </p>
            <div className="space-y-2">
              {pendingReview.map(({ key, tx }) => (
                <div key={key} className="bg-white border border-red-200 rounded-lg p-2">
                  <div className="space-y-1 mb-2">
                    {tx.items.map((item, idx) => (
                      <div key={`${key}-${idx}`} className="flex items-center justify-between gap-2 text-sm">
                        <span className="text-gray-800 truncate">{item.title || '(ohne Titel)'}</span>
                        <span className="text-gray-500 text-xs font-mono truncate max-w-[40%]">{item.qrCode}</span>
                        <span className="font-semibold text-gray-800 flex-shrink-0">{item.salePrice.toFixed(2)} €</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-red-500 mb-2">Manuell nachtragen und Eintrag löschen</p>
                  <button
                    onClick={() => handleDeletePendingReview(key)}
                    className="w-full px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-medium rounded-lg transition-colors"
                  >
                    Eintrag löschen
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
