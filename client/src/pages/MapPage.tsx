import { PageHeader } from '../components/PageHeader';
import { LiveMap } from '../components/LiveMap';
import { SafetyNote } from '../components/SafetyDisclaimer';

export function MapPage() {
  return (
    <div className="pb-24">
      <PageHeader title="Karte" subtitle="Blitzer & Freunde live" />
      <div className="px-5 pt-3">
        <SafetyNote storageKey="mototrack-safety-note-map-dismissed" />
      </div>
      <LiveMap className="h-[calc(100vh-240px)]" />
    </div>
  );
}
