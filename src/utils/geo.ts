import { GeoPoint, ProjectedPosition, Trail, TurnCue, TurnType, BreadcrumbPoint } from '../types';
import { Units, formatShortDistance } from './units';

const EARTH_RADIUS = 6371000; // meters

/**
 * Calculates great-circle distance between two points using Haversine formula
 */
export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS * c;
}

/**
 * Calculates initial bearing from point 1 to point 2 (0 to 360 degrees)
 */
export function calculateBearing(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const y = Math.sin(deltaLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);

  const theta = Math.atan2(y, x);
  return ((theta * 180) / Math.PI + 360) % 360;
}

/**
 * Normalizes an angle difference to range [-180, 180]
 */
export function normalizeAngleDiff(angle: number): number {
  let diff = (angle + 180) % 360;
  if (diff < 0) diff += 360;
  return diff - 180;
}

/**
 * Projects a user point onto a trail segment defined by two coordinates.
 * Uses equirectangular projection for sub-millisecond high-accuracy local distance.
 */
function projectPointToSegment(
  pLat: number,
  pLon: number,
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number,
  aCumDist: number
): { point: GeoPoint; t: number; distToPoint: number; cumDist: number } {
  const avgLatRad = (((aLat + bLat) / 2) * Math.PI) / 180;
  const cosLat = Math.cos(avgLatRad);

  // Convert to local Cartesian meters relative to A
  const bx = (bLon - aLon) * ((Math.PI / 180) * EARTH_RADIUS * cosLat);
  const by = (bLat - aLat) * ((Math.PI / 180) * EARTH_RADIUS);

  const px = (pLon - aLon) * ((Math.PI / 180) * EARTH_RADIUS * cosLat);
  const py = (pLat - aLat) * ((Math.PI / 180) * EARTH_RADIUS);

  const segLenSq = bx * bx + by * by;
  let t = 0;
  if (segLenSq > 0.0001) {
    t = (px * bx + py * by) / segLenSq;
    t = Math.max(0, Math.min(1, t));
  }

  const projLat = aLat + t * (bLat - aLat);
  const projLon = aLon + t * (bLon - aLon);

  const distToPoint = haversineDistance(pLat, pLon, projLat, projLon);
  const segDistance = Math.sqrt(segLenSq);
  const cumDist = aCumDist + t * segDistance;

  return {
    point: { lat: projLat, lon: projLon, cumDistance: cumDist },
    t,
    distToPoint,
    cumDist,
  };
}

export interface FindClosestPointOptions {
  movementBearing?: number;
  lastDistanceAlong?: number;
  isRoundTrip?: boolean;
  consecutiveOffTrailCount?: number;
  isReverseMode?: boolean;
}

/**
 * Finds the closest point on the trail by projecting onto segments.
 * - Optional movementBearing and lastDistanceAlong parameters (supported as positional or options object).
 * - Consider segments within 40 m of user, discard those whose bearing differs from movementBearing by >60°,
 *   pick closest remaining, fall back to closest overall if none remain.
 * - For normal trails: search -100 m to +300 m around lastDistanceAlong, widening to full search after 3 consecutive off-trail fixes.
 * - For isRoundTrip trails: ignore window and search both legs.
 */
