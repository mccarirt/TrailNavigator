// Unit formatting helpers.
// All internal calculations stay in meters / seconds / km-h. Convert only when displaying.

export type Units = 'imperial' | 'metric';

export const METERS_PER_FOOT = 0.3048;
export const METERS_PER_MILE = 1609.344;

export interface UnitParts {
  val: string;
  unit: string;
}

/** Distance with unit: feet below 0.1 mi (imperial) or meters below 1 km (metric). */
export function formatDistanceParts(meters: number, units: Units): UnitParts {
  const m = Math.max(0, isFinite(meters) ? meters : 0);
  if (units === 'imperial') {
    if (m < METERS_PER_MILE * 0.1) {
      return { val: (Math.round(m / METERS_PER_FOOT / 5) * 5).toString(), unit: 'ft' };
    }
    const mi = m / METERS_PER_MILE;
    return { val: mi < 10 ? mi.toFixed(2) : mi.toFixed(1), unit: 'mi' };
  }
  if (m < 1000) {
    return { val: Math.round(m).toString(), unit: 'm' };
  }
  const km = m / 1000;
  return { val: km < 10 ? km.toFixed(2) : km.toFixed(1), unit: 'km' };
}

export function formatDistance(meters: number, units: Units): string {
  const p = formatDistanceParts(meters, units);
  return `${p.val} ${p.unit}`;
}

/** Short distances (turn cues, distance from trail): ft rounded to 5, or whole meters. */
export function formatShortDistanceParts(meters: number, units: Units): UnitParts {
  const m = Math.max(0, isFinite(meters) ? meters : 0);
  if (units === 'imperial') {
    if (m < METERS_PER_MILE) {
      return { val: (Math.round(m / METERS_PER_FOOT / 5) * 5).toString(), unit: 'ft' };
    }
    return formatDistanceParts(m, units);
  }
  return formatDistanceParts(m, units);
}

export function formatShortDistance(meters: number, units: Units): string {
  const p = formatShortDistanceParts(meters, units);
  return `${p.val} ${p.unit}`;
}

export function formatElevationParts(meters: number, units: Units): UnitParts {
  const m = isFinite(meters) ? meters : 0;
  if (units === 'imperial') {
    return { val: Math.round(m / METERS_PER_FOOT).toString(), unit: 'ft' };
  }
  return { val: Math.round(m).toString(), unit: 'm' };
}

export function formatElevation(meters: number, units: Units): string {
  const p = formatElevationParts(meters, units);
  return `${p.val} ${p.unit}`;
}

/** Pace input is seconds per km (internal). Output is min:sec per mile or per km. */
export function formatPaceParts(secPerKm: number | null, units: Units): UnitParts {
  const unit = units === 'imperial' ? '/mi' : '/km';
  if (secPerKm === null || !isFinite(secPerKm) || secPerKm <= 0 || secPerKm > 3600) {
    return { val: '--:--', unit };
  }
  const sec = units === 'imperial' ? secPerKm * (METERS_PER_MILE / 1000) : secPerKm;
  const mins = Math.floor(sec / 60);
  const secs = Math.floor(sec % 60);
  return { val: `${mins}:${secs.toString().padStart(2, '0')}`, unit };
}

/** Speed input is km/h (internal). */
export function formatSpeedParts(kmh: number, units: Units): UnitParts {
  if (units === 'imperial') {
    return { val: (kmh * 1000 / METERS_PER_MILE).toFixed(1), unit: 'mph' };
  }
  return { val: Math.round(kmh).toString(), unit: 'km/h' };
}

export function formatSpeed(kmh: number, units: Units): string {
  const p = formatSpeedParts(kmh, units);
  return `${p.val} ${p.unit}`;
}
