import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';

/**
 * Etikettenbogen-Erzeugung – siehe docs/spec-etiketten-pdf.md.
 *
 * Zweck dieses Moduls ist Maßhaltigkeit: Der Bogen wird auf vorgestanzte Etiketten
 * gedruckt, jede Abweichung > ~1 mm macht ihn unbrauchbar. Deshalb ausschließlich
 * absolute mm-Koordinaten, PDF-Standardfonts (auf jedem System identische Metrik)
 * und QR-Codes als Vektor. Nichts hier darf von einer Render-Engine abhängen.
 */

/** Avery Zweckform 3475: 70 × 36 mm, 3 × 8 = 24 Etiketten je A4-Bogen. */
export const SHEET = {
  cols: 3,
  rows: 8,
  labelW: 70,
  labelH: 36,
  marginLeft: 0,   // 3 × 70 = 210 mm = volle A4-Breite, der Bogen ist randlos
  marginTop: 4.5,  // (297 − 8 × 36) / 2
} as const;

export const LABELS_PER_SHEET = SHEET.cols * SHEET.rows;

/**
 * Innenabstand zum Etikettenrand. 5 mm statt der optisch schöneren 2,5 mm, weil
 * die äußeren Spalten direkt an der Papierkante liegen und typische Laser-/
 * Tintendrucker 4–5 mm nicht bedrucken können – sonst wird links und rechts
 * abgeschnitten, unabhängig von der Druckskalierung.
 */
const PAD = 5;

const QR_SIZE = 17;          // mm, inkl. Quiet Zone
const QR_QUIET_MODULES = 2;  // Module Ruhezone, liegen innerhalb von QR_SIZE
const TEXT_X = 25;           // mm ab Etikettenkante: Beginn der Textspalte

const A4 = { w: 210, h: 297 } as const;

export interface LabelData {
  title: string;
  sizeLabel?: string | null;
  gender?: string | null;
  price: number;
  qrCode: string;
}

export interface LabelSheetOptions {
  /** Verkäufernummer, wird unter jedem QR-Code gedruckt. */
  sellerNr: number | string;
  /** Index des ersten belegten Etiketts auf dem Bogen (0-basiert) – für angebrochene Bögen. */
  from?: number;
}

const fmtPrice = (n: number) => `${n.toFixed(2).replace('.', ',')} €`;

/** Position eines Etikettenplatzes auf dem Bogen, in mm ab Blattecke oben links. */
export function slotPosition(slot: number): { x: number; y: number } {
  const indexOnSheet = slot % LABELS_PER_SHEET;
  const col = indexOnSheet % SHEET.cols;
  const row = Math.floor(indexOnSheet / SHEET.cols);
  return {
    x: SHEET.marginLeft + col * SHEET.labelW,
    y: SHEET.marginTop + row * SHEET.labelH,
  };
}

/**
 * Zeichnet einen QR-Code als Vektor-Rechtecke.
 *
 * Bewusst kein eingebettetes PNG: ein 300-px-Bild auf 17 mm ist bei 600 dpi bereits
 * interpoliert, was die Scanrate an der Kasse senkt. Horizontal benachbarte Module
 * werden zu einem Rechteck zusammengefasst – das halbiert die Zeichenoperationen.
 */
export function drawQr(doc: jsPDF, text: string, x: number, y: number, sizeMm: number): void {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const n = qr.modules.size;
  const m = sizeMm / (n + 2 * QR_QUIET_MODULES);

  doc.setFillColor(0, 0, 0);
  for (let r = 0; r < n; r++) {
    let c = 0;
    while (c < n) {
      if (!qr.modules.data[r * n + c]) {
        c++;
        continue;
      }
      let run = 1;
      while (c + run < n && qr.modules.data[r * n + c + run]) run++;
      doc.rect(
        x + (c + QR_QUIET_MODULES) * m,
        y + (r + QR_QUIET_MODULES) * m,
        m * run,
        m,
        'F'
      );
      c += run;
    }
  }
}

function drawFieldLabel(doc: jsPDF, text: string, x: number, y: number, align?: 'right') {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5);
  doc.setTextColor(170);
  doc.text(text, x, y, align ? { align } : undefined);
  doc.setTextColor(0);
}

