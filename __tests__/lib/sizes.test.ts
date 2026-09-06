import { describe, it, expect } from 'vitest';
import { DEFAULT_SIZES, parseSizes, sizeGroups } from '@/app/lib/sizes';

const DOPPEL = [
  '50/56', '62/68', '74/80', '86/92', '98/104',
  '110/116', '122/128', '134/140', '146/152', '158/164', '170/176',
];

describe('DEFAULT_SIZES', () => {
  it('enthält alle Doppelgrößen', () => {
    const alle = parseSizes(DEFAULT_SIZES);
    for (const d of DOPPEL) expect(alle).toContain(d);
  });

  it('behält die Einzelgrößen daneben', () => {
    // "einfach extra" – die Doppelgrößen ersetzen nichts.
    const alle = parseSizes(DEFAULT_SIZES);
    for (const s of ['50', '56', '104', '176']) expect(alle).toContain(s);
  });

  it('enthält keine Dubletten', () => {
    const roh = DEFAULT_SIZES.split(',').map(s => s.trim());
    expect(new Set(roh).size).toBe(roh.length);
  });
});

describe('sizeGroups', () => {
  const gruppen = sizeGroups(parseSizes(DEFAULT_SIZES));
  const von = (label: string) => gruppen.find(g => g.label === label)!.sizes;

  it('steckt die Doppelgrößen in die cm-Gruppe, nicht in eine eigene', () => {
    // Vorgabe: an der Bedienung soll sich nichts ändern – also keine fünfte Gruppe.
    expect(gruppen).toHaveLength(4);
    for (const d of DOPPEL) expect(von('Kleidung – Größentabelle (cm)')).toContain(d);
  });

  it('lässt keine Doppelgröße in die Schuhgruppe rutschen', () => {
    // 50/56 beginnt mit einer Zahl im Schuhbereich – ohne die Slash-Prüfung
    // könnte sie dort landen.
    const schuhe = von('Schuhe');
    for (const d of DOPPEL) expect(schuhe).not.toContain(d);
  });

  it('ordnet jede Größe genau einer Gruppe zu', () => {
    // Der eigentliche Regressionsschutz: eine Größe, die durch alle Filter fällt,
    // steht in der Liste, erscheint aber in keiner Auswahl – stumm.
    const alle = parseSizes(DEFAULT_SIZES);
    for (const s of alle) {
      const treffer = gruppen.filter(g => g.sizes.includes(s)).map(g => g.label);
      expect({ [s]: treffer }).toEqual({ [s]: [expect.any(String)] });
    }
  });
});

describe('parseSizes', () => {
  it('verträgt Doppelgrößen in einer basar-eigenen Liste', () => {
    expect(parseSizes('86/92, 98/104 ,86/92')).toEqual(['86/92', '98/104']);
  });

  it('fällt bei leerer Liste auf DEFAULT_SIZES zurück', () => {
    expect(parseSizes('')).toEqual(parseSizes(DEFAULT_SIZES));
    expect(parseSizes(null)).toEqual(parseSizes(DEFAULT_SIZES));
  });
});
