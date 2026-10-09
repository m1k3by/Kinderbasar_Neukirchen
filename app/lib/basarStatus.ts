/**
 * Statusablauf eines Basars: DRAFT → OPEN → ACTIVE → CLOSED, jeder Schritt einzeln, und jeder
 * genau einen Schritt zurücknehmbar.
 *
 * Eine Quelle für Server (PATCH /api/basars/[id]/status) und Oberfläche (/admin/basars/[id]).
 * Vorher standen die Übergänge zweimal im Code, und die Oberfläche kannte nur „vorwärts":
 * Der Server erlaubte das Zurücknehmen längst, ein Knopf dafür fehlte. Ein versehentliches
 * „→ Schließen" am Verkaufstag hätte alle Kassen stillgelegt, ohne Weg zurück in der App.
 *
 * Bewusst eigener String-Typ statt `BasarStatus` aus @prisma/client: diese Datei läuft auch
 * im Browser, und dort soll nichts aus dem Prisma-Paket landen.
 */
export type BasarStatusValue = 'DRAFT' | 'OPEN' | 'ACTIVE' | 'CLOSED';

export const NEXT_STATUS: Record<BasarStatusValue, BasarStatusValue | null> = {
  DRAFT: 'OPEN',
  OPEN: 'ACTIVE',
  ACTIVE: 'CLOSED',
  CLOSED: null,
};

export const PREVIOUS_STATUS: Record<BasarStatusValue, BasarStatusValue | null> = {
  DRAFT: null,
  OPEN: 'DRAFT',
  ACTIVE: 'OPEN',
  CLOSED: 'ACTIVE',
};

export const STATUS_LABELS: Record<BasarStatusValue, string> = {
  DRAFT: 'Entwurf',
  OPEN: 'Offen',
  ACTIVE: 'Aktiv',
  CLOSED: 'Geschlossen',
};

/**
 * Was ein Statuswechsel bewirkt – für die Rückfrage vor dem Klick. Jede Aussage ist im Code
 * belegt, nicht abgeleitet:
 *  - Artikel anlegen/übernehmen nur bei OPEN (articles/route.ts, articles/import/route.ts),
 *    löschen gesperrt bei ACTIVE/CLOSED (articles/[artId]/route.ts)
 *  - Kassieren nur bei ACTIVE (sales/route.ts)
 *  - Abrechnungen erzeugen nur bei CLOSED (settlements/route.ts); Neu-Erzeugen ersetzt alle
 *  - Provision, Gebühr, Limits gesperrt bei ACTIVE (lockedFieldsForActiveBasar)
 *  - Anmelden für Verkäufer gesperrt bei DRAFT und CLOSED (participation/route.ts)
 * Wer einen dieser Punkte im Code ändert, muss den Text hier mitziehen.
 */
const WARNINGS: Record<string, string> = {
  'DRAFT->OPEN':
    'Verkäufer können sich in den eingestellten Zeiträumen anmelden und Artikel anlegen.',
  'OPEN->ACTIVE':
    'Ab jetzt kann an den Kassen kassiert werden.\n' +
    'Artikel anlegen, übernehmen und löschen ist dann für alle gesperrt, ebenso Änderungen an Provision, Gebühr und Limits.',
  'ACTIVE->CLOSED':
    'Danach kann an KEINER Kasse mehr kassiert werden.\n' +
    'Erst dann lassen sich die Abrechnungen erzeugen.',
  'CLOSED->ACTIVE':
    'Die Kassen funktionieren wieder.\n' +
    'Bereits erzeugte Abrechnungen stimmen nach weiteren Verkäufen nicht mehr – nach dem erneuten Schließen neu erzeugen.',
  'ACTIVE->OPEN':
    'Kassieren ist dann an ALLEN Kassen gesperrt.\n' +
    'Verkäufer können wieder Artikel anlegen und löschen; verkaufte Artikel bleiben verkauft. ' +
    'Nur nutzen, um einen Fehlklick zu korrigieren.',
  'OPEN->DRAFT':
    'Verkäufer können sich dann nicht mehr anmelden und keine Artikel mehr anlegen.',
};

export function transitionWarning(from: BasarStatusValue, to: BasarStatusValue): string {
  return WARNINGS[`${from}->${to}`] ?? '';
}

/**
 * Vollständiger Text der Rückfrage, damit Vorwärts- und Rückwärtsknopf überall gleich fragen.
 * `title` für die Basar-Liste: dort muss in der Rückfrage stehen, *welcher* Basar gemeint ist.
 */
export function transitionConfirmText(from: BasarStatusValue, to: BasarStatusValue, title?: string): string {
  const warning = transitionWarning(from, to);
  const subject = title ? `„${title}": ` : '';
  return `${subject}Status von „${STATUS_LABELS[from]}" zu „${STATUS_LABELS[to]}" ändern?` + (warning ? `\n\n${warning}` : '');
}
