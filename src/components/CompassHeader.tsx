import React from 'react';
import { TurnCue } from '../types';
import { CornerUpLeft, CornerUpRight, ArrowUp, RotateCcw, AlertTriangle, ShieldCheck, Compass, X } from 'lucide-react';
import { normalizeAngleDiff } from '../utils/geo';
import { Units, formatShortDistance } from '../utils/units';

interface CompassHeaderProps {
  arrowAngle: number; // in degrees (bearingToTarget - heading)
  directionHeadline: string;
  directionSubline: string;
  distanceToTarget: number;
  nextTurnCue: TurnCue | null;
  distanceToNextTurn: number | null;
  isOffTrail: boolean;
  offTrailDistance: number;
  headingSource: 'gps' | 'sensor' | 'none';
  needsSensorPermission: boolean;
  onRequestPermission: () => void;
  highContrastMode: 'dark-slate' | 'sunlight-bright';
  onClose?: () => void;
  units?: Units;
}

export const CompassHeader: React.FC<CompassHeaderProps> = ({
  arrowAngle,
  directionHeadline,
  directionSubline,
  distanceToTarget,
  nextTurnCue,
  distanceToNextTurn,
  isOffTrail,
  offTrailDistance,
  headingSource,
  needsSensorPermission,
  onRequestPermission,
  highContrastMode,
  onClose,
  units = 'imperial',
}) => {
  const normalizedAngle = normalizeAngleDiff(arrowAngle);

  // Determine turn icon for next turn cue
  const getTurnIcon = (cue: TurnCue) => {
    if (cue.turnType.includes('left')) {
      return <CornerUpLeft className="w-5 h-5 text-[var(--accent)] shrink-0" />;
    }
    if (cue.turnType.includes('right')) {
      return <CornerUpRight className="w-5 h-5 text-[var(--accent)] shrink-0" />;
    }
    if (cue.turnType === 'u-turn') {
      return <RotateCcw className="w-5 h-5 text-[var(--danger)] shrink-0" />;
    }
    return <ArrowUp className="w-5 h-5 text-[var(--accent-2)] shrink-0" />;
  };


  return (
    <div
      id="compass-header-container"
      className="w-full px-4 pt-2.5 pb-3 select-none relative bg-[var(--surface)] text-[var(--text)]"
      style={{ borderBottom: 'var(--border-w-strong) solid var(--border-color)' }}
    >
      {onClose && (
        <button
          id="close-compass-header-btn"
          onClick={onClose}
          className="absolute top-2 right-2 z-10 p-1.5 rounded-lg text-[var(--text-secondary)] hover:opacity-70 transition"
          title="Minimize compass panel"
          aria-label="Minimize compass panel"
        >
          <X className="w-4 h-4" />
        </button>
      )}
      <div className="flex items-center justify-between gap-3 max-w-xl mx-auto">
        {/* Left: Next Turn Cue Pill */}
        <div className="flex-1 min-w-0">
          {nextTurnCue && distanceToNextTurn !== null ? (
            <div
              id="next-turn-cue-badge"
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-[var(--radius-sm)] text-sm font-bold tracking-tight border ${
                distanceToNextTurn <= 35
                  ? 'bg-[var(--accent)] text-white border-[var(--accent)] animate-pulse'
                  : 'bg-[var(--surface-2)] text-[var(--text)] border-[var(--border-color)]'
              }`}
            >
              {getTurnIcon(nextTurnCue)}
              <span className="truncate">
                {nextTurnCue.description} in{' '}
                <strong className="underline decoration-2">
                  {formatShortDistance(distanceToNextTurn, units)}
                </strong>
              </span>
            </div>
          ) : (
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold text-[var(--text-secondary)] bg-[var(--surface-2)]">
              <ShieldCheck className="w-3.5 h-3.5 text-[var(--accent-2)]" />
              <span>Following Trail Path</span>
            </div>
          )}

          {/* Direction Text */}
          <div className="mt-1.5">
            <h2
              id="direction-headline"
              className="text-xl sm:text-2xl font-extrabold tracking-tight leading-tight font-[family-name:var(--font-display)]"
              style={{ color: isOffTrail ? 'var(--danger)' : 'var(--accent-2)' }}
            >
              {directionHeadline}
            </h2>
            <p
              id="direction-subline"
              className="text-xs sm:text-sm font-semibold tracking-wide text-[var(--text-secondary)]"
            >
              {directionSubline}
            </p>
          </div>

          {/* Compass Sensor Status / Prompt */}
          {needsSensorPermission ? (
            <button
              id="enable-compass-sensor-btn"
              onClick={onRequestPermission}
              className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold rounded-md bg-[var(--info)] hover:opacity-90 text-white shadow"
            >
              <Compass className="w-3.5 h-3.5" />
              Enable Device Compass
            </button>
          ) : (
            <div className="mt-1 flex items-center gap-2">
              <span
                className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border"
                style={
                  headingSource === 'gps'
                    ? { color: 'var(--info)', borderColor: 'var(--info)', background: 'color-mix(in srgb, var(--info) 15%, transparent)' }
                    : headingSource === 'sensor'
                    ? { color: 'var(--accent-2)', borderColor: 'var(--accent-2)', background: 'color-mix(in srgb, var(--accent-2) 15%, transparent)' }
                    : { color: 'var(--text-secondary)', borderColor: 'var(--border-color)', background: 'var(--surface-2)' }
                }
              >
                {headingSource === 'gps'
                  ? 'GPS Heading'
                  : headingSource === 'sensor'
                  ? 'Compass'
                  : 'Bearing'}
              </span>
            </div>
          )}
        </div>

        {/* Right: Large High-Contrast Compass Dial & Needle */}
        <div className="relative flex flex-col items-center justify-center shrink-0">
          <div
            id="compass-dial"
            className="relative w-28 h-28 sm:w-32 sm:h-32 rounded-full flex items-center justify-center shadow-lg"
            style={{
              borderWidth: '4px',
              borderStyle: 'solid',
              borderColor: isOffTrail ? 'var(--danger)' : 'var(--border-color)',
              background: isOffTrail ? 'color-mix(in srgb, var(--danger) 12%, var(--surface))' : 'var(--surface-2)',
            }}
          >
            {/* Cardinal Marks */}
            <span className="absolute top-1 text-[11px] font-extrabold tracking-widest text-[var(--text)]">
              N
            </span>
            <span className="absolute bottom-1 text-[11px] font-extrabold tracking-widest text-[var(--text-secondary)]">
              S
            </span>
            <span className="absolute right-1 text-[11px] font-extrabold tracking-widest text-[var(--text-secondary)]">
              E
            </span>
            <span className="absolute left-1 text-[11px] font-extrabold tracking-widest text-[var(--text-secondary)]">
              W
            </span>

            {/* Inner Ring */}
            <div
              className="w-20 h-20 sm:w-24 sm:h-24 rounded-full flex items-center justify-center"
              style={{ border: '1px solid var(--border-color)' }}
            />

            {/* Rotating Arrow Indicator */}
            <div
              id="compass-rotating-arrow"
              className="absolute inset-0 flex items-center justify-center pointer-events-none transition-transform duration-200 ease-out"
              style={{
                transform: `rotate(${normalizedAngle}deg)`,
              }}
            >
              <svg
                viewBox="0 0 100 100"
                className="w-22 h-22 sm:w-26 sm:h-26 drop-shadow-md"
              >
                {/* Arrow Head Pointing UP (Target direction) */}
                <polygon
                  points="50,6 68,52 50,42 32,52"
                  fill={isOffTrail ? 'var(--danger)' : 'var(--accent-2)'}
                  stroke="var(--surface)"
                  strokeWidth="2.5"
                  strokeLinejoin="round"
                />
                {/* Arrow Tail */}
                <polygon
                  points="50,94 62,60 50,68 38,60"
                  fill="var(--text-secondary)"
                  stroke="var(--border-color)"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                />
                {/* Central Pivot Circle */}
                <circle
                  cx="50"
                  cy="50"
                  r="6"
                  fill="var(--surface)"
                  stroke={isOffTrail ? 'var(--danger)' : 'var(--accent-2)'}
                  strokeWidth="3"
                />
              </svg>
            </div>
          </div>

          <div
            className="mt-1 text-[11px] font-bold tracking-wider uppercase"
            style={{ color: isOffTrail ? 'var(--danger)' : 'var(--text-secondary)' }}
          >
            {isOffTrail ? 'OFF TRAIL' : `${formatShortDistance(distanceToTarget, units)} AHEAD`}
          </div>
        </div>
      </div>
    </div>
  );
};