export function findClosestPointOnTrail(
  userLat: number,
  userLon: number,
  trailPoints: GeoPoint[],
  totalTrailDistance: number,
  movementBearingOrOptions?: number | FindClosestPointOptions,
  lastDistanceAlongParam?: number,
  isRoundTripParam?: boolean,
  consecutiveOffTrailCountParam?: number,
  isReverseModeParam?: boolean
): ProjectedPosition | null {
  if (!trailPoints || trailPoints.length < 2) return null;

  let movementBearing: number | undefined;
  let lastDistanceAlong: number | undefined;
  let isRoundTrip: boolean = false;
  let consecutiveOffTrailCount: number = 0;
  let isReverseMode: boolean = false;

  if (typeof movementBearingOrOptions === 'object' && movementBearingOrOptions !== null) {
    movementBearing = movementBearingOrOptions.movementBearing;
    lastDistanceAlong = movementBearingOrOptions.lastDistanceAlong;
    isRoundTrip = !!movementBearingOrOptions.isRoundTrip;
    consecutiveOffTrailCount = movementBearingOrOptions.consecutiveOffTrailCount ?? 0;
    isReverseMode = !!movementBearingOrOptions.isReverseMode;
  } else {
    movementBearing = typeof movementBearingOrOptions === 'number' ? movementBearingOrOptions : undefined;
    lastDistanceAlong = lastDistanceAlongParam;
    isRoundTrip = !!isRoundTripParam;
    consecutiveOffTrailCount = consecutiveOffTrailCountParam ?? 0;
    isReverseMode = !!isReverseModeParam;
  }

  const searchSegments = (applyWindowFilter: boolean): ProjectedPosition | null => {
    let closestOverall: {
      point: GeoPoint;
      segmentIndex: number;
      distToPoint: number;
      cumDist: number;
    } | null = null;

    const directionalCandidates: Array<{
      point: GeoPoint;
      segmentIndex: number;
      distToPoint: number;
      cumDist: number;
    }> = [];

    const hasHint =
      applyWindowFilter &&
      lastDistanceAlong !== undefined &&
      lastDistanceAlong !== null &&
      !isNaN(lastDistanceAlong);

    let minHintDist = -Infinity;
    let maxHintDist = Infinity;
    if (hasHint) {
      if (isReverseMode) {
        minHintDist = lastDistanceAlong! - 300;
        maxHintDist = lastDistanceAlong! + 100;
      } else {
        minHintDist = lastDistanceAlong! - 100;
        maxHintDist = lastDistanceAlong! + 300;
      }
    }

    for (let i = 0; i < trailPoints.length - 1; i++) {
      const a = trailPoints[i];
      const b = trailPoints[i + 1];
      const aCum = a.cumDistance ?? 0;
      const bCum = b.cumDistance ?? aCum;

      if (hasHint) {
        const segMin = Math.min(aCum, bCum);
        const segMax = Math.max(aCum, bCum);
        if (segMax < minHintDist || segMin > maxHintDist) {
          continue;
        }
      }

      const res = projectPointToSegment(
        userLat,
        userLon,
        a.lat,
        a.lon,
        b.lat,
        b.lon,
        aCum
      );

      const candidate = {
        point: res.point,
        segmentIndex: i,
        distToPoint: res.distToPoint,
        cumDist: res.cumDist,
      };

      if (!closestOverall || res.distToPoint < closestOverall.distToPoint) {
        closestOverall = candidate;
      }

      // Consider segments within 40 m of the user
      if (res.distToPoint <= 40) {
        if (movementBearing !== undefined && movementBearing !== null && !isNaN(movementBearing)) {
          const segBearing = calculateBearing(a.lat, a.lon, b.lat, b.lon);
          const angleDiff = Math.abs(normalizeAngleDiff(segBearing - movementBearing));
          // Discard those whose bearing differs from movementBearing by more than 60°
          if (angleDiff <= 60) {
            directionalCandidates.push(candidate);
          }
        } else {
          directionalCandidates.push(candidate);
        }
      }
    }

    // Pick closest remaining directional candidate, fall back to closest overall
    let chosen = closestOverall;
    if (directionalCandidates.length > 0) {
      directionalCandidates.sort((x, y) => x.distToPoint - y.distToPoint);
      chosen = directionalCandidates[0];
    }

    if (!chosen) return null;

    const distanceRemaining = Math.max(0, totalTrailDistance - chosen.cumDist);

    return {
      point: chosen.point,
      segmentIndex: chosen.segmentIndex,
      distanceFromTrail: chosen.distToPoint,
      distanceAlongTrail: chosen.cumDist,
      distanceRemaining,
    };
  };

  // For isRoundTrip trails ignore that window and search both legs
  if (isRoundTrip) {
    return searchSegments(false);
  }

  // For normal trails, search only -100 m to +300 m around lastDistanceAlong,
  // widening to a full search after 3 consecutive off-trail fixes
  const canUseWindow =
    lastDistanceAlong !== undefined &&
    lastDistanceAlong !== null &&
    !isNaN(lastDistanceAlong) &&
    consecutiveOffTrailCount < 3;

  if (canUseWindow) {
    const windowResult = searchSegments(true);
    if (windowResult) {
      return windowResult;
    }
  }

  // Fall back to full search
  return searchSegments(false);
}

