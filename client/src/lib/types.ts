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

export interface FriendLocation {
  userId: number;
  lat: number;
  lng: number;
  speedKmh: number;
  ts: number;
}

export interface Friend {
  id: number;
  username: string;
  displayName: string;
  avatarPath: string | null;
  online: boolean;
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
  points: number;
  track: RideTrackPoint[];
}
