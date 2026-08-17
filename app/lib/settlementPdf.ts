import { jsPDF } from 'jspdf';

/**
 * Abrechnungs-PDF – serverseitiger Ersatz für die zwei früheren Client-Generatoren in
 * app/seller/basars/[id]/page.tsx und app/admin/basars/[id]/abrechnung/page.tsx.
 *
 * Wie bei app/lib/labels.ts gilt: absolute mm-Koordinaten, nur PDF-Standardfonts
 * (Helvetica), kein Textfluss durch die Engine. Anders als beim Etikettenbogen ist hier
 * kein vorgestanzter Bogen im Spiel, die Millimeter-Disziplin dient trotzdem der
 * Reproduzierbarkeit über Geräte hinweg.
 *
 * Reiner Generator: keine Prisma-Importe, keine Decimal-Typen. Die aufrufende Route
 * konvertiert Decimal → number, bevor die Daten hierher kommen.
 */

export interface SettlementPdfArticle {
  title: string;
  sizeLabel?: string | null;
  price: number;
  status: 'AVAILABLE' | 'SOLD' | 'RETURNED';
  soldAt?: string | null; // ISO
}

export interface SettlementPdfData {
  basarTitle: string;
  commissionPercent: number;
  sellerNr: number;
  sellerName: string;
  generatedAt: string; // ISO
  grossRevenue: number;
  commissionAmount: number;
  entryFeeAmount: number;
  netPayout: number;
  articles: SettlementPdfArticle[];
}

interface ArticleGroupSummary {
  count: number;
  sum: number;
}

export interface SummarizedArticles {
  offered: ArticleGroupSummary;
  sold: { summary: ArticleGroupSummary; articles: SettlementPdfArticle[] };
  /** Nicht verkaufte Artikel (AVAILABLE + RETURNED zusammen) – gehen ins persönliche Archiv zurück. */
  archive: { summary: ArticleGroupSummary; articles: SettlementPdfArticle[] };
}

const sumPrice = (articles: SettlementPdfArticle[]) => articles.reduce((s, a) => s + a.price, 0);

/**
 * Fachliche Kernregel (vom Nutzer bestätigt, siehe app/api/seller-articles/route.ts:37-39):
 * Angeboten = Verkauft + Archiv. Archiv sind alle Artikel mit status !== 'SOLD' – AVAILABLE
 * und RETURNED werden NICHT getrennt ausgewiesen, sondern als ein Block, weil für die
 * Übernahme in den nächsten Basar nur "verkauft oder nicht" entscheidet.
 *
 * Eigenständig exportiert und getestet, weil hier der einzige fachliche Kern des PDFs steckt –
 * der Rest ist reines Layout.
 */
export function summarizeArticles(articles: SettlementPdfArticle[]): SummarizedArticles {
  const sold = articles.filter(a => a.status === 'SOLD');
  const archive = articles.filter(a => a.status !== 'SOLD');
  return {
    offered: { count: articles.length, sum: sumPrice(articles) },
    sold: { summary: { count: sold.length, sum: sumPrice(sold) }, articles: sold },
    archive: { summary: { count: archive.length, sum: sumPrice(archive) }, articles: archive },
  };
}

const fmt = (n: number) => n.toFixed(2).replace('.', ',');
const fmtPrice = (n: number) => `${fmt(n)} €`;

/** Lange Titel wie im bisherigen Verkäufer-PDF auf zwei Zeilen kürzen. */
const shortTitle = (title: string) => (title.length > 40 ? title.substring(0, 38) + '…' : title);

const mL = 18; // linker Rand
const mR = 192; // rechter Rand

interface TableColumn {
  label: string;
  x: number;
  align?: 'right';
}