/**
 * Simplifies an array of GeoPoints using the Ramer-Douglas-Peucker algorithm
 * with perpendicular distance measured in meters via equirectangular projection.
 * Reduces jitter and prevents browser freezes on large GPX tracks.
 */
export function simplifyPoints(
  points: GeoPoint[],
  toleranceMeters: number = 3.0
): GeoPoint[] {
  if (points.length <= 2) return points;

  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;

  // Stack of [startIndex, endIndex]
  const stack: [number, number][] = [[0, points.length - 1]];

  while (stack.length > 0) {
    const [start, end] = stack.pop()!;
    if (end <= start + 1) continue;

    const pA = points[start];
    const pB = points[end];

    const avgLatRad = (((pA.lat + pB.lat) / 2) * Math.PI) / 180;
    const cosLat = Math.cos(avgLatRad);
    const kx = (Math.PI / 180) * EARTH_RADIUS * cosLat;
    const ky = (Math.PI / 180) * EARTH_RADIUS;

    const bx = (pB.lon - pA.lon) * kx;
    const by = (pB.lat - pA.lat) * ky;
    const bLen = Math.sqrt(bx * bx + by * by);

    let maxDist = 0;
    let maxIndex = start;

    for (let i = start + 1; i < end; i++) {
      const p = points[i];
      const px = (p.lon - pA.lon) * kx;
      const py = (p.lat - pA.lat) * ky;

      let d = 0;
      if (bLen < 1e-4) {
        d = Math.sqrt(px * px + py * py);
      } else {
        d = Math.abs(px * by - py * bx) / bLen;
      }

      if (d > maxDist) {
        maxDist = d;
        maxIndex = i;
      }
    }

    if (maxDist > toleranceMeters) {
      keep[maxIndex] = 1;
      stack.push([start, maxIndex]);
      stack.push([maxIndex, end]);
    }
  }

  const result: GeoPoint[] = [];
  for (let i = 0; i < points.length; i++) {
    if (keep[i]) {
      result.push(points[i]);
    }
  }
  return result;
}

/**
 * Interpolates a point along the trail at a target cumulative distance
 * using binary search (O(log N)) for instant lookup on large tracks.
 */
export function getPointAtDistance(
  trailPoints: GeoPoint[],
  targetDistance: number
): GeoPoint {
  const n = trailPoints.length;
  if (n === 0) return { lat: 0, lon: 0, cumDistance: 0 };
  if (targetDistance <= 0) return trailPoints[0];

  const total = trailPoints[n - 1].cumDistance ?? 0;
  if (targetDistance >= total) return trailPoints[n - 1];

  // Binary search for the segment [low, low + 1] containing targetDistance
  let low = 0;
  let high = n - 2;
  let segmentIndex = 0;

  while (low <= high) {
    const mid = (low + high) >> 1;
    const midDist = trailPoints[mid].cumDistance ?? 0;
    const nextDist = trailPoints[mid + 1].cumDistance ?? midDist;

    if (targetDistance < midDist) {
      high = mid - 1;
    } else if (targetDistance > nextDist) {
      low = mid + 1;
    } else {
      segmentIndex = mid;
      break;
    }
  }

  if (low > high) {
    segmentIndex = Math.max(0, Math.min(n - 2, high));
  }

  const a = trailPoints[segmentIndex];
  const b = trailPoints[segmentIndex + 1];
  const aDist = a.cumDistance ?? 0;
  const bDist = b.cumDistance ?? aDist;
  const segLen = bDist - aDist;
  const t = segLen > 0 ? Math.max(0, Math.min(1, (targetDistance - aDist) / segLen)) : 0;

  return {
    lat: a.lat + t * (b.lat - a.lat),
    lon: a.lon + t * (b.lon - a.lon),
    ele:
      a.ele !== undefined && b.ele !== undefined
        ? a.ele + t * (b.ele - a.ele)
        : a.ele ?? b.ele,
    cumDistance: targetDistance,
  };
}

