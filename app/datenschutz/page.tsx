import Link from 'next/link';

export default function DatenschutzPage() {
  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-yellow-500 text-gray-800 p-4 shadow-md">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <Link href="/" className="text-2xl font-bold hover:underline">
            Kinderbasar Neukirchen
          </Link>
          <Link href="/" className="hover:underline text-lg">
            Zurück zur Startseite
          </Link>
        </div>
      </header>

      <div className="max-w-4xl mx-auto p-8">
        <div className="bg-white/90 backdrop-blur-sm rounded-lg shadow-lg p-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-6">Datenschutzerklärung</h1>
          
          <div className="space-y-6 text-gray-800 text-base leading-relaxed">
            <section>
              <h2 className="text-2xl font-semibold mb-3">1. Verantwortlicher</h2>
              <p>
                Verantwortlich für die Datenverarbeitung auf dieser Website ist:
              </p>
              <p className="mt-2">
                [Ihr Name / Organisation]<br />
                [Straße und Hausnummer]<br />
                [PLZ und Ort]<br />
                E-Mail: [ihre@email.de]<br />
                Telefon: [Ihre Telefonnummer]
              </p>
              <p className="mt-3 text-sm text-gray-600">
                <strong>Hinweis:</strong> Bitte ersetzen Sie die Platzhalter in eckigen Klammern durch Ihre tatsächlichen Daten.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-3">2. Allgemeine Hinweise zur Datenverarbeitung</h2>
              <p>
                Wir nehmen den Schutz Ihrer persönlichen Daten sehr ernst. Wir behandeln Ihre personenbezogenen Daten 
                vertraulich und entsprechend den gesetzlichen Datenschutzvorschriften sowie dieser Datenschutzerklärung.
              </p>
              <p className="mt-2">
                Diese Website erhebt und speichert automatisch Informationen, die Ihr Browser an uns übermittelt. 
                Darüber hinaus verarbeiten wir personenbezogene Daten, die Sie uns bei der Registrierung freiwillig mitteilen.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-3">3. Welche Daten werden erfasst?</h2>
              
              <h3 className="text-xl font-semibold mt-4 mb-2">3.1 Registrierungsdaten</h3>
              <p>Bei der Registrierung als Verkäufer oder Mitarbeiter erheben wir:</p>
              <ul className="list-disc ml-6 mt-2 space-y-1">
                <li>Vorname und Nachname</li>
                <li>E-Mail-Adresse</li>
                <li>Verkäufer-ID (automatisch generiert)</li>
              </ul>
              <p className="mt-2">
                <strong>Rechtsgrundlage:</strong> Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung) und Art. 6 Abs. 1 lit. f DSGVO 
                (berechtigtes Interesse an der Organisation des Basars)
              </p>

              <h3 className="text-xl font-semibold mt-4 mb-2">3.2 Nutzungsdaten</h3>
              <p>Wir speichern:</p>
              <ul className="list-disc ml-6 mt-2 space-y-1">
                <li>Anmeldungen zu Helferaufgaben (Task-Signups)</li>
                <li>Kuchenspenden (Name der Kuchenart)</li>
                <li>Login-Zeitpunkte (gespeichert in JWT-Tokens)</li>
              </ul>

              <h3 className="text-xl font-semibold mt-4 mb-2">3.3 Server-Logdaten</h3>
              <p>Bei jedem Zugriff auf unsere Website werden automatisch folgende Daten erfasst:</p>
              <ul className="list-disc ml-6 mt-2 space-y-1">
                <li>IP-Adresse</li>
                <li>Datum und Uhrzeit des Zugriffs</li>
                <li>Aufgerufene Seite</li>
                <li>Browser-Typ und Version</li>
                <li>Betriebssystem</li>
              </ul>
              <p className="mt-2">
                Diese Daten werden ausschließlich zu statistischen Zwecken und zur Fehleranalyse verwendet.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-3">4. Zweck der Datenverarbeitung</h2>
              <p>Ihre Daten werden verwendet für:</p>
              <ul className="list-disc ml-6 mt-2 space-y-1">
                <li>Verwaltung der Verkäufer-Registrierungen für den Kinderbasar</li>
                <li>Koordination der Helfer-Einsätze</li>
                <li>Verwaltung der Kuchenspenden</li>
                <li>Versand von Registrierungsbestätigungen und Login-Daten per E-Mail</li>
                <li>Erstellung von QR-Codes und Barcodes für Verkäufer</li>
                <li>Bereitstellung des Admin- und Employee-Bereichs</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-3">5. Speicherdauer</h2>
              <p>
                Wir speichern Ihre personenbezogenen Daten nur so lange, wie es für die Durchführung des Basars 
                erforderlich ist oder gesetzliche Aufbewahrungsfristen bestehen.
              </p>
              <p className="mt-2">
                Nach Ende der Basar-Veranstaltung werden die Daten spätestens nach 6 Monaten gelöscht, 
                sofern keine rechtlichen Aufbewahrungspflichten entgegenstehen.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-3">6. Weitergabe von Daten an Dritte</h2>
              
              <h3 className="text-xl font-semibold mt-4 mb-2">6.1 Hosting (Vercel)</h3>
              <p>
                Diese Website wird auf Servern von Vercel Inc., 340 S Lemon Ave #4133, Walnut, CA 91789, USA gehostet. 
                Vercel verarbeitet dabei im Auftrag Daten wie IP-Adressen, Browser-Informationen und Zugriffsdaten.
              </p>
              <p className="mt-2">
                <strong>Rechtsgrundlage:</strong> Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse an sicherem Hosting)
              </p>

              <h3 className="text-xl font-semibold mt-4 mb-2">6.2 Datenbank (Supabase)</h3>
              <p>
                Ihre Registrierungsdaten werden in einer PostgreSQL-Datenbank bei Supabase (Supabase Inc., USA) gespeichert.
              </p>
              <p className="mt-2">
                <strong>Rechtsgrundlage:</strong> Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse an sicherer Datenspeicherung)
              </p>

              <h3 className="text-xl font-semibold mt-4 mb-2">6.3 E-Mail-Versand (Mailjet)</h3>
              <p>
                Für den Versand von E-Mails (Registrierungsbestätigungen, Login-Daten) nutzen wir Mailjet 
                (Mailgun Technologies Inc., USA).
              </p>
              <p className="mt-2">
                <strong>Rechtsgrundlage:</strong> Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse an zuverlässigem E-Mail-Versand)
              </p>

              <p className="mt-4">
                <strong>Datentransfer in Drittländer:</strong> Die genannten Dienstleister haben ihren Sitz in den USA. 
                Die Datenübermittlung erfolgt auf Grundlage von EU-Standardvertragsklauseln.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-3">7. Cookies und lokale Speicherung</h2>
              <p>
                Diese Website verwendet JWT-Tokens (JSON Web Tokens), die im lokalen Speicher (Session Storage) 
                Ihres Browsers gespeichert werden, um Sie nach dem Login angemeldet zu halten.
              </p>
              <p className="mt-2">
                Wir verwenden <strong>keine Tracking-Cookies</strong> oder Analyse-Tools von Drittanbietern.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-3">8. Ihre Rechte</h2>
              <p>Sie haben folgende Rechte bezüglich Ihrer personenbezogenen Daten:</p>
              <ul className="list-disc ml-6 mt-2 space-y-2">
                <li><strong>Recht auf Auskunft</strong> (Art. 15 DSGVO): Sie können jederzeit Auskunft über die bei uns gespeicherten Daten erhalten.</li>
                <li><strong>Recht auf Berichtigung</strong> (Art. 16 DSGVO): Unrichtige Daten werden auf Ihren Wunsch korrigiert.</li>
                <li><strong>Recht auf Löschung</strong> (Art. 17 DSGVO): Sie können die Löschung Ihrer Daten verlangen, sofern keine gesetzlichen Aufbewahrungspflichten bestehen.</li>
                <li><strong>Recht auf Einschränkung der Verarbeitung</strong> (Art. 18 DSGVO)</li>
                <li><strong>Recht auf Datenübertragbarkeit</strong> (Art. 20 DSGVO): Sie können Ihre Daten in einem strukturierten, maschinenlesbaren Format erhalten.</li>
                <li><strong>Widerspruchsrecht</strong> (Art. 21 DSGVO): Sie können der Verarbeitung Ihrer Daten jederzeit widersprechen.</li>
              </ul>
              <p className="mt-3">
                Zur Ausübung Ihrer Rechte wenden Sie sich bitte an: <strong>[ihre@email.de]</strong>
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-3">9. Beschwerderecht</h2>
              <p>
                Sie haben das Recht, sich bei einer Datenschutz-Aufsichtsbehörde über die Verarbeitung Ihrer 
                personenbezogenen Daten zu beschweren.
              </p>
              <p className="mt-2">
                Zuständige Aufsichtsbehörde:<br />
                <strong>Landesbeauftragter für Datenschutz und Informationsfreiheit Ihres Bundeslandes</strong>
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-3">10. Sicherheit</h2>
              <p>
                Wir verwenden geeignete technische und organisatorische Sicherheitsmaßnahmen zum Schutz Ihrer Daten:
              </p>
              <ul className="list-disc ml-6 mt-2 space-y-1">
                <li>SSL/TLS-Verschlüsselung (HTTPS) für alle Datenübertragungen</li>
                <li>Passwörter werden mit bcrypt gehashed und niemals im Klartext gespeichert</li>
                <li>Zugriffskontrolle durch JWT-basierte Authentifizierung</li>
                <li>Regelmäßige Sicherheitsupdates</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-3">11. Änderungen dieser Datenschutzerklärung</h2>
              <p>
                Wir behalten uns vor, diese Datenschutzerklärung anzupassen, um sie an geänderte Rechtssituationen 
                oder bei Änderungen des Dienstes anzupassen. Für erneute Besuche gilt dann die jeweils aktuelle 
                Datenschutzerklärung.
              </p>
            </section>

            <p className="mt-8 text-sm text-gray-600">
              <strong>Stand:</strong> {new Date().toLocaleDateString('de-DE', { year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
