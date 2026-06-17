import { LegalLayout, LegalSection, Placeholder } from './LegalLayout';

// Pflichtangaben nach § 5 DDG (ehem. TMG). Die Platzhalter MÜSSEN vor der
// Veröffentlichung durch die echten Angaben des Betreibers ersetzt werden.
export function Impressum() {
  return (
    <LegalLayout title="Impressum">
      <LegalSection heading="Angaben gemäß § 5 DDG">
        <p>
          <Placeholder>Vor- und Nachname / Firmenname</Placeholder>
          <br />
          <Placeholder>Straße und Hausnummer</Placeholder>
          <br />
          <Placeholder>PLZ und Ort</Placeholder>
          <br />
          <Placeholder>Land</Placeholder>
        </p>
      </LegalSection>

      <LegalSection heading="Kontakt">
        <p>
          E-Mail: <Placeholder>kontakt@deine-domain.de</Placeholder>
          <br />
          Telefon (optional): <Placeholder>Telefonnummer</Placeholder>
        </p>
      </LegalSection>

      <LegalSection heading="Verantwortlich für den Inhalt (§ 18 Abs. 2 MStV)">
        <p>
          <Placeholder>Vor- und Nachname</Placeholder>, Anschrift wie oben.
        </p>
      </LegalSection>

      <LegalSection heading="Umsatzsteuer-ID (falls vorhanden)">
        <p>
          USt-IdNr. gemäß § 27 a UStG: <Placeholder>DE… (falls vorhanden)</Placeholder>
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
          MotoTrack ist ein privates/nicht-kommerzielles Hobbyprojekt. Die App dient ausschließlich der
          Aufzeichnung und Auswertung von Fahrten zu privaten Zwecken. Sie unterstützt oder fördert in
          keiner Weise Geschwindigkeitsüberschreitungen oder andere Verstöße gegen die
          Straßenverkehrsordnung. Details siehe Nutzungsbedingungen.
        </p>
      </LegalSection>

      <p className="text-xs text-(--color-text-secondary)">
        Hinweis: Dieses Impressum enthält Platzhalter und ist vor einer öffentlichen Veröffentlichung
        mit den tatsächlichen Angaben zu vervollständigen.
      </p>
    </LegalLayout>
  );
}