/**
 * Computes target guidance point:
 * When on trail: target is 40 meters ahead along the trail.
 * When off trail: target is the nearest point on the trail.
 */
export function computeNavigationTarget(
  projected: ProjectedPosition,
  trailPoints: GeoPoint[],
  isOffTrail: boolean,
  lookAheadMeters: number = 40,
  isReverseMode: boolean = false
): { targetPoint: GeoPoint; isReturningToTrail: boolean } {
  if (isOffTrail) {
    return {
      targetPoint: projected.point,
      isReturningToTrail: true,
    };
  }

  const targetDist = isReverseMode
    ? Math.max(0, projected.distanceAlongTrail - lookAheadMeters)
    : projected.distanceAlongTrail + lookAheadMeters;

  const targetPoint = getPointAtDistance(trailPoints, targetDist);
  return {
    targetPoint,
    isReturningToTrail: false,
  };
}

/**
 * Precomputes turn cues along the track where bearing changes by > 35 degrees.
 * The track is simplified (~3 m tolerance) first so large GPX files don't hang
 * and GPS jitter does not create false turns.
 */
export function precomputeTurnCues(trailPoints: GeoPoint[]): TurnCue[] {
  const cues: TurnCue[] = [];
  if (trailPoints.length < 4) return cues;

  // Simplify the track (3 m tolerance) to eliminate noise and avoid hangs
  const simplified = simplifyPoints(trailPoints, 3.0);
  if (simplified.length < 4) return cues;

  const LOOKBACK_METERS = 15;
  const LOOKAHEAD_METERS = 15;
  const MIN_BEARING_CHANGE = 35; // degrees

  let lastCueDistance = -100;

  for (let i = 1; i < simplified.length - 1; i++) {
    const current = simplified[i];
    const currentDist = current.cumDistance ?? 0;

    // Enforce at least 30m spacing between consecutive turn cues to avoid clutter
    if (currentDist - lastCueDistance < 30) continue;

    const backDist = Math.max(0, currentDist - LOOKBACK_METERS);
    const forwardDist = Math.min(
      trailPoints[trailPoints.length - 1].cumDistance ?? 0,
      currentDist + LOOKAHEAD_METERS
    );

    const ptBack = getPointAtDistance(trailPoints, backDist);
    const ptForward = getPointAtDistance(trailPoints, forwardDist);

    const bearingIn = calculateBearing(
      ptBack.lat,
      ptBack.lon,
      current.lat,
      current.lon
    );
    const bearingOut = calculateBearing(
      current.lat,
      current.lon,
      ptForward.lat,
      ptForward.lon
    );

    const angleChange = normalizeAngleDiff(bearingOut - bearingIn);

    if (Math.abs(angleChange) >= MIN_BEARING_CHANGE) {
      let turnType: TurnType = 'straight';
      let description = '';

      if (Math.abs(angleChange) > 135) {
        turnType = 'u-turn';
        description = 'Sharp U-turn';
      } else if (angleChange <= -70) {
        turnType = 'sharp-left';
        description = 'Sharp left';
      } else if (angleChange < -45) {
        turnType = 'left';
        description = 'Turn left';
      } else if (angleChange < -25) {
        turnType = 'slight-left';
        description = 'Slight left';
      } else if (angleChange >= 70) {
        turnType = 'sharp-right';
        description = 'Sharp right';
      } else if (angleChange > 45) {
        turnType = 'right';
        description = 'Turn right';
      } else if (angleChange > 25) {
        turnType = 'slight-right';
        description = 'Slight right';
      }

      cues.push({
        id: `turn-${i}-${Math.round(currentDist)}`,
        distanceAlongTrail: currentDist,
        pointIndex: i,
        lat: current.lat,
        lon: current.lon,
        turnType,
        bearingChange: angleChange,
        description,
        vibrated: false,
      });

      lastCueDistance = currentDist;
    }
  }

  return cues;
}

