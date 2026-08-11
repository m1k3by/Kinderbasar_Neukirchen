# Spec: Basare in den Verkäuferbereich mergen

**Status:** umgesetzt (2026-08-11)
**Erstellt:** 2026-08-11
**Tests:** [__tests__/lib/navLinks.test.ts](../__tests__/lib/navLinks.test.ts)
**Betroffen:** [app/lib/navLinks.ts](../app/lib/navLinks.ts), [app/seller/page.tsx](../app/seller/page.tsx), [app/seller/basars/page.tsx](../app/seller/basars/page.tsx), [app/seller/basars/[id]/page.tsx](../app/seller/basars/[id]/page.tsx), [app/employee/page.tsx](../app/employee/page.tsx), [public/manifest.json](../public/manifest.json)

---

## 1. Ziel

Für **Verkäufer und Mitarbeiter** gibt es keinen eigenen Navigationspunkt „Basare" mehr. Alles, was heute unter `/seller/basars` liegt, wird in den Verkäuferbereich `/seller` gemerged.

Für **Admins** bleibt alles unverändert – dort ist „Basare" eine echte Verwaltungsansicht (anlegen, Status schalten, archivieren, Teilnehmer, Abrechnung) und hat mit der Verkäufersicht fachlich nichts zu tun.

---

## 2. Ist-Zustand

### Navigation (Nicht-Admin, aus [navLinks.ts:59-68](../app/lib/navLinks.ts#L59))

| Tab | Ziel | Sichtbar für |
|---|---|---|
| Verkäuferbereich | `/seller` | alle |
| Mitarbeiterbereich | `/employee` | `isEmployee` |
| **Basare** | `/seller/basars` | alle |
| Kasse | `/admin/basars` bzw. direkt | `isCashier` |
| Logout | `/` | alle |

### Seiteninhalte

| Seite | Inhalt |
|---|---|
| `/seller` | Karte „Mein Basar – Artikel erfassen" (nur ein Link auf `/seller/basars`), Liste „Deine Basare" mit Teilnahme-Toggle + Abmelde-Bestätigung, Block „Sicherheit" (Passwort ändern) |
| `/seller/basars` | Dieselben Basare nochmal – aber mit Status-Badge, Konditionen (max. Artikel, Provision, Gebühr), CTA in die Detailseite, plus Abschnitt „Vergangene Basare" |
| `/seller/basars/[id]` | Artikel anlegen/löschen, Größenprüfung, Übernahme aus Archiv, Etiketten-PDF, Verkäufe, Abrechnung |

**Das Problem:** `/seller` und `/seller/basars` zeigen dieselbe Basar-Liste in zwei verschiedenen Darstellungen mit unterschiedlichen Aktionen. Der Nutzer muss zwischen zwei Tabs wechseln, um an einem Basar teilzunehmen *und* dann Artikel anzulegen. Die Karte „Mein Basar" auf `/seller` existiert nur, um diesen Sprung zu überbrücken.

---

## 3. Soll-Zustand

### Navigation

| Tab | Ziel | Sichtbar für |
|---|---|---|
| Verkäuferbereich | `/seller` | alle |
| Mitarbeiterbereich | `/employee` | `isEmployee` |
| ~~Basare~~ | — | **entfällt** |
| Kasse | `/admin/basars` bzw. direkt | `isCashier` |
| Logout | `/` | alle |

### Seitenstruktur

```
/seller                  ← eine Liste, eine Karte pro Basar
   │                       Teilnahme-Toggle UND Einstieg in die Artikel
   ├─ Aktuelle Basare
   ├─ Vergangene Basare (Abrechnung)
   └─ Sicherheit (Passwort)
       │
       └─ /seller/basars/[id]   ← URL bleibt, ist Unterseite, kein Tab
```

`/seller/basars` (die Listenseite) entfällt und leitet dauerhaft auf `/seller` um.

