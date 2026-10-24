import { describe, it, expect } from 'vitest';
import { pickSellerId } from '../../app/lib/sellerIdAllocation';

const range = (from: number, to: number, step = 1) => {
  const r: number[] = [];
  for (let n = from; n <= to; n += step) r.push(n);
  return r;
};
const all = range(1000, 9999);
const without = (xs: number[]) => all.filter(n => !xs.includes(n));

describe('pickSellerId', () => {
  it('leere Belegung: 1000', () => {
    expect(pickSellerId([])).toBe(1000);
  });

  it('Stufe 100 vor Stufe 10 vor Einern, auch wenn die Nummer größer ist', () => {
    // Ein 100er irgendwo frei schlägt freie 10er/Einer in leeren Blöcken
    const used = range(1000, 9999).filter(n => n % 100 === 0 && n !== 9900);
    expect(pickSellerId(used)).toBe(9900);
    // Alle 100er belegt: freier 10er vor freiem Einer
    const h = range(1000, 9999).filter(n => n % 100 === 0);
    expect(pickSellerId(h)! % 10).toBe(0);
    expect(pickSellerId(h)! % 100).not.toBe(0);
  });

  it('Block mit weniger Belegung gewinnt, auch mit größerer Nummer', () => {
    // Block 1 hat 2 belegte, Block 2 hat 1, alle anderen 0 -> aber andere Blöcke sind leerer
    const used = [1000, 1100, 2000];
    expect(pickSellerId(used)).toBe(3000);
    // nur Block 1 und 2 existieren effektiv: alle anderen Blöcke voll an 100ern
    const fill = range(3000, 9999).filter(n => n % 100 === 0);
    expect(pickSellerId([...used, ...fill])).toBe(2100); // Block 2 (1 belegt) vor Block 1 (2 belegt)
  });

  it('zählt ALLE belegten Nummern des Blocks, nicht nur die der Stufe', () => {
    // Block 1: 1000 + 50 Einer belegt; Block 2: 2000, 2100 belegt (2 Stück). Alle anderen Blöcke 100er-voll.
    const fill = range(3000, 9999).filter(n => n % 100 === 0);
    const used = [1000, ...range(1001, 1050), 2000, 2100, ...fill];
    expect(pickSellerId(used)).toBe(2200); // Block 2 hat weniger Belegung (2 < 51)
  });

  it('Gleichstand: kleinerer Block', () => {
    expect(pickSellerId([1000, 2000])).toBe(3000);
    const fill = range(3000, 9999).filter(n => n % 100 === 0);
    expect(pickSellerId([1000, 2000, ...fill])).toBe(1100);
  });

  it('x000 zählt als 100er', () => {
    const fill = range(1000, 9999).filter(n => n % 100 === 0 && n % 1000 !== 0);
    // nur die x000 sind frei -> 100er-Stufe, kleinster Block mit gleicher Belegung
    expect(pickSellerId(fill)).toBe(1000);
  });

  it('alle 100er belegt: 10er im am wenigsten belegten Block', () => {
    const h = range(1000, 9999).filter(n => n % 100 === 0);
    // Block 1 zusätzlich stark belegt
    const used = [...h, ...range(1001, 1009)];
    expect(pickSellerId(used)).toBe(2010);
  });

  it('alle 100er und 10er belegt: Einer', () => {
    const t = range(1000, 9999).filter(n => n % 10 === 0);
    expect(pickSellerId(t)).toBe(1001);
  });

  it('alles belegt: null', () => {
    expect(pickSellerId(all)).toBeNull();
    expect(pickSellerId(without([5555]))).toBe(5555);
  });

  it('Nummern außerhalb des Bereichs (z. B. 91001) zählen nicht', () => {
    expect(pickSellerId([91001, 999])).toBe(1000);
  });
});
