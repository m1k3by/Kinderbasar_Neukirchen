# Spec: Geräteunabhängiger Etikettendruck

**Status:** umgesetzt (2026-08-11)
**Erstellt:** 2026-08-11
**Umsetzung:** [app/lib/labels.ts](../app/lib/labels.ts), [app/api/basars/[id]/labels.pdf/route.ts](../app/api/basars/[id]/labels.pdf/route.ts), [__tests__/api/basars-id-labels-pdf.test.ts](../__tests__/api/basars-id-labels-pdf.test.ts)

---

## 1. Problem

Etiketten werden aktuell als HTML-Bogen in einem neuen Fenster gerendert und über `window.print()` gedruckt ([page.tsx:263](../app/seller/basars/[id]/page.tsx#L263)). Das Layout basiert auf `@page { size: A4; margin: 0 }` und einem CSS-Grid mit `repeat(3, 70mm)`.

Auf iOS entsteht dabei eine unbrauchbare Datei. Analyse eines real erzeugten Bogens (iOS 26.5.2, Safari, „Als PDF sichern"):

| Größe | Soll | Ist | Faktor |
|---|---|---|---|
| Spaltenraster | 70,0 mm | 60,67 mm | 0,8667 |
| Zeilenraster | 36,0 mm | 31,14 mm | 0,8649 |
| QR-Kantenlänge | 24,0 mm | 21,00 mm | 0,875 |
| 1. Spalte von links | 2,5 mm | 16,17 mm | +13,7 mm |
| 1. Zeile von oben | 7,0 mm | 20,14 mm | +13,1 mm |

**Ursache:** Safari ignoriert `@page`-Ränder, erzwingt eigene Druckränder (Clip-Rechteck im PDF: `x=14,11 mm`, `Breite=181,78 mm`) und skaliert den Inhalt per Shrink-to-Fit hinein: 181,78 / 210 = **0,8656**.

**Auswirkung:** Der Versatz summiert sich pro Spalte und Zeile. Bei einem vollen 8-Zeilen-Bogen liegt Zeile 8 um **~21 mm** daneben – mehr als eine halbe Etikettenhöhe.

**Warum Nachdrucken nicht half:** Der Fehler steckt in der PDF-Datei, nicht im Druckvorgang. Deshalb kam er beim Weiterleiten per WhatsApp sowohl vom Android-Handy als auch vom PC identisch heraus.

---

## 2. Ziel

> Ein Etiketten-PDF muss auf **jedem** Gerät (iOS, iPadOS, Android, Windows, macOS, Linux; Smartphone, Tablet, Notebook) **bytegleich** sein und bei 100 %-Druck auf **jedem** Drucker exakt auf den Avery-3475-Bogen passen.

Das wird nicht durch Testen auf vielen Geräten erreicht, sondern **strukturell**: Das Endgerät rendert nichts mehr selbst, es lädt eine fertige Datei herunter.

---

## 3. Lösung im Überblick

`window.print()` entfällt vollständig. Stattdessen:

```
Browser (beliebiges Gerät)
   │  GET /api/basars/:id/labels.pdf
   ▼
Route Handler (Node, Vercel)
   │  jsPDF, unit:'mm', absolute Koordinaten
   │  QR-Codes als Vektor-Rechtecke
   ▼
application/pdf  →  Download
```

Die Geometrie ist damit im Server-Code festgelegt und in der Datei eingefroren.

---

## 4. Neuer Endpoint

### `GET /api/basars/[id]/labels.pdf`

**Datei:** `app/api/basars/[id]/labels.pdf/route.ts`

**Query-Parameter**

| Parameter | Typ | Default | Bedeutung |
|---|---|---|---|
| `from` | int | `0` | Index des ersten Etiketts auf dem Bogen (0-basiert), für angebrochene Bögen. Werte außerhalb 0–23 fallen auf `0` zurück – ein Tippfehler soll den Bogen vorne beginnen lassen, nicht 23 Etiketten verschenken. |
| `sellerId` | int | – | Nur für Admins, um einen fremden Bogen nachzudrucken. Verkäufer bekommen bei abweichendem Wert `403`. |
| `calibration` | `1` | – | Liefert stattdessen die Testseite aus §8. Braucht keine Basar- oder Artikeldaten. |

**Auth:** `requireAuth()` aus [apiAuth.ts](../app/lib/apiAuth.ts).
- `role === 'seller'` → nur eigene Artikel dieses Basars, ermittelt über `prisma.basarSeller.findUnique({ where: { basarId_sellerId: { basarId, sellerId } } })`
- `role === 'admin'` → zusätzlich optionaler Parameter `sellerId`, um den Bogen eines Verkäufers nachzudrucken
- sonst `401` / `403`

**Antwort**

```
200 application/pdf
Content-Disposition: attachment; filename="etiketten-basar-<title>-vk<sellerId>.pdf"
Cache-Control: no-store
```

Fehlerfälle geben JSON zurück: `401` ohne Anmeldung, `403` bei fremdem Bogen, `400` wenn ein Admin ohne `sellerId` anfragt, `404` bei unbekanntem Basar oder fehlender Teilnahme, `409` wenn der Verkäufer keine Artikel hat.

> `no-store`, weil sich die Artikelliste jederzeit ändert und ein zwischengespeicherter Bogen zu Etiketten ohne Gegenstück in der Datenbank führt.

---

## 5. Geometrie (verbindlich)

Zielbogen: **Avery Zweckform 3475** – 70 × 36 mm, 3 Spalten × 8 Zeilen = 24 Etiketten pro A4-Blatt.

```ts
const SHEET = {
  cols: 3,
  rows: 8,
  labelW: 70,      // mm
  labelH: 36,      // mm
  marginTop: 4.5,  // mm – (297 - 8*36) / 2
  marginLeft: 0,   // mm – 3*70 = 210 = volle A4-Breite
} as const;

const PAD   = 5;   // mm Innenabstand links/rechts, siehe unten
const PAD_Y = 2.5; // mm oben/unten – dort grenzt kein Etikett an die Papierkante
const QR    = 24;  // mm Kantenlänge inkl. Quiet Zone
const TEXT_X = PAD + QR + 2; // 31 mm – Beginn der Textspalte
const BAND_Y = 32.5;         // mm – Grundlinie Größe · Zielgruppe · Preis
```

Position von Etikett `i` (0-basiert, inkl. `from`-Offset):

```ts
const slot = from + i;
const col  = slot % SHEET.cols;
const row  = Math.floor(slot / SHEET.cols) % SHEET.rows;
const x    = SHEET.marginLeft + col * SHEET.labelW;
const y    = SHEET.marginTop  + row * SHEET.labelH;
```

Nach je 24 Etiketten `doc.addPage()`.

### Innenabstand: 5 mm, nicht 2,5 mm

Avery 3475 nutzt mit 3 × 70 mm exakt die volle A4-Breite von 210 mm – die Etiketten gehen randlos bis an die Papierkante. Typische Laser- und Tintendrucker haben aber **4–5 mm nicht bedruckbaren Rand**. Der bisherige Innenabstand von 2,5 mm führt deshalb dazu, dass in der linken und rechten Spalte Inhalt abgeschnitten wird – **unabhängig von jeder Skalierung**. `PAD = 5` behebt das.

### Aufteilung innerhalb eines Etiketts (70 × 36 mm)

```
 ┌──────────────────────────────────────────┐ ← y
 │  ┌──────────┐                       9001 │   PAD 5 mm links/rechts,
 │  │          │  Winterjacke Lego          │   PAD_Y 2,5 mm oben/unten
 │  │    QR    │  mit langem Namen          │
 │  │  24 mm   │                            │
 │  └──────────┘                            │
 │  116      Junge               5,00 €     │ ← BAND_Y = 32,5
 └──────────────────────────────────────────┘ ← y + 36
 x   x+5      x+29  x+31                 x+65
```

| Element | Position | Schrift |
|---|---|---|
| QR-Code | `x+5`, `y+2,5`, 24 × 24 mm | – |
| Verkäufernummer | rechtsbündig `x+65`, `y+7,5` | Helvetica-Bold 12 pt |
| Bezeichnung | `x+31`, `y+12,5` (+3,9 je Zeile) | Helvetica-Bold 9 pt, max. 3 Zeilen |
| Größe | `x+5`, `y+32,5` | Helvetica-Bold 12 pt |
| Zielgruppe | mittig zwischen Größe und Preis, `y+32,5` | Helvetica-Bold 10 pt, farbig |
| Preis | rechtsbündig `x+65`, `y+32,5` | Helvetica-Bold 12 pt |

Feldbeschriftungen („Bezeichnung", „Größe", „Preis") entfallen – die Werte sind an der
Kasse eindeutig, und der gewonnene Platz geht in QR-Code und Schriftgröße.

**Farben der Zielgruppe:** Junge `#1D4EB8` (blau), Mädchen `#DB2777` (rosa),
Unisex `#6B7280` (grau). Auf Schwarzweißdruckern werden daraus Grauwerte – die
Unterscheidung trägt deshalb nie allein die Farbe, das Wort steht immer dabei.

**Kollisionsschutz im unteren Band:** die Zielgruppe wird auf die Mitte zwischen dem
rechten Rand der Größe und dem linken Rand des Preises gesetzt (beides über
`getTextWidth`, also AFM-Metrik) und ganz weggelassen, wenn dort weniger als ihre
Textbreite + 2 mm frei ist. Damit können „W32/L34" und „123,50 €" nicht ineinanderlaufen.

---

## 6. Schriften

**Nur PDF-Standardfonts** (`helvetica`, `helvetica-bold`) mit `WinAnsiEncoding`. Kein `Arial` – das existiert auf Linux und Android nicht und würde auf eine abweichende Metrik zurückfallen.

Umlaute und `€` sind in WinAnsiEncoding enthalten und im Prototyp verifiziert.

**Textkürzung** über `doc.splitTextToSize(text, maxWidthMm)` – das nutzt die eingebauten AFM-Metriken und ist damit ebenfalls geräteunabhängig. Bezeichnungen werden auf **3 Zeilen** begrenzt, danach mit `…` abgeschnitten:

```ts
const lines = doc.splitTextToSize(a.title, SHEET.labelW - TEXT_X - PAD);
const shown = lines.slice(0, 3);
if (lines.length > 3) shown[2] = shown[2].replace(/.{1}$/, '…');
```

> Damit ist auch der Fall aus dem Fehlerbild abgedeckt: `Hshehejejehsjdjdjdjdjdjdjdjd` und `aaaaaaaaaaaaaaaaaaaaaaaaa` liefen bisher aus dem Etikett heraus.

---

## 7. QR-Codes als Vektor

Statt des PNG aus [`/api/articles/[qrCode]/qr`](../app/api/articles/[qrCode]/qr/route.ts) wird die Modulmatrix direkt gezeichnet:

```ts
import QRCode from 'qrcode';

function drawQr(doc: jsPDF, text: string, x: number, y: number, sizeMm: number) {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const n = qr.modules.size;          // 21 bei den aktuellen Codes
  const quiet = 2;                    // Quiet Zone in Modulen, innerhalb sizeMm
  const m = sizeMm / (n + 2 * quiet); // Modulkantenlänge in mm
  doc.setFillColor(0, 0, 0);
  for (let r = 0; r < n; r++) {
    let c = 0;
    while (c < n) {
      if (!qr.modules.data[r * n + c]) { c++; continue; }
      let run = 1;                     // horizontal benachbarte Module zusammenfassen
      while (c + run < n && qr.modules.data[r * n + c + run]) run++;
      doc.rect(x + (c + quiet) * m, y + (r + quiet) * m, m * run, m, 'F');
      c += run;
    }
  }
}
```

**Warum Vektor:**
- auflösungsunabhängig – ein 300-px-PNG auf 17 mm ist bei 600 dpi bereits interpoliert, was die Scanrate an der Kasse senkt
- keine PNG-Dekodierung im Server-Bundle
- deutlich kleinere Dateien (siehe §11)

Das Run-Merging reduziert die Zeichenoperationen von ~6.000 auf ~2.900 pro Bogen.

Der bestehende PNG-Endpoint **bleibt** – er wird für die Bildschirmanzeige gebraucht.

---

## 8. Druckskalierung absichern

Drei Ebenen, weil keine allein ausreicht:

1. **`doc.viewerPreferences({ PrintScaling: 'None' })`** – hinterlegt im PDF, dass der Druckdialog „Tatsächliche Größe" vorwählen soll. Adobe Acrobat/Reader wertet das aus. Firefox/pdf.js ignoriert es nachweislich ([Bugzilla 1243580](https://bugzilla.mozilla.org/show_bug.cgi?id=1243580)), Chrome ebenfalls nicht zuverlässig.
2. **Hinweis in der Oberfläche** direkt am Download-Button:
   > Beim Drucken **„Tatsächliche Größe" / 100 %** wählen – nicht „An Seite anpassen". Papierformat A4.
3. **Separate Testseite** unter `?calibration=1`: das Etikettenraster als graue Umrisse plus ein waagerechter 100-mm- und ein senkrechter 50-mm-Maßstrich mit 10-mm-Teilung. Der Nutzer druckt sie auf Normalpapier und prüft mit einem Lineal in zwei Sekunden, ob der Drucker maßhaltig arbeitet – bevor er einen Etikettenbogen opfert.

   > **Abweichung vom ersten Entwurf:** Ursprünglich waren Passermarken auf dem Etikettenbogen selbst vorgesehen, „am unteren Blattrand, 288–297 mm". Das geht nicht: Avery 3475 ist randlos, Zeile 8 reicht von 256,5 bis 292,5 mm. Auf dem Bogen ist keine Fläche frei, auf der Marken nicht quer über Etiketten laufen würden. Deshalb eine eigene Seite.

---

## 9. Frontend-Änderung

In [page.tsx](../app/seller/basars/[id]/page.tsx):

- `handlePrintLabels()` **löschen** – samt des kompletten HTML-/CSS-Strings (Zeilen 263–365) und `escapeHtml()`, falls sonst ungenutzt.
- Ersetzen durch einen Download:

```tsx
<a
  href={`/api/basars/${basarId}/labels.pdf`}
  download
  className="..."
>
  Etiketten als PDF herunterladen
</a>
<p className="text-sm text-gray-600">
  Beim Drucken „Tatsächliche Größe" / 100 % wählen – nicht „An Seite anpassen". Papierformat A4.
</p>
```

Ein `<a download>` statt `window.open()` ist wichtig: iOS Safari öffnet die Datei dann in der Dateien-/Vorschau-App, wo sie unverändert weitergegeben und gedruckt werden kann.

**Optional (empfohlen):** Eingabefeld „Erstes Etikett auf dem Bogen" (1–24) für angebrochene Bögen → `?from=<n-1>`.

---

## 10. Tests

Neue Datei `__tests__/api/basars-id-labels-pdf.test.ts`, Prisma und `qrcode` gemockt wie in den bestehenden Route-Tests.

**Auth**
- [ ] ohne Token → 401
- [ ] Verkäufer A bekommt keine Etiketten von Verkäufer B (fremde `sellerId` → 403)
- [ ] Admin darf mit `?sellerId=` fremde Bögen erzeugen
- [ ] unbekannte `basarId` → 404
- [ ] Verkäufer ohne Artikel → 409

**PDF-Struktur** (Buffer parsen, nicht nur Statuscode prüfen)
- [ ] `Content-Type: application/pdf`, Buffer beginnt mit `%PDF-`
- [ ] MediaBox = `0 0 595.28 841.89`
- [ ] `/PrintScaling /None` im Katalog vorhanden
- [ ] **keine** `/Subtype /Image` im Dokument (QR ist Vektor)
- [ ] nur Standard-Fonts, keine `/FontFile*`

**Geometrie** – der eigentliche Regressionsschutz
- [ ] Spaltenraster der Textanker = 198,43 pt (± 0,01) = 70 mm
- [ ] Zeilenraster = 102,05 pt (± 0,01) = 36 mm
- [ ] alle gezeichneten Elemente liegen ≥ 5 mm von jeder Blattkante entfernt
- [ ] 25 Artikel → 2 Seiten; 24 Artikel → 1 Seite
- [ ] `?from=5` → erstes Etikett in Spalte 3, Zeile 2

**Inhalt**
- [ ] Bezeichnung mit 60 Zeichen wird auf 2 Zeilen gekürzt und verlässt das Etikett nicht
- [ ] Umlaute und `€` sind im Textstream vorhanden

---

## 11. Erwartetes Ergebnis

Verifiziert an einem Prototyp mit 24 Etiketten (`jspdf@4.2.1`, Node 22):

| | vorher (iOS-Bogen) | nachher |
|---|---|---|
| Spaltenraster | 60,67 mm | **70,00 mm** |
| Zeilenraster | 31,14 mm | **36,00 mm** |
| Versatz Zeile 8 | ~21 mm | **0 mm** |
| Bilder im PDF | 14 PNG | **0** |
| Dateigröße | 162 KB (14 Etiketten) | **18 KB** (24 Etiketten) |
| Ergebnis geräteabhängig | ja | **nein** |

Die 18 KB entstehen mit `new jsPDF({ …, compress: true })` und dem Run-Merging aus §7; ohne beides sind es 472 KB.

---

## 12. Umsetzungsstand

- [x] `app/lib/labels.ts` – `SHEET`-Konstanten, `drawQr()`, `buildLabelSheet()`, `buildCalibrationSheet()`. Reine Funktionen ohne Prisma, direkt testbar.
- [x] `app/api/basars/[id]/labels.pdf/route.ts` – Auth, Datenbankabfrage, Response.
- [x] Tests aus §10 – 24 Tests, grün. Gesamtsuite 533/533, `tsc --noEmit` und `eslint` fehlerfrei, `next build` registriert die Route.
- [x] Frontend umgestellt; `handlePrintLabels()` und `escapeHtml()` samt HTML-/CSS-Block (108 Zeilen) entfernt.
- [x] README §„Für Nutzer: so drucken" gegen die Oberfläche geprüft.
- [ ] **Offen – manueller Abnahmetest:** Bogen von **iPhone, Android und PC** herunterladen, `sha256` der drei Dateien vergleichen (müssen identisch sein), einen davon auf Normalpapier drucken und gegen einen Avery-3475-Bogen halten.

Gemessen am erzeugten Musterbogen (14 Artikel, Verkäufer 9001):

```
MediaBox      0 0 595.28 841.89
PrintScaling  /None
Bilder        0        eingebettete Fonts  0
Textspalten   31.0 / 101.0 / 171.0 mm  → Abstand 70.000 / 70.000 mm
Textzeilen    16.0 / 52.0 / 88.0 / 124.0 / 160.0 mm → Abstand 36.000 mm
Linker Rand   6.36 mm (≥ 5 mm gefordert)
```

---

## 13. Bewusst nicht Teil dieser Spec

- **Abrechnungs-PDFs** ([page.tsx:371](../app/seller/basars/[id]/page.tsx#L371), [abrechnung/page.tsx:95](../app/admin/basars/[id]/abrechnung/page.tsx#L95)) nutzen bereits jsPDF mit absoluten Koordinaten und sind nicht maßhaltigkeitskritisch. Sie könnten später aus Konsistenzgründen ebenfalls serverseitig laufen, sind aber nicht defekt.
- **Andere Etikettenformate** (z. B. 3474 mit 65 × 38 mm). Die `SHEET`-Konstante ist so geschnitten, dass ein zweites Format später nur ein weiteres Objekt braucht.
- **Barcode zusätzlich zum QR** (`bwip-js` ist als Dependency vorhanden, wird hier aber nicht gebraucht).
