import Link from 'next/link';

export default function ImpressumPage() {
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
          <h1 className="text-3xl font-bold text-gray-800 mb-6">Impressum</h1>
          
          <div className="space-y-6 text-gray-800 text-base leading-relaxed">
            <section>
              <h2 className="text-2xl font-semibold mb-3">Angaben gemäß § 5 TMG</h2>
              <p>
                [Ihr vollständiger Name oder Name der Organisation]<br />
                [Straße und Hausnummer]<br />
                [PLZ und Ort]
              </p>
              <p className="mt-4 text-sm text-gray-600">
                <strong>Hinweis:</strong> Bitte ersetzen Sie die Platzhalter in eckigen Klammern durch Ihre tatsächlichen Daten.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-3">Kontakt</h2>
              <p>
                <strong>Telefon:</strong> [Ihre Telefonnummer]<br />
                <strong>E-Mail:</strong> [ihre@email.de]
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-3">Verantwortlich für den Inhalt</h2>
              <p>
                Verantwortlich für den Inhalt nach § 55 Abs. 2 RStV:
              </p>
              <p className="mt-2">
                [Ihr Name]<br />
                [Adresse]
              </p>
            </section>

            {/* Optional - nur wenn zutreffend */}
            <section className="opacity-60">
              <h2 className="text-2xl font-semibold mb-3">Umsatzsteuer-ID (optional)</h2>
              <p>
                Umsatzsteuer-Identifikationsnummer gemäß § 27 a Umsatzsteuergesetz:<br />
                [DE XXXXXXXXX] <em>(nur falls vorhanden und gewerblich)</em>
              </p>
            </section>

            <section className="opacity-60">
              <h2 className="text-2xl font-semibold mb-3">Handelsregister (optional)</h2>
              <p>
                Registereintrag:<br />
                Eintragung im Handelsregister<br />
                Registergericht: [Gericht]<br />
                Registernummer: [HRB XXXXX] <em>(nur falls vorhanden und gewerblich)</em>
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-3">EU-Streitschlichtung</h2>
              <p>
                Die Europäische Kommission stellt eine Plattform zur Online-Streitbeilegung (OS) bereit:{' '}
                <a 
                  href="https://ec.europa.eu/consumers/odr/" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  https://ec.europa.eu/consumers/odr/
                </a>
              </p>
              <p className="mt-2">
                Unsere E-Mail-Adresse finden Sie oben im Impressum.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-3">Verbraucherstreitbeilegung / Universalschlichtungsstelle</h2>
              <p>
                Wir sind nicht bereit oder verpflichtet, an Streitbeilegungsverfahren vor einer 
                Verbraucherschlichtungsstelle teilzunehmen.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-3">Haftung für Inhalte</h2>
              <p>
                Als Diensteanbieter sind wir gemäß § 7 Abs.1 TMG für eigene Inhalte auf diesen Seiten nach den 
                allgemeinen Gesetzen verantwortlich. Nach §§ 8 bis 10 TMG sind wir als Diensteanbieter jedoch nicht 
                verpflichtet, übermittelte oder gespeicherte fremde Informationen zu überwachen oder nach Umständen 
                zu forschen, die auf eine rechtswidrige Tätigkeit hinweisen.
              </p>
              <p className="mt-2">
                Verpflichtungen zur Entfernung oder Sperrung der Nutzung von Informationen nach den allgemeinen 
                Gesetzen bleiben hiervon unberührt. Eine diesbezügliche Haftung ist jedoch erst ab dem Zeitpunkt 
                der Kenntnis einer konkreten Rechtsverletzung möglich. Bei Bekanntwerden von entsprechenden 
                Rechtsverletzungen werden wir diese Inhalte umgehend entfernen.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-3">Haftung für Links</h2>
              <p>
                Unser Angebot enthält Links zu externen Websites Dritter, auf deren Inhalte wir keinen Einfluss haben. 
                Deshalb können wir für diese fremden Inhalte auch keine Gewähr übernehmen. Für die Inhalte der 
                verlinkten Seiten ist stets der jeweilige Anbieter oder Betreiber der Seiten verantwortlich.
              </p>
              <p className="mt-2">
                Die verlinkten Seiten wurden zum Zeitpunkt der Verlinkung auf mögliche Rechtsverstöße überprüft. 
                Rechtswidrige Inhalte waren zum Zeitpunkt der Verlinkung nicht erkennbar. Eine permanente inhaltliche 
                Kontrolle der verlinkten Seiten ist jedoch ohne konkrete Anhaltspunkte einer Rechtsverletzung nicht 
                zumutbar. Bei Bekanntwerden von Rechtsverletzungen werden wir derartige Links umgehend entfernen.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-3">Urheberrecht</h2>
              <p>
                Die durch die Seitenbetreiber erstellten Inhalte und Werke auf diesen Seiten unterliegen dem 
                deutschen Urheberrecht. Die Vervielfältigung, Bearbeitung, Verbreitung und jede Art der Verwertung 
                außerhalb der Grenzen des Urheberrechtes bedürfen der schriftlichen Zustimmung des jeweiligen Autors 
                bzw. Erstellers.
              </p>
              <p className="mt-2">
                Downloads und Kopien dieser Seite sind nur für den privaten, nicht kommerziellen Gebrauch gestattet. 
                Soweit die Inhalte auf dieser Seite nicht vom Betreiber erstellt wurden, werden die Urheberrechte 
                Dritter beachtet. Insbesondere werden Inhalte Dritter als solche gekennzeichnet. Sollten Sie trotzdem 
                auf eine Urheberrechtsverletzung aufmerksam werden, bitten wir um einen entsprechenden Hinweis. Bei 
                Bekanntwerden von Rechtsverletzungen werden wir derartige Inhalte umgehend entfernen.
              </p>
            </section>

            <p className="mt-8 text-sm text-gray-600">
              <strong>Stand:</strong> {new Date().toLocaleDateString('de-DE', { year: 'numeric', month: 'long', day: 'numeric' })}
            </p>

            <div className="mt-8 p-4 bg-blue-50 border-l-4 border-blue-500 text-blue-900">
              <p className="font-semibold mb-2">📝 Wichtiger Hinweis:</p>
              <p className="text-sm">
                Bitte ersetzen Sie alle Platzhalter in eckigen Klammern [wie diesen] durch Ihre tatsächlichen Daten. 
                Entfernen Sie die optionalen Abschnitte (Umsatzsteuer-ID, Handelsregister), falls diese bei Ihnen 
                nicht zutreffen. Lassen Sie das Impressum ggf. von einem Rechtsanwalt prüfen.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