/** Zeichnet die Kopfzeile einer Tabelle und liefert die y-Position der ersten Datenzeile. */
function drawTableHeader(doc: jsPDF, y: number, columns: TableColumn[]): number {
  doc.setFillColor(243, 244, 246);
  doc.rect(mL, y - 5, mR - mL, 7, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(0);
  for (const col of columns) {
    doc.text(col.label, col.x, y, col.align ? { align: col.align } : undefined);
  }
  let ny = y + 2;
  doc.setDrawColor(200);
  doc.line(mL, ny, mR, ny);
  ny += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  return ny;
}

function ensurePageBreak(doc: jsPDF, y: number): number {
  if (y > 272) {
    doc.addPage();
    return 20;
  }
  return y;
}

/**
 * Rendert eine der beiden Artikeltabellen (verkauft / zurück ins Archiv) inklusive
 * Seitenumbruch. Bei Umbruch innerhalb der Tabelle wird die Kopfzeile auf der neuen Seite
 * wiederholt – das fehlte im bisherigen Client-Code.
 */
function drawArticleTable(
  doc: jsPDF,
  startY: number,
  title: string,
  emptyMessage: string,
  columns: TableColumn[],
  rows: SettlementPdfArticle[],
  renderRow: (row: SettlementPdfArticle, index: number, y: number) => void,
  totalsSum: number
): number {
  let y = ensurePageBreak(doc, startY);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(130);
  doc.text(title, mL, y);
  doc.setTextColor(0);
  y += 7;

  if (rows.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(10);
    doc.setTextColor(160);
    doc.text(emptyMessage, mL, y);
    doc.setTextColor(0);
    return y + 10;
  }

  y = drawTableHeader(doc, y, columns);

  rows.forEach((row, i) => {
    if (y > 272) {
      doc.addPage();
      y = drawTableHeader(doc, 20, columns);
    }
    if (i % 2 === 0) {
      doc.setFillColor(249, 250, 251);
      doc.rect(mL, y - 4.5, mR - mL, 7, 'F');
    }
    renderRow(row, i, y);
    y += 7;
  });

  doc.setDrawColor(180);
  doc.line(mL, y, mR, y);
  y += 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  const descColumn = columns.find(c => c.label === 'Beschreibung');
  doc.text(`${rows.length} Artikel gesamt`, descColumn?.x ?? mL + 12, y);
  const priceColumn = columns[columns.length - 1];
  doc.text(fmtPrice(totalsSum), priceColumn.x, y, priceColumn.align ? { align: priceColumn.align } : undefined);

  return y + 14;
}

/** Leeres Abrechnungsdokument mit den in CLAUDE.md vorgeschriebenen Einstellungen. */
export function newSettlementDoc(): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  doc.viewerPreferences({ PrintScaling: 'None' });
  return doc;
}

/**
 * Rendert die Abrechnung eines Verkäufers ab der *aktuellen* Seite des Dokuments. Erwartet
 * eine leere Seite (die Kopfzeile beginnt bei absoluten y=22) und hängt bei Bedarf weitere an.
 *
 * Getrennt von buildSettlementPdf, damit die Sammelabrechnung (alle Verkäufer in einer Datei)
 * dieselbe Layout-Logik benutzt statt einer zweiten Kopie – siehe
 * app/api/basars/[id]/settlements/abrechnungen.pdf/route.ts.
 */
