'use client';

import { useState, useEffect, useRef, use, useCallback } from 'react';
import Link from 'next/link';
import Header from '../../../../components/Header';

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
}

interface PendingTransaction {
  id: string; // idempotency key
  basarId: string;
  items: ScannedArticle[];
  timestamp: number;
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
  const scannerRef = useRef<any>(null);
  const scannerDivRef = useRef<HTMLDivElement>(null);
  // Ref-based Set tracks scanned codes independently of React state batching
  // This prevents duplicate scans from rapid re-fires of the scanner callback
  const scannedCodesRef = useRef<Set<string>>(new Set());
  const audioCtxRef = useRef<AudioContext | null>(null);

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

  // Track online status
  useEffect(() => {
    setIsOnline(navigator.onLine);
    const handleOnline = () => { setIsOnline(true); syncPending(); };
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => { window.removeEventListener('online', handleOnline); window.removeEventListener('offline', handleOffline); };
  }, []);

  // Load pending count from IndexedDB on mount
  useEffect(() => { loadPendingCount(); }, []);

  async function loadPendingCount() {
    try {
      const { keys } = await import('idb-keyval');
      const allKeys = await keys();
      const pending = allKeys.filter(k => String(k).startsWith('pending-sale-'));
      setPendingCount(pending.length);
    } catch { /* ignore */ }
  }

