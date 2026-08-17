/**
 * Wie viele Artikel jemand in einem Basar anlegen darf.
 *
 * Zwei Gruppen, unterschieden über Seller.isEmployee:
 *  - Verkäufer          → Basar.maxArticlesPerSeller
 *  - Mitarbeiter / Orga → Basar.maxArticlesPerEmployee
 *
 * Orga-Leute arbeiten über Admin-Zugänge; Admins besitzen keine Verkäufernummer und legen
 * gar keine Artikel an (POST /api/basars/[id]/articles lehnt role 'admin' ab). Wer als Orga
 * eigene Artikel einstellt, tut das über sein Verkäuferkonto und ist dort als Mitarbeiter
 * gekennzeichnet – deshalb genügt ein Limit für beide, wie vom Nutzer festgelegt.
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
}

/**
 * @param override Einzelfall-Ausnahme aus BasarSeller.maxArticlesOverride. Sticht das
 *                 Gruppenlimit immer – sie wird pro Person bewusst gesetzt, auch nach unten.
 */
export function maxArticlesFor(
  basar: ArticleLimitBasar,
  seller: ArticleLimitSeller,
  override?: number | null
): number {
  if (override !== null && override !== undefined) return override;
  if (seller.isEmployee) return basar.maxArticlesPerEmployee ?? basar.maxArticlesPerSeller;
  return basar.maxArticlesPerSeller;
}
