export interface FaqItem {
  id: string;
  question: string;
  answer: string;
  keywords: string[];
  roles: ('seller' | 'employee' | 'cashier')[];
}

export const faqData: FaqItem[] = [
  // === VERKÄUFER ===
  {
    id: 'seller-artikel-erstellen',
    question: 'Wie erstelle ich Artikel?',
    answer:
      'Gehe zu **Meine Basare** → wähle einen Basar → klicke auf **"Neuer Artikel"**. Gib Bezeichnung und Preis ein und speichere. Jeder Artikel bekommt automatisch einen QR-Code.',
    keywords: ['artikel', 'erstellen', 'anlegen', 'neu', 'hinzufügen', 'neuer', 'eintragen', 'hochladen'],
    roles: ['seller', 'employee'],
  },
  {
    id: 'seller-etiketten',
    question: 'Wie drucke ich Etiketten aus?',
    answer:
      'Gehe zu deinem Basar und klicke auf **"Etiketten drucken"**. Es öffnet sich ein PDF mit allen QR-Code-Etiketten, die du ausdrucken und auf deine Artikel kleben kannst.',
    keywords: ['etiketten', 'drucken', 'ausdrucken', 'label', 'pdf', 'qr', 'aufkleber', 'zettel'],
    roles: ['seller', 'employee'],
  },
  {
    id: 'seller-artikel-bearbeiten',
    question: 'Kann ich Artikel nachträglich bearbeiten?',
    answer:
      'Ja, solange der Basar noch offen ist. Gehe zu deinem Basar, klicke auf den Artikel und wähle **"Bearbeiten"**. Nach dem Druck der Etiketten solltest du Preise nicht mehr ändern.',
    keywords: ['bearbeiten', 'ändern', 'editieren', 'korrigieren', 'anpassen', 'nachträglich'],
    roles: ['seller', 'employee'],
  },
  {
    id: 'seller-preis-format',
    question: 'Welches Preisformat muss ich eingeben?',
    answer:
      'Preise werden mit **Komma als Dezimaltrennzeichen** eingegeben, z.B. **1,70** oder **12,50**. Gib den Preis in Euro ein – Cent-Beträge mit Komma. Negative Preise oder 0 € sind nicht erlaubt.',
    keywords: ['preis', 'format', 'komma', 'angeben', 'eingeben', 'euro', 'cent', 'dezimal', 'betrag', '1,70', 'schreiben'],
    roles: ['seller', 'employee'],
  },
  {
    id: 'seller-artikel-loeschen',
    question: 'Wie lösche ich einen Artikel?',
    answer:
      'Gehe zu deinem Basar, klicke auf den Artikel und wähle **"Löschen"**. Achtung: Bereits verkaufte Artikel können nicht gelöscht werden.',
    keywords: ['löschen', 'entfernen', 'artikel', 'stornieren', 'storno', 'wegmachen'],
    roles: ['seller', 'employee'],
  },
  {
    id: 'seller-provision',
    question: 'Wie hoch ist die Provision?',
    answer:
      'Die Provision wird vom Basar-Veranstalter festgelegt und ist auf der Basar-Detailseite sichtbar. Sie wird automatisch bei der Abrechnung berechnet.',
    keywords: ['provision', 'prozent', 'gebühr', 'abzug', '%', 'anteil', 'kosten'],
    roles: ['seller', 'employee'],
  },
  {
    id: 'seller-abrechnung',
    question: 'Wann bekomme ich meine Abrechnung?',
    answer:
      'Nach Abschluss des Basars erstellt der Admin die Abrechnung. Du siehst dann unter **"Abrechnung"** welche Artikel verkauft wurden und wie viel du erhältst – Verkaufserlös minus Provision und ggf. Eintrittsgeld.',
    keywords: ['abrechnung', 'auszahlung', 'geld', 'erlös', 'gewinn', 'abschluss', 'settlement', 'verdienst'],
    roles: ['seller', 'employee'],
  },
  {
    id: 'seller-max-artikel',
    question: 'Wie viele Artikel darf ich anmelden?',
    answer:
      'Die maximale Artikelanzahl wird vom Veranstalter pro Basar festgelegt. Du siehst das Limit auf der Basar-Detailseite. Sobald du das Limit erreicht hast, kannst du keine weiteren Artikel anlegen.',
    keywords: ['maximal', 'anzahl', 'limit', 'maximum', 'viele', 'artikel', 'anmelden', 'registrieren', 'erlaubt'],
    roles: ['seller', 'employee'],
  },
  {
    id: 'seller-eintrittsgeld',
    question: 'Gibt es eine Anmeldegebühr oder Standgebühr?',
    answer:
      'Das hängt vom jeweiligen Basar ab. Auf der Basar-Detailseite siehst du, ob und wie viel Eintrittsgeld anfällt. Es wird bei der Abrechnung automatisch abgezogen.',
    keywords: ['eintrittsgeld', 'standgebühr', 'anmeldegebühr', 'teilnahme', 'mitmachen', 'fee'],
    roles: ['seller', 'employee'],
  },
  {
    id: 'seller-basar-ablauf',
    question: 'Wie läuft der Basar ab?',
    answer:
      'Du meldest Artikel an und druckst die QR-Code-Etiketten aus. Am Basartag gibst du deine Artikel ab. Die Kasse scannt die QR-Codes beim Verkauf. Nach dem Basar erhältst du deine Abrechnung mit dem Erlös.',
    keywords: ['ablauf', 'basar', 'funktioniert', 'prozess', 'vorgehen', 'wie', 'abgabe'],
    roles: ['seller', 'employee'],
  },

  // === MITARBEITER ===
  {
    id: 'employee-aufgaben',
    question: 'Wie melde ich mich für Aufgaben an?',
    answer:
      'Im **Mitarbeiterbereich** siehst du alle verfügbaren Aufgaben nach Tagen sortiert (Freitag, Samstag, Sonntag). Klicke auf eine Aufgabe um dich anzumelden. Du kannst dich auch wieder abmelden, solange Plätze frei sind.',
    keywords: ['aufgaben', 'aufgabe', 'schicht', 'dienst', 'helfen', 'eintragen', 'slot', 'melden'],
    roles: ['employee'],
  },
  {
    id: 'employee-kuchen',
    question: 'Wie trage ich Kuchen ein?',
    answer:
      'Im **Mitarbeiterbereich** gibt es einen Abschnitt **"Kuchenzettel"**. Dort trägst du ein, welche Kuchen du mitbringst. Klicke auf **"Kuchen hinzufügen"** und gib die Details ein.',
    keywords: ['kuchen', 'kuchenzettel', 'backen', 'torte', 'kaffee', 'mitbringen', 'kuchen'],
    roles: ['employee'],
  },
  {
    id: 'employee-verkaeufer-aktivieren',
    question: 'Wie aktiviere ich meinen Verkäuferstatus?',
    answer:
      'Im **Mitarbeiterbereich** gibt es einen Schalter **"Als Verkäufer aktiv"**. Wenn du ihn aktivierst, kannst du auch Artikel für den Basar anmelden – zusätzlich zu deiner Mitarbeiterrolle.',
    keywords: ['verkäufer', 'aktivieren', 'status', 'aktiv', 'umschalten', 'toggle', 'schalter'],
    roles: ['employee'],
  },
  {
    id: 'employee-kasse-zugang',
    question: 'Wie komme ich zur Kasse?',
    answer:
      'Wenn du als Kassierer eingeteilt bist, siehst du im Mitarbeiterbereich einen **"Kasse"**-Button. Klicke darauf, um zur Kassen-Ansicht des aktuellen Basars zu gelangen.',
    keywords: ['kasse', 'kassierer', 'zugang', 'button', 'öffnen', 'kassieren', 'pos'],
    roles: ['employee', 'cashier'],
  },

  // === KASSE ===
  {
    id: 'cashier-scannen',
    question: 'Wie scanne ich Artikel ein?',
    answer:
      'Klicke auf den **QR-Scanner-Button** (Kamera-Icon) in der Kasse. Halte den QR-Code des Artikels vor die Kamera. Der Artikel wird automatisch in den Warenkorb gelegt. Du kannst auch den QR-Code manuell eintippen.',
    keywords: ['scannen', 'qr', 'code', 'kamera', 'scanner', 'einlesen', 'scan', 'eintippen'],
    roles: ['cashier', 'employee'],
  },
  {
    id: 'cashier-artikel-entfernen',
    question: 'Wie entferne ich einen Artikel aus dem Warenkorb?',
    answer:
      'Im Warenkorb siehst du alle gescannten Artikel. Klicke auf das **Papierkorb-Symbol** neben dem Artikel um ihn zu entfernen. Der Artikel gilt dann als nicht verkauft.',
    keywords: ['entfernen', 'warenkorb', 'stornieren', 'rückgängig', 'papierkorb', 'löschen', 'korb'],
    roles: ['cashier', 'employee'],
  },
  {
    id: 'cashier-offline',
    question: 'Was passiert im Offline-Modus?',
    answer:
      'Die Kasse funktioniert auch ohne Internet. Verkäufe werden lokal gespeichert und automatisch synchronisiert, sobald die Verbindung wieder besteht. Ein **Offline-Indikator** zeigt dir den aktuellen Status.',
    keywords: ['offline', 'internet', 'verbindung', 'synchronisieren', 'sync', 'netz', 'kein internet'],
    roles: ['cashier', 'employee'],
  },
  {
    id: 'cashier-sync',
    question: 'Wie synchronisiere ich offline gespeicherte Verkäufe?',
    answer:
      'Sobald wieder eine Internetverbindung besteht, synchronisiert die Kasse **automatisch** alle offline gespeicherten Verkäufe. Du musst nichts manuell tun – der Sync-Status ist in der Kassen-Ansicht sichtbar.',
    keywords: ['synchronisieren', 'sync', 'hochladen', 'übertragen', 'daten', 'speichern'],
    roles: ['cashier', 'employee'],
  },
  {
    id: 'cashier-verkauf-abschliessen',
    question: 'Wie schließe ich einen Verkauf ab?',
    answer:
      'Wenn alle Artikel gescannt sind, klicke auf **"Bezahlen"** oder **"Kauf abschließen"**. Der Gesamtbetrag wird angezeigt. Nach Bestätigung werden die Verkäufe gespeichert und der Warenkorb geleert.',
    keywords: ['abschließen', 'bezahlen', 'kaufen', 'fertig', 'zahlen', 'kauf', 'abschluss', 'gesamt'],
    roles: ['cashier', 'employee'],
  },
  {
    id: 'cashier-scanner-fehler',
    question: 'Der Scanner funktioniert nicht – was tun?',
    answer:
      'Prüfe ob die **Kamera-Berechtigung** im Browser erteilt ist. Bei schlechtem Licht näher an den QR-Code gehen. Alternativ kannst du den QR-Code auch **manuell eintippen**. Falls das Problem bleibt, den Admin informieren.',
    keywords: ['scanner', 'funktioniert nicht', 'kamera', 'fehler', 'problem', 'geht nicht', 'berechtigung'],
    roles: ['cashier', 'employee'],
  },

  // === ALLGEMEIN ===
  {
    id: 'general-login',
    question: 'Ich kann mich nicht einloggen – was tun?',
    answer:
      'Überprüfe deine **E-Mail-Adresse** und dein **Passwort** (Groß-/Kleinschreibung beachten). Falls du dein Passwort vergessen hast, wende dich an den Administrator – er kann es zurücksetzen.',
    keywords: ['login', 'einloggen', 'anmelden', 'passwort', 'vergessen', 'fehler', 'geht nicht', 'konto'],
    roles: ['seller', 'employee', 'cashier'],
  },
  {
    id: 'general-passwort',
    question: 'Wie ändere ich mein Passwort?',
    answer:
      'Es gibt zwei Möglichkeiten:\n\n**Eingeloggt (Verkäufer):** Gehe zu deiner Startseite unter **"Mein Konto"** → **"Passwort ändern"** → neues Passwort eingeben und bestätigen.\n\n**Passwort vergessen:** Auf der **Login-Seite** auf **"Passwort vergessen?"** klicken → E-Mail-Adresse eingeben → du erhältst einen Reset-Link per E-Mail.',
    keywords: ['passwort', 'ändern', 'zurücksetzen', 'reset', 'vergessen', 'kennwort', 'neu', 'resetten'],
    roles: ['seller', 'employee', 'cashier'],
  },
  {
    id: 'general-registrierung',
    question: 'Wie registriere ich mich?',
    answer:
      'Auf der **Login-Seite** gibt es Links zur Registrierung als Verkäufer oder Mitarbeiter. Fülle das Formular mit deinen Daten aus. Nach der Registrierung kannst du dich sofort einloggen.',
    keywords: ['registrieren', 'registrierung', 'neu', 'konto', 'account', 'erstellen', 'anmeldung'],
    roles: ['seller', 'employee', 'cashier'],
  },
];

export const suggestedQuestions: Record<string, string[]> = {
  seller: [
    'Wie erstelle ich Artikel?',
    'Wie drucke ich Etiketten aus?',
    'Wann bekomme ich meine Abrechnung?',
    'Wie viele Artikel darf ich anmelden?',
  ],
  employee: [
    'Wie melde ich mich für Aufgaben an?',
    'Wie trage ich Kuchen ein?',
    'Wie aktiviere ich meinen Verkäuferstatus?',
    'Wie komme ich zur Kasse?',
  ],
  cashier: [
    'Wie scanne ich Artikel ein?',
    'Wie entferne ich einen Artikel aus dem Warenkorb?',
    'Was passiert im Offline-Modus?',
    'Wie schließe ich einen Verkauf ab?',
  ],
};