function drawLabel(doc: jsPDF, a: LabelData, sellerNr: number | string, x: number, y: number) {
  const textW = SHEET.labelW - TEXT_X - PAD;
  const rightX = x + SHEET.labelW - PAD;

  drawQr(doc, a.qrCode, x + PAD, y + PAD, QR_SIZE);

  // Verkäufernummer mittig unter dem QR-Code
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(51);
  doc.text(String(sellerNr), x + PAD + QR_SIZE / 2, y + 25.8, { align: 'center' });
  doc.setTextColor(0);

  drawFieldLabel(doc, 'Bezeichnung', x + TEXT_X, y + 7.5);

  // Bezeichnung auf zwei Zeilen begrenzen. splitTextToSize nutzt die eingebauten
  // AFM-Metriken der Standardfonts und liefert damit überall dasselbe Ergebnis.
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  const lines = doc.splitTextToSize(a.title, textW) as string[];
  const shown = lines.slice(0, 2);
  if (lines.length > 2 && shown[1]) {
    shown[1] = shown[1].replace(/.$/, '…');
  }
  shown.forEach((line, i) => doc.text(line, x + TEXT_X, y + 11.5 + i * 3.6));

  drawFieldLabel(doc, 'Größe', x + TEXT_X, y + 24);
  drawFieldLabel(doc, 'Preis', rightX, y + 24, 'right');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(51);
  const size = a.sizeLabel?.trim() || '–';
  doc.text(size, x + TEXT_X, y + 28.5);
  if (a.gender) {
    doc.setFontSize(6);
    doc.setTextColor(29, 78, 216);
    doc.text(a.gender, x + TEXT_X + doc.getTextWidth(size) + 1.2, y + 28.5);
  }
  doc.setTextColor(0);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(fmtPrice(a.price), rightX, y + 29, { align: 'right' });
}

function newDoc(): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  // Hinweis an den Viewer, im Druckdialog „Tatsächliche Größe" vorzuwählen. Acrobat
  // wertet das aus, Chrome und Firefox nicht – der Hinweis in der Oberfläche bleibt
  // deshalb notwendig.
  doc.viewerPreferences({ PrintScaling: 'None' });
  return doc;
}

/** Erzeugt den Etikettenbogen. Seitenumbruch nach jeweils 24 Etiketten. */
export function buildLabelSheet(labels: LabelData[], opts: LabelSheetOptions): jsPDF {
  const doc = newDoc();
  const from = Math.max(0, Math.min(opts.from ?? 0, LABELS_PER_SHEET - 1));

  let lastPage = 0;
  labels.forEach((label, i) => {
    const slot = from + i;
    const page = Math.floor(slot / LABELS_PER_SHEET);
    if (page > lastPage) {
      doc.addPage();
      lastPage = page;
    }
    const { x, y } = slotPosition(slot);
    drawLabel(doc, label, opts.sellerNr, x, y);
  });

  return doc;
}

/**
 * Einseitige Testseite für Normalpapier: Etikettenraster als Umrisse plus zwei
 * Maßstriche. Damit lässt sich mit einem Lineal prüfen, ob der Drucker maßhaltig
 * arbeitet, ohne einen Etikettenbogen zu opfern.
 *
 * Bewusst getrennt vom echten Bogen: Avery 3475 ist randlos, auf dem Bogen selbst
 * ist keine Fläche frei, auf der Marken nicht quer über Etiketten laufen würden.
 */
export function buildCalibrationSheet(): jsPDF {
  const doc = newDoc();

  doc.setDrawColor(190);
  doc.setLineWidth(0.2);
  for (let row = 0; row < SHEET.rows; row++) {
    for (let col = 0; col < SHEET.cols; col++) {
      const { x, y } = slotPosition(row * SHEET.cols + col);
      doc.rect(x, y, SHEET.labelW, SHEET.labelH);
    }
  }

  doc.setDrawColor(0);
  doc.setLineWidth(0.3);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);

  // Waagerechter 100-mm-Strich mit 10-mm-Teilung, mittig auf dem Blatt
  const hy = SHEET.marginTop + 4 * SHEET.labelH;
  const hx = (A4.w - 100) / 2;
  doc.line(hx, hy, hx + 100, hy);
  for (let i = 0; i <= 100; i += 10) {
    doc.line(hx + i, hy - 1.5, hx + i, hy + 1.5);
  }
  doc.text('100 mm – muss exakt 10,0 cm messen', hx, hy - 3);

  // Senkrechter 50-mm-Strich
  const vx = A4.w / 2;
  const vy = hy + 10;
  doc.line(vx, vy, vx, vy + 50);
  for (let i = 0; i <= 50; i += 10) {
    doc.line(vx - 1.5, vy + i, vx + 1.5, vy + i);
  }
  doc.setFontSize(8);
  doc.text('50 mm', vx + 3, vy + 25);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('Testseite Etikettenraster – auf Normalpapier drucken', SHEET.marginLeft + PAD, SHEET.marginTop - 1.5);
  doc.setFontSize(8);
  doc.setTextColor(90);
  doc.text(
    'Mit „Tatsächliche Größe" / 100 % auf A4 drucken. Stimmen beide Maßstriche, passt auch der',
    hx,
    vy + 60
  );
  doc.text(
    'Etikettenbogen. Weichen sie ab, steht der Druckdialog auf „An Seite anpassen".',
    hx,
    vy + 64
  );
  doc.setTextColor(0);

  return doc;
}