/**
 * Text description of relative direction for compass guidance
 */
export function getRelativeDirectionText(
  relativeBearing: number,
  distanceToTarget: number,
  isReturningToTrail: boolean,
  units: Units = 'imperial'
): { headline: string; subline: string } {
  const norm = normalizeAngleDiff(relativeBearing);
  const distText = formatShortDistance(Math.max(1, distanceToTarget), units);

  if (isReturningToTrail) {
    return {
      headline: `Return to Trail (${distText})`,
      subline: `Turn toward trail · ${Math.abs(Math.round(norm))}°`,
    };
  }

  let turnText = 'Straight ahead';
  if (norm < -120 || norm > 120) {
    turnText = 'Turn around';
  } else if (norm < -60) {
    turnText = 'Sharp left';
  } else if (norm < -25) {
    turnText = 'Bear left';
  } else if (norm < -10) {
    turnText = 'Keep slight left';
  } else if (norm > 60) {
    turnText = 'Sharp right';
  } else if (norm > 25) {
    turnText = 'Bear right';
  } else if (norm > 10) {
    turnText = 'Keep slight right';
  }

  return {
    headline: turnText,
    subline: `${distText} ahead along trail`,
  };
}

/**
 * Reverses a trail's direction:
 * - Inverts points and recalculates cumulative distances from 0 to totalDistance
 * - Inverts segments if present
 * - Swaps elevation gain and loss
 * - Recomputes turn cues along the new forward direction
 */
export function reverseTrail(trail: Trail): Trail {
  const reversedRaw = trail.points.slice().reverse();
  let cum = 0;
  const newPoints: GeoPoint[] = [];

  for (let i = 0; i < reversedRaw.length; i++) {
    const pt = reversedRaw[i];
    if (i > 0) {
      const prev = newPoints[i - 1];
      cum += haversineDistance(prev.lat, prev.lon, pt.lat, pt.lon);
    }
    newPoints.push({
      ...pt,
      cumDistance: cum,
    });
  }

  // Reverse segments
  let newSegments: GeoPoint[][] | undefined = undefined;
  if (trail.segments && trail.segments.length > 0) {
    newSegments = trail.segments
      .slice()
      .reverse()
      .map(seg => {
        return seg.slice().reverse();
      });
  }

  const turnCues = precomputeTurnCues(newPoints);

  const isAlreadyReversed = trail.name.endsWith(' (Reversed)');
  const newName = isAlreadyReversed
    ? trail.name.replace(/ \(Reversed\)$/, '')
    : `${trail.name} (Reversed)`;

  return {
    ...trail,
    name: newName,
    points: newPoints,
    segments: newSegments,
    totalDistance: cum,
    elevationGain: trail.elevationLoss,
    elevationLoss: trail.elevationGain,
    turnCues,
    isRoundTrip: trail.isRoundTrip,
  };
}

/**
 * Inverts turn type for reverse mode navigation (walking backward along trail)
 */
export function invertTurnType(turnType: TurnType): TurnType {
  switch (turnType) {
    case 'left':
      return 'right';
    case 'right':
      return 'left';
    case 'slight-left':
      return 'slight-right';
    case 'slight-right':
      return 'slight-left';
    case 'sharp-left':
      return 'sharp-right';
    case 'sharp-right':
      return 'sharp-left';
    default:
      return turnType;
  }
}

/**
 * Inverts verbal direction text for reverse mode navigation
 */
