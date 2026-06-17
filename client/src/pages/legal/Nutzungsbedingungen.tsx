import { LegalLayout, LegalSection } from './LegalLayout';

// Nutzungsbedingungen inkl. der zentralen Sicherheits-/Haftungsklauseln. Der
// Sicherheitshinweis steht bewusst ganz oben.
export function Nutzungsbedingungen() {
  return (
    <LegalLayout title="Nutzungsbedingungen">
      <section className="ios-card flex flex-col gap-2 border border-(--color-danger) p-4">
        <h2 className="text-base font-semibold text-(--color-danger)">
          ⚠️ Wichtiger Sicherheitshinweis – kein Aufruf zum Schnellfahren
        </h2>
        <p>
          MotoTrack ist ausschließlich ein Werkzeug zur Aufzeichnung und Auswertung von Fahrten zu
          privaten Zwecken. <strong>Die App unterstützt, fördert oder belohnt in keiner Weise
          Geschwindigkeitsüberschreitungen, riskantes Fahrverhalten oder Verstöße gegen die
          Straßenverkehrsordnung.</strong>
        </p>
        <p>
          Spielerische Elemente wie Punkte, Schräglagen-Bewertungen oder „Zonen“ sind reine
          Unterhaltung und dürfen niemals zum Anlass genommen werden, schneller, unaufmerksamer oder
          regelwidrig zu fahren. <strong>Fahre stets verantwortungsbewusst, vorausschauend und
          ausschließlich im Rahmen der geltenden Gesetze sowie der zulässigen
          Höchstgeschwindigkeit.</strong>
        </p>
        <p>
          Die Verantwortung für das Fahrverhalten liegt allein bei der fahrenden Person. Bediene das
          Gerät niemals während der Fahrt; richte die App vor Fahrtantritt ein. Die Nutzung erfolgt auf
          eigenes Risiko.
        </p>
      </section>

      <LegalSection heading="1. Geltungsbereich">
        <p>
          Diese Bedingungen regeln die Nutzung der App MotoTrack. Mit der Registrierung erklärst du dich
          mit ihnen einverstanden.
        </p>
      </LegalSection>

      <LegalSection heading="2. Bestimmungsgemäße Nutzung">
        <ul className="list-disc pl-5">
          <li>Die App dient der privaten Aufzeichnung von Fahrten und dem Austausch mit Freunden.</li>
          <li>
            Die angezeigten Karten-Elemente (z. B. „Blitzer“, Zonen) sind fiktiv bzw. spielerisch
            generiert und stellen <strong>keine</strong> Warnung vor realen
            Verkehrsüberwachungsanlagen dar (§ 23 Abs. 1c StVO bleibt unberührt; die App ist nicht zur
            Nutzung während der Fahrt zum Aufspüren von Messanlagen bestimmt).
          </li>
          <li>Die Bedienung der App während der Fahrt ist untersagt.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="3. Pflichten der Nutzer">
        <ul className="list-disc pl-5">
          <li>Du bist für die Sicherheit deines Zugangs (Passwort) selbst verantwortlich.</li>
          <li>
            Inhalte (z. B. Anzeigename, Profilbild, Chat-Nachrichten) dürfen keine Rechte Dritter
            verletzen, nicht rechtswidrig, beleidigend oder anstößig sein.
          </li>
          <li>
            Den Live-Standort und geteilte Fahrten gibst du nur mit Personen frei, die damit
            einverstanden sind.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="4. Inhalte und Meldungen">
        <p>
          Für nutzergenerierte Inhalte (insbesondere Gruppen-Chats) sind die jeweiligen Verfasser
          verantwortlich. Rechtswidrige Inhalte können an{' '}
          <span className="font-mono text-xs">kontakt@deine-domain.de</span> gemeldet und nach Prüfung
          entfernt werden.
        </p>
      </LegalSection>

      <LegalSection heading="5. Haftungsausschluss">
        <p>
          Die App wird ohne Gewähr für ständige Verfügbarkeit, Fehlerfreiheit oder Richtigkeit der
          angezeigten Werte (z. B. GPS-Geschwindigkeit, Schräglage) bereitgestellt. Eine Haftung für
          Schäden, die aus der Nutzung – insbesondere aus einem Fahrverhalten entgegen den
          Verkehrsregeln – entstehen, ist ausgeschlossen, soweit gesetzlich zulässig. Unberührt bleibt
          die Haftung für Vorsatz, grobe Fahrlässigkeit sowie für Schäden aus der Verletzung des Lebens,
          des Körpers oder der Gesundheit.
        </p>
      </LegalSection>

      <LegalSection heading="6. Kündigung / Löschung">
        <p>
          Du kannst dein Konto jederzeit in den Einstellungen löschen. Damit werden alle zugehörigen
          Daten entfernt.
        </p>
      </LegalSection>

      <LegalSection heading="7. Änderungen">
        <p>
          Wir können diese Bedingungen anpassen, wenn dies erforderlich wird. Über wesentliche
          Änderungen informieren wir in geeigneter Weise.
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
