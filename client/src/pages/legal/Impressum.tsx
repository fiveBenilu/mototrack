import { LegalLayout, LegalSection } from './LegalLayout';

// Pflichtangaben nach § 5 DDG (ehem. TMG). MotoTrack ist ein privates,
// nicht-kommerzielles Projekt ohne Gewinnerzielungsabsicht.
export function Impressum() {
  return (
    <LegalLayout title="Impressum">
      <LegalSection heading="Angaben gemäß § 5 DDG">
        <p>
          Bennet Griese
          <br />
          Im Katzenbungert 13
          <br />
          50129 Bergheim
          <br />
          Deutschland
        </p>
      </LegalSection>

      <LegalSection heading="Kontakt">
        <p>
          E-Mail:{' '}
          <a href="mailto:bennet@bgriese.de" className="text-(--color-accent)">
            bennet@bgriese.de
          </a>
        </p>
      </LegalSection>

      <LegalSection heading="Verantwortlich für den Inhalt (§ 18 Abs. 2 MStV)">
        <p>Bennet Griese, Anschrift wie oben.</p>
      </LegalSection>

      <LegalSection heading="Art des Angebots">
        <p>
          MotoTrack ist ein privates, nicht-kommerzielles Projekt und wird ohne
          Gewinnerzielungsabsicht betrieben. Es besteht keine Umsatzsteuerpflicht; eine
          Umsatzsteuer-Identifikationsnummer liegt daher nicht vor.
        </p>
      </LegalSection>

      <LegalSection heading="EU-Streitschlichtung">
        <p>
          Die Europäische Kommission stellt eine Plattform zur Online-Streitbeilegung (OS) bereit:{' '}
          <a
            href="https://ec.europa.eu/consumers/odr/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-(--color-accent)"
          >
            https://ec.europa.eu/consumers/odr/
          </a>
          . Wir sind nicht verpflichtet und nicht bereit, an Streitbeilegungsverfahren vor einer
          Verbraucherschlichtungsstelle teilzunehmen.
        </p>
      </LegalSection>

      <LegalSection heading="Haftung für Inhalte & Nutzung">
        <p>
          MotoTrack dient ausschließlich der Aufzeichnung und Auswertung von Fahrten zu privaten
          Zwecken. Die App unterstützt oder fördert in keiner Weise Geschwindigkeitsüberschreitungen
          oder andere Verstöße gegen die Straßenverkehrsordnung. Details siehe Nutzungsbedingungen.
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
