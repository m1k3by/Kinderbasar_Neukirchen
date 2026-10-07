import { jsPDF } from 'jspdf';

/**
 * Anlieferzettel: ein A4-Blatt quer pro Person, große Verkäufernummer, dahinter „M" für
 * Mitarbeiter bzw. „ORGA", unten rechts „Angelieferte Kisten:" zum Ausfüllen von Hand an der
 * Anmeldung. Vorlage war ein von der Orga selbst gebautes Blatt („1095", „1060 M",
 * „1080 ORGA") – keine Namen, weil die Blätter offen an der Anmeldung liegen.
 *
 * Layout nach den PDF-Regeln in CLAUDE.md: serverseitig, absolute Millimeter,
 * PDF-Standardschrift (nicht eingebettet, keine Lizenz), PrintScaling None.
 */

export const PAGE = { width: 297, height: 210 } as const;

/** Innenabstand zur Papierkante. CLAUDE.md verlangt ≥ 5 mm; hier großzügig, weil Platz ist. */
export const MARGIN = 15;

/** Längster mögliche Nummerntext: Verkäufernummern reichen bis 9999, Orga ist der längste Zusatz. */
export const LONGEST_LABEL = '9999 ORGA';

const NUMBER_BASELINE = 115;

/**
 * Freie Breite rechts neben „Angelieferte Kisten:" zum Eintragen der Zahl von Hand.
 * Der Schriftzug ist rechtsbündig, endet aber nicht an der Papierkante – sonst bliebe
 * hinter dem Doppelpunkt kein Platz, und genau dort wird geschrieben.
 */
const WRITE_GAP = 40;

/** Rechtsbündig unten rechts. `right` ist der rechte Rand des Schriftzugs, nicht sein Anfang. */
const FOOTER = { right: PAGE.width - MARGIN - WRITE_GAP, y: 185, size: 32 };

export interface AnlieferzettelRow {
  sellerId: number;
  isOrga: boolean;
  isEmployee: boolean;
}

/** Orga sticht Mitarbeiter: Orga ist ein Zusatzkennzeichen *für* Mitarbeiter (CLAUDE.md). */
export function roleSuffix(row: { isOrga: boolean; isEmployee: boolean }): '' | 'M' | 'ORGA' {
  if (row.isOrga) return 'ORGA';
  if (row.isEmployee) return 'M';
  return '';
}

export function labelFor(row: AnlieferzettelRow): string {
  const suffix = roleSuffix(row);
  return suffix ? `${row.sellerId} ${suffix}` : String(row.sellerId);
}

/**
 * Eine Schriftgröße für alle Seiten, abgeleitet aus dem längsten möglichen Text. Bewusst
 * nicht pro Seite angepasst: „1095" stünde sonst riesig und „1080 ORGA" klein daneben, und
 * am Anlieferungstisch soll jede Nummer gleich groß und an derselben Stelle sein.
 */
export function numberFontSize(doc: jsPDF): number {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(100);
  const widthAt100 = doc.getTextWidth(LONGEST_LABEL);
  // 2 % Puffer, gemessen: jsPDF rechnet mit auf 1/100 em gerundeten Laufweiten (Ziffer 0,550),
  // gedruckt wird mit den echten Helvetica-Bold-Werten (0,556). „9999 ORGA" wird damit ~1 %
  // breiter, als getTextWidth sagt, und lag ohne Puffer 1 mm im Rand. Arial und andere
  // maßgleiche Ersatzschriften der Drucker haben dieselben Werte.
  return Math.floor((0.98 * 100 * (PAGE.width - 2 * MARGIN)) / widthAt100);
}

export function buildAnlieferzettel(rows: AnlieferzettelRow[]): jsPDF {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
  doc.viewerPreferences({ PrintScaling: 'None' });
  const size = numberFontSize(doc);

  rows.forEach((row, index) => {
    if (index > 0) doc.addPage();

    const label = labelFor(row);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(size);
    doc.text(label, (PAGE.width - doc.getTextWidth(label)) / 2, NUMBER_BASELINE);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(FOOTER.size);
    doc.text('Angelieferte Kisten:', FOOTER.right, FOOTER.y, { align: 'right' });
  });

  return doc;
}
