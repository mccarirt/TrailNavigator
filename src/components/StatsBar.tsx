import React from 'react';
import { Timer, Footprints, Clock, Route, AlertTriangle, X } from 'lucide-react';
import { Units, formatDistanceParts, formatPaceParts, formatShortDistance } from '../utils/units';

interface StatsBarProps {
  totalElapsedSeconds: number; // Elapsed hike time in seconds
  paceSecondsPerKm: number | null; // Seconds per km, null if stopped
  estimatedTimeRemainingSeconds: number | null; // Estimated seconds remaining to finish
  distanceRemaining: number; // in meters
  distanceSoFar: number; // in meters
  distanceFromTrail: number; // in meters
  offTrailThreshold: number; // in meters
  highContrastMode: 'dark-slate' | 'sunlight-bright';
  isReverseMode?: boolean;
  onClose?: () => void;
  distanceWalked?: number; // in meters (sum of breadcrumb segments)
  units?: Units;
  // Free Hike: no planned trail, so "time/distance left" and "trail offset" don't apply -
  // show just Time, Pace, and Distance walked instead of the usual 4-tile trail-relative grid.
  freeHike?: boolean;
}

// Format Total Time (hh:mm:ss or mm:ss)
export const formatTotalTime = (totalSec: number) => {
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = Math.floor(totalSec % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

// Format Time Remaining (e.g., "1h 24m", "42m", "< 1m")
export const formatTimeRemaining = (sec: number | null, distanceRemaining: number = 0) => {
  if (sec === null || isNaN(sec) || sec <= 0) {
    if (distanceRemaining <= 15) return '0 min';
    return '--:--';
  }
  const hours = Math.floor(sec / 3600);
  const minutes = Math.floor((sec % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes} min`;
  }
  return '< 1 min';
};

// Format Pace (min:sec per mile or per km). Input is seconds per km.
export const formatPace = (secPerKm: number | null, units: Units = 'imperial') =>
  formatPaceParts(secPerKm, units);

// Format distance (input in meters)
export const formatDist = (meters: number, units: Units = 'imperial') =>
  formatDistanceParts(meters, units);

export const StatsBar: React.FC<StatsBarProps> = ({
  totalElapsedSeconds,
  paceSecondsPerKm,
  estimatedTimeRemainingSeconds,
  distanceRemaining,
  distanceSoFar,
  distanceFromTrail,
  offTrailThreshold,
  highContrastMode,
  isReverseMode = false,
  onClose,
  distanceWalked = 0,
  units = 'imperial',
  freeHike = false,
}) => {

  const remaining = formatDist(distanceRemaining, units);
  const soFar = formatDist(distanceSoFar, units);
  const walked = formatDist(distanceWalked, units);
  const pace = formatPace(paceSecondsPerKm, units);
  const fromTrailText = formatShortDistance(distanceFromTrail, units);
  const isDistWarning = distanceFromTrail > offTrailThreshold * 0.75;
  const isDistAlert = distanceFromTrail >= offTrailThreshold;

  return (
    <div
      id="navigation-stats-bar"
      className="w-full px-2 py-2 select-none bg-[var(--surface)] text-[var(--text)]"
      style={{ borderBottom: 'var(--border-w-strong) solid var(--border-color)' }}
    >
      <div className="max-w-xl mx-auto space-y-1.5">
        {/* Header with dismiss handle when slideable */}
        {onClose && (
          <div
            className="flex items-center justify-between pb-1 px-1 mb-1"
            style={{ borderBottom: '1px solid var(--border-color)' }}
          >
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-[var(--text-secondary)]">
              Trip Stats & Time
            </span>
            <button
              id="close-stats-panel-btn"
              onClick={onClose}
              className="p-1 rounded-md text-[var(--text-secondary)] hover:opacity-70 transition"
              title="Hide stats panel"
              aria-label="Hide stats panel"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Free Hike: just Time, Pace, and Distance walked - no trail to measure "remaining" against */}
        {freeHike ? (
          <div className="grid grid-cols-3 gap-1.5 text-center">
            <div
              id="stat-total-time"
              className="p-1.5 rounded-[var(--radius-sm)] border flex flex-col justify-between bg-[var(--surface-2)] border-[var(--border-color)]"
            >
              <div className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-secondary)] flex items-center justify-center gap-1">
                <Timer className="w-3 h-3 text-[var(--info)] shrink-0" />
                <span className="truncate">Total Time</span>
              </div>
              <div className="mt-0.5">
                <span className="text-base sm:text-lg font-extrabold tracking-tight font-mono font-[family-name:var(--font-display)]">
                  {formatTotalTime(totalElapsedSeconds)}
                </span>
              </div>
            </div>

            <div
              id="stat-pace"
              className="p-1.5 rounded-[var(--radius-sm)] border flex flex-col justify-between bg-[var(--surface-2)] border-[var(--border-color)]"
            >
              <div className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-secondary)] flex items-center justify-center gap-1">
                <Footprints className="w-3 h-3 text-[var(--accent)] shrink-0" />
                <span className="truncate">Pace</span>
              </div>
              <div className="mt-0.5 flex items-baseline justify-center gap-0.5">
                <span className="text-base sm:text-lg font-extrabold tracking-tight font-mono font-[family-name:var(--font-display)]">
                  {pace.val}
                </span>
                <span className="text-[9px] font-bold text-[var(--text-secondary)]">{pace.unit}</span>
              </div>
            </div>

            <div
              id="stat-distance-walked"
              className="p-1.5 rounded-[var(--radius-sm)] border flex flex-col justify-between bg-[var(--surface-2)] border-[var(--border-color)]"
            >
              <div className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-secondary)] flex items-center justify-center gap-1">
                <Route className="w-3 h-3 text-[var(--accent-2)] shrink-0" />
                <span className="truncate">Distance</span>
              </div>
              <div className="mt-0.5 flex items-baseline justify-center gap-0.5">
                <span className="text-base sm:text-lg font-extrabold tracking-tight font-mono font-[family-name:var(--font-display)]">
                  {walked.val}
                </span>
                <span className="text-xs font-bold text-[var(--text-secondary)]">{walked.unit}</span>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* The 4 requested metrics in clear, high-contrast prominent cards */}
            <div className="grid grid-cols-4 gap-1.5 text-center">
              {/* 1. Total Time */}
              <div
                id="stat-total-time"
                className="p-1.5 rounded-[var(--radius-sm)] border flex flex-col justify-between bg-[var(--surface-2)] border-[var(--border-color)]"
              >
                <div className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-secondary)] flex items-center justify-center gap-1">
                  <Timer className="w-3 h-3 text-[var(--info)] shrink-0" />
                  <span className="truncate">Total Time</span>
                </div>
                <div className="mt-0.5">
                  <span className="text-base sm:text-lg font-extrabold tracking-tight font-mono font-[family-name:var(--font-display)]">
                    {formatTotalTime(totalElapsedSeconds)}
                  </span>
                </div>
              </div>

              {/* 2. Pace */}
              <div
                id="stat-pace"
                className="p-1.5 rounded-[var(--radius-sm)] border flex flex-col justify-between bg-[var(--surface-2)] border-[var(--border-color)]"
              >
                <div className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-secondary)] flex items-center justify-center gap-1">
                  <Footprints className="w-3 h-3 text-[var(--accent)] shrink-0" />
                  <span className="truncate">Pace</span>
                </div>
                <div className="mt-0.5 flex items-baseline justify-center gap-0.5">
                  <span className="text-base sm:text-lg font-extrabold tracking-tight font-mono font-[family-name:var(--font-display)]">
                    {pace.val}
                  </span>
                  <span className="text-[9px] font-bold text-[var(--text-secondary)]">{pace.unit}</span>
                </div>
              </div>

              {/* 3. Time Remaining */}
              <div
                id="stat-time-remaining"
                className="p-1.5 rounded-[var(--radius-sm)] border flex flex-col justify-between bg-[var(--surface-2)] border-[var(--border-color)]"
              >
                <div className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-secondary)] flex items-center justify-center gap-1">
                  <Clock className="w-3 h-3 text-[var(--accent-2)] shrink-0" />
                  <span className="truncate">Time Left</span>
                </div>
                <div className="mt-0.5">
                  <span className="text-base sm:text-lg font-extrabold tracking-tight font-mono font-[family-name:var(--font-display)]">
                    {formatTimeRemaining(estimatedTimeRemainingSeconds, distanceRemaining)}
                  </span>
                </div>
              </div>

              {/* 4. Distance Remaining */}
              <div
                id="stat-dist-remaining"
                className="p-1.5 rounded-[var(--radius-sm)] border flex flex-col justify-between bg-[var(--surface-2)] border-[var(--border-color)]"
              >
                <div className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-secondary)] flex items-center justify-center gap-1">
                  <Route className="w-3 h-3 text-[var(--accent-2)] shrink-0" />
                  <span className="truncate">{isReverseMode ? 'To Start' : 'Dist Left'}</span>
                </div>
                <div className="mt-0.5 flex items-baseline justify-center gap-0.5">
                  <span className="text-base sm:text-lg font-extrabold tracking-tight font-mono font-[family-name:var(--font-display)]">
                    {remaining.val}
                  </span>
                  <span className="text-xs font-bold text-[var(--text-secondary)]">{remaining.unit}</span>
                </div>
              </div>
            </div>

            {/* Secondary Sub-Row: Distance Completed, Distance Actually Walked & Offset from Trail */}
            <div className="flex flex-wrap items-center justify-between gap-y-1 px-2 text-[11px] font-bold text-[var(--text-secondary)]">
              <div className="flex items-center gap-3">
                <div>
                  Along Trail: <strong className="text-[var(--text)]">{soFar.val} {soFar.unit}</strong>
                </div>
                <div>
                  Walked: <strong className="text-[var(--accent)]">{walked.val} {walked.unit}</strong>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <span>Trail offset:</span>
                <span
                  className={`px-1.5 py-0.5 rounded font-extrabold ${isDistAlert ? 'animate-pulse' : ''}`}
                  style={
                    isDistAlert
                      ? { background: 'var(--danger)', color: '#fff' }
                      : isDistWarning
                      ? { background: 'var(--accent)', color: '#fff' }
                      : { color: 'var(--text)' }
                  }
                >
                  {fromTrailText}
                </span>
                {isDistAlert && <AlertTriangle className="w-3.5 h-3.5 text-[var(--danger)]" />}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
