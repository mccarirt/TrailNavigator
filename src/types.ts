export interface GeoPoint {
  lat: number;
  lon: number;
  ele?: number; // Elevation in meters
  time?: string;
  cumDistance?: number; // Cumulative distance along trail in meters
}

export interface BreadcrumbPoint {
  lat: number;
  lon: number;
  timestamp: number;
  accuracy: number;
}

export type TurnType =
  | 'slight-left'
  | 'left'
  | 'sharp-left'
  | 'slight-right'
  | 'right'
  | 'sharp-right'
  | 'u-turn'
  | 'straight';

export interface TurnCue {
  id: string;
  distanceAlongTrail: number; // In meters from start
  pointIndex: number;
  lat: number;
  lon: number;
  turnType: TurnType;
  bearingChange: number; // In degrees (-180 to 180)
  description: string;
  vibrated?: boolean; // Has vibrated when within 30m
}

export interface Waypoint {
  name: string;
  lat: number;
  lon: number;
  ele?: number;
  desc?: string;
  time?: string;
}

export interface Trail {
  id: string;
  name: string;
  fileName?: string;
  createdAt: number;
  points: GeoPoint[];
  segments?: GeoPoint[][];
  waypoints?: Waypoint[];
  totalDistance: number; // In meters
  elevationGain?: number; // In meters
  elevationLoss?: number;
  turnCues: TurnCue[];
  isRoundTrip?: boolean; // True if start and end are within 50m and >=60% of second-half points lie within 20m of first-half
  bounds: {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
  };
}

export interface UserPosition {
  lat: number;
  lon: number;
  accuracy: number; // In meters
  altitude?: number | null;
  speed?: number | null; // In m/s
  heading?: number | null; // In degrees (0-360)
  timestamp: number;
}

export interface ProjectedPosition {
  point: GeoPoint;
  segmentIndex: number;
  distanceFromTrail: number; // Perpendicular or point distance in meters
  distanceAlongTrail: number; // Distance along trail from start to projected point in meters
  distanceRemaining: number; // Distance from projected point to trail end in meters
}

export interface AppSettings {
  offTrailThreshold: number; // Default 30 meters
  offTrailClearThreshold: number; // Default 20 meters
  beepEnabled: boolean;
  vibrateEnabled: boolean;
  lookAheadDistance: number; // Default 40 meters
  highContrastMode: 'dark-slate' | 'sunlight-bright';
}
