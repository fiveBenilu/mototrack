import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useTheme } from '../context/ThemeContext';
import { curveColor, type Curve } from '../lib/curves';

const ROUTE_COLOR = '#0a84ff';

function endIcon(color: string) {
  return L.divIcon({
    className: '',
    html: `<div style="width:16px;height:16px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4)"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

// Karte automatisch auf den Streckenverlauf einpassen.
function FitBounds({ geometry }: { geometry: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (geometry.length > 1) map.fitBounds(geometry as L.LatLngBoundsExpression, { padding: [30, 30] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geometry]);
  return null;
}

export function RoutePreviewMap({
  geometry,
  curves,
  className,
}: {
  geometry: [number, number][];
  curves: Curve[];
  className?: string;
}) {
  const { resolved } = useTheme();
  if (geometry.length < 2) return null;

  return (
    <div className={`overflow-hidden ${className ?? ''}`}>
      <MapContainer center={geometry[0]} zoom={12} className="h-full w-full" zoomControl={false}>
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
        <FitBounds geometry={geometry} />

        <Polyline positions={geometry} pathOptions={{ color: ROUTE_COLOR, weight: 4, opacity: 0.7 }} />

        {/* Schöne Kurven farblich hervorheben (dicke Überlagerung). */}
        {curves.map((c, i) => (
          <Polyline
            key={i}
            positions={c.positions}
            pathOptions={{ color: curveColor(c.quality), weight: 8, opacity: 0.9, lineCap: 'round' }}
          />
        ))}

        <Marker position={geometry[0]} icon={endIcon('#34c759')} />
        <Marker position={geometry[geometry.length - 1]} icon={endIcon('#ff3b30')} />
      </MapContainer>
    </div>
  );
}
