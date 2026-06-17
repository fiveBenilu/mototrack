import { Link } from 'react-router-dom';
import { LegalLayout, LegalSection } from './LegalLayout';

// Datenschutzerklärung gemäß DSGVO Art. 13. Die einzelnen Datenkategorien
// spiegeln das wider, was die App tatsächlich verarbeitet.
export function Datenschutz() {
  return (
    <LegalLayout title="Datenschutzerklärung">
      <p className="text-(--color-text-secondary)">
        Der Schutz deiner personenbezogenen Daten ist uns wichtig. Nachfolgend informieren wir dich
        gemäß Art. 13 DSGVO über die Verarbeitung deiner Daten in der App MotoTrack.
      </p>

      <LegalSection heading="1. Verantwortlicher">
        <p>
          Bennet Griese, Im Katzenbungert 13, 50129 Bergheim, Deutschland. E-Mail:{' '}
          <a href="mailto:bennet@bgriese.de" className="text-(--color-accent)">
            bennet@bgriese.de
          </a>
          . Weitere Angaben im{' '}
          <Link to="/impressum" className="text-(--color-accent)">
            Impressum
          </Link>
          .
        </p>
      </LegalSection>

      <LegalSection heading="2. Welche Daten wir verarbeiten">
        <ul className="list-disc pl-5">
          <li>
            <strong>Kontodaten:</strong> Benutzername, Anzeigename, Passwort (nur als kryptografischer
            Hash, nie im Klartext), optionales Profilbild, automatisch generierter Freunde-Code.
          </li>
          <li>
            <strong>Standort- und Fahrtdaten:</strong> GPS-Position, Geschwindigkeit, zurückgelegte
            Strecke, Zeitstempel sowie der vollständige Streckenverlauf einer aufgezeichneten Fahrt.
            Dies sind besonders schützenswerte Bewegungsdaten.
          </li>
          <li>
            <strong>Sensordaten des Geräts:</strong> Schräglage (Gyroskop) und Beschleunigung
            (G-Kraft) während einer Fahrt.
          </li>
          <li>
            <strong>Live-Standort:</strong> Bei aktivem Konvoi-/Freunde-Modus wird dein aktueller
            Standort in Echtzeit an die von dir ausgewählten Personen übermittelt – nur, solange du
            dies aktiv eingeschaltet hast.
          </li>
          <li>
            <strong>Soziale Daten:</strong> Freundschaftsbeziehungen, Gruppenmitgliedschaften und
            Chat-Nachrichten in Gruppen.
          </li>
          <li>
            <strong>Push-Abonnements:</strong> Geräte-Endpunkt und zugehörige Schlüssel, falls du
            Push-Benachrichtigungen aktivierst.
          </li>
          <li>
            <strong>Technische Daten:</strong> beim Aufruf anfallende Server-/Verbindungsdaten (z. B.
            IP-Adresse) durch den Hosting-/Proxy-Dienstleister.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="3. Zwecke und Rechtsgrundlagen">
        <ul className="list-disc pl-5">
          <li>
            Bereitstellung des Kontos und der Kernfunktionen (Fahrten aufzeichnen, Statistik) –{' '}
            <strong>Art. 6 Abs. 1 lit. b DSGVO</strong> (Vertrag/Nutzungsverhältnis).
          </li>
          <li>
            Verarbeitung von Standort-, Sensor- und Live-Standortdaten –{' '}
            <strong>Art. 6 Abs. 1 lit. a DSGVO</strong> (deine Einwilligung, jederzeit über die
            Geräteberechtigungen bzw. das Beenden der Aufzeichnung widerrufbar).
          </li>
          <li>
            Push-Benachrichtigungen – <strong>Art. 6 Abs. 1 lit. a DSGVO</strong> (Einwilligung,
            jederzeit in den Einstellungen widerrufbar).
          </li>
          <li>
            Betrieb, Sicherheit und Fehleranalyse – <strong>Art. 6 Abs. 1 lit. f DSGVO</strong>
            (berechtigtes Interesse an einem sicheren, funktionierenden Dienst).
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="4. Cookies / lokale Speicherung">
        <p>
          Wir setzen ausschließlich ein technisch notwendiges Cookie zur Anmeldung (Session-Token).
          Es ist für den Betrieb erforderlich und damit nach § 25 Abs. 2 TTDSG einwilligungsfrei. Ein
          Tracking durch Dritte oder zu Werbezwecken findet nicht statt. Zusätzlich werden im lokalen
          Speicher deines Geräts App-Einstellungen (z. B. Theme, Einwilligungs- und Sicherheitshinweis)
          gespeichert.
        </p>
      </LegalSection>

      <LegalSection heading="5. Empfänger und Drittanbieter">
        <ul className="list-disc pl-5">
          <li>
            <strong>Hosting/Auslieferung:</strong> Der Dienst wird auf einem vom Betreiber selbst
            betriebenen Server bereitgestellt. Die verschlüsselte Auslieferung (TLS) erfolgt über
            Cloudflare (Cloudflare Tunnel), Cloudflare, Inc., USA. Dabei wird deine IP-Adresse
            verarbeitet.
          </li>
          <li>
            <strong>Kartendaten:</strong> Kartenkacheln und Straßendaten werden von OpenStreetMap /
            Overpass geladen; dabei wird deine IP-Adresse an den jeweiligen Tile-Server übermittelt.
          </li>
          <li>
            <strong>Push-Dienste:</strong> Für Benachrichtigungen werden die Push-Dienste des
            jeweiligen Browser-/Geräteherstellers (z. B. Apple, Google, Mozilla) genutzt.
          </li>
          <li>
            <strong>Andere Nutzer:</strong> Geteilte Fahrten (öffentlicher Link), Live-Standort im
            Konvoi und Gruppen-Chatnachrichten sind für die jeweils berechtigten Personen sichtbar.
          </li>
        </ul>
        <p className="text-xs text-(--color-text-secondary)">
          Soweit Daten in Drittländer (z. B. USA) übertragen werden, erfolgt dies auf Grundlage
          geeigneter Garantien (Art. 44 ff. DSGVO, z. B. EU-Standardvertragsklauseln).
        </p>
      </LegalSection>

      <LegalSection heading="6. Speicherdauer">
        <p>
          Wir speichern deine Daten, solange dein Konto besteht. Löschst du dein Konto, werden alle
          zugehörigen Daten (Fahrten, Freundschaften, Gruppen, Nachrichten, Durchfahrten,
          Push-Abonnements) unverzüglich und vollständig gelöscht. Einzelne Fahrten kannst du jederzeit
          selbst löschen.
        </p>
      </LegalSection>

      <LegalSection heading="7. Deine Rechte">
        <p>Dir stehen nach der DSGVO folgende Rechte zu:</p>
        <ul className="list-disc pl-5">
          <li>Auskunft (Art. 15) und Datenübertragbarkeit (Art. 20) – über „Daten exportieren“ in den Einstellungen.</li>
          <li>Berichtigung (Art. 16).</li>
          <li>Löschung (Art. 17) – über „Konto löschen“ in den Einstellungen.</li>
          <li>Einschränkung der Verarbeitung (Art. 18) und Widerspruch (Art. 21).</li>
          <li>Widerruf erteilter Einwilligungen mit Wirkung für die Zukunft (Art. 7 Abs. 3).</li>
          <li>
            Beschwerde bei einer Aufsichtsbehörde (Art. 77), z. B. der für dich zuständigen
            Landesdatenschutzbehörde.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="8. Minderjährige">
        <p>
          Das Angebot richtet sich an Personen ab 16 Jahren. Jüngere Nutzer benötigen die Einwilligung
          der Erziehungsberechtigten (Art. 8 DSGVO).
        </p>
      </LegalSection>

      <p className="text-xs text-(--color-text-secondary)">Stand: 17. Juni 2026</p>
    </LegalLayout>
  );
}