  const syncPending = useCallback(async () => {
    try {
      const { keys, get, del } = await import('idb-keyval');
      const allKeys = await keys();
      const pendingKeys = allKeys.filter(k => String(k).startsWith('pending-sale-'));
      for (const key of pendingKeys) {
        const tx = await get<PendingTransaction>(key);
        if (!tx) continue;
        try {
          const res = await fetch(`/api/basars/${tx.basarId}/sales`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: tx.items.map(i => ({ qrCode: i.qrCode, salePrice: i.salePrice })) }),
          });
          if (res.ok) { await del(key); setPendingCount(p => Math.max(0, p - 1)); }
        } catch { /* keep for next sync */ }
      }
    } catch { /* ignore */ }
  }, []);

  async function startScanner() {
    setScannerError('');
    setScanning(true);
    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      const scanner = new Html5Qrcode('qr-reader-container');
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        async (decodedText: string) => {
          // Pause scanner while processing
          try { await scanner.pause(); } catch { /* ignore */ }
          await handleQrScan(decodedText);
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

  async function handleQrScan(qrCode: string) {
    // Use ref-based Set to catch duplicates even under stale React closures
    if (scannedCodesRef.current.has(qrCode)) {
      showMessage('Artikel bereits im Warenkorb!', 'error');
      playScanError();
      return;
    }
    // Reserve the code immediately to block concurrent scans of the same code
    scannedCodesRef.current.add(qrCode);
    try {
      const res = await fetch(`/api/articles/scan/${encodeURIComponent(qrCode)}`);
      const data = await res.json();
      if (!res.ok) {
        scannedCodesRef.current.delete(qrCode); // release on error so it could be retried
        showMessage(data.error || 'Fehler beim Laden des Artikels', 'error');
        playScanError();
        return;
      }
      setCart(prev => [...prev, { ...data, salePrice: data.price }]);
      showMessage(`✓ "${data.title}" hinzugefügt`, 'success');
      playScanSuccess();
    } catch {
      scannedCodesRef.current.delete(qrCode);
      showMessage('Netzwerkfehler beim Scannen', 'error');
      playScanError();
    }
  }

  function showMessage(text: string, type: 'success' | 'error' | 'info') {
    setMessage(text);
    setMessageType(type);
    setTimeout(() => setMessage(''), 3000);
  }

  async function handleKassieren() {
    if (cart.length === 0) return;
    setKassieren(true);
    const items = cart.map(i => ({ qrCode: i.qrCode, salePrice: i.salePrice }));
    try {
      const res = await fetch(`/api/basars/${basarId}/sales`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
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
        setCashInput('');
        }
      } else if (!navigator.onLine || res.status >= 500) {
        await saveOffline(items);
      } else {
        const data = await res.json();
        showMessage(data.error || 'Fehler beim Kassieren', 'error');
      }
    } catch {
      // Network error → save offline
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
      <Header
        links={[
          { href: '/admin', label: 'Basarliste' },
          { href: '/admin/basars', label: 'Basare', active: true },
          { href: '/admin/list', label: 'Helferliste' },
          { href: '/admin/tasks', label: 'Aufgaben' },
          { href: '/admin/settings', label: 'Datum einstellen' },
          { href: '/', label: 'Logout' },
        ]}
      />

      {/* Status bar */}
      <div className={`text-center text-sm py-1.5 font-medium ${isOnline ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}>
        {isOnline ? '● Online' : '● Offline – Verkäufe werden lokal gespeichert'}
        {pendingCount > 0 && ` · ${pendingCount} ausstehende Sync(s)`}
      </div>

      <div className="max-w-2xl mx-auto p-4">
        <h1 className="text-2xl font-bold text-gray-800 mb-4">Kasse</h1>

        {message && (
          <div className={`mb-4 px-4 py-3 rounded-lg font-medium border ${msgColors[messageType]}`}>
            {message}
          </div>
        )}

        {/* QR Scanner */}
        <div className="bg-white rounded-xl shadow-md p-5 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-700">QR-Code Scanner</h2>
            <button
              onClick={scanning ? stopScanner : startScanner}
              className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${scanning ? 'bg-red-100 text-red-700 hover:bg-red-200' : 'bg-yellow-500 hover:bg-yellow-600 text-gray-900'}`}
            >
              {scanning ? '■ Scanner stoppen' : '▶ Scanner starten'}
            </button>
          </div>

          {scannerError && <p className="text-red-600 text-sm mb-2">{scannerError}</p>}

          <div
            id="qr-reader-container"
            ref={scannerDivRef}
            className={`w-full rounded-lg overflow-hidden bg-gray-100 ${scanning ? 'block' : 'hidden'}`}
            style={{ minHeight: scanning ? '300px' : '0' }}
          />

          {!scanning && (
            <p className="text-gray-400 text-sm text-center py-4">Scanner stoppen und starten um Artikel zu scannen</p>
          )}
        </div>

        {/* Cart */}
        <div className="bg-white rounded-xl shadow-md p-5 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-700">Warenkorb ({cart.length})</h2>
            {cart.length > 0 && (
              <button onClick={() => { if (confirm('Warenkorb leeren?')) { setCart([]); scannedCodesRef.current.clear(); setCashInput(''); } }}
                className="text-sm text-red-500 hover:underline">Leeren</button>
            )}
          </div>

          {cart.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-4">Noch keine Artikel gescannt</p>
          ) : (
            <div className="space-y-2">
              {cart.map(item => (
                <div key={item.qrCode} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-800 truncate">{item.title}</p>
                    <p className="text-xs text-gray-500">
                      Verk. #{item.sellerId}{item.sizeLabel && ` · ${item.sizeLabel}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <input
                      type="number"
                      min="0"
                      step="0.10"
                      value={item.salePrice}
                      onChange={e => setCart(prev => prev.map(c => c.qrCode === item.qrCode ? { ...c, salePrice: parseFloat(e.target.value) || 0 } : c))}
                      className="w-20 text-right border border-gray-300 rounded px-2 py-1 text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-yellow-500"
                    />
                    <span className="text-sm text-gray-500">€</span>
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
          <div className="bg-white rounded-xl shadow-md p-5 mb-4">
            <div className="flex justify-between items-center text-xl font-bold mb-4">
              <span>Gesamt:</span>
              <span className="text-green-600">{totalAmount.toFixed(2)} €</span>
            </div>

            {/* Change calculator */}
            <div className="mb-4">
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
              <div className={`text-center font-bold text-lg py-2 rounded-lg mb-4 ${change >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                {change >= 0 ? `Rückgeld: ${change.toFixed(2)} €` : `Zu wenig: ${Math.abs(change).toFixed(2)} €`}
              </div>
            )}

            <button
              onClick={handleKassieren}
              disabled={kassieren}
              className="w-full py-4 bg-green-500 hover:bg-green-600 text-white text-xl font-bold rounded-xl shadow-lg transition-all hover:scale-[1.01] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {kassieren ? 'Kassiert…' : `✓ Kassieren (${totalAmount.toFixed(2)} €)`}
            </button>
          </div>
        )}

        {pendingCount > 0 && isOnline && (
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 text-center">
            <p className="text-orange-700 font-medium">{pendingCount} Offline-Transaktion(en) ausstehend</p>
            <button onClick={syncPending} className="mt-2 px-4 py-1.5 bg-orange-500 hover:bg-orange-600 text-white text-sm rounded-lg transition-colors">
              Jetzt synchronisieren
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
