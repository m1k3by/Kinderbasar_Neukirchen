export type FaqCategory =
  | 'Artikel & Etiketten'
  | 'Abrechnung & Geld'
  | 'Helfer & Kuchen'
  | 'Kasse'
  | 'Konto & Login';

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
  keywords: string[];
  roles: ('seller' | 'employee' | 'cashier')[];
  category: FaqCategory;
}

export const faqData: FaqItem[] = [

  // ─── VERKÄUFER ────────────────────────────────────────────────────────────

  {
    id: 'seller-artikel-erstellen',
    question: 'Wie lege ich einen neuen Artikel an?',
    answer:
      'Gehe zu **Basare** → wähle einen Basar → scrolle zum Formular **"Neuen Artikel hinzufügen"**.\n\nFülle aus:\n– **Beschreibung** (max. 30 Zeichen, z.B. "Jeans blau")\n– **Für wen?** (Junge / Mädchen / Unisex)\n– **Größe** (z.B. 110, M, W32) – klicke auf **ⓘ** für alle gültigen Größen\n– **Preis** in €\n\nDann auf **"+ Hinzufügen"** klicken. Der Artikel bekommt automatisch einen QR-Code.',
    keywords: ['artikel', 'erstellen', 'anlegen', 'neu', 'hinzufügen', 'neuer', 'eintragen', 'erfassen'],
    roles: ['seller', 'employee'],
    category: 'Artikel & Etiketten',
  },

  {
    id: 'seller-preis-regeln',
    question: 'Welche Preise sind erlaubt?',
    answer:
      'Preise müssen **Vielfache von 0,50 €** sein – also 0,50 / 1,00 / 1,50 / 2,00 usw.\n\nMindestpreis: **0,50 €**. Andere Beträge (z.B. 1,70 €) werden nicht akzeptiert.\n\nDu siehst die Fehlermeldung: _"Der Preis muss ein Vielfaches von 0,50 € sein"_.',
    keywords: ['preis', 'format', 'komma', 'angeben', 'eingeben', 'euro', 'cent', 'betrag', '1,70', 'vielfaches', 'schritte', 'erlaubt', 'gültig'],
    roles: ['seller', 'employee'],
    category: 'Artikel & Etiketten',
  },

  {
    id: 'seller-groessen',
    question: 'Welche Größen kann ich eingeben?',
    answer:
      'Klicke auf das **ⓘ-Symbol** neben dem Größenfeld – dort siehst du alle gültigen Größen:\n\n– **Kleidung (Buchstaben):** XXS, XS, S, M, L, XL, XXL, 3XL, 4XL, 5XL\n– **Kleidung (cm):** 50 bis 176\n– **Hosen (W-Größen):** W24 bis W44\n– **Schuhe:** 18 bis 49\n\nKlicke eine Größe im Dialog direkt an – sie wird automatisch eingetragen.',
    keywords: ['größe', 'größen', 'gültig', 'erlaubt', 'cm', 'buchstaben', 'schuhe', 'hosen', 'kleidung', 'wgröße', 'info'],
    roles: ['seller', 'employee'],
    category: 'Artikel & Etiketten',
  },

  {
    id: 'seller-etiketten',
    question: 'Wie drucke ich Etiketten aus?',
    answer:
      'In deiner Artikelliste gibt es den Button **"🖨 Etiketten drucken"** (blau). Klicke darauf – es öffnet sich ein Druckfenster mit allen QR-Code-Etiketten.\n\nJedes Etikett zeigt: QR-Code, deine Verkäufernummer, Beschreibung, Größe und Preis. Schneide sie aus und klebe sie auf die Artikel.',
    keywords: ['etiketten', 'drucken', 'ausdrucken', 'label', 'pdf', 'qr', 'aufkleber', 'zettel', 'print'],
    roles: ['seller', 'employee'],
    category: 'Artikel & Etiketten',
  },

  {
    id: 'seller-artikel-bearbeiten',
    question: 'Kann ich Artikel nachträglich ändern?',
    answer:
      'Ein direktes Bearbeiten ist aktuell **nicht möglich** – es gibt keine "Ändern"-Funktion für bereits angelegte Artikel.\n\nMöchtest du etwas korrigieren:\n\n– Solange der Basar noch **nicht gestartet** ist (Status "Anmeldung offen"), kannst du den Artikel über das **Papierkorb-Symbol** löschen und mit den korrekten Angaben neu anlegen.\n\n**Achtung:** Hast du für den alten Artikel schon ein Etikett gedruckt, gilt dieses danach nicht mehr – drucke für den neuen Artikel ein neues Etikett.\n\nSobald der Basar **läuft** oder **beendet** ist, können Artikel generell nicht mehr gelöscht oder geändert werden – verkaufte Artikel ohnehin nie.',
    keywords: ['bearbeiten', 'ändern', 'editieren', 'korrigieren', 'anpassen', 'nachträglich', 'aktualisieren'],
    roles: ['seller', 'employee'],
    category: 'Artikel & Etiketten',
  },

  {
    id: 'seller-artikel-loeschen',
    question: 'Wie lösche ich einen Artikel?',
    answer:
      'Klicke auf das **Papierkorb-Symbol** neben dem Artikel. Es erscheint ein Bestätigungsdialog **"Artikel wirklich löschen?"**.\n\n**Wichtig:** Löschen ist nur möglich, solange der Basar noch **nicht gestartet** ist (Status "Anmeldung offen"). Sobald der Basar **läuft** oder **beendet** ist, wird das Papierkorb-Symbol für alle Artikel ausgeblendet – auch für noch nicht verkaufte.',
    keywords: ['löschen', 'entfernen', 'stornieren', 'storno', 'wegmachen', 'papierkorb', 'artikel'],
    roles: ['seller', 'employee'],
    category: 'Artikel & Etiketten',
  },

  {
    id: 'seller-verkaeufernummer',
    question: 'Was ist meine Verkäufernummer?',
    answer:
      'Deine Verkäufernummer wird bei der Registrierung automatisch vergeben und per E-Mail mitgeteilt. Du siehst sie:\n– Im Header oben rechts als **"(Verkäufer) Nummer: 123"**\n– Auf der Basar-Seite als **"Deine Verkäufernummer: #123"**\n– Auf allen gedruckten Etiketten\n\nAn der Kasse wird dein Artikel dieser Nummer zugeordnet.',
    keywords: ['verkäufernummer', 'nummer', 'id', 'meine nummer', 'welche', 'wo', 'finden'],
    roles: ['seller', 'employee'],
    category: 'Konto & Login',
  },

  {
    id: 'seller-status',
    question: 'Was bedeutet "Verkäuferstatus inaktiv"?',
    answer:
      'Wenn dein Status **inaktiv** ist, kannst du keine neuen Artikel anlegen. Du siehst eine orangene Warnung: _"Dein Verkäuferstatus ist aktuell inaktiv."_\n\nDie Teilnahme gilt pro Basar: Auf der Startseite beim gewünschten Basar den Schalter **"Teilnahme"** anklicken und im Dialog AGB und Datenschutzerklärung bestätigen.',
    keywords: ['status', 'inaktiv', 'aktiv', 'aktivieren', 'verkäuferstatus', 'deaktiviert', 'sperren'],
    roles: ['seller', 'employee'],
    category: 'Konto & Login',
  },

  {
    id: 'seller-basar-status',
    question: 'Was bedeuten die Basar-Status?',
    answer:
      '– **Vorbereitung** – Basar noch nicht offen, keine Artikel möglich\n– **Anmeldung offen** – du kannst Artikel anlegen und Etiketten drucken\n– **Läuft** – Verkauf läuft, keine neuen Artikel mehr, du siehst deinen Verkaufsstand\n– **Beendet** – Abrechnung ist verfügbar, PDF-Download möglich',
    keywords: ['status', 'basar', 'vorbereitung', 'offen', 'läuft', 'beendet', 'bedeutet', 'unterschied'],
    roles: ['seller', 'employee'],
    category: 'Artikel & Etiketten',
  },

  {
    id: 'seller-archiv-import',
    question: 'Kann ich Artikel aus einem früheren Basar übernehmen?',
    answer:
      'Ja! Auf der Basar-Seite gibt es die gelbe Box **"Aus früherem Basar übernehmen"**. Klicke auf **"Anzeigen"** und wähle die gewünschten Artikel aus.\n\n**Wichtig:** Du **musst** sie aktiv importieren – sonst sind sie nur im Archiv und können an der Kasse nicht gescannt werden.\n\nGute Nachricht: **Deine QR-Codes bleiben gültig** – du brauchst keine neuen Etiketten zu drucken!',
    keywords: ['archiv', 'früher', 'übernehmen', 'importieren', 'altes', 'letztes', 'vorheriger', 'kopieren'],
    roles: ['seller', 'employee'],
    category: 'Artikel & Etiketten',
  },

  {
    id: 'seller-abrechnung',
    question: 'Was zeigt die Abrechnung?',
    answer:
      'Nach Basarende siehst du auf der Basar-Seite unter **"Deine Abrechnung"**:\n\n– **Brutto-Erlös** – Summe aller verkauften Artikel\n– **Provision** – prozentualer Abzug des Veranstalters\n– **Teilnahmegebühr** – falls vom Veranstalter erhoben\n– **Netto-Auszahlung** – was du bekommst (grün)\n\nMit **"↓ PDF"** kannst du die Abrechnung herunterladen.',
    keywords: ['abrechnung', 'auszahlung', 'geld', 'erlös', 'gewinn', 'settlement', 'verdienst', 'netto', 'brutto', 'pdf'],
    roles: ['seller', 'employee'],
    category: 'Abrechnung & Geld',
  },

  {
    id: 'seller-provision',
    question: 'Wie hoch ist die Provision?',
    answer:
      'Die Provision legt der Veranstalter pro Basar fest. Du siehst sie auf der Basar-Karte in der Übersicht als **"X% Provision"** und nochmals auf der Basar-Detailseite.\n\nSie wird automatisch bei der Abrechnung vom Brutto-Erlös abgezogen.',
    keywords: ['provision', 'prozent', 'gebühr', 'abzug', '%', 'anteil', 'kosten', 'wieviel'],
    roles: ['seller', 'employee'],
    category: 'Abrechnung & Geld',
  },

  {
    id: 'seller-max-artikel',
    question: 'Wie viele Artikel darf ich anmelden?',
    answer:
      'Das legt der Veranstalter pro Basar fest. Du siehst das Limit im Formular als **"Neuen Artikel hinzufügen (X/Y)"** – X = deine aktuellen Artikel, Y = Maximum.\n\nSobald du das Limit erreichst, ist der **"+ Hinzufügen"**-Button deaktiviert.',
    keywords: ['maximal', 'anzahl', 'limit', 'maximum', 'viele', 'artikel', 'anmelden', 'registrieren', 'erlaubt', 'wie viele'],
    roles: ['seller', 'employee'],
    category: 'Artikel & Etiketten',
  },

  {
    id: 'seller-eintrittsgeld',
    question: 'Gibt es eine Teilnahmegebühr?',
    answer:
      'Das hängt vom jeweiligen Basar ab. Auf der Basar-Karte siehst du **"X,XX € Gebühr"** – nur wenn eine Gebühr anfällt.\n\nSie wird bei der Abrechnung automatisch vom Erlös abgezogen und in der Abrechnung als eigene Zeile ausgewiesen.',
    keywords: ['eintrittsgeld', 'standgebühr', 'anmeldegebühr', 'teilnahme', 'mitmachen', 'gebühr', 'kosten'],
    roles: ['seller', 'employee'],
    category: 'Abrechnung & Geld',
  },

  // ─── MITARBEITER ─────────────────────────────────────────────────────────

  {
    id: 'employee-aufgaben-anmelden',
    question: 'Wie melde ich mich für eine Aufgabe an?',
    answer:
      'Im **Mitarbeiterbereich** scrolle zur **"Helferliste"**. Die Aufgaben sind nach Tagen gruppiert (Freitag / Samstag / Sonntag).\n\nJede Aufgabe zeigt: Titel, Uhrzeit und **"X / Y"** (belegte / Gesamtplätze).\n\nKlicke auf **"Jetzt eintragen"** (gelb). Volle Aufgaben zeigen **"Voll"** (grau, nicht klickbar).',
    keywords: ['aufgabe', 'aufgaben', 'anmelden', 'eintragen', 'schicht', 'dienst', 'helfen', 'slot', 'melden', 'helferliste'],
    roles: ['employee'],
    category: 'Helfer & Kuchen',
  },

  {
    id: 'employee-aufgaben-ueberschneidung',
    question: 'Warum kann ich mich nicht für eine Aufgabe eintragen?',
    answer:
      'Du erhältst eine Fehlermeldung wenn:\n\n– Der Slot bereits **voll** ist\n– Du **zeitgleich** schon für eine andere Aufgabe eingetragen bist\n\nBei Überschneidung erscheint: _"Eintragung nicht möglich! Du bist bereits für [Aufgabe] ([Zeit]) am [Tag] eingetragen."_\n\nTrage dich zuerst aus der anderen Aufgabe aus oder wähle eine andere Zeit.',
    keywords: ['nicht möglich', 'fehler', 'überschneidung', 'gleichzeitig', 'konflikt', 'belegt', 'voll', 'problem'],
    roles: ['employee'],
    category: 'Helfer & Kuchen',
  },

  {
    id: 'employee-aufgaben-austragen',
    question: 'Wie trage ich mich aus einer Aufgabe aus?',
    answer:
      'In der **Helferliste** zeigt deine eingetragene Aufgabe den Button **"Austragen"** (rot). Klicke darauf – du bekommst eine Bestätigung **"✓ Erfolgreich ausgetragen"**.',
    keywords: ['austragen', 'abmelden', 'aufgabe', 'stornieren', 'rückgängig', 'entfernen'],
    roles: ['employee'],
    category: 'Helfer & Kuchen',
  },

  {
    id: 'employee-kuchen',
    question: 'Wie trage ich Kuchen in die Kuchenliste ein?',
    answer:
      'Im **Mitarbeiterbereich** scrolle zur **"Kuchenliste"**. Im Eingabefeld (Placeholder: _"z.B. Marmorkuchen"_) deinen Kuchen eingeben → **"Hinzufügen"** klicken.\n\nDeine eigenen Einträge siehst du in der gelben Box **"Deine Kuchen (X):"** – dort kannst du sie auch **ändern** oder **löschen**.\n\nHinweis: In der Gesamtliste siehst du nur Namen, nicht wer was mitbringt.',
    keywords: ['kuchen', 'kuchenliste', 'backen', 'torte', 'mitbringen', 'eintragen', 'hinzufügen'],
    roles: ['employee'],
    category: 'Helfer & Kuchen',
  },

  {
    id: 'employee-verkaeufer-aktivieren',
    question: 'Wie aktiviere ich meinen Verkäuferstatus als Mitarbeiter?',
    answer:
      'Die Teilnahme gilt pro Basar. Auf deiner Startseite steht bei jedem Basar der Schalter **"Teilnahme"**:\n\n– Grau = **INAKTIV** → klicken zum Aktivieren\n– Grün = **AKTIV** → klicken zum Abmelden\n\nBeim Aktivieren erscheint ein Dialog, in dem du die **AGB** und die **Datenschutzerklärung** bestätigen musst. Danach kannst du für diesen Basar Artikel anlegen.',
    keywords: ['verkäufer', 'aktivieren', 'status', 'aktiv', 'umschalten', 'toggle', 'schalter', 'mitarbeiter'],
    roles: ['employee'],
    category: 'Konto & Login',
  },

  {
    id: 'employee-kasse-zugang',
    question: 'Wie komme ich zur Kasse?',
    answer:
      'Nur wenn du als Kassierer eingetragen bist, siehst du die lila Karte **"Kasse 💳"** im Mitarbeiterbereich.\n\nDort gibt es für jeden aktiven Basar einen Button **"Kasse: [Basarname] →"**. Wenn kein Basar gerade läuft, ist der Button deaktiviert und zeigt **"Kein aktiver Basar"**.',
    keywords: ['kasse', 'kassierer', 'zugang', 'öffnen', 'kassieren', 'pos', 'kasse öffnen'],
    roles: ['employee', 'cashier'],
    category: 'Kasse',
  },

  // ─── KASSE ────────────────────────────────────────────────────────────────

  {
    id: 'cashier-scannen',
    question: 'Wie scanne ich Artikel ein?',
    answer:
      'Klicke auf **"▶ Scannen"** (gelb) – die Kamera startet. Halte den QR-Code des Artikels vor die Kamera.\n\n– **Grüner Blitz + Ton** = Artikel erfolgreich erkannt und in den Warenkorb gelegt\n– **Roter Blitz + 2 Töne** = Fehler (Artikel nicht gefunden oder schon verkauft)\n\nMit **"■ Stop"** (rot) kannst du den Scanner beenden.',
    keywords: ['scannen', 'qr', 'code', 'kamera', 'scanner', 'einlesen', 'scan', 'artikel'],
    roles: ['cashier', 'employee'],
    category: 'Kasse',
  },

  {
    id: 'cashier-toene',
    question: 'Was bedeuten die Töne an der Kasse?',
    answer:
      '– **Hoher Piepton** = Artikel erfolgreich gescannt\n– **Zwei tiefe Töne** = Scan-Fehler (Artikel nicht gefunden, bereits verkauft oder ungültiger Code)\n– **Kassenton ("Ding")** = Kauf erfolgreich abgeschlossen\n\nDie Töne helfen dir, ohne auf den Bildschirm zu schauen.',
    keywords: ['töne', 'ton', 'piepton', 'ding', 'sound', 'beep', 'akustisch', 'bedeutet', 'signal'],
    roles: ['cashier', 'employee'],
    category: 'Kasse',
  },

  {
    id: 'cashier-preis-aendern',
    question: 'Kann ich den Preis eines Artikels im Warenkorb ändern?',
    answer:
      'Ja! Im Warenkorb ist das **Preisfeld jedes Artikels direkt editierbar** – klicke einfach darauf und trage den neuen Betrag ein. Das ist z.B. für Verhandlungen oder Korrekturen nützlich.',
    keywords: ['preis', 'ändern', 'anpassen', 'korrigieren', 'warenkorb', 'editieren', 'rabatt'],
    roles: ['cashier', 'employee'],
    category: 'Kasse',
  },

  {
    id: 'cashier-artikel-entfernen',
    question: 'Wie entferne ich einen Artikel aus dem Warenkorb?',
    answer:
      'Im Warenkorb gibt es neben jedem Artikel ein **"✕"-Symbol**. Klicke darauf, um den Artikel zu entfernen. Er gilt dann als nicht verkauft.',
    keywords: ['entfernen', 'warenkorb', 'stornieren', 'rückgängig', 'löschen', 'korb', 'artikel'],
    roles: ['cashier', 'employee'],
    category: 'Kasse',
  },

  {
    id: 'cashier-warenkorb-leeren',
    question: 'Wie leere ich den gesamten Warenkorb?',
    answer:
      'Über dem Warenkorb gibt es den Button **"Leeren"** (roter Link). Klicke darauf – es erscheint ein Bestätigungsdialog **"Warenkorb leeren?"**. Nach Bestätigung werden alle Artikel entfernt.',
    keywords: ['leeren', 'warenkorb', 'alle', 'entfernen', 'löschen', 'zurücksetzen', 'neu'],
    roles: ['cashier', 'employee'],
    category: 'Kasse',
  },

  {
    id: 'cashier-kauf-abschliessen',
    question: 'Wie schließe ich einen Kauf ab?',
    answer:
      'Wenn alle Artikel im Warenkorb sind:\n\n1. Im Feld **"Betrag erhalten"** den erhaltenen Geldbetrag eingeben\n2. Die App zeigt dir das **Rückgeld** (grün) oder ob der Betrag nicht reicht (rot)\n3. Klicke auf **"✓ Kassieren (X,XX €)"** (grün)\n\nNach Abschluss: Kassenton, Warenkorb wird geleert.',
    keywords: ['abschließen', 'bezahlen', 'kassieren', 'fertig', 'zahlen', 'kauf', 'abschluss', 'rückgeld', 'betrag'],
    roles: ['cashier', 'employee'],
    category: 'Kasse',
  },

  {
    id: 'cashier-offline',
    question: 'Was passiert im Offline-Modus?',
    answer:
      'Oben in der Statusleiste siehst du **"● Offline"** (orange) – die App arbeitet weiter!\n\n**"X im Cache"** in der Statusleiste zeigt, wie viele Artikel dieses Basars lokal gespeichert sind – so werden auch offline gescannte Artikel erkannt.\n\nAbgeschlossene Käufe werden ebenfalls lokal gespeichert und als **"X Sync ausstehend"** in der Statusleiste gezählt. Sobald du wieder online bist, werden sie automatisch synchronisiert.',
    keywords: ['offline', 'internet', 'verbindung', 'kein netz', 'statusleiste', 'cache'],
    roles: ['cashier', 'employee'],
    category: 'Kasse',
  },

  {
    id: 'cashier-offline-artikel-nicht-gefunden',
    question: 'Offline-Artikel wird nicht gefunden – was tun?',
    answer:
      'Wenn ein gescannter Artikel offline nicht im lokalen Cache ist, erscheint eine **gelbe Warnbox** mit einem Formular zur manuellen Eingabe:\n\n– **Artikelbezeichnung** eingeben\n– **Preis** eingeben\n– Auf **"Hinzufügen"** klicken\n\nDer Artikel wird dann manuell in den Warenkorb gelegt.',
    keywords: ['nicht gefunden', 'offline', 'manuell', 'eingeben', 'cache', 'unbekannt', 'fehlt'],
    roles: ['cashier', 'employee'],
    category: 'Kasse',
  },

  {
    id: 'cashier-sync',
    question: 'Wie synchronisiere ich offline gespeicherte Verkäufe?',
    answer:
      'Sobald du wieder online bist, erscheint ein **oranges Banner** mit der Anzahl ausstehender Transaktionen und dem Button **"Jetzt synchronisieren"**.\n\nDu kannst auch warten – die App synchronisiert automatisch im Hintergrund.',
    keywords: ['synchronisieren', 'sync', 'hochladen', 'übertragen', 'ausstehend', 'warten'],
    roles: ['cashier', 'employee'],
    category: 'Kasse',
  },

  {
    id: 'cashier-scanner-fehler',
    question: 'Der Scanner funktioniert nicht – was tun?',
    answer:
      'Mögliche Ursachen:\n\n– **Kamera-Berechtigung** nicht erteilt → im Browser-Popup erlauben\n– **Schlechtes Licht** → näher herangehen oder besser ausleuchten\n– **QR-Code beschädigt oder verschmutzt** → Etikett glätten und erneut versuchen\n\nEs gibt kein Suchfeld zur manuellen QR-Eingabe. Nur wenn du **offline** bist und ein gescannter Artikel nicht im lokalen Cache gefunden wird, öffnet sich automatisch ein Formular zur manuellen Eingabe von Artikelbezeichnung und Preis. Hilft nichts davon, wende dich an den Basar-Administrator.',
    keywords: ['scanner', 'funktioniert nicht', 'kamera', 'fehler', 'problem', 'geht nicht', 'berechtigung', 'kein bild'],
    roles: ['cashier', 'employee'],
    category: 'Kasse',
  },

  // ─── ALLGEMEIN ────────────────────────────────────────────────────────────

  {
    id: 'general-registrierung-verkaeufer',
    question: 'Wie registriere ich mich als Verkäufer?',
    answer:
      'Gehe zur **Login-Seite** und klicke auf den Registrierungslink für Verkäufer. Fülle aus:\n\n– E-Mail-Adresse\n– Vorname & Nachname\n– AGB akzeptieren (Pflicht)\n\nNach Absenden bekommst du deine **Verkäufernummer** sofort angezeigt und eine Bestätigungs-E-Mail.',
    keywords: ['registrieren', 'registrierung', 'verkäufer', 'neu', 'konto', 'anmeldung', 'account'],
    roles: ['seller', 'employee', 'cashier'],
    category: 'Konto & Login',
  },

  {
    id: 'general-registrierung-mitarbeiter',
    question: 'Wie registriere ich mich als Mitarbeiter?',
    answer:
      'Gehe zur **Login-Seite** und wähle den Registrierungslink für Mitarbeiter. Du brauchst:\n\n– E-Mail-Adresse\n– Vorname & Nachname\n– AGB akzeptieren\n\nNach Registrierung erhältst du deine **Login-Daten per E-Mail** (Passwort wird zugeschickt).',
    keywords: ['registrieren', 'mitarbeiter', 'helfer', 'neu', 'konto', 'anmeldung'],
    roles: ['seller', 'employee', 'cashier'],
    category: 'Konto & Login',
  },

  {
    id: 'general-login-problem',
    question: 'Ich kann mich nicht einloggen – was tun?',
    answer:
      'Überprüfe:\n\n– **E-Mail-Adresse** korrekt? (auch Tipp- und Groß-/Kleinschreibung)\n– **Passwort** korrekt? (Auge-Icon zum Einblenden nutzen)\n\nFalls du dein Passwort vergessen hast: Klicke auf **"Passwort vergessen?"** unter dem Login-Formular.',
    keywords: ['login', 'einloggen', 'anmelden', 'passwort', 'fehler', 'geht nicht', 'konto', 'funktioniert nicht'],
    roles: ['seller', 'employee', 'cashier'],
    category: 'Konto & Login',
  },

  {
    id: 'general-passwort-aendern',
    question: 'Wie ändere ich mein Passwort (eingeloggt)?',
    answer:
      'Gehe auf deine **Startseite** (Verkäufer-Bereich oder Mitarbeiter-Bereich) → scrolle zum Abschnitt **"Sicherheit"** → klicke auf **"Passwort ändern"** (blauer Button).\n\nGib dein neues Passwort zweimal ein (mindestens **6 Zeichen**) → **"Passwort ändern"** bestätigen.',
    keywords: ['passwort', 'ändern', 'sicherheit', 'neu', 'kennwort', 'eingeloggt', 'modal'],
    roles: ['seller', 'employee', 'cashier'],
    category: 'Konto & Login',
  },

  {
    id: 'general-passwort-vergessen',
    question: 'Ich habe mein Passwort vergessen – was tun?',
    answer:
      'Auf der **Login-Seite** gibt es den Link **"Passwort vergessen?"** (rechts, blau).\n\nKlicke darauf → E-Mail-Adresse eingeben → **"Reset-Link senden"** klicken.\n\nDu bekommst dann einen **Link per E-Mail**. Klicke ihn an, gib ein neues Passwort ein (mind. 6 Zeichen) und bestätige es. Danach automatische Weiterleitung zum Login.',
    keywords: ['vergessen', 'reset', 'zurücksetzen', 'link', 'email', 'passwort vergessen', 'resetten'],
    roles: ['seller', 'employee', 'cashier'],
    category: 'Konto & Login',
  },

];

export const suggestedQuestions: Record<string, string[]> = {
  seller: [
    'Wie lege ich einen neuen Artikel an?',
    'Welche Preise sind erlaubt?',
    'Wie drucke ich Etiketten aus?',
    'Was zeigt die Abrechnung?',
  ],
  employee: [
    'Wie melde ich mich für eine Aufgabe an?',
    'Wie trage ich Kuchen in die Kuchenliste ein?',
    'Wie aktiviere ich meinen Verkäuferstatus als Mitarbeiter?',
    'Wie komme ich zur Kasse?',
  ],
  cashier: [
    'Wie scanne ich Artikel ein?',
    'Wie schließe ich einen Kauf ab?',
    'Was passiert im Offline-Modus?',
    'Wie synchronisiere ich offline gespeicherte Verkäufe?',
  ],
};
