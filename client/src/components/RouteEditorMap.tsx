import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useTheme } from '../context/ThemeContext';
import { useRide } from '../context/RideContext';

const DEFAULT_CENTER: [number, number] = [51.1657, 10.4515];
const ROUTE_COLOR = '#0a84ff';

// Nummerierter Wegpunkt-Pin (1, 2, 3 …); Start grün, Ziel rot.
function waypointIcon(label: string, kind: 'start' | 'mid' | 'end') {
  const bg = kind === 'start' ? '#34c759' : kind === 'end' ? '#ff3b30' : ROUTE_COLOR;
  return L.divIcon({
    className: '',
    html: `<div style="width:26px;height:26px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${bg};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center"><span style="transform:rotate(45deg);color:#fff;font-size:12px;font-weight:700">${label}</span></div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 26],
  });
}

function ClickToAdd({ onAdd }: { onAdd: (p: [number, number]) => void }) {
  useMapEvents({ click: (e) => onAdd([e.latlng.lat, e.latlng.lng]) });
  return null;
}

// Auf einen gesuchten/generierten Punkt schwenken.
function FocusOn({ focus }: { focus: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (focus) map.setView(focus, Math.max(map.getZoom(), 11));
  }, [focus, map]);
  return null;
}

// Beim ersten Laden auf die eigene Position zentrieren.
function CenterOnce() {
  const map = useMap();
  const { myLocation } = useRide();
  useEffect(() => {
    if (myLocation) map.setView([myLocation.lat, myLocation.lng], 13);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

export function RouteEditorMap({
  waypoints,
  geometry,
  focus = null,
  onAdd,
  onMove,
  onRemove,
  className,
}: {
  waypoints: [number, number][];
  geometry: [number, number][];
  focus?: [number, number] | null;
  onAdd: (p: [number, number]) => void;
  onMove: (index: number, p: [number, number]) => void;
  onRemove: (index: number) => void;
  className?: string;
}) {
  const { resolved } = useTheme();

  return (
    <div className={`relative overflow-hidden ${className ?? ''}`}>
      <MapContainer center={DEFAULT_CENTER} zoom={6} className="h-full w-full" zoomControl={false}>
        <TileLayer
          key={resolved}
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url={
            resolved === 'dark'
              ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
              : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'
          }
          subdomains="abcd"
          maxZoom={20}
        />
        <CenterOnce />
        <FocusOn focus={focus} />
        <ClickToAdd onAdd={onAdd} />

        {geometry.length > 1 && (
          <Polyline positions={geometry} pathOptions={{ color: ROUTE_COLOR, weight: 5, opacity: 0.8 }} />
        )}

        {waypoints.map((wp, i) => {
          const kind = i === 0 ? 'start' : i === waypoints.length - 1 ? 'end' : 'mid';
          return (
            <Marker
              key={i}
              position={wp}
              draggable
              icon={waypointIcon(String(i + 1), kind)}
              eventHandlers={{
                dragend: (e) => {
                  const ll = (e.target as L.Marker).getLatLng();
                  onMove(i, [ll.lat, ll.lng]);
                },
                // Tippen auf einen Pin entfernt ihn (langes Ziehen verschiebt).
                click: () => onRemove(i),
              }}
            />
          );
        })}
      </MapContainer>
    </div>
  );
}
