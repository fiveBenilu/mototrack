export interface RideTrackPoint {
  ts: number;
  lat: number;
  lng: number;
  speed: number;
  lean: number;
}

export interface SpeedCamera {
  id: number;
  lat: number;
  lng: number;
}

// Blitzer-Zone (Forza-Stil): Mess-Strecke zwischen Ein- und Ausfahrt.
export interface SpeedZone {
  id: number;
  entryLat: number;
  entryLng: number;
  exitLat: number;
  exitLng: number;
  lengthM: number;
  path: [number, number][]; // Straßenverlauf zwischen Ein- und Ausfahrt
}

export interface FriendLocation {
  userId: number;
  lat: number;
  lng: number;
  speedKmh: number;
  ts: number;
  // Live-Telemetrie (fehlt bei alten Clients → optional).
  leanDeg?: number;
  distanceM?: number;
  maxSpeedKmh?: number;
  recording?: boolean;
}

/** Live-Ereignis eines Freundes während der Fahrt (Blitzer/Zone geschafft). */
export interface FriendEvent {
  id: string;
  userId: number;
  name: string;
  kind: 'camera' | 'zone';
  speedKmh: number;
  points: number;
  stars: number;
  ts: number;
}

export interface Friend {
  id: number;
  username: string;
  displayName: string;
  avatarPath: string | null;
  online: boolean;
  nickname?: string | null;
}

export interface FriendRequest {
  requestId: number;
  id: number;
  username: string;
  displayName: string;
  avatarPath: string | null;
}

export interface StatsTotals {
  rides: number;
  distanceM: number;
  durationS: number;
  maxSpeedKmh: number;
  maxLeanLeft: number;
  maxLeanRight: number;
  maxG: number;
  points: number;
}

export interface RideHistoryEntry {
  id: number;
  startedAt: number;
  distanceM: number;
  durationS: number;
  maxSpeedKmh: number;
  avgSpeedKmh: number;
  maxLean: number;
}

export interface CornerEvent {
  rideId: number;
  ts: number;
  lean: number;
  side: 'links' | 'rechts';
  rating: 'Bronze' | 'Silber' | 'Gold' | 'Platin';
}

export interface FriendProfile {
  user: {
    id: number;
    username: string;
    displayName: string;
    avatarPath: string | null;
    online: boolean;
  };
  totals: StatsTotals;
  history: RideHistoryEntry[];
  corners: CornerEvent[];
}

export interface FriendStats {
  id: number;
  displayName: string;
  avatarPath: string | null;
  distanceM: number;
  maxSpeedKmh: number;
  maxLean: number;
  points: number;
}

export interface GroupMember {
  id: number;
  username: string;
  displayName: string;
  avatarPath: string | null;
  online: boolean;
}

export interface GroupSummary {
  id: number;
  name: string;
  ownerId: number;
  createdAt: number;
  memberCount: number;
  lastMessage: { body: string; createdAt: number; displayName: string } | null;
}

export interface GroupDetail {
  id: number;
  name: string;
  ownerId: number;
  createdAt: number;
  activeRouteId: number | null;
  members: GroupMember[];
}

export interface GroupMessage {
  id: number;
  groupId: number;
  userId: number;
  displayName: string;
  avatarPath: string | null;
  body: string;
  createdAt: number;
}

export interface RouteStep {
  lat: number;
  lng: number;
  instruction: string;
  distanceM: number;
}

// Routing-Profil: schnellste Strecke oder kurvige Motorrad-Route (calimoto-Stil).
export type RouteProfile = 'fast' | 'curvy';

// Geplante Tour: Wegpunkte + berechneter Straßenverlauf, Dauer und
// Abbiege-Anweisungen.
export interface PlannedRoute {
  id: number;
  ownerId: number;
  ownerName: string | null;
  name: string;
  profile: RouteProfile;
  distanceM: number;
  durationS: number;
  waypoints: [number, number][];
  geometry: [number, number][];
  steps: RouteStep[];
  createdAt: number;
}

// Routing-Vorschau (noch nicht gespeichert).
export interface RoutePreview {
  distanceM: number;
  durationS: number;
  geometry: [number, number][];
  steps: RouteStep[];
}

// Ergebnis der Ortssuche (Nominatim).
export interface GeocodeResult {
  name: string;
  lat: number;
  lng: number;
}

export interface Ride {
  id: number;
  startedAt: number;
  endedAt: number;
  durationS: number;
  distanceM: number;
  maxSpeedKmh: number;
  avgSpeedKmh: number;
  maxLeanLeft: number;
  maxLeanRight: number;
  maxG: number;
  points: number;
  shareToken: string | null;
  track: RideTrackPoint[];
}

// Öffentlich geteilte Fahrt (read-only, ohne interne IDs/Token).
export interface SharedRide {
  startedAt: number;
  endedAt: number;
  durationS: number;
  distanceM: number;
  maxSpeedKmh: number;
  avgSpeedKmh: number;
  maxLeanLeft: number;
  maxLeanRight: number;
  maxG: number;
  riderName: string;
  track: RideTrackPoint[];
}
