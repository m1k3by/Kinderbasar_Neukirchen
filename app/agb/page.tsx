import LegalFooter from '../components/LegalFooter';

export default function AGBPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <h1 className="text-4xl font-bold mb-8 text-gray-800">
          Allgemeine Geschäftsbedingungen (AGB)
        </h1>
        
        <div className="bg-white rounded-lg shadow-sm p-8 space-y-8">
          {/* Geltungsbereich */}
          <section>
            <h2 className="text-2xl font-bold mb-4 text-gray-800">1. Geltungsbereich</h2>
            <p className="text-gray-700 leading-relaxed">
              Diese Allgemeinen Geschäftsbedingungen (AGB) gelten für die Teilnahme am Kinderbasar Neukirchen 
              (nachfolgend "Veranstalter" genannt). Mit der Registrierung erkennen die Verkäufer diese AGB 
              verbindlich an.
            </p>
          </section>

          {/* Registrierung */}
          <section>
            <h2 className="text-2xl font-bold mb-4 text-gray-800">2. Registrierung und Verkäufernummer</h2>
            <div className="space-y-3 text-gray-700 leading-relaxed">
              <p>
                2.1. Die Registrierung erfolgt online über die Website des Veranstalters oder vor Ort.
              </p>
              <p>
                2.2. Jeder Verkäufer erhält eine eindeutige Verkäufernummer, die zur Kennzeichnung aller 
                Waren verwendet werden muss.
              </p>
              <p>
                2.3. Die Verkäufernummer ist nicht übertragbar und darf nur vom registrierten Verkäufer 
                verwendet werden.
              </p>
              <p>
                2.4. Pro Person/Haushalt ist nur eine Verkäufernummer zulässig.
              </p>
            </div>
          </section>

          {/* Warenannahme */}
          <section>
            <h2 className="text-2xl font-bold mb-4 text-gray-800">3. Warenannahme</h2>
            <div className="space-y-3 text-gray-700 leading-relaxed">
              <p>
                3.1. Die Warenannahme erfolgt zu den vom Veranstalter bekannt gegebenen Zeiten.
              </p>
              <p>
                3.2. Jeder Artikel muss gut sichtbar und fest mit einem Etikett versehen sein, das die 
                Verkäufernummer und den Preis enthält.
              </p>
              <p>
                3.3. Angenommen werden ausschließlich:
              </p>
              <ul className="list-disc ml-6 space-y-2">
                <li>Saubere, gepflegte und funktionstüchtige Artikel</li>
                <li>Kinderkleidung und -schuhe</li>
                <li>Spielzeug und Bücher in einwandfreiem Zustand</li>
                <li>Kinderwagen, Autositze und ähnliche Artikel (mit gültigen Sicherheitsnormen)</li>
              </ul>
              <p>
                3.4. Der Veranstalter behält sich das Recht vor, Waren ohne Angabe von Gründen abzulehnen, 
                insbesondere bei:
              </p>
              <ul className="list-disc ml-6 space-y-2">
                <li>Beschädigten, verschmutzten oder unvollständigen Artikeln</li>
                <li>Artikeln ohne oder mit falscher Kennzeichnung</li>
                <li>Sicherheitsbedenklichen Produkten</li>
              </ul>
            </div>
          </section>

          {/* Kommissionsverkauf */}
          <section>
            <h2 className="text-2xl font-bold mb-4 text-gray-800">4. Kommissionsverkauf und Provision</h2>
            <div className="space-y-3 text-gray-700 leading-relaxed">
              <p>
                4.1. Der Verkauf erfolgt auf Kommissionsbasis. Der Veranstalter verkauft die Ware im Namen 
                und für Rechnung des Verkäufers.
              </p>
              <p>
                4.2. Die Provision beträgt 15% des Verkaufspreises zzgl. gesetzlicher Mehrwertsteuer.
              </p>
              <p>
                4.3. Der Verkäufer legt den Verkaufspreis selbst fest. Es wird empfohlen, realistische 
                Preise anzusetzen (ca. 30-50% des Neupreises).
              </p>
            </div>
          </section>

          {/* Abrechnung */}
          <section>
            <h2 className="text-2xl font-bold mb-4 text-gray-800">5. Abrechnung und Auszahlung</h2>
            <div className="space-y-3 text-gray-700 leading-relaxed">
              <p>
                5.1. Die Abrechnung erfolgt nach Ende des Basars.
              </p>
              <p>
                5.2. Die Auszahlung des Verkaufserlöses (abzüglich Provision) erfolgt wahlweise:
              </p>
              <ul className="list-disc ml-6 space-y-2">
                <li>Bar bei der Warenrückgabe</li>
                </ul>
              </div>
          </section>

          {/* Nicht verkaufte Ware */}
          <section>
            <h2 className="text-2xl font-bold mb-4 text-gray-800">6. Nicht verkaufte Ware</h2>
            <div className="space-y-3 text-gray-700 leading-relaxed">
              <p>
                6.1. Nicht verkaufte Artikel können zu den bekannt gegebenen Zeiten abgeholt werden.
              </p>
              <p>
                6.2. Nicht abgeholte Ware geht in das Eigentum des Veranstalters über und wird gespendet 
                oder entsorgt. Ein Anspruch auf Auszahlung des Verkaufserlöses oder Rückgabe besteht nicht mehr.
              </p>
              <p>
                6.3. Verkäufer können bei der Registrierung angeben, dass nicht verkaufte Ware gespendet 
                werden darf. In diesem Fall entfällt die Abholpflicht.
              </p>
            </div>
          </section>

          {/* Haftung */}
          <section>
            <h2 className="text-2xl font-bold mb-4 text-gray-800">7. Haftung</h2>
            <div className="space-y-3 text-gray-700 leading-relaxed">
              <p>
                7.1. Der Veranstalter übernimmt die Ware mit größter Sorgfalt, haftet jedoch nicht für 
                Verlust, Beschädigung oder Diebstahl, soweit nicht Vorsatz oder grobe Fahrlässigkeit vorliegt.
              </p>
              <p>
                7.2. Der Verkäufer versichert, dass die angebotene Ware frei von Rechten Dritter ist und 
                er zur Veräußerung berechtigt ist.
              </p>
              <p>
                7.3. Der Verkäufer haftet für die Richtigkeit der Angaben zu den Artikeln (Zustand, 
                Sicherheit, Vollständigkeit).
              </p>
              <p>
                7.4. Für Mängel an der Ware haftet der Verkäufer gegenüber dem Käufer nach den gesetzlichen 
                Bestimmungen.
              </p>
            </div>
          </section>

          {/* Helfer */}
          <section>
            <h2 className="text-2xl font-bold mb-4 text-gray-800">8. Helfer und Mitarbeit</h2>
            <div className="space-y-3 text-gray-700 leading-relaxed">
              <p>
                8.1. Verkäufer haben die Möglichkeit, sich als Helfer zu registrieren.
              </p>
              <p>
                8.2. Die Anmeldung als Helfer ist freiwillig und begründet kein Arbeitsverhältnis.
              </p>
            </div>
          </section>

          {/* Datenschutz */}
          <section>
            <h2 className="text-2xl font-bold mb-4 text-gray-800">9. Datenschutz</h2>
            <div className="space-y-3 text-gray-700 leading-relaxed">
              <p>
                9.1. Die Verarbeitung personenbezogener Daten erfolgt gemäß der Datenschutzerklärung des 
                Veranstalters.
              </p>
              <p>
                9.2. Die Datenschutzerklärung ist unter <a href="/datenschutz" className="text-blue-600 hover:underline">/datenschutz</a> einsehbar.
              </p>
            </div>
          </section>

          {/* Änderungen */}
          <section>
            <h2 className="text-2xl font-bold mb-4 text-gray-800">10. Änderungen und Schlussbestimmungen</h2>
            <div className="space-y-3 text-gray-700 leading-relaxed">
              <p>
                10.1. Der Veranstalter behält sich das Recht vor, diese AGB jederzeit zu ändern. 
                Änderungen werden den registrierten Verkäufern per E-Mail mitgeteilt.
              </p>
              <p>
                10.2. Sollten einzelne Bestimmungen dieser AGB unwirksam sein, bleibt die Wirksamkeit 
                der übrigen Bestimmungen hiervon unberührt.
              </p>
              <p>
                10.3. Es gilt das Recht der Bundesrepublik Deutschland.
              </p>
            </div>
          </section>

          {/* Kontakt */}
          <section className="border-t pt-6">
            <h2 className="text-2xl font-bold mb-4 text-gray-800">Kontakt</h2>
            <p className="text-gray-700 leading-relaxed">
              Bei Fragen zu diesen AGB wenden Sie sich bitte an:<br />
              <strong>Kinderbasar Neukirchen</strong><br />
              basar.neukirchen@gmail.com<br />
             </p>
          </section>

          <div className="text-sm text-gray-500 border-t pt-6">
            Stand: November 2025
          </div>
        </div>
      </div>
      
      <LegalFooter />
    </div>
  );
}
