import { describe, it, expect } from 'vitest';
import zlib from 'zlib';
import { jsPDF } from 'jspdf';
import {
  buildAnlieferzettel,
  roleSuffix,
  labelFor,
  PAGE,
  MARGIN,
} from '@/app/lib/anlieferzettel';

const PT_PER_MM = 72 / 25.4;

/**
 * Text je Seite aus dem *erzeugten* PDF: Schriftgröße (letztes Tf) und linke Kante (Td).
 * Gemessen an der Datei, nicht an den Konstanten – eine Nummer, die über den Rand läuft,
 * sieht man am Bildschirm nicht, auf dem Papier ist sie abgeschnitten.
 * Die Standardschriften sind nicht eingebettet, also ist jeder Flate-Stream eine Seite.
 */
function pages(buf: Buffer) {
  const raw = buf.toString('latin1');
  const result: { pt: number; xMm: number; yMm: number; text: string }[][] = [];
  const re = /stream\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    const start = m.index + m[0].length;
    const end = raw.indexOf('endstream', start);
    if (end < 0) continue;
    let content: string;
    try {
      content = zlib.inflateSync(buf.subarray(start, end)).toString('latin1');
    } catch { continue; }
    if (!content.includes('Tj')) continue;

    const texts: { pt: number; xMm: number; yMm: number; text: string }[] = [];
    let pt = 0;
    const tre = /\/F\d+ ([\d.]+) Tf|([\d.]+) ([\d.]+) Td\s*\((.*?)\) Tj/g;
    let t: RegExpExecArray | null;
    while ((t = tre.exec(content)) !== null) {
      if (t[1] !== undefined) { pt = parseFloat(t[1]); continue; }
      // Im PDF zaehlt y von unten, im Generator von oben – hier auf „von oben" bringen,
      // damit sich die Zusicherungen gegen dieselben Zahlen lesen wie der Quelltext.
      texts.push({
        pt,
        xMm: parseFloat(t[2]) / PT_PER_MM,
        yMm: PAGE.height - parseFloat(t[3]) / PT_PER_MM,
        text: t[4],
      });
    }
    result.push(texts);
  }
  return result;
}

const pdf = (rows: Parameters<typeof buildAnlieferzettel>[0]) =>
  Buffer.from(buildAnlieferzettel(rows).output('arraybuffer') as ArrayBuffer);

const VK = { isOrga: false, isEmployee: false };
const MA = { isOrga: false, isEmployee: true };
const ORGA = { isOrga: true, isEmployee: true };

describe('roleSuffix / labelFor', () => {
  it('kennzeichnet Mitarbeiter mit M, Orga mit ORGA, Verkäufer gar nicht', () => {
    expect(roleSuffix(VK)).toBe('');
    expect(roleSuffix(MA)).toBe('M');
    expect(roleSuffix(ORGA)).toBe('ORGA');
  });

  it('Orga sticht Mitarbeiter – Orga ist ein Zusatzkennzeichen für Mitarbeiter', () => {
    // Jede Orga-Person ist zugleich Mitarbeiter. Prüfte die Funktion isEmployee zuerst,
    // stünde auf jedem Orga-Blatt nur „M".
    expect(roleSuffix({ isOrga: true, isEmployee: true })).toBe('ORGA');
  });

  it('setzt den Zusatz mit Leerzeichen hinter die Nummer, wie auf der Vorlage', () => {
    expect(labelFor({ sellerId: 1095, ...VK })).toBe('1095');
    expect(labelFor({ sellerId: 1060, ...MA })).toBe('1060 M');
    expect(labelFor({ sellerId: 1080, ...ORGA })).toBe('1080 ORGA');
  });
});

