import { describe, it, expect } from 'vitest';
import zlib from 'zlib';
import { buildLabelSheet } from '@/app/lib/labels';

/**
 * Die Feldbeschriftungen („Bezeichnung", „Größe", „Preis") sind von 6 auf 8 pt gewachsen,
 * weil sie neben dem 12-pt-Wert untergingen. Der Platz dafür kam daher, dass die
 * Zielgruppenzeile 0,7 mm nach oben rückte – im unteren Drittel des Etiketts lag sonst
 * nirgends Reserve.
 *
 * Gemessen wird deshalb am *erzeugten* PDF, nicht an den Konstanten: die Zeilen dürfen sich
 * nicht überlappen. Ein Etikett, dessen Beschriftung im Wert klebt, ist auf dem Papier
 * unbrauchbar, und am Bildschirm sieht man den halben Millimeter nicht.
 */

const PT_PER_MM = 72 / 25.4;
// Helvetica-Metriken der PDF-Standardfonts – geräteunabhängig, deshalb hier rechenbar.
const CAP_HEIGHT = 0.718;
const DESCENDER = 0.207;

function contentStream(buf: Buffer): string {
  let best: Buffer | null = null;
  const raw = buf.toString('latin1');
  const re = /stream\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    const start = m.index + m[0].length;
    const end = raw.indexOf('endstream', start);
    if (end < 0) continue;
    try {
      const out = zlib.inflateSync(buf.subarray(start, end));
      if (!best || out.length > best.length) best = out;
    } catch { /* kein Flate-Stream */ }
  }
  return best ? best.toString('latin1') : '';
}

/**
 * Textzeilen des ersten Etiketts: Schriftgröße aus dem zuletzt gesetzten Tf, Grundlinie aus
 * dem Td. Ergebnis in mm ab Etikettenoberkante, nach Grundlinie sortiert.
 */
function lines(content: string) {
  const out: { pt: number; baseline: number; text: string }[] = [];
  let pt = 0;
  const re = /\/F\d+ ([\d.]+) Tf|([\d.]+) ([\d.]+) Td\s*\((.*?)\) Tj/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    if (m[1] !== undefined) { pt = parseFloat(m[1]); continue; }
    const mmFromTop = 297 - parseFloat(m[3]) / PT_PER_MM;
    // Etikett 1 liegt bei 4,5 mm Bogenrand oben, Höhe 36 mm.
    if (mmFromTop < 4.5 || mmFromTop > 4.5 + 36) continue;
    out.push({ pt, baseline: mmFromTop - 4.5, text: m[4] });
  }
  return out.sort((a, b) => a.baseline - b.baseline);
}

function sheet() {
  const doc = buildLabelSheet(
    [{ title: 'Jeansjacke blau gefüttert mit Kapuze', sizeLabel: '110/116', gender: 'Junge', price: 12.5, qrCode: 'ABC123' }],
    { sellerNr: 1002 }
  );
  return contentStream(Buffer.from(doc.output('arraybuffer') as ArrayBuffer));
}

describe('Etikett – unteres Band', () => {
  it('setzt die Feldbeschriftungen in 8 pt', () => {
    const beschriftungen = lines(sheet()).filter(l => ['Bezeichnung', 'Größe', 'Preis'].includes(l.text));
    expect(beschriftungen.map(l => l.text).sort()).toEqual(['Bezeichnung', 'Größe', 'Preis']);
    for (const l of beschriftungen) expect(l.pt).toBe(8);
  });

  it('lässt keine zwei Zeilen überlappen', () => {
    // Der eigentliche Schutz: wer eine Schriftgröße erhöht oder eine Grundlinie verschiebt,
    // ohne nachzurechnen, bekommt hier einen negativen Abstand.
    //
    // Zeilen auf *derselben* Grundlinie (Größe links, Preis rechts) werden zu einer Zeile
    // zusammengefasst statt gegeneinander gemessen – die trennt die Spaltenbreite, nicht die
    // Höhe. Ein einfaches „überspringen, wenn negativ" wäre falsch: dann würde der Test
    // genau den Fall verschlucken, für den er da ist.
    const alle = lines(sheet());
    expect(alle.length).toBeGreaterThan(4);

    const zeilen = new Map<string, { pt: number; baseline: number; texte: string[] }>();
    for (const l of alle) {
      const key = l.baseline.toFixed(2);
      const vorhanden = zeilen.get(key);
      if (vorhanden) {
        vorhanden.pt = Math.max(vorhanden.pt, l.pt);
        vorhanden.texte.push(l.text);
      } else {
        zeilen.set(key, { pt: l.pt, baseline: l.baseline, texte: [l.text] });
      }
    }

    const sortiert = [...zeilen.values()].sort((a, b) => a.baseline - b.baseline);
    const abstaende = sortiert.slice(1).map((z, i) => {
      const vorige = sortiert[i];
      const oberkante = z.baseline - CAP_HEIGHT * z.pt / PT_PER_MM;
      const unterkante = vorige.baseline + DESCENDER * vorige.pt / PT_PER_MM;
      return { unter: vorige.texte.join('/'), ueber: z.texte.join('/'), mm: Number((oberkante - unterkante).toFixed(2)) };
    });

    // Alle Abstände auf einmal prüfen: schlägt es fehl, steht die Stelle im Fehlertext.
    expect(abstaende.filter(a => a.mm <= 0.3)).toEqual([]);
  });

  it('bleibt innerhalb des Etiketts', () => {
    for (const l of lines(sheet())) {
      expect(l.baseline - CAP_HEIGHT * l.pt / PT_PER_MM).toBeGreaterThan(0);
      expect(l.baseline).toBeLessThan(36);
    }
  });
});
