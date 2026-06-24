import { Link } from 'react-router-dom';
import { Icon } from './Icon';

export function PageHeader({
  title,
  subtitle,
  backTo,
  onBack,
}: {
  title: string;
  subtitle?: string;
  backTo?: string;
  onBack?: () => void;
}) {
  return (
    <header className="safe-top sticky top-0 z-40 border-b border-(--color-border) bg-(--color-card) px-5 pb-3 pt-4 backdrop-blur-xl">
      <div className="flex items-center gap-2">
        {backTo && (
          <Link
            to={backTo}
            aria-label="Zurück"
            className="-ml-1.5 flex h-8 w-8 items-center justify-center rounded-full text-(--color-text-secondary)"
          >
            <Icon name="chevron-left" size={22} />
          </Link>
        )}
        {onBack && !backTo && (
          <button
            onClick={onBack}
            aria-label="Zurück"
            className="-ml-1.5 flex h-8 w-8 items-center justify-center rounded-full text-(--color-text-secondary)"
          >
            <Icon name="chevron-left" size={22} />
          </button>
        )}
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      </div>
      {subtitle && <p className="text-sm text-(--color-text-secondary)">{subtitle}</p>}
    </header>
  );
}
