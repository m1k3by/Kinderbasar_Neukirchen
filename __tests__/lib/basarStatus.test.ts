import { describe, it, expect } from 'vitest';
import {
  NEXT_STATUS,
  PREVIOUS_STATUS,
  STATUS_LABELS,
  transitionWarning,
  transitionConfirmText,
  type BasarStatusValue,
} from '@/app/lib/basarStatus';

const ALLE: BasarStatusValue[] = ['DRAFT', 'OPEN', 'ACTIVE', 'CLOSED'];

/** Jeder Übergang, den Server und Knöpfe zulassen – vorwärts und zurück. */
const erlaubt = ALLE.flatMap(s => [
  ...(NEXT_STATUS[s] ? [[s, NEXT_STATUS[s]!] as const] : []),
  ...(PREVIOUS_STATUS[s] ? [[s, PREVIOUS_STATUS[s]!] as const] : []),
]);

describe('basarStatus', () => {
  it('Zurück ist genau die Umkehrung von Vorwärts', () => {
    // Sonst böte der Rückwärtsknopf einen Schritt an, den der Server ablehnt – oder einen,
    // der nicht dorthin führt, woher man kam.
    for (const s of ALLE) {
      const next = NEXT_STATUS[s];
      if (next) expect(PREVIOUS_STATUS[next]).toBe(s);
    }
    expect(PREVIOUS_STATUS.DRAFT).toBeNull();
    expect(NEXT_STATUS.CLOSED).toBeNull();
  });

  it('jeder erlaubte Übergang hat einen Warntext', () => {
    // Wer einen Schritt ergänzt und den Text vergisst, liefert eine Rückfrage ohne Folgen –
    // genau die, die vor dem Umbau „Status zu ‚Geschlossen' ändern?" lautete.
    expect(erlaubt).toHaveLength(6);
    for (const [from, to] of erlaubt) {
      expect(transitionWarning(from, to), `${from} → ${to}`).not.toBe('');
    }
  });

  it('warnt beim Schließen und beim Zurück auf Offen, dass die Kassen stehen', () => {
    expect(transitionWarning('ACTIVE', 'CLOSED')).toMatch(/KEINER Kasse/);
    expect(transitionWarning('ACTIVE', 'OPEN')).toMatch(/Kassieren ist dann an ALLEN Kassen gesperrt/);
  });

  it('erinnert beim Wiederöffnen der Kasse daran, Abrechnungen neu zu erzeugen', () => {
    expect(transitionWarning('CLOSED', 'ACTIVE')).toMatch(/neu erzeugen/);
  });

  it('nennt beim Aktivieren, dass Artikel danach gesperrt sind', () => {
    expect(transitionWarning('OPEN', 'ACTIVE')).toMatch(/Artikel anlegen, übernehmen und löschen ist dann für alle gesperrt/);
  });

  it('hat für nicht erlaubte Sprünge keinen Text', () => {
    expect(transitionWarning('DRAFT', 'CLOSED')).toBe('');
    expect(transitionWarning('CLOSED', 'OPEN')).toBe('');
  });

  it('Rückfrage nennt Ausgangs- und Zielstatus, den Basar und die Folgen', () => {
    const text = transitionConfirmText('ACTIVE', 'CLOSED', 'Herbst- und Winterbasar 2026');
    expect(text.startsWith('„Herbst- und Winterbasar 2026": Status von „Aktiv" zu „Geschlossen" ändern?')).toBe(true);
    expect(text).toContain(transitionWarning('ACTIVE', 'CLOSED'));
  });

  it('Rückfrage ohne Titel beginnt direkt mit dem Statuswechsel', () => {
    expect(transitionConfirmText('CLOSED', 'ACTIVE').startsWith('Status von „Geschlossen" zu „Aktiv" ändern?')).toBe(true);
  });

  it('hat für jeden Status eine Bezeichnung', () => {
    for (const s of ALLE) expect(STATUS_LABELS[s]).toBeTruthy();
  });
});
