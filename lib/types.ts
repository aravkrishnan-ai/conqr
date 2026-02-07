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
  territoryId?: string; // Links to territory if loop was closed
  averageSpeed?: number; // m/s
}

export interface Territory {
  id: string; // UUID
  name: string;
  ownerId: string;
  ownerName?: string; // Username of the owner for display
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

export interface TerritoryInvasion {
  id: string;
  invadedUserId: string;
  invaderUserId: string;
  invaderUsername?: string;
  invadedTerritoryId: string;
  newTerritoryId: string;
  overlapArea: number;
  territoryWasDestroyed: boolean;
  createdAt: number;
  seen: boolean;
}

export interface ConquerResult {
  newTerritory: Territory;
  modifiedTerritories: Territory[];
  deletedTerritoryIds: string[];
  invasions: TerritoryInvasion[];
  totalConqueredArea: number;
}

export type PostType = 'text' | 'activity_share' | 'territory_share';

export interface Post {
  id: string;
  userId: string;
  username: string;
  userAvatarUrl?: string;
  content: string;
  postType: PostType;
  activityId?: string;
  territoryId?: string;
  activity?: Activity;
  territory?: Territory;
  likeCount: number;
  commentCount: number;
  isLikedByMe: boolean;
  createdAt: number;
}

export interface PostComment {
  id: string;
  postId: string;
  userId: string;
  username: string;
  userAvatarUrl?: string;
  content: string;
  createdAt: number;
}

export type FriendshipStatus = 'pending' | 'accepted' | 'rejected' | 'none';

export interface Friendship {
  id: string;
  requesterId: string;
  addresseeId: string;
  status: FriendshipStatus;
  createdAt: number;
  updatedAt: number;
}

export interface FriendWithProfile {
  friendship: Friendship;
  profile: UserProfile;
}

