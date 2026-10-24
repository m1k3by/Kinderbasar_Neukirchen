/**
 * Höchster speicherbarer Artikelpreis in €.
 *
 * Das ist die technische Spaltengrenze von `Article.price` und `SellerArticle.price`
 * (`Decimal(6,2)` → 9999.99), KEINE fachliche Regel. Darüber wirft Postgres „numeric field
 * overflow" und der Nutzer sieht einen 500er. Eine niedrigere fachliche Obergrenze wäre eine
 * Orga-Entscheidung.
 */
export const MAX_ARTICLE_PRICE = 9999.99;

export const PRICE_TOO_HIGH_MESSAGE = 'Preis zu hoch – höchstens 9.999,99 €.';
