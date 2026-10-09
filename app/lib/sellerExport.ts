/**
 * Excel-Export der Verkäuferliste (/admin/list).
 *
 * Die Liste ist **global** – sie zeigt alle Verkäufer, nicht die eines Basars. Die Spalten
 * „Teilnahme" und „AGB/DS" beziehen sich aber auf den oben gewählten Basar. Ohne diese
 * Angabe ist eine exportierte Datei nicht interpretierbar: „Aktiv" allein sagt nichts, wenn
 * niemand mehr weiß, für welchen Basar. Deshalb steht der Basar als erste Spalte in *jeder*
 * Zeile – nicht nur im Dateinamen, denn Zeilen werden kopiert, zusammengeführt und sortiert,
 * Dateinamen gehen dabei verloren.
 *
 * Hier liegt nur die Abbildung Datensatz → Zeile; das Schreiben der Datei macht die Seite
 * mit `write-excel-file`. So ist die fachliche Zuordnung testbar, ohne eine XLSX-Datei
 * erzeugen zu müssen.
 */

export interface ExportSeller {
  sellerId: number;
  firstName: string;
  lastName: string;
  email: string;
  isEmployee: boolean;
  isCashier: boolean;
  isOrga: boolean;
  createdAt: string;
  /** Nur vorhanden, wenn die Liste mit einem Basar geladen wurde (siehe GET /api/sellers). */
  participation?: {
    isActive: boolean;
    viaOrga?: boolean;
    termsAcceptedAt?: string | null;
  } | null;
  _count?: { taskSignups: number; cakes: number };
}

export interface SellerExportRow {
  basar: string;
  nr: number;
  rolle: string;
  orga: string;
  kassierer: string;
  teilnahme: string;
  /** Fehlt die Zustimmung, bleibt die Zelle leer – in Excel filterbar, anders als ein Text. */
  agbAkzeptiert?: Date;
  listeAktiv: string;
  vorname: string;
  nachname: string;
  email: string;
  schichten: number;
  kuchen: number;
  registriert?: Date;
}

type ColumnType = StringConstructor | NumberConstructor | DateConstructor;

export interface SellerExportColumn {
  key: keyof SellerExportRow;
  header: string;
  width: number;
  type: ColumnType;
  format?: string;
}

/**
 * Spaltenreihenfolge und -breiten. Bewusst hier und nicht in der Seite: so kann ein Test
 * belegen, dass jede Spalte einen Kopf und eine Breite hat und die Reihenfolge stimmt.
 */
export const SELLER_EXPORT_COLUMNS: SellerExportColumn[] = [
  { key: 'basar', header: 'Basar', width: 34, type: String },
  { key: 'nr', header: 'Nr', width: 8, type: Number },
  { key: 'rolle', header: 'Rolle', width: 14, type: String },
  { key: 'orga', header: 'Orga', width: 8, type: String },
  { key: 'kassierer', header: 'Kassierer', width: 11, type: String },
  { key: 'teilnahme', header: 'Teilnahme', width: 14, type: String },
  { key: 'agbAkzeptiert', header: 'AGB/DS zugestimmt', width: 18, type: Date, format: 'dd.mm.yyyy' },
  { key: 'listeAktiv', header: 'In Liste eingetragen', width: 20, type: String },
  { key: 'vorname', header: 'Vorname', width: 18, type: String },
  { key: 'nachname', header: 'Nachname', width: 20, type: String },
  { key: 'email', header: 'E-Mail', width: 34, type: String },
  { key: 'schichten', header: 'Schichten', width: 11, type: Number },
  { key: 'kuchen', header: 'Kuchen', width: 9, type: Number },
  { key: 'registriert', header: 'Registriert', width: 13, type: Date, format: 'dd.mm.yyyy' },
];

/**
 * „Aktiv" im Sinne der Spalte „in eine Liste eingetragen": gilt nur für Mitarbeiter, denn
 * Schichten und Kuchen gibt es für Verkäufer nicht. Wird auch von der Seite selbst benutzt,
 * damit Anzeige und Export nicht auseinanderlaufen können.
 */
export function activityStatus(seller: ExportSeller): 'Aktiv' | 'Inaktiv' | '–' {
  if (!seller.isEmployee) return '–';
  const hasActivity = (seller._count?.taskSignups || 0) > 0 || (seller._count?.cakes || 0) > 0;
  return hasActivity ? 'Aktiv' : 'Inaktiv';
}

/** Leere oder unbrauchbare Datumsangaben werden zu undefined, nicht zu „Invalid Date". */
function toDate(value: string | null | undefined): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export function buildSellerExportRows(
  sellers: ExportSeller[],
  basarLabel: string
): SellerExportRow[] {
  return sellers.map(s => ({
    basar: basarLabel,
    nr: s.sellerId,
    rolle: s.isEmployee ? 'Mitarbeiter' : 'Verkäufer',
    orga: s.isOrga ? 'Ja' : '–',
    kassierer: s.isCashier ? 'Ja' : '–',
    // Dieselben Texte wie in der Tabelle: wer Bildschirm und Datei nebeneinander legt,
    // soll nicht zwei Vokabulare vergleichen müssen.
    teilnahme: s.participation?.viaOrga
      ? 'Aktiv (Orga)'
      : s.participation?.isActive
        ? 'Aktiv'
        : 'Inaktiv',
    agbAkzeptiert: toDate(s.participation?.termsAcceptedAt),
    listeAktiv: activityStatus(s),
    vorname: s.firstName,
    nachname: s.lastName,
    email: s.email,
    schichten: s._count?.taskSignups ?? 0,
    kuchen: s._count?.cakes ?? 0,
    registriert: toDate(s.createdAt),
  }));
}

/** ASCII-Slug für den Dateinamen – Umlaute und Sonderzeichen vertragen nicht alle Systeme. */
function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export function sellerExportFileName(basarTitle: string, now: Date = new Date()): string {
  const datum = now.toISOString().slice(0, 10);
  const teil = slug(basarTitle);
  return `verkaeuferliste-${teil ? `${teil}-` : ''}${datum}.xlsx`;
}

/**
 * Excel verbietet in Tabellenblattnamen : \ / ? * [ ] und mehr als 31 Zeichen. Ein Verstoß
 * macht die Datei nicht etwa hässlich, sondern unlesbar – Excel verweigert sie.
 */
export function excelSheetName(basarTitle: string): string {
  const cleaned = basarTitle.replace(/[:\\/?*[\]]/g, ' ').replace(/\s+/g, ' ').trim();
  return cleaned ? cleaned.slice(0, 31) : 'Verkäufer';
}
