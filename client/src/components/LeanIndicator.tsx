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
            {/* --- Motorrad --- */}
            <g fill={color} stroke="none">
              {/* Tank / Motorblock */}
              <ellipse cx="54" cy="110" rx="40" ry="33" />
              {/* linke Packtasche */}
              <rect x="6" y="120" width="20" height="20" rx="5" />
              {/* rechter Zylinder / Auspuff */}
              <circle cx="94" cy="130" r="11" />
              {/* Vorderreifen */}
              <rect x="43" y="86" width="22" height="62" rx="10" />
            </g>
            {/* Scheinwerfer (ausgespart) */}
            <rect x="44" y="90" width="20" height="11" rx="5" fill="var(--color-card)" />

            {/* --- Fahrer --- */}
            <g fill={color} stroke={color} strokeLinecap="round" strokeLinejoin="round">
              {/* Arme zu den Lenkergriffen */}
              <line x1="42" y1="46" x2="14" y2="86" strokeWidth="13" />
              <line x1="66" y1="46" x2="94" y2="86" strokeWidth="13" />
              {/* Rumpf: Schultern breit, läuft zum Sitz zusammen */}
              <path d="M36 36 L72 36 L66 90 L42 90 Z" strokeWidth="1" />
              {/* Helm */}
              <rect x="36" y="0" width="36" height="40" rx="17" strokeWidth="1" />
            </g>
            {/* Helm-Visiernaht */}
            <line x1="54" y1="4" x2="54" y2="34" stroke="var(--color-card)" strokeWidth="2.5" strokeLinecap="round" />
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
