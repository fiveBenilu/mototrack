import { PageHeader } from '../components/PageHeader';
import { LiveMap } from '../components/LiveMap';

export function MapPage() {
  return (
    <div className="pb-24">
      <PageHeader title="Karte" subtitle="Blitzer & Freunde live" />
      <LiveMap className="h-[calc(100vh-180px)]" />
    </div>
  );
}
