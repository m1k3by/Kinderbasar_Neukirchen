/**
 * Kanonische Größenliste.
 *
 * Wird beim Anlegen eines Basars nach Basar.allowedSizes kopiert und dort pro
 * Basar angepasst. Dient ausserdem als Fallback, solange ein Basar keine eigene
 * Liste hat.
 *
 * Die Liste ist bewusst eine Vorschlagsliste für das Artikel-Formular, keine
 * harte Validierung: SellerArticle (persönliches Artikelarchiv) wird über
 * Basare hinweg wiederverwendet, eine in Basar A gültige Größe darf beim
 * Übernehmen in Basar B nicht fehlschlagen.
 */
export const DEFAULT_SIZES =
  'XXS,XS,S,M,L,XL,XXL,3XL,4XL,5XL,' +
  '50,56,62,68,74,80,86,92,98,104,110,116,122,128,134,140,146,152,158,164,170,176,' +
  'W24,W25,W26,W27,W28,W29,W30,W31,W32,W33,W34,W36,W38,W40,W42,W44,' +
  '18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49';

/** CSV → Größenliste, leer/fehlend fällt auf DEFAULT_SIZES zurück. Dedupliziert. */
export function parseSizes(raw?: string | null): string[] {
  const parts = (raw && raw.trim() ? raw : DEFAULT_SIZES)
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  return Array.from(new Set(parts));
}

/** Gruppierung für die Chip-Auswahl im Basar-Formular. */
export function sizeGroups(sizes: string[] = parseSizes()) {
  return [
    {
      label: 'Kleidung – Buchstaben',
      sizes: sizes.filter(s => /^(XXS|XS|S|M|L|XL|XXL|3XL|4XL|5XL)$/.test(s)),
    },
    {
      label: 'Kleidung – Größentabelle (cm)',
      sizes: sizes.filter(s => /^\d+$/.test(s) && +s >= 50 && +s <= 176),
    },
    {
      label: 'Hosen (W-Größen)',
      sizes: sizes.filter(s => /^W\d+$/.test(s)),
    },
    {
      label: 'Schuhe',
      sizes: sizes.filter(s => /^\d+$/.test(s) && +s >= 18 && +s <= 49),
    },
  ];
}
