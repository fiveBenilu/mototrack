function zoneColor(absLean: number): string {
  if (absLean < 25) return 'var(--color-success)';
  if (absLean < 40) return 'var(--color-warning)';
  return 'var(--color-danger)';
}

export function LeanIndicator({ lean }: { lean: number }) {
  const clamped = Math.max(-60, Math.min(60, lean));
  const color = zoneColor(Math.abs(lean));
  const pivotX = 100;
  const pivotY = 178;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative h-40 w-40">
        <svg viewBox="0 0 200 200" className="h-full w-full">
          {/* Referenzlinien für 25° / 45° */}
          {[-45, -25, 25, 45].map((deg) => (
            <line
              key={deg}
              x1={pivotX}
              y1={pivotY}
              x2={pivotX + 90 * Math.sin((deg * Math.PI) / 180)}
              y2={pivotY - 90 * Math.cos((deg * Math.PI) / 180)}
              stroke="var(--color-border)"
              strokeWidth="1"
              strokeDasharray="2 4"
            />
          ))}

          {/* Boden-Linie */}
          <line x1="10" y1={pivotY} x2="190" y2={pivotY} stroke="var(--color-text-secondary)" strokeWidth="2" />

          {/* Motorrad + Fahrer von hinten (gefüllte Silhouette), rotiert um den Reifen-Kontaktpunkt.
              Ursprungsbild ~108 breit / 148 hoch, hier per translate auf den Pivot (100/178) gesetzt. */}
          <g transform={`rotate(${clamped} ${pivotX} ${pivotY}) translate(${pivotX - 54} ${pivotY - 148})`}>
            {/* Motorrad + Fahrer in Heckansicht. Lokaler Ursprung: Mitte x=54,
                Reifen-Kontaktpunkt unten bei y=148 (= Pivot). */}

            {/* Hinterreifen (breit) mit dezentem Profilsteg */}
            <rect x="45" y="84" width="18" height="64" rx="9" fill={color} />
            <rect x="52.5" y="88" width="3" height="56" rx="1.5" fill="var(--color-card)" opacity="0.3" />

            {/* Auspuff-Endtöpfe links & rechts */}
            <rect x="36" y="111" width="8.5" height="24" rx="4.25" fill={color} />
            <rect x="63.5" y="111" width="8.5" height="24" rx="4.25" fill={color} />

            {/* Heck-/Sitzverkleidung über dem Rad */}
            <path d="M45 90 L63 90 L60 116 Q54 122 48 116 Z" fill={color} />

            {/* Beine: Knie leicht nach außen (Hanging-off-Look) */}
            <g stroke={color} fill="none" strokeLinecap="round">
              <path d="M48 94 Q38 99 34 109" strokeWidth="11" />
              <path d="M60 94 Q70 99 74 109" strokeWidth="11" />
            </g>

            {/* Oberkörper (Rücken): runde Schultern, verjüngt zum Sitz */}
            <path d="M40 54 Q40 39 54 39 Q68 39 68 54 L62 95 L46 95 Z" fill={color} />

            {/* Arme zu den Lenkergriffen */}
            <g stroke={color} fill="none" strokeLinecap="round">
              <path d="M44 53 Q33 64 28 85" strokeWidth="9" />
              <path d="M64 53 Q75 64 80 85" strokeWidth="9" />
            </g>

            {/* Lenkergriffe / Lenkerenden */}
            <circle cx="28" cy="85" r="4.5" fill={color} />
            <circle cx="80" cy="85" r="4.5" fill={color} />

            {/* Helm */}
            <ellipse cx="54" cy="23" rx="15" ry="16" fill={color} />
            {/* Visier-Andeutung */}
            <path d="M44.5 21 Q54 27.5 63.5 21" stroke="var(--color-card)" strokeWidth="3" fill="none" strokeLinecap="round" />
            {/* Rückenprotektor-Linie */}
            <line x1="54" y1="44" x2="54" y2="90" stroke="var(--color-card)" strokeWidth="2" opacity="0.45" strokeLinecap="round" />
          </g>
        </svg>
      </div>
      <div className="text-center">
        <p className="text-4xl font-bold tabular-nums" style={{ color }}>
          {Math.abs(lean).toFixed(0)}°
        </p>
        <p className="text-xs font-medium text-(--color-text-secondary)">
          {lean < -2 ? 'Links' : lean > 2 ? 'Rechts' : 'Aufrecht'}
        </p>
      </div>
    </div>
  );
}
