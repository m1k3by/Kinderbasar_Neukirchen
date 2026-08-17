/**
 * Fassungsstände von AGB und Datenschutzerklärung.
 *
 * Beim Aktivieren der Basar-Teilnahme wird nicht nur festgehalten, *wann* jemand zugestimmt
 * hat, sondern auch *wozu* – ohne die Fassung ist ein Zeitstempel als Nachweis wertlos,
 * sobald der Text einmal geändert wurde (DSGVO Art. 7 Abs. 1: die Zustimmung muss
 * nachweisbar sein).
 *
 * WICHTIG: Diese Konstanten bei *jeder* inhaltlichen Änderung an app/agb/page.tsx bzw.
 * app/datenschutz/page.tsx hochsetzen. Beide Seiten zeigen den Wert als „Stand" an, damit
 * er nicht unbemerkt von der tatsächlichen Fassung abweichen kann.
 *
 * Format: ISO-Datum der Fassung. Sortierbar und ohne Mehrdeutigkeit vergleichbar.
 */
export const TERMS_VERSION = '2025-11-01';
export const PRIVACY_VERSION = '2025-11-01';

/** ISO-Fassungsdatum → „1. November 2025" für die Anzeige. */
export function legalVersionLabel(version: string): string {
  const date = new Date(`${version}T00:00:00Z`);
  if (isNaN(date.getTime())) return version;
  return date.toLocaleDateString('de-DE', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  });
}

export interface ConsentRecord {
  termsAcceptedAt?: string | Date | null;
  termsVersion?: string | null;
  privacyVersion?: string | null;
}

/**
 * Klartext-Zusammenfassung eines Zustimmungsnachweises für die Admin-Ansicht.
 *
 * Drei Zustände, die auseinandergehalten werden müssen:
 *  - keine Zustimmung dokumentiert (Altbestand oder vom Admin stellvertretend aktiviert),
 *  - Zustimmung mit bekannter Fassung,
 *  - Zustimmung ohne Fassung – Zeilen aus der Zeit vor der Versionierung. Die wird als
 *    „Fassung unbekannt" ausgewiesen und nicht stillschweigend als aktuelle Fassung
 *    dargestellt, sonst behauptet die Oberfläche einen Nachweis, den es nicht gibt.
 */
export function consentSummary(consent: ConsentRecord | null | undefined): string {
  if (!consent?.termsAcceptedAt) return 'Keine dokumentierte Zustimmung';

  const date = new Date(consent.termsAcceptedAt);
  const when = isNaN(date.getTime())
    ? 'unbekanntem Zeitpunkt'
    : date.toLocaleString('de-DE', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin',
      });

  const fassung = (label: string, version: string | null | undefined) =>
    `${label}: ${version ? `Fassung ${legalVersionLabel(version)}` : 'Fassung unbekannt'}`;

  return [
    `Zugestimmt am ${when}`,
    fassung('AGB', consent.termsVersion),
    fassung('Datenschutzerklärung', consent.privacyVersion),
  ].join('\n');
}