describe('buildAnlieferzettel', () => {
  it('ist A4 quer', () => {
    const mediaBox = pdf([{ sellerId: 1095, ...VK }]).toString('latin1').match(/\/MediaBox\s*\[([^\]]*)\]/)![1];
    const [, , w, h] = mediaBox.trim().split(/\s+/).map(Number);
    expect(w).toBeCloseTo(841.89, 1);
    expect(h).toBeCloseTo(595.28, 1);
  });

  it('eine Seite pro Person, in der übergebenen Reihenfolge, mit Feld für die Kistenzahl', () => {
    const seiten = pages(pdf([
      { sellerId: 1060, ...MA },
      { sellerId: 1080, ...ORGA },
      { sellerId: 1095, ...VK },
    ]));

    expect(seiten.map(s => s.map(t => t.text))).toEqual([
      ['1060 M', 'Angelieferte Kisten:'],
      ['1080 ORGA', 'Angelieferte Kisten:'],
      ['1095', 'Angelieferte Kisten:'],
    ]);
  });

  it('der längste mögliche Text passt mit Rand aufs Blatt', () => {
    // 9999 ist die höchste Verkäufernummer, ORGA der längste Zusatz.
    const [nummer] = pages(pdf([{ sellerId: 9999, ...ORGA }]))[0];
    // Helvetica-Bold, Laufweiten in 1/1000 em: Ziffer 556, Leerzeichen 278, O 778, R 722, G 778, A 722.
    const breiteMm = ((4 * 556 + 278 + 778 + 722 + 778 + 722) / 1000) * nummer.pt / PT_PER_MM;

    expect(nummer.xMm).toBeGreaterThanOrEqual(MARGIN - 0.5);
    expect(nummer.xMm + breiteMm).toBeLessThanOrEqual(PAGE.width - MARGIN + 0.5);
    // Und nicht winzig: die Nummer soll über den Tisch hinweg lesbar sein.
    expect(breiteMm).toBeGreaterThan(0.93 * (PAGE.width - 2 * MARGIN));
  });

  it('„Angelieferte Kisten:" steht unten rechts, groß, mit Platz zum Eintragen', () => {
    const [, fuss] = pages(pdf([{ sellerId: 1095, ...VK }]))[0];

    // Breite mit derselben Engine, die das PDF erzeugt hat. Fuer eine Abstandspruefung in
    // Zentimeterhoehe genuegt das; die ~1 % Abweichung zu den echten Helvetica-Laufweiten
    // zaehlt nur im randscharfen Fall der Nummer, und der hat seinen eigenen Test oben.
    const mess = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    mess.setFont('helvetica', 'normal');
    mess.setFontSize(fuss.pt);
    const rechteKante = fuss.xMm + mess.getTextWidth(fuss.text);

    // Deutlich groesser als die urspruenglichen 18 pt – lesbar quer ueber den Tisch.
    expect(fuss.pt).toBeGreaterThanOrEqual(28);
    // Unteres Blattviertel.
    expect(fuss.yMm).toBeGreaterThan(PAGE.height - 40);
    // Rechte Blatthaelfte: frueher stand der Schriftzug links bei x = 20 mm.
    expect(rechteKante).toBeGreaterThan(PAGE.width * 0.75);
    // Innerhalb des Randes …
    expect(rechteKante).toBeLessThanOrEqual(PAGE.width - MARGIN);
    // … und dahinter bleibt Platz, um die Zahl von Hand einzutragen. Ohne diese Zusicherung
    // koennte der Schriftzug buendig an den Rand rutschen und das Feld waere unbeschreibbar.
    expect(PAGE.width - MARGIN - rechteKante).toBeGreaterThanOrEqual(30);
  });

  it('jede Nummer hat dieselbe Schriftgröße und steht mittig', () => {
    const seiten = pages(pdf([{ sellerId: 1095, ...VK }, { sellerId: 1080, ...ORGA }]));
    const [kurz, lang] = seiten.map(s => s[0]);

    expect(kurz.pt).toBe(lang.pt);
    // Gleiche Größe, verschiedene Breite → die kurze Nummer beginnt weiter rechts.
    expect(kurz.xMm).toBeGreaterThan(lang.xMm);
    // Toleranz 1 mm, gemessen statt geraten: jsPDF zentriert mit auf 1/100 em gerundeten
    // Laufweiten, gedruckt wird mit den echten (Ziffer 0,556 statt 0,550 em). Das verschiebt
    // die Mitte um gut einen halben Millimeter – auf einem Blatt, das man von Hand auf den
    // Tisch legt, unsichtbar. Rechnet hier mit den echten Werten, also mit dem Druckbild.
    const breiteKurz = ((4 * 556) / 1000) * kurz.pt / PT_PER_MM;
    expect(Math.abs(kurz.xMm + breiteKurz / 2 - PAGE.width / 2)).toBeLessThan(1);
  });
});