export function invertTurnDescription(desc: string): string {
  return desc
    .replace(/\bTurn sharp left\b/gi, 'Turn sharp right')
    .replace(/\bTurn sharp right\b/gi, 'Turn sharp left')
    .replace(/\bTurn left\b/gi, 'Turn right')
    .replace(/\bTurn right\b/gi, 'Turn left')
    .replace(/\bBear left\b/gi, 'Bear right')
    .replace(/\bBear right\b/gi, 'Bear left')
    .replace(/\bKeep slight left\b/gi, 'Keep slight right')
    .replace(/\bKeep slight right\b/gi, 'Keep slight left');
}

/**
 * Calculates the total distance actually walked across all breadcrumb segments.
 */
export function calculateBreadcrumbsDistance(segments: BreadcrumbPoint[][]): number {
  let totalMeters = 0;
  for (const seg of segments) {
    for (let i = 1; i < seg.length; i++) {
      totalMeters += haversineDistance(
        seg[i - 1].lat,
        seg[i - 1].lon,
        seg[i].lat,
        seg[i].lon
      );
    }
  }
  return totalMeters;
}



// ---------------------------------------------------------------------------
// Round-trip (out-and-back) leg tracking
// ---------------------------------------------------------------------------
// Round-trip GPX files contain both legs (out to a turnaround, then back over the same path).
// This tracker decides which leg the hiker is on, so turning around early switches guidance to the
// return leg instead of pointing on toward the turnaround they skipped.
//
// Two independent signals are used, because GPS-derived bearing is noisy under tree cover:
//  1. Bearing: the direction of travel matches the *other* leg's segment direction for 5 fixes / 20 m.
//  2. Trend: progress along the current leg has dropped by 25 m from its recent peak
//     (measured on a 5-fix moving average, so GPS noise doesn't trigger it).
// When the current leg has no nearby twin (the two legs diverge), the other leg is mirrored.

export type TrailLeg = 'outbound' | 'return';

export interface RoundTripState {
  leg: TrailLeg;
  lastDistanceAlong: number | null;
  pending: Array<{ lat: number; lon: number; timestamp: number; candidateLeg: TrailLeg }>;
  history: number[]; // along-trail distance (current leg) of recent accepted fixes
  lastSwitch: { lat: number; lon: number; timestamp: number } | null; // where/when the leg last changed
}

export function createRoundTripState(): RoundTripState {
  return { leg: 'outbound', lastDistanceAlong: null, pending: [], history: [], lastSwitch: null };
}

const turnaroundIndexCache = new WeakMap<GeoPoint[], number>();
const legSliceCache = new WeakMap<GeoPoint[], { tIdx: number; out: GeoPoint[]; ret: GeoPoint[] }>();

/**
 * Index of the turnaround of an out-and-back: the sharpest U-turn in the middle half of the track
 * (the track heads one way, then reverses within ~40 m). Falls back to the point farthest from the start
 * when the track has no sharp reversal (e.g. a rounded end).
 */
export function findTurnaroundIndex(points: GeoPoint[]): number {
  const cached = turnaroundIndexCache.get(points);
  if (cached !== undefined) return cached;

  const n = points.length;
  const total = points[n - 1].cumDistance ?? 0;
  let best = -1;
  let bestReversal = 0;
  const SPAN = 40;

  for (let i = 1; i < n - 1; i++) {
    const c = points[i].cumDistance ?? 0;
    if (c < total * 0.25 || c > total * 0.75) continue;
    if (c - SPAN < 0 || c + SPAN > total) continue;
    const back = getPointAtDistance(points, c - SPAN);
    const fwd = getPointAtDistance(points, c + SPAN);
    const b1 = calculateBearing(back.lat, back.lon, points[i].lat, points[i].lon);
    const b2 = calculateBearing(points[i].lat, points[i].lon, fwd.lat, fwd.lon);
    const reversal = Math.abs(normalizeAngleDiff(b2 - b1));
    if (reversal > bestReversal) {
      bestReversal = reversal;
      best = i;
    }
  }

  if (best < 0 || bestReversal < 120) {
    let bestDist = -1;
    const start = points[0];
    for (let i = 0; i < n; i++) {
      const d = haversineDistance(start.lat, start.lon, points[i].lat, points[i].lon);
      if (d > bestDist) {
        bestDist = d;
        best = i;
      }
    }
  }

  turnaroundIndexCache.set(points, best);
  return best;
}