export function drawSettlementPage(doc: jsPDF, data: SettlementPdfData): void {
  const { offered, sold, archive } = summarizeArticles(data.articles);

  // ── Kopf ────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('Abrechnung Kinderbasar', mL, 22);

  // Verkäufernummer oben rechts – das Merkmal, nach dem Abrechnungen sortiert und
  // ausgegeben werden, muss ohne Suchen erkennbar sein.
  doc.setFontSize(8);
  doc.setTextColor(130);
  doc.text('VERKÄUFERNUMMER', mR, 16, { align: 'right' });
  doc.setTextColor(0);
  doc.setFontSize(30);
  doc.text(`#${data.sellerNr}`, mR, 28, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  doc.text(data.basarTitle, mL, 32);
  doc.text(`Verkäufer: ${data.sellerName}`, mL, 40);

  doc.setFontSize(9);
  doc.setTextColor(140);
  doc.text(`Erstellt: ${new Date(data.generatedAt).toLocaleDateString('de-DE')}`, mL, 48);
  doc.setTextColor(0);

  doc.setDrawColor(210);
  doc.line(mL, 53, mR, 53);

  // ── Zusammenfassung ─────────────────────────────────────
  let y = 63;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(130);
  doc.text('ZUSAMMENFASSUNG', mL, y);
  doc.setTextColor(0);
  y += 7;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  const summaryRows: [string, string][] = [
    ['Brutto-Erlös:', fmtPrice(data.grossRevenue)],
    [`Provision (${data.commissionPercent}%):`, `– ${fmt(data.commissionAmount)} €`],
    ['Teilnahmegebühr:', `– ${fmt(data.entryFeeAmount)} €`],
  ];
  for (const [label, value] of summaryRows) {
    doc.text(label, mL, y);
    doc.text(value, mR, y, { align: 'right' });
    y += 8;
  }
  doc.setDrawColor(180);
  doc.line(mL, y, mR, y);
  y += 7;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('Netto-Auszahlung:', mL, y);
  doc.text(fmtPrice(data.netPayout), mR, y, { align: 'right' });
  y += 14;

  // ── Übersicht (Kernstück): angeboten = verkauft + Archiv ─
  doc.setDrawColor(210);
  doc.line(mL, y, mR, y);
  y += 9;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(130);
  doc.text('ÜBERSICHT', mL, y);
  doc.setTextColor(0);
  y += 7;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  const overviewRows: [string, string][] = [
    [`Angeboten: ${offered.count} Artikel`, fmtPrice(offered.sum)],
    [`Verkauft: ${sold.summary.count} Artikel`, fmtPrice(sold.summary.sum)],
    [`Zurück ins Archiv: ${archive.summary.count} Artikel`, fmtPrice(archive.summary.sum)],
  ];
  for (const [label, value] of overviewRows) {
    doc.text(label, mL, y);
    doc.text(value, mR, y, { align: 'right' });
    y += 8;
  }
  y += 1;
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  doc.setTextColor(150);
  const hint = doc.splitTextToSize(
    'Nicht verkaufte Artikel bleiben im persönlichen Archiv und können beim nächsten Basar direkt wieder übernommen werden.',
    mR - mL
  ) as string[];
  hint.forEach((line, i) => doc.text(line, mL, y + i * 4));
  doc.setTextColor(0);
  y += hint.length * 4 + 8;

  // ── Tabelle: verkaufte Artikel ────────────────────────────
  doc.setDrawColor(210);
  doc.line(mL, y, mR, y);
  y += 9;

  const soldColumns: TableColumn[] = [
    { label: '#', x: mL + 2 },
    { label: 'Beschreibung', x: mL + 12 },
    { label: 'Größe', x: mL + 108 },
    { label: 'Uhrzeit', x: mL + 138 },
    { label: 'Preis', x: mR - 2, align: 'right' },
  ];
  y = drawArticleTable(
    doc,
    y,
    `VERKAUFTE ARTIKEL (${sold.summary.count})`,
    'Keine Artikel verkauft.',
    soldColumns,
    sold.articles,
    (a, i, ry) => {
      doc.text(String(i + 1), mL + 2, ry);
      doc.text(shortTitle(a.title), mL + 12, ry);
      doc.text(a.sizeLabel?.trim() || '–', mL + 108, ry);
      const t = a.soldAt
        ? new Date(a.soldAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
        : '–';
      doc.text(t, mL + 138, ry);
      doc.text(fmtPrice(a.price), mR - 2, ry, { align: 'right' });
    },
    sold.summary.sum
  );

  // ── Tabelle: zurück ins Archiv ────────────────────────────
  const archiveColumns: TableColumn[] = [
    { label: '#', x: mL + 2 },
    { label: 'Beschreibung', x: mL + 12 },
    { label: 'Größe', x: mL + 108 },
    { label: 'Preis', x: mR - 2, align: 'right' },
  ];
  drawArticleTable(
    doc,
    y,
    `ZURÜCK INS ARCHIV (${archive.summary.count})`,
    'Keine Artikel gehen zurück ins Archiv.',
    archiveColumns,
    archive.articles,
    (a, i, ry) => {
      doc.text(String(i + 1), mL + 2, ry);
      doc.text(shortTitle(a.title), mL + 12, ry);
      doc.text(a.sizeLabel?.trim() || '–', mL + 108, ry);
      doc.text(fmtPrice(a.price), mR - 2, ry, { align: 'right' });
    },
    archive.summary.sum
  );
}

export function buildSettlementPdf(data: SettlementPdfData): jsPDF {
  const doc = newSettlementDoc();
  drawSettlementPage(doc, data);
  return doc;
}

/** Dateinamen-tauglicher ASCII-Slug (Content-Disposition verträgt keine Umlaute). */
export function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'basar';
}

export function pdfResponse(bytes: ArrayBuffer, filename: string): Response {
  return new Response(new Uint8Array(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      // Die Abrechnung kann neu generiert werden; ein zwischengespeichertes PDF könnte
      // veraltete Beträge zeigen.
      'Cache-Control': 'no-store',
    },
  });
}
