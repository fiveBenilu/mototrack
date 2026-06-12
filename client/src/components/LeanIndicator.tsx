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
            {/* --- Motorrad (Rückansicht, schlank) --- */}
            <g fill={color} stroke="none">
              {/* Hinterreifen – schmal, mittig, Kontaktpunkt unten */}
              <rect x="49" y="80" width="10" height="68" rx="5" />
              {/* Heck / Sitzbank – schmale, sich verjüngende Silhouette */}
              <path d="M47 132 L61 132 L58 96 L50 96 Z" />
              {/* Auspuff-Endrohre, dezent links & rechts */}
              <rect x="40" y="120" width="6" height="20" rx="3" />
              <rect x="62" y="120" width="6" height="20" rx="3" />
            </g>

            {/* --- Fahrer --- */}
            <g fill={color} stroke={color} strokeLinecap="round" strokeLinejoin="round">
              {/* Arme zu den Lenkergriffen */}
              <line x1="44" y1="48" x2="26" y2="84" strokeWidth="9" />
              <line x1="64" y1="48" x2="82" y2="84" strokeWidth="9" />
              {/* Rumpf: Schultern schmal, läuft zum Sitz zusammen */}
              <path d="M40 38 L68 38 L62 96 L46 96 Z" strokeWidth="1" />
              {/* Helm */}
              <ellipse cx="54" cy="20" rx="16" ry="18" strokeWidth="1" />
            </g>
            {/* Lenkergriffe */}
            <circle cx="26" cy="84" r="4" fill={color} />
            <circle cx="82" cy="84" r="4" fill={color} />
            {/* Helm-Visiernaht */}
            <line x1="54" y1="6" x2="54" y2="36" stroke="var(--color-card)" strokeWidth="2.5" strokeLinecap="round" />
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
