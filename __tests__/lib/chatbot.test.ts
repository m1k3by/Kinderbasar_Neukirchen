import { describe, it, expect } from 'vitest';
import { findAnswer, getSuggestedQuestions } from '@/app/lib/chatbot';
import { faqData } from '@/app/data/faq';

describe('findAnswer – acceptance queries', () => {
  it('answers a natural German question about printing labels', () => {
    const result = findAnswer('Wie kriege ich meine Etiketten gedruckt?', ['seller']);
    expect(result.type).toBe('answer');
    if (result.type === 'answer') expect(result.item.id).toBe('seller-etiketten');
  });

  // Beide Fragen enthalten "Etikett" und konkurrieren deshalb direkt. Vor dem 26.08.2026 gab
  // es "selbst machen" gar nicht – die Frage landete auf der Druck-Anleitung und wurde damit
  // nicht beantwortet, sondern nur in der Nähe des Themas abgelegt.
  it('separates "Etikett selber machen" from "Etiketten drucken"', () => {
    const selbst = findAnswer('kann ich mein Etikett selber machen?', ['seller']);
    expect(selbst.type).toBe('answer');
    if (selbst.type === 'answer') expect(selbst.item.id).toBe('seller-etiketten-selbst');

    const drucken = findAnswer('Wie drucke ich Etiketten aus?', ['seller']);
    expect(drucken.type).toBe('answer');
    if (drucken.type === 'answer') expect(drucken.item.id).toBe('seller-etiketten');
  });

  // Die Antwort beschrieb bis zum 26.08.2026 ein "Druckfenster" – also genau den
  // window.print()-Weg, den CLAUDE.md verbietet und den es hier nie gab. Der Pflichthinweis
  // aus derselben Regel (Punkt 5) fehlte dafür. Beides wird hier festgenagelt.
  it('the label answer describes the PDF download, not a print dialog', () => {
    const item = faqData.find((i) => i.id === 'seller-etiketten')!;
    expect(item.answer).not.toMatch(/Druckfenster/i);
    expect(item.answer).toMatch(/PDF/);
    expect(item.answer).toMatch(/Tatsächliche Größe/);
  });

  it('folds ASCII umlaut substitutes ("groesse" -> "größe")', () => {
    const result = findAnswer('groesse eingeben', ['seller']);
    expect(result.type).toBe('answer');
    if (result.type === 'answer') expect(result.item.id).toBe('seller-groessen');
  });

  it('disambiguates "artikel löschen" from "artikel erstellen"', () => {
    const result = findAnswer('artikel löschen', ['seller']);
    expect(result.type).toBe('answer');
    if (result.type === 'answer') {
      expect(result.item.id).toBe('seller-artikel-loeschen');
      expect(result.item.id).not.toBe('seller-artikel-erstellen');
    }
  });

  it('matches employee-only content ("kuchen mitbringen") in employee context', () => {
    const result = findAnswer('kuchen mitbringen', ['employee']);
    expect(result.type).toBe('answer');
    if (result.type === 'answer') expect(result.item.id).toBe('employee-kuchen');
  });

  it('returns "none" for gibberish input', () => {
    const result = findAnswer('asdfgh xyz', ['seller']);
    expect(result.type).toBe('none');
  });

  it('matches cashier content ("scanner geht nicht") when cashier context is present', () => {
    const result = findAnswer('scanner geht nicht', ['cashier']);
    expect(result.type).toBe('answer');
    if (result.type === 'answer') expect(result.item.id).toBe('cashier-scanner-fehler');
  });
});

describe('findAnswer – context filtering', () => {
  it('seller without cashier context never surfaces cashier-only FAQ items', () => {
    const cashierOnlyIds = new Set(
      faqData.filter((f) => f.roles.includes('cashier') && !f.roles.includes('seller')).map((f) => f.id)
    );
    const result = findAnswer('scanner geht nicht', ['seller']);
    if (result.type === 'answer') expect(cashierOnlyIds.has(result.item.id)).toBe(false);
    if (result.type === 'suggestions') {
      expect(result.items.every((i) => !cashierOnlyIds.has(i.id))).toBe(true);
    }
  });

  it('seller WITH cashier context does receive cashier FAQ items', () => {
    const result = findAnswer('scanner geht nicht', ['seller', 'cashier']);
    expect(result.type).toBe('answer');
    if (result.type === 'answer') expect(result.item.id).toBe('cashier-scanner-fehler');
  });

  it('every returned item (answer + alternatives) matches the given contexts', () => {
    const result = findAnswer('Wie kriege ich meine Etiketten gedruckt?', ['seller']);
    expect(result.type).toBe('answer');
    if (result.type === 'answer') {
      for (const item of [result.item, ...result.alternatives]) {
        expect(item.roles.some((r) => ['seller'].includes(r))).toBe(true);
      }
    }
  });
});

describe('findAnswer – edge cases', () => {
  it('returns "none" for an empty query', () => {
    expect(findAnswer('', ['seller']).type).toBe('none');
    expect(findAnswer('   ', ['seller']).type).toBe('none');
  });

  it('returns "none" when contexts is empty', () => {
    expect(findAnswer('Wie drucke ich Etiketten aus?', []).type).toBe('none');
  });

  it('caps alternatives at 2 and never includes the primary item', () => {
    const result = findAnswer('Wie kriege ich meine Etiketten gedruckt?', ['seller']);
    if (result.type === 'answer') {
      expect(result.alternatives.length).toBeLessThanOrEqual(2);
      expect(result.alternatives.every((a) => a.id !== result.item.id)).toBe(true);
    }
  });

  it('caps suggestions at 3 for an unconfident-but-plausible query', () => {
    const result = findAnswer('status', ['seller']);
    if (result.type === 'suggestions') {
      expect(result.items.length).toBeGreaterThan(0);
      expect(result.items.length).toBeLessThanOrEqual(3);
    }
  });
});

describe('getSuggestedQuestions', () => {
  it('returns a non-empty, capped list for a single context', () => {
    const qs = getSuggestedQuestions(['seller']);
    expect(qs.length).toBeGreaterThan(0);
    expect(qs.length).toBeLessThanOrEqual(5);
  });

  it('merges multiple contexts without duplicates, capped at 5', () => {
    const qs = getSuggestedQuestions(['seller', 'employee', 'cashier']);
    expect(qs.length).toBeLessThanOrEqual(5);
    expect(new Set(qs).size).toBe(qs.length);
  });

  it('falls back to seller questions for an unknown/empty context list', () => {
    const qs = getSuggestedQuestions([]);
    expect(qs.length).toBeGreaterThan(0);
  });
});
