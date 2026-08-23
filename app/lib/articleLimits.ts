/**
 * Wie viele Artikel jemand in einem Basar anlegen darf.
 *
 * Drei Gruppen, aufsteigend nach Vorrang:
 *  - Verkäufer                    → Basar.maxArticlesPerSeller
 *  - Mitarbeiter (isEmployee)     → Basar.maxArticlesPerEmployee, ersatzweise das Verkäuferlimit
 *  - Orga (isOrga)                → unbegrenzt
 *
 * Orga ist ein Zusatzkennzeichen für Mitarbeiter, das der Admin setzt (siehe
 * prisma/schema.prisma und app/api/admin/toggle-orga-status). Orga-Leute stellen die
 * Artikel ein, die dem Basar selbst gehören – Spenden, Fundsachen, Restposten – und für die
 * gibt es keine sinnvolle Obergrenze.
 *
 * `Infinity` statt null/undefined als „unbegrenzt": jeder vorhandene Vergleich der Form
 * `anzahl >= maxArticles` ergibt damit von selbst das Richtige und musste nirgends um einen
 * Sonderfall ergänzt werden. Nur für die Anzeige braucht es formatArticleLimit().
 *
 * maxArticlesPerEmployee ist absichtlich optional: Bestandsbasare haben den Wert nicht und
 * verhalten sich damit exakt wie bisher. Ein Pflichtfeld mit Vorgabewert hätte bei einem
 * Basar mit z. B. 80 Artikeln pro Verkäufer das Mitarbeiterlimit stillschweigend auf den
 * Vorgabewert gesenkt.
 */

export interface ArticleLimitBasar {
  maxArticlesPerSeller: number;
  /** null/undefined = keine eigene Vorgabe, es gilt das Verkäuferlimit. */
  maxArticlesPerEmployee?: number | null;
}

export interface ArticleLimitSeller {
  isEmployee: boolean;
  /** Orga-Kennzeichen. Fehlt es (Altaufrufe, Token ohne das Feld), gilt es als nicht gesetzt. */
  isOrga?: boolean | null;
}

/**
 * @param override Einzelfall-Ausnahme aus BasarSeller.maxArticlesOverride. Sticht jedes
 *                 Gruppenlimit, auch das unbegrenzte Orga-Limit – sie wird pro Person und
 *                 Basar bewusst gesetzt, auch nach unten. Wer einer Orga-Person eine
 *                 Obergrenze geben will, setzt sie hier.
 */
export function maxArticlesFor(
  basar: ArticleLimitBasar,
  seller: ArticleLimitSeller,
  override?: number | null
): number {
  if (override !== null && override !== undefined) return override;
  if (seller.isOrga) return Infinity;
  if (seller.isEmployee) return basar.maxArticlesPerEmployee ?? basar.maxArticlesPerSeller;
  return basar.maxArticlesPerSeller;
}

/** Anzeigetext für ein Limit – „unbegrenzt" statt der Zahl Infinity. */
export function formatArticleLimit(limit: number): string {
  return Number.isFinite(limit) ? String(limit) : 'unbegrenzt';
}