**Warum die Detailseite eine eigene Route bleibt:** Sie ist mit 856 Zeilen die umfangreichste Seite des Projekts (Artikel-CRUD, Größenvalidierung, Archiv-Übernahme, Etiketten-PDF, Abrechnung). Sie in `/seller` hineinzuklappen würde eine unwartbare Seite erzeugen und die Basar-Auswahl nicht mehr per URL teilbar machen. Der Wunsch war, den **Tab** loszuwerden – nicht die Route. Eine Unterseite ohne Tab erfüllt das.

### Die zusammengeführte Basar-Karte

Eine Karte pro Basar auf `/seller`, die beides kann:

```
┌────────────────────────────────────────────────────────┐
│ [Anmeldung offen]  Herbstbasar 2026                    │
│ Samstag, 12.09.2026 · Gemeindehaus                     │
│ Max. 50 Artikel · 20 % Provision · 2,00 € Gebühr       │
│                                                        │
│ [ Teilnahme: AKTIV ]        [ Artikel anlegen → ]      │
└────────────────────────────────────────────────────────┘
```

- **Teilnahme-Toggle:** Verhalten unverändert aus [seller/page.tsx:107](../app/seller/page.tsx#L107) übernehmen – optimistisches Update, Rollback bei Fehler, Abmelde-Bestätigungsdialog mit Konsequenzliste.
- **CTA-Label** wie bisher in [basars/page.tsx:128](../app/seller/basars/page.tsx#L128): `OPEN` → „Artikel anlegen", `ACTIVE` → „Verkäufe ansehen", `CLOSED` → „Abrechnung".
- **Konditionen-Zeile** aus der bisherigen Basar-Liste übernehmen (`maxArticlesPerSeller`, `commissionPercent`, `entryFee`) – auf `/seller` fehlt sie heute.
- Der Hinweis „Du bist noch nicht angemeldet → Jetzt teilnehmen" ([basars/page.tsx:117](../app/seller/basars/page.tsx#L117)) entfällt ersatzlos: der Toggle steht jetzt direkt daneben.

---

## 4. Änderungen im Einzelnen

### 4.1 `app/lib/navLinks.ts`

- `SellerNavKey`: `'basare'` entfernen → `'verkaeufer' | 'mitarbeiter' | 'kasse'`.
- Die Zeile `defs.push({ key: 'basare', href: '/seller/basars', label: 'Basare' })` ([navLinks.ts:64](../app/lib/navLinks.ts#L64)) löschen.
- `ADMIN_LINKS` bleibt **unverändert** – `'basare'` bleibt als `AdminNavKey` bestehen.
- Der Kommentarkopf der Datei erklärt die Cashier-/Pfad-Logik; er muss um den Grund für den Wegfall ergänzt werden, sonst wird der Link beim nächsten Mal „versehentlich repariert".

### 4.2 `app/seller/page.tsx`

- Karte „Mein Basar – Artikel erfassen" ([Zeile 208-221](../app/seller/page.tsx#L208)) **entfällt** – sie war nur ein Wegweiser auf den nun gemergten Inhalt.
- Liste „Deine Basare" wird zur zusammengeführten Karte (Abschnitt 3): Status-Badge, Konditionen, Toggle **und** CTA auf `/seller/basars/[id]`.
- Neuer Abschnitt „Vergangene Basare" für `status === 'CLOSED'`, übernommen aus [basars/page.tsx:136-166](../app/seller/basars/page.tsx#L136).
- Filter angleichen: `/seller` zeigt heute `!isArchived && status !== 'DRAFT'` ([Zeile 77](../app/seller/page.tsx#L77)), `/seller/basars` teilt in `OPEN|ACTIVE` vs. `CLOSED` ([Zeile 58](../app/seller/basars/page.tsx#L58)). Zusammengeführt: aktuelle Liste = `OPEN|ACTIVE`, vergangene Liste = `CLOSED`, `DRAFT` und archivierte weiterhin ausblenden.
- Der Block „Sicherheit" bleibt unverändert am Seitenende.

### 4.3 `app/seller/basars/page.tsx`

Ersetzen durch eine Redirect-Seite auf `/seller` (`redirect('/seller')` in einer Server-Komponente – permanent, damit gespeicherte Lesezeichen und der PWA-Shortcut alter Installationen nicht ins Leere laufen).

Die bisherige Auto-Weiterleitung „genau ein Basar → direkt in die Detailseite" ([Zeile 61](../app/seller/basars/page.tsx#L61)) **entfällt**. Sie darf nicht auf `/seller` übernommen werden, weil dort auch Teilnahme-Toggle und Passwortänderung wohnen – ein Auto-Redirect würde diese Funktionen unerreichbar machen. Der Komfortverlust ist ein zusätzlicher Klick.

### 4.4 `app/seller/basars/[id]/page.tsx`

- Drei `getNavLinks(..., 'basare')`-Aufrufe ([404](../app/seller/basars/[id]/page.tsx#L404), [411](../app/seller/basars/[id]/page.tsx#L411), [426](../app/seller/basars/[id]/page.tsx#L426)) auf `'verkaeufer'` umstellen – ohne das kompiliert es nach 4.1 nicht mehr.
- Sichtbaren „Zurück zur Übersicht"-Weg auf `/seller` zeigen lassen (heute implizit über den Tab). Ohne Tab braucht die Detailseite einen eigenen Rücksprung.

### 4.5 `app/employee/page.tsx`

- Der Kommentar in [Zeile 377-380](../app/employee/page.tsx#L377) („Basar-Teilnahme und Artikelerfassung … leben nur im Verkäuferbereich") beschreibt genau den Zielzustand und bleibt gültig – nur der Verweis auf die Kopfzeile ist zu präzisieren (Tab „Verkäuferbereich", nicht „Basare").
- Sonst keine Änderung: der Mitarbeiterbereich enthält weiterhin nur Kasse, Helferliste, Kuchenliste.

### 4.6 `public/manifest.json`

Shortcut „Mein Basar" ([Zeile 30](../public/manifest.json#L30)) von `/seller/basars` auf `/seller` ändern. (Der Redirect aus 4.3 fängt Altinstallationen ab, bis das Manifest neu gelesen wird.)

### 4.7 `docs/spec-etiketten-pdf.md`

Enthält drei Zeilenverweise auf `app/seller/basars/[id]/page.tsx`. Die Datei bleibt bestehen, die Zeilennummern verschieben sich aber – Verweise prüfen.

---

## 5. Randfälle, die leicht übersehen werden

1. **Cashier ohne Admin-Rolle.** `getNavLinks` behandelt Cashier über den Seller-Zweig, `middleware.ts:41-46` lässt ihn aber auf `/admin/basars` durch. Dort ruft [admin/basars/page.tsx:135](../app/admin/basars/page.tsx#L135) `getNavLinks(navUser, 'basare')` auf. Nach 4.1 gibt es für einen Cashier keinen `basare`-Eintrag mehr → **kein aktiver Tab**. Korrekt wäre für ihn `'kasse'`, weil `/admin/basars` sein Kassen-Einstieg ist. Betrifft `/admin/basars` und `/admin/basars/[id]` (+ `/abrechnung`); für Admins muss dort weiterhin `'basare'` aktiv sein. Lösung: `activeKey` abhängig von `navUser.role` wählen.

2. **`NavKey` ist eine Union.** `getNavLinks(user, activeKey: NavKey)` akzeptiert auch nach dem Entfernen aus `SellerNavKey` weiterhin `'basare'` für einen Seller, weil `'basare'` ein gültiger `AdminNavKey` bleibt. Der Compiler fängt einen vergessenen Aufruf also **nicht**.

   *Umgesetzt:* Eine rollenabhängige Typisierung von `activeKey` wurde **verworfen** – `navUser` ist in allen `/admin/basars/**`-Seiten als `useState<NavUser>` mit dem vollen Rollen-Union deklariert (der Wert kommt erst zur Laufzeit aus `/api/me`) und würde damit auf keine der Überladungen passen. Stattdessen kapselt `basarsAdminActiveKey(user)` die Regel aus Randfall 1 an einer Stelle in `app/lib/navLinks.ts` und ist dort testbar. Die übrigen Aufrufe wurden manuell geprüft (Liste in Abschnitt 4).

3. **Kein Basar vorhanden.** `/seller` zeigt heute „Aktuell ist kein Basar für eine Teilnahme geöffnet." Der Leerzustand muss beide Fälle abdecken (keine aktuellen *und* keine vergangenen Basare).

4. **Teilnahme inaktiv, Basar `OPEN`.** Die CTA „Artikel anlegen" muss auch dann sichtbar/klickbar bleiben – die Detailseite entscheidet selbst, was ein Nicht-Teilnehmer darf ([basars/[id]/page.tsx:119](../app/seller/basars/[id]/page.tsx#L119) setzt `activeSellerStatus`). Die Zugriffslogik nicht in die Karte duplizieren.

5. **Login-Ziel.** [login/page.tsx:35](../app/login/page.tsx#L35) leitet Seller auf `/seller`, Mitarbeiter auf `/employee`. Bleibt richtig und unverändert.

---

## 6. Ausdrücklich unverändert

- Alle Routen unter `/admin/**` und `ADMIN_LINKS` in `navLinks.ts`.
- `middleware.ts` – keine neuen oder entfallenden geschützten Pfade.
- Sämtliche API-Routen (`/api/basars/**`, `/api/seller-articles`, …). **Diese Änderung ist rein clientseitig.**
- Prisma-Schema, Etiketten-PDF, Abrechnungslogik.

---

## 7. Tests

Die Coverage-Schwelle (90 %) gilt laut `vitest.config.ts` nur für `app/lib/**` und `app/api/**`. Von dieser Änderung liegt dort **nur `app/lib/navLinks.ts`** – und für die Datei existiert bisher **keine Testdatei**.

Zu ergänzen: `__tests__/lib/navLinks.test.ts` mit
- Seller: enthält `verkaeufer` + `Logout`, **kein** `/seller/basars`;
- Employee (`isEmployee`): zusätzlich `mitarbeiter`, weiterhin kein `/seller/basars`;
- Cashier (`isCashier`): zusätzlich `kasse`, `kasseHref`-Override wird berücksichtigt;
- Admin: alle sechs `ADMIN_LINKS` unverändert, `basare` → `/admin/basars`;
- `activeKey` markiert genau einen Eintrag.

Gemäß CLAUDE.md gilt für den neuen Test der Nachweis: `basare`-Zeile testweise wieder einbauen und prüfen, dass der Test rot wird.

Die Seitenkomponenten (`app/seller/**`) sind nicht Teil der Coverage-Regel und haben heute keine Tests; für sie ist ein manueller Klick-Durchlauf vorgesehen (Abschnitt 8).

---

## 8. Manuelle Abnahme

Je Rolle einmal durchklicken:

| Rolle | Erwartung |
|---|---|
| Verkäufer | Nav zeigt nur „Verkäuferbereich" + „Logout". `/seller` listet aktuelle und vergangene Basare, Toggle funktioniert, CTA führt in die Artikel. `/seller/basars` leitet auf `/seller` um. |
| Mitarbeiter | Zusätzlich „Mitarbeiterbereich". Basare weiterhin nur über den Verkäuferbereich erreichbar. |
| Kassierer | Zusätzlich „Kasse". `/admin/basars` bleibt erreichbar, korrekter Tab ist aktiv (Randfall 1). |
| Admin | Navigation und alle `/admin`-Seiten unverändert. |

---

## 9. Umfang

6 Dateien geändert, 1 Datei durch Redirect ersetzt, 1 Testdatei neu. Keine Migration, keine API-Änderung, kein Datenrisiko – vollständig reversibel.

---

## 10. Entschieden

**Bleibt die Artikel-Detailseite unter `/seller/basars/[id]`, oder zieht sie auf `/seller/[basarId]` um?**

**URL beibehalten.** Ein Umzug bringt keinen funktionalen Vorteil, entwertet aber bestehende Lesezeichen und erzeugt Konflikte mit `/seller` als eigenem Segment. Der Pfadbestandteil `basars` ist ohne Tab nicht mehr sichtbar und damit unkritisch.

---

## 11. Nachweis

| Prüfung | Ergebnis |
|---|---|
| `npx tsc --noEmit` | fehlerfrei |
| `npm run lint` | fehlerfrei |
| `npm run test:run` | 561 Tests, 560 grün; der eine Fehler ist ein 5-s-Timeout in `basars-id-labels-pdf.test.ts` unter paralleler Last – isoliert laufen dort alle 24 Tests grün. Von dieser Änderung nicht berührt. |
| `__tests__/lib/navLinks.test.ts` | 15 Tests grün |
| Rot-Nachweis (CLAUDE.md) | `basare`-Zeile testweise wieder eingebaut → 4 Tests schlagen fehl, danach zurückgesetzt |
| `curl /seller/basars` | `308 → /seller` |

Der Klick-Durchlauf aus Abschnitt 8 steht noch aus – er setzt einen Login je Rolle voraus.

---

## 12. Nachtrag: Artikel anlegen ohne aktive Teilnahme

**Regel:** Für das Anlegen von Artikeln ist **keine** aktive Teilnahme am Basar nötig. Ein Verkäufer darf seine Artikel vorbereiten, bevor er sich anmeldet. Die Anmeldung entscheidet nur darüber, ob am Basar tatsächlich verkauft wird.

### Vorher

| Ort | Verhalten |
|---|---|
| `POST /api/basars/[id]/articles` | `403 „Du bist für diesen Basar nicht als Teilnehmer aktiv"` bei `isActive === false` |
| `POST /api/basars/[id]/articles/import` | dasselbe 403 |
| beide Routen, Verkäufer ohne `BasarSeller`-Zeile | Zeile wurde **aktiv** angelegt (`isActive: true`) – Artikel anzulegen aktivierte also nebenbei die Teilnahme – und war zusätzlich durch `maxSellers` blockiert |
| `app/seller/basars/[id]/page.tsx` | `canAddArticles = status === 'OPEN' && activeSellerStatus`, oranger Hinweis „…um Artikel anlegen zu können" |

Die Asymmetrie war der eigentliche Fehler: Wer sich einmal abgemeldet hatte, war gesperrt; wer noch nie eine Zeile hatte, wurde stillschweigend zum Teilnehmer gemacht.

### Nachher

- Beide Routen: kein Teilnahme-Check mehr. Fehlende Zeile wird per `upsert` **inaktiv** angelegt (`isActive: false, activatedAt: null`), `update: {}` lässt eine bestehende Zeile unangetastet – eine bestehende Teilnahme wird also weder aktiviert noch beendet.
- **`maxSellers` wird in diesen Routen nicht mehr geprüft.** Eine inaktive Zeile belegt keinen Teilnehmerplatz (`_count` zählt überall `isActive: true`). Der Platz wird ausschließlich in `PUT /api/basars/[id]/participation` vergeben, das dort auch Aktivierungsfenster und `maxSellers` prüft – die Kapazitätsgrenze bleibt also vollständig erhalten, nur an der richtigen Stelle.
- UI: `canAddArticles = basar.status === 'OPEN'`. Das Archiv wird für jeden `OPEN`-Basar geladen, nicht mehr nur für Teilnehmer.
- Der orange Hinweis bleibt, sagt aber jetzt das Richtige: Artikel anlegen geht, für den Verkauf ist die Anmeldung nötig. Sein Link zeigt immer auf `/seller` (vorher für Mitarbeiter fälschlich auf `/employee`, wo es die Teilnahme-Umschaltung nie gab).

### Was das **nicht** ändert

`isActive` wurde in den Verkaufs-, Scan-, Etiketten- und Abrechnungspfaden noch nie geprüft. Ein inaktiver Verkäufer mit Artikeln war also auch vorher schon möglich (anlegen, dann abmelden – der Abmeldedialog sagt ausdrücklich „Deine Artikel bleiben gespeichert") und seine Artikel waren an der Kasse scannbar. Diese Änderung öffnet dort nichts Neues.

### Tests

`__tests__/api/basars-id-articles.test.ts` und `…-import.test.ts`: die beiden 403-Tests sind durch Tests der neuen Regel ersetzt, dazu je ein Test auf die `upsert`-Argumente (`isActive: false`) und einer, der belegt, dass `maxSellers` das Anlegen nicht mehr blockiert. Rot-Nachweis: Sperre wieder eingebaut → 6 Tests rot.
