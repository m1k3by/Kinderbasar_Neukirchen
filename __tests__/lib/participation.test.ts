import { describe, it, expect } from 'vitest';
import { isParticipating, participationPayload, matchesParticipantFilter } from '@/app/lib/participation';

const normal = { isOrga: false };
const orga = { isOrga: true };

describe('isParticipating', () => {
  it('folgt der BasarSeller-Zeile, wenn kein Orga-Kennzeichen vorliegt', () => {
    expect(isParticipating(normal, { isActive: true })).toBe(true);
    expect(isParticipating(normal, { isActive: false })).toBe(false);
  });

  it('gilt ohne Zeile als nicht teilnehmend', () => {
    expect(isParticipating(normal, null)).toBe(false);
    expect(isParticipating(normal, undefined)).toBe(false);
  });

  // Der Kern: Orga muss sich nirgends aktivieren, auch nicht in Basaren, für die es noch
  // gar keine BasarSeller-Zeile gibt.
  it('gilt für Orga auch ohne Zeile als teilnehmend', () => {
    expect(isParticipating(orga, null)).toBe(true);
    expect(isParticipating(orga, undefined)).toBe(true);
  });

  // Eine abgemeldete Zeile darf Orga nicht wieder inaktiv machen – sonst hinge die
  // Teilnahme doch wieder an einem Klick.
  it('überstimmt eine inaktive Zeile', () => {
    expect(isParticipating(orga, { isActive: false })).toBe(true);
  });

  it('behandelt fehlende Sellerdaten als nicht-Orga', () => {
    expect(isParticipating(null, { isActive: true })).toBe(true);
    expect(isParticipating(undefined, { isActive: false })).toBe(false);
    expect(isParticipating({}, null)).toBe(false);
  });
});

describe('participationPayload', () => {
  it('liefert null, wenn es weder Zeile noch Orga gibt', () => {
    expect(participationPayload(normal, null)).toBeNull();
  });

  it('reicht die Felder der Zeile durch und löst isActive auf', () => {
    const row = { isActive: true, activatedAt: null };
    expect(participationPayload(normal, row)).toEqual({ isActive: true, activatedAt: null, viaOrga: false });
  });

  // viaOrga trennt "ist angemeldet" von "kann sich abmelden": die Oberfläche schaltet den
  // Umschalter damit ab, statt eine wirkungslose Schaltfläche anzubieten.
  it('meldet viaOrga, wenn die Teilnahme aus dem Kennzeichen kommt', () => {
    expect(participationPayload(orga, null)).toEqual({ isActive: true, viaOrga: true });
    expect(participationPayload(orga, { isActive: false, activatedAt: null }))
      .toEqual({ isActive: true, activatedAt: null, viaOrga: true });
  });

  it('setzt viaOrga nicht, wenn jemand sich selbst aktiviert hat', () => {
    const out = participationPayload(normal, { isActive: true, activatedAt: '2026-08-01' });
    expect(out).toMatchObject({ isActive: true, viaOrga: false });
  });
});

describe('matchesParticipantFilter', () => {
  const zeile = (activated: boolean, articles: number, viaOrga = false) => ({ activated, viaOrga, _count: { articles } });

  it('„Alle" lässt jede Zeile durch', () => {
    expect(matchesParticipantFilter(zeile(true, 3), 'all')).toBe(true);
    expect(matchesParticipantFilter(zeile(false, 0), 'all')).toBe(true);
  });

  it('„Aktiv angemeldet" folgt der rohen Aktivierung, unabhängig von der Artikelzahl', () => {
    expect(matchesParticipantFilter(zeile(true, 0), 'activated')).toBe(true);
    expect(matchesParticipantFilter(zeile(true, 12), 'activated')).toBe(true);
    expect(matchesParticipantFilter(zeile(false, 12), 'activated')).toBe(false);
  });

  it('„Aktiv, ohne Artikel" verlangt beides', () => {
    expect(matchesParticipantFilter(zeile(true, 0), 'activatedNoArticles')).toBe(true);
    expect(matchesParticipantFilter(zeile(true, 1), 'activatedNoArticles')).toBe(false);
    expect(matchesParticipantFilter(zeile(false, 0), 'activatedNoArticles')).toBe(false);
  });

  it('nimmt Orga ohne eigene Aktivierung nicht auf, obwohl sie als teilnehmend gilt', () => {
    // Genau die Verwechslung, an der der Orga-Fehler vom 20.09.2026 hing: aufgelöstes
    // isActive (true wegen Orga) gegen die rohe Zeile (false). Der Filter muss die rohe
    // nehmen – sonst stimmt seine Zahl nicht mit der Kachel „aktiv angemeldet" überein,
    // die gegen maxSellers zählt, und Orga-Personen, die nicht verkaufen, landeten in der
    // Liste „noch keine Artikel".
    const orgaZeile = { activated: false, isActive: true, viaOrga: true, _count: { articles: 0 } };
    expect(matchesParticipantFilter(orgaZeile, 'activated')).toBe(false);
    expect(matchesParticipantFilter(orgaZeile, 'activatedNoArticles')).toBe(false);
  });

  it('„Orga ausblenden" entfernt Orga in jedem Filter, auch wenn sie sich selbst aktiviert hat', () => {
    const orgaAktiviert = zeile(true, 0, true);
    expect(matchesParticipantFilter(orgaAktiviert, 'all', true)).toBe(false);
    expect(matchesParticipantFilter(orgaAktiviert, 'activated', true)).toBe(false);
    expect(matchesParticipantFilter(orgaAktiviert, 'activatedNoArticles', true)).toBe(false);
    // Ohne das Häkchen bleibt sie in „Aktiv angemeldet" – sie belegt ja einen Platz.
    expect(matchesParticipantFilter(orgaAktiviert, 'activated')).toBe(true);
  });

  it('„Orga ausblenden" lässt normale Verkäufer und Mitarbeiter ohne Orga-Kennzeichen stehen', () => {
    // viaOrga kommt allein aus isOrga. Ein Mitarbeiter (isEmployee) ohne Orga hat viaOrga=false
    // und gehört laut Auftrag ausdrücklich zu den „normalen Verkäufern".
    const mitarbeiter = zeile(true, 0, false);
    expect(matchesParticipantFilter(mitarbeiter, 'all', true)).toBe(true);
    expect(matchesParticipantFilter(mitarbeiter, 'activatedNoArticles', true)).toBe(true);
  });
});
