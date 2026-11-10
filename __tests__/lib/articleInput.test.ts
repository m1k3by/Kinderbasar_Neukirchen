import { describe, it, expect } from 'vitest';
import { normalizeTags, parseArticleInput } from '@/app/lib/articleInput';

describe('normalizeTags', () => {
  it('trimmt, entfernt Doppelte ohne Groß/klein und schreibt Standard-Tags kanonisch', () => {
    expect(normalizeTags([' sommer ', 'SOMMER', 'Mädchen  4 J.', 'mädchen 4 j.', '', 7, null])).toEqual(['Sommer', 'Mädchen 4 J.']);
  });
  it('kein Array → leer; höchstens 10 Tags à 30 Zeichen', () => {
    expect(normalizeTags('Sommer')).toEqual([]);
    expect(normalizeTags(Array.from({ length: 15 }, (_, i) => `t${i}`))).toHaveLength(10);
    expect(normalizeTags(['x'.repeat(50)])[0]).toHaveLength(30);
  });
});

describe('parseArticleInput', () => {
  it('lehnt fehlenden, nicht positiven und zu hohen Preis ab', () => {
    expect(parseArticleInput({ title: 'A' })).toHaveProperty('error');
    expect(parseArticleInput({ title: 'A', price: -1 })).toHaveProperty('error');
    expect(parseArticleInput({ title: 'A', price: 100000 })).toHaveProperty('error');
  });
  it('unbekanntes Geschlecht wird null, Tags werden normalisiert', () => {
    expect(parseArticleInput({ title: 'A', price: '2.5', gender: 'x', tags: ['winter'] })).toEqual({
      data: { title: 'A', sizeLabel: null, gender: null, price: 2.5, tags: ['Winter'] },
    });
  });
});
