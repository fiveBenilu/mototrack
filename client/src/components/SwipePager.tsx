import { useRef, useState, type ReactNode } from 'react';

export interface SwipePage {
  key: string;
  /** Kurzes Label für die aktive Seite (über den Punkten angezeigt). */
  label: string;
  node: ReactNode;
}

/**
 * Horizontal wischbarer Seiten-Pager mit Snap und Punkt-Indikator – wie die
 * Ansichten im Workout der Apple Watch. Nutzt natives CSS-Scroll-Snapping, daher
 * ohne zusätzliche Bibliothek und mit nativem Touch-Gefühl.
 */
export function SwipePager({ pages, className }: { pages: SwipePage[]; className?: string }) {
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  function onScroll() {
    const el = ref.current;
    if (!el) return;
    const idx = Math.round(el.scrollLeft / el.clientWidth);
    if (idx !== active) setActive(Math.max(0, Math.min(pages.length - 1, idx)));
  }

  return (
    <div className={`flex min-h-0 flex-col ${className ?? ''}`}>
      <div className="flex shrink-0 flex-col items-center gap-1 pb-1.5 pt-1">
        <span className="text-xs font-medium text-(--color-text-secondary)">{pages[active]?.label}</span>
        <div className="flex items-center gap-1.5">
          {pages.map((p, i) => (
            <span
              key={p.key}
              className="h-1.5 rounded-full transition-all duration-200"
              style={{
                width: i === active ? 18 : 6,
                background: i === active ? 'var(--color-accent)' : 'var(--color-border)',
              }}
            />
          ))}
        </div>
      </div>

      <div
        ref={ref}
        onScroll={onScroll}
        className="flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain"
      >
        {pages.map((p) => (
          <div key={p.key} className="w-full shrink-0 snap-center overflow-y-auto">
            {p.node}
          </div>
        ))}
      </div>
    </div>
  );
}
