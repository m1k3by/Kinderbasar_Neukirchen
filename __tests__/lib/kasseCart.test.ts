import { describe, it, expect } from 'vitest';
import {
  cartKey, serializeCart, parseCart, withoutPending, unbookedItems, cacheScanDecision,
  type ScannedArticle,
} from '@/app/lib/kasseCart';

const item = (qr: string, over: Partial<ScannedArticle> = {}): ScannedArticle => ({
  id: `id-${qr}`, title: `Artikel ${qr}`, price: 2.5, salePrice: 2.5, sellerId: 1001,
  sellerName: 'Muster', qrCode: qr, basarId: 'b1', ...over,
});

describe('kasseCart: Speicherformat', () => {
  it('Schlüssel gilt pro Basar, nicht pro Nutzer', () => {
    expect(cartKey('b1')).toBe('kasse-cart-b1');
  });

  it('Rundlauf serialize → JSON → parse liefert dieselben Positionen', () => {
    const items = [item('A'), item('B', { sizeLabel: '104' })];
    const stored = JSON.parse(JSON.stringify(serializeCart('b1', items, 123)));
    expect(stored).toMatchObject({ v: 1, basarId: 'b1', savedAt: 123 });
    expect(parseCart(stored, 'b1')).toEqual([
      { ...items[0], sizeLabel: undefined },
      items[1],
    ]);
  });

  it('verwirft einen Stand eines anderen Basars', () => {
    expect(parseCart(serializeCart('b2', [item('A', { basarId: 'b2' })]), 'b1')).toEqual([]);
    // Wrapper eines fremden Basars, Positionen tragen aber zufällig die richtige basarId.
    expect(parseCart(serializeCart('b2', [item('A')]), 'b1')).toEqual([]);
  });

  it.each([undefined, null, 'text', 42, [], {}, { v: 2, basarId: 'b1', items: [] }, { v: 1, basarId: 'b1', items: 'x' }])(
    'falsches Format %j → leer, keine Ausnahme',
    (raw) => { expect(parseCart(raw, 'b1')).toEqual([]); },
  );

  it('verwirft kaputte Positionen einzeln und behält die guten', () => {
    const raw = {
      v: 1, basarId: 'b1', savedAt: 1,
      items: [item('OK'), null, 'x', { ...item('P1'), price: '2.5' }, { ...item('P2'), qrCode: '' }, item('FREMD', { basarId: 'b9' }), { title: 'ohne id' }],
    };
    expect(parseCart(raw, 'b1').map(i => i.qrCode)).toEqual(['OK']);
  });

  it('entfernt doppelte QR-Codes', () => {
    expect(parseCart(serializeCart('b1', [item('A'), item('A')]), 'b1')).toHaveLength(1);
  });
});

describe('kasseCart: Offline-Vorgänge', () => {
  it('filtert Positionen heraus, die schon in einem pending-sale liegen', () => {
    const out = withoutPending([item('A'), item('B'), item('C')], new Set(['B']));
    expect(out.map(i => i.qrCode)).toEqual(['A', 'C']);
  });
});

describe('kasseCart: Teilfehler beim Kassieren', () => {
  const cart = [item('A'), item('B'), item('C')];

  it('alles gebucht → Warenkorb leer', () => {
    expect(unbookedItems(cart, [{ success: true }, { success: true }, { success: true }])).toEqual([]);
  });

  it('nur nicht gebuchte Positionen bleiben', () => {
    const results = [{ success: true }, { error: 'Bereits verkauft' },{ success: true }];
    expect(unbookedItems(cart, results).map(i => i.qrCode)).toEqual(['B']);
  });

  it('fehlendes Ergebnis zählt als nicht gebucht (Geld nie still verlieren)', () => {
    expect(unbookedItems(cart, [{ success: true }]).map(i => i.qrCode)).toEqual(['B', 'C']);
  });
});

describe('kasseCart: Scan ohne Server', () => {
  it('nicht im Cache → unknown', () => { expect(cacheScanDecision(undefined)).toBe('unknown'); });
  it('SOLD laut Cache → sold', () => { expect(cacheScanDecision({ status: 'SOLD' })).toBe('sold'); });
  it('AVAILABLE/RETURNED/ohne Status → use', () => {
    expect(cacheScanDecision({ status: 'AVAILABLE' })).toBe('use');
    expect(cacheScanDecision({ status: 'RETURNED' })).toBe('use');
    expect(cacheScanDecision({})).toBe('use');
  });
});