function getLegSlices(points: GeoPoint[]) {
  const cached = legSliceCache.get(points);
  if (cached) return cached;
  const tIdx = Math.max(1, Math.min(points.length - 2, findTurnaroundIndex(points)));
  const value = { tIdx, out: points.slice(0, tIdx + 1), ret: points.slice(tIdx) };
  legSliceCache.set(points, value);
  return value;
}

export interface RoundTripFix {
  lat: number;
  lon: number;
  timestamp: number;
  accuracy?: number | null;
}

export interface RoundTripResult {
  proj: ProjectedPosition | null;
  turnedAround: boolean; // switched outbound -> return on this fix
  switchedLeg: TrailLeg | null;
  reason?: 'bearing' | 'trend';
}

const TREND_DROP_METERS = 25;
const BEARING_SWITCH_FIXES = 5;
const BEARING_SWITCH_MOVEMENT = 20;
const HISTORY_LENGTH = 60;

function movingAverage(values: number[], end: number, window: number): number {
  const start = Math.max(0, end - window + 1);
  let sum = 0;
  for (let i = start; i <= end; i++) sum += values[i];
  return sum / (end - start + 1);
}

export function resolveRoundTripPosition(
  trail: Trail,
  fix: RoundTripFix,
  movementBearing: number | undefined,
  state: RoundTripState,
  consecutiveOffTrailCount: number = 0
): RoundTripResult {
  const pts = trail.points;
  const total = trail.totalDistance;
  if (!pts || pts.length < 4) {
    return { proj: findClosestPointOnTrail(fix.lat, fix.lon, pts, total), turnedAround: false, switchedLeg: null };
  }

  const { tIdx, out, ret } = getLegSlices(pts);
  const tDist = pts[tIdx].cumDistance ?? total / 2;
  const accuracyOk = (fix.accuracy ?? 0) <= 50;
  const legPts = (leg: TrailLeg) => (leg === 'outbound' ? out : ret);
  const offset = (leg: TrailLeg) => (leg === 'return' ? tIdx : 0);
  const otherLeg = (leg: TrailLeg): TrailLeg => (leg === 'outbound' ? 'return' : 'outbound');

  const projectOnLeg = (
    leg: TrailLeg,
    opts: { bearing?: number; hint?: number; offCount?: number }
  ): ProjectedPosition | null => {
    const p = findClosestPointOnTrail(fix.lat, fix.lon, legPts(leg), total, {
      movementBearing: opts.bearing,
      lastDistanceAlong: opts.hint,
      isRoundTrip: false,
      consecutiveOffTrailCount: opts.offCount ?? 0,
    });
    if (p) p.segmentIndex += offset(leg);
    return p;
  };

  // Mirror a point on one leg onto the other leg's distance numbering
  const mirror = (p: ProjectedPosition): ProjectedPosition => {
    const along = Math.max(0, Math.min(total, 2 * tDist - p.distanceAlongTrail));
    return { ...p, distanceAlongTrail: along, distanceRemaining: Math.max(0, total - along) };
  };

  const cur = state.leg;
  const other = otherLeg(cur);

  // Full-leg nearest point on the current leg (no hint or bearing). Used as a fallback and for mirroring.
  const curFull = projectOnLeg(cur, {});
  if (!curFull) {
    return { proj: null, turnedAround: false, switchedLeg: null };
  }
  // Position on the current leg, following the hiker continuously (windowed around the last position),
  // so parts of the same leg that pass near each other can't make progress appear to jump backwards.
  let stayProj =
    projectOnLeg(cur, {
      bearing: movementBearing,
      hint: state.lastDistanceAlong ?? undefined,
      offCount: consecutiveOffTrailCount,
    }) ?? curFull;

  // The legs can diverge; if the other leg is much closer, follow the physical path via its mirror
  if (stayProj.distanceFromTrail > 30) {
    const op = projectOnLeg(other, {});
    if (op && op.distanceFromTrail <= 25 && op.distanceFromTrail < stayProj.distanceFromTrail - 15) {
      stayProj = mirror(op);
    }
  }

  // --- Signal 2: progress trend on the current leg ---
  // Only well-matched fixes (close to the trail) count, and progress is smoothed over 5 fixes.
  let trendSwitch = false;
  if (accuracyOk && stayProj.distanceFromTrail <= 30) {
    state.history.push(stayProj.distanceAlongTrail);
    if (state.history.length > HISTORY_LENGTH) state.history.shift();
    const h = state.history;
    if (h.length >= 10) {
      const nowAvg = movingAverage(h, h.length - 1, 5);
      let peak = -Infinity;
      for (let i = 4; i < h.length; i++) {
        peak = Math.max(peak, movingAverage(h, i, 5));
      }
      if (peak - nowAvg >= TREND_DROP_METERS) trendSwitch = true;
    }
  }

  // --- Signal 1: direction of travel matches the other leg ---
  // Only a segment that is both close (<= 40 m) and heading the same way (within 60 deg) counts as evidence.
  // If neither leg has one, there is no evidence either way (never fall back to "nearest").
  let bearingSwitch = false;
  const nearestConsistent = (leg: TrailLeg): number => {
    if (movementBearing === undefined) return Infinity;
    const lp = legPts(leg);
    let best = Infinity;
    for (let i = 0; i < lp.length - 1; i++) {
      const a = lp[i];
      const b = lp[i + 1];
      const r = projectPointToSegment(fix.lat, fix.lon, a.lat, a.lon, b.lat, b.lon, a.cumDistance ?? 0);
      if (r.distToPoint > 40 || r.distToPoint >= best) continue;
      const segBearing = calculateBearing(a.lat, a.lon, b.lat, b.lon);
      if (Math.abs(normalizeAngleDiff(segBearing - movementBearing)) <= 60) best = r.distToPoint;
    }
    return best;
  };
  if (accuracyOk && movementBearing !== undefined && !isNaN(movementBearing)) {
    const dCur = nearestConsistent(cur);
    const dOther = nearestConsistent(other);
    if (dOther < dCur && dOther < Infinity) {
      state.pending.push({ lat: fix.lat, lon: fix.lon, timestamp: fix.timestamp, candidateLeg: other });
      // Net displacement (not path length), so GPS jitter while standing still doesn't count as movement
      const first = state.pending[0];
      const moved = haversineDistance(first.lat, first.lon, fix.lat, fix.lon);
      if (state.pending.length >= BEARING_SWITCH_FIXES && moved >= BEARING_SWITCH_MOVEMENT) {
        bearingSwitch = true;
      }
    } else {
      state.pending = [];
    }
  } else {
    // no usable direction evidence: don't accumulate stale evidence
    state.pending = [];
  }

  // --- Switch legs ---
  // Don't flip back right after a switch (within 40 m / 60 s): that's GPS noise, not a real second turnaround.
  const recentlySwitched =
    state.lastSwitch !== null &&
    haversineDistance(state.lastSwitch.lat, state.lastSwitch.lon, fix.lat, fix.lon) < 40 &&
    fix.timestamp - state.lastSwitch.timestamp < 60000;

  if ((bearingSwitch || trendSwitch) && !recentlySwitched) {
    const np = projectOnLeg(other, { bearing: movementBearing });
    const proj = np && np.distanceFromTrail <= 40 ? np : mirror(curFull);
    state.leg = other;
    state.lastDistanceAlong = proj.distanceAlongTrail;
    state.pending = [];
    state.history = [];
    state.lastSwitch = { lat: fix.lat, lon: fix.lon, timestamp: fix.timestamp };
    return { proj, turnedAround: other === 'return', switchedLeg: other, reason: bearingSwitch ? 'bearing' : 'trend' };
  }

  // --- Stay on the current leg ---
  const proj = stayProj;
  state.lastDistanceAlong = proj.distanceAlongTrail;
  return { proj, turnedAround: false, switchedLeg: null };
}
