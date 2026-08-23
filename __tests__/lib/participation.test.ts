import { describe, it, expect } from 'vitest';
import { isParticipating, participationPayload } from '@/app/lib/participation';

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
