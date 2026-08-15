export interface Cluster {
  lat: number;
  lng: number;
  count: number;
}

// Rasterweite in Grad, sodass eine Zelle bei jedem Zoom ungefähr gleich groß auf
// dem Bildschirm ist (Web-Mercator: Weltbreite = 256 px · 2^zoom).
const CLUSTER_CELL_PX = 60;

/**
 * Gruppiert Punkte in ein zoomabhängiges Raster – wie die Bubbles in den
 * E-Scooter-Apps. Statt hunderter Marker zeichnet die Karte beim Rauszoomen nur
 * noch eine Blase pro Zelle mit der Anzahl darin.
 *
 * ponytail: Raster statt echtem Clustering (kein leaflet.markercluster). Reicht
 * für ein paar hundert Blitzer; bei Zehntausenden wäre Supercluster fällig.
 */
export function clusterPoints(points: { lat: number; lng: number }[], zoom: number): Cluster[] {
  const cell = (360 * CLUSTER_CELL_PX) / (256 * 2 ** zoom);
  const cells = new Map<string, Cluster>();
  for (const p of points) {
    const key = `${Math.floor(p.lat / cell)}:${Math.floor(p.lng / cell)}`;
    const existing = cells.get(key);
    if (existing) {
      existing.lat += p.lat;
      existing.lng += p.lng;
      existing.count += 1;
    } else {
      cells.set(key, { lat: p.lat, lng: p.lng, count: 1 });
    }
  }
  // Blase in den Schwerpunkt ihrer Punkte setzen, nicht in die Zellenmitte.
  return Array.from(cells.values()).map((c) => ({ lat: c.lat / c.count, lng: c.lng / c.count, count: c.count }));
}
