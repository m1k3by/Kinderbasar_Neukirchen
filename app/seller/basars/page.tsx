import { permanentRedirect } from 'next/navigation';

/**
 * Die Basar-Liste ist in den Verkäuferbereich gemerged (siehe docs/spec-basare-im-
 * verkaeuferbereich.md): /seller zeigt jetzt Teilnahme UND Einstieg in die Artikel auf
 * einer Karte, der Tab "Basare" entfällt für Verkäufer und Mitarbeiter.
 *
 * Diese Route bleibt nur als Weiterleitung bestehen – für Lesezeichen und für den
 * PWA-Shortcut "Mein Basar" bereits installierter Apps, deren manifest.json noch auf
 * /seller/basars zeigt. Die Detailseite /seller/basars/[id] ist davon nicht betroffen.
 */
export default function SellerBasarsRedirect() {
  permanentRedirect('/seller');
}
