/**
 * Auszahlbeträge auf volle 10 Cent runden – kaufmännisch, bei genau 5 Cent aufwärts.
 *
 * Grund ist die Barauszahlung am Basartag: 1-, 2- und 5-Cent-Münzen muss dann niemand
 * vorhalten. Die Orga macht das auf ihrem Papier-Abrechnungsblatt seit jeher so
 * (Frühjahr/Sommer-Basar 2026: „Ergebnis 162,78 €" → „Auszahlbetrag, gerundet 162,80 €").
 *
 * Die Provision bleibt davon unberührt und wird weiter exakt ausgewiesen; die
 * Rundungsdifferenz von höchstens 5 Cent trägt der Basar. Deshalb steht auf der Abrechnung
 * beides: das exakte Ergebnis und der gerundete Auszahlbetrag darunter.
 */

/**
 * @param amount Betrag in Euro.
 * @returns Auf 10 Cent gerundeter Betrag in Euro.
 *
 * Gerechnet wird über ganze Cent, nicht als `Math.round(amount * 10) / 10`. Für positive
 * Beträge liefern beide Fassungen dasselbe – nachgemessen über alle 200 001 Cent-Beträge
 * von 0,00 € bis 2000,00 €, null Abweichungen. Der Unterschied liegt bei negativen
 * Beträgen auf exakt 5 Cent: `Math.round` rundet Richtung +∞, aus −17,75 € würde −17,70 €
 * statt −17,80 €. Negative Auszahlungen entstehen heute nicht (die Abrechnung begrenzt auf
 * 0), aber eine Rundungsfunktion, die je nach Vorzeichen in eine andere Richtung läuft,
 * wäre ein stiller Fehler, falls doch einmal eine Gebühr den Erlös übersteigt.
 */
export function roundPayout(amount: number): number {
  const cents = Math.round(amount * 100);
  const sign = cents < 0 ? -1 : 1;
  const roundedCents = Math.floor((Math.abs(cents) + 5) / 10) * 10;
  return (sign * roundedCents) / 100;
}
