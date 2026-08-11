# CLAUDE.md

Projektregeln für Kinderbasar Neukirchen (Next.js 16 App Router, React 19, TypeScript, Prisma/PostgreSQL, Tailwind v4, Deployment auf Vercel).

---

## Befehle

```bash
npm run dev            # Dev-Server
npm run build          # prisma generate + next build
npm run lint           # ESLint
npm run test:run       # Vitest einmalig
npm run test:coverage  # Coverage (Schwellwert 90 %)
npm run db:push        # Prisma-Schema anwenden
```

Tests liegen unter `__tests__/` und decken `app/lib/**` und `app/api/**` ab. Prisma und externe Dienste (Mail, QR) werden pro Testdatei gemockt.

---

## Struktur

- `app/api/**` – Route Handler. Auth immer über `app/lib/apiAuth.ts` (`getAuth()`), nie selbst JWT parsen.
- `app/lib/**` – geteilte Logik (Auth, Mail, Zeitfenster, Größen, Rate Limiting). Neue Geschäftslogik gehört hierhin, nicht in Page-Komponenten – nur so ist sie testbar.
- `app/admin | seller | employee/**` – rollenspezifische Oberflächen.
- `prisma/schema.prisma` – Datenmodell.

---

## PDF & Druck – verbindliche Regeln

> **Grundsatz: Ein PDF muss auf jedem Gerät bitgleich sein und auf jedem Drucker identisch herauskommen.**
> iOS, iPadOS, Android, Windows, macOS, Linux – Handy, Tablet, Notebook. Es darf keine Diskrepanz geben.
> Das gilt besonders für Etiketten: sie werden auf vorgestanzte Bögen (Avery Zweckform 3475, 70 × 36 mm, 3 × 8 = 24 pro A4-Bogen) gedruckt. Schon 2 mm Abweichung zerstören den Bogen.

### Verboten

- **Kein `window.print()` für Etiketten oder andere maßhaltige Ausgaben.** Kein `window.open()` mit HTML-Bogen, kein `@page`/`@media print`-CSS als Layoutgrundlage.
  *Warum:* iOS Safari ignoriert `@page { margin: 0 }`, erzwingt eigene Druckränder (~14 mm) und skaliert den Inhalt per Shrink-to-Fit. Gemessen an einem realen Etikettenbogen: Faktor **0,866** → Spaltenraster 60,7 mm statt 70 mm, Zeilenraster 31,1 mm statt 36 mm. Bei Zeile 8 sind das **21 mm Versatz** – die Etiketten sind unbrauchbar. Der Fehler steckt dann bereits in der Datei, kein Druckdialog kann ihn noch korrigieren.
- **Kein `html2canvas`, kein HTML-zu-PDF im Browser.** Ergebnis hängt von Viewport, DPR, Systemschriften und Engine ab.
- **Keine Systemschriften.** Nur PDF-Standardfonts (Helvetica) oder eingebettete Fonts. `Arial` existiert auf Linux/Android nicht und fällt auf eine andere Metrik zurück.
- **Kein Layout, das exakt die volle Papierbreite ausnutzt**, ohne Sicherheitsabstand nach innen (siehe unten).

### Vorgeschrieben

1. **PDF serverseitig erzeugen**, als Route Handler mit `Content-Type: application/pdf`, z. B. `GET /api/basars/[id]/labels.pdf`. Das Gerät lädt eine fertige Datei herunter und rendert nichts selbst – damit ist Geräteunabhängigkeit strukturell garantiert und nicht nur getestet.
2. **Absolute Koordinaten in Millimetern**, `new jsPDF({ unit: 'mm', format: 'a4' })`. Keine relativen Layouts, kein Textfluss, kein Umbruch durch die Engine. Jede Position wird berechnet:
   ```ts
   const x = col * 70;          // Spaltenraster
   const y = 4.5 + row * 36;    // Zeilenraster, 4.5 mm Bogenrand oben
   ```
3. **QR-Codes als Vektor zeichnen**, nicht als PNG einbetten:
   ```ts
   const qr = QRCode.create(code, { errorCorrectionLevel: 'M' });
   const n = qr.modules.size;              // z. B. 21
   const m = sizeMm / (n + 2 * quietZone); // Modulkantenlänge in mm
   // pro gesetztem Modul: doc.rect(x, y, m, m, 'F')
   ```
   Vektor ist auflösungsunabhängig, scannt bei jeder Drucker-DPI sauber und macht das PDF um Größenordnungen kleiner. Ein 300-px-PNG auf 17 mm ist bei 600 dpi bereits interpoliert.
4. **`doc.viewerPreferences({ PrintScaling: 'None' })` setzen.** Das ist ein *Hinweis* an den Viewer, im Druckdialog „Tatsächliche Größe" vorzuwählen. Adobe Acrobat/Reader wertet ihn aus; Firefox/pdf.js ignoriert ihn nachweislich (Bugzilla 1243580), Chrome ebenfalls nicht zuverlässig. Deshalb ersetzt er nicht Punkt 5.
5. **Der Nutzer muss trotzdem informiert werden**: sichtbarer Hinweis an der Download-Stelle – *„Beim Drucken ‚Tatsächliche Größe' / 100 % wählen, nicht ‚An Seite anpassen'."*
6. **Mindestens 5 mm Inhaltsabstand zur Papierkante.** Avery 3475 hat keine Ränder – 3 × 70 mm = exakt 210 mm. Typische Laser- und Tintendrucker haben aber 4–5 mm nicht bedruckbaren Rand. Inhalt in der linken/rechten Etikettenspalte muss deshalb ≥ 5 mm eingerückt sein, sonst wird er abgeschnitten – unabhängig von der Skalierung.

### Bestehende Stellen

Umsetzungsdetails für den Etikettenbogen: **[docs/spec-etiketten-pdf.md](docs/spec-etiketten-pdf.md)**

| Ort | Zweck | Status |
|---|---|---|
| `app/lib/labels.ts` + `app/api/basars/[id]/labels.pdf/route.ts` | Etikettenbogen | ✅ serverseitig, absolute mm, Vektor-QR |
| `app/seller/basars/[id]/page.tsx` → `handleExportPDF()` | Abrechnung Verkäufer | ✅ jsPDF, absolute mm |
| `app/admin/basars/[id]/abrechnung/page.tsx` | Abrechnung Admin | ✅ jsPDF, absolute mm |
| `app/api/articles/[qrCode]/qr/route.ts` | QR als PNG (Bildschirmanzeige) | ✅ – für PDF stattdessen Vektor zeichnen |

### Prüfung bei Änderungen an PDFs

Nach jeder Änderung an einer PDF-Ausgabe: Datei erzeugen und die Geometrie messen, nicht nur ansehen. Erwartet für den Etikettenbogen:

- MediaBox `0 0 595.2756 841.8898` (A4)
- Spaltenraster 198,43 pt (70 mm), Zeilenraster 102,05 pt (36 mm)
- keine Skalierungsmatrix ≠ 1 auf Seitenebene

---

## Sonstige Konventionen

- Sprache der Oberfläche und aller Nutzertexte: **Deutsch**.
- Beträge über `fmt()` formatieren, Währung `€` mit schmalem Abstand davor.
- Verkäufernummer (`sellerId`) ist permanent und basarübergreifend stabil; QR-Codes von Artikeln dürfen sich bei Wiederverwendung über Basare hinweg **nicht** ändern (sonst müsste neu gedruckt werden).
- Fehler in Route Handlern: `console.error` mit Routenpfad als Präfix, nach außen generische Meldung.
