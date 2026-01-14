export type ActivityType = 'WALK' | 'RUN' | 'RIDE';

export interface UserProfile {
  id: string; // UUID
  username: string;
  email?: string; // Private
  phone?: string; // Private
  bio?: string;
  avatarUrl?: string; // or base64
  createdAt: number;
}

export interface GPSPoint {
  lat: number;
  lng: number;
  timestamp: number;
  speed: number | null; // m/s
  accuracy: number | null; // meters
  altitude: number | null;
}

export interface Activity {
  id: string; // UUID
  userId: string;
  type: ActivityType;
  startTime: number;
  endTime?: number;
  distance: number; // meters
  duration: number; // seconds
  polylines: GPSPoint[][]; // Array of segments (handling pauses/auto-resume)
  isSynced: boolean;
}

export interface Territory {
  id: string; // UUID
  name: string;
  ownerId: string;
  activityId: string;
  claimedAt: number;
  area: number; // square meters
  perimeter: number; // meters
  center: { lat: number; lng: number };
  polygon: [number, number][]; // [lng, lat] for GeoJSON/MapLibre compatibility
  history: TerritoryClaimEvent[];
}

export interface TerritoryClaimEvent {
  previousOwnerId?: string;
  claimedBy: string;
  claimedAt: number;
  activityId: string;
}

export interface SuspiciousLog {
  id: string;
  activityId: string;
  reason: string;
  timestamp: number;
  data: any;
}
