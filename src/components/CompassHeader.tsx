import React from 'react';
import { TurnCue } from '../types';
import { CornerUpLeft, CornerUpRight, ArrowUp, RotateCcw, AlertTriangle, ShieldCheck, Compass, X } from 'lucide-react';
import { normalizeAngleDiff } from '../utils/geo';

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
}) => {
  const normalizedAngle = normalizeAngleDiff(arrowAngle);

  // Determine turn icon for next turn cue
  const getTurnIcon = (cue: TurnCue) => {
    if (cue.turnType.includes('left')) {
      return <CornerUpLeft className="w-5 h-5 text-amber-400 shrink-0" />;
    }
    if (cue.turnType.includes('right')) {
      return <CornerUpRight className="w-5 h-5 text-amber-400 shrink-0" />;
    }
    if (cue.turnType === 'u-turn') {
      return <RotateCcw className="w-5 h-5 text-rose-400 shrink-0" />;
    }
    return <ArrowUp className="w-5 h-5 text-emerald-400 shrink-0" />;
  };

  const isDayMode = highContrastMode === 'sunlight-bright';

  return (
    <div
      id="compass-header-container"
      className={`w-full px-4 pt-2.5 pb-3 border-b select-none transition-colors relative ${
        isDayMode
          ? 'bg-white border-slate-300 text-slate-900'
          : 'bg-slate-900 border-slate-800 text-white'
      }`}
    >
      {onClose && (
        <button
          id="close-compass-header-btn"
          onClick={onClose}
          className="absolute top-2 right-2 z-10 p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-black/10 dark:hover:bg-white/10 transition"
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
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-bold tracking-tight border ${
                distanceToNextTurn <= 35
                  ? 'bg-amber-500 text-black border-amber-400 animate-pulse'
                  : isDayMode
                  ? 'bg-slate-100 text-slate-900 border-slate-300'
                  : 'bg-slate-800 text-amber-300 border-slate-700'
              }`}
            >
              {getTurnIcon(nextTurnCue)}
              <span className="truncate">
                {nextTurnCue.description} in{' '}
                <strong className="underline decoration-2">
                  {distanceToNextTurn < 1000
                    ? `${Math.round(distanceToNextTurn)} m`
                    : `${(distanceToNextTurn / 1000).toFixed(1)} km`}
                </strong>
              </span>
            </div>
          ) : (
            <div
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold ${
                isDayMode ? 'text-slate-600 bg-slate-100' : 'text-slate-400 bg-slate-800/80'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              <span>Following Trail Path</span>
            </div>
          )}

          {/* Direction Text */}
          <div className="mt-1.5">
            <h2
              id="direction-headline"
              className={`text-xl sm:text-2xl font-black tracking-tight leading-tight ${
                isOffTrail ? 'text-rose-500' : isDayMode ? 'text-black' : 'text-emerald-400'
              }`}
            >
              {directionHeadline}
            </h2>
            <p
              id="direction-subline"
              className={`text-xs sm:text-sm font-semibold tracking-wide ${
                isDayMode ? 'text-slate-600' : 'text-slate-300'
              }`}
            >
              {directionSubline}
            </p>
          </div>

          {/* Compass Sensor Status / Prompt */}
          {needsSensorPermission ? (
            <button
              id="enable-compass-sensor-btn"
              onClick={onRequestPermission}
              className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold rounded-md bg-sky-500 hover:bg-sky-400 text-black shadow"
            >
              <Compass className="w-3.5 h-3.5" />
              Enable Device Compass
            </button>
          ) : (
            <div className="mt-1 flex items-center gap-2">
              <span
                className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                  headingSource === 'gps'
                    ? 'bg-blue-900/60 text-blue-300 border border-blue-700/50'
                    : headingSource === 'sensor'
                    ? 'bg-emerald-900/60 text-emerald-300 border border-emerald-700/50'
                    : 'bg-slate-700 text-slate-400'
                }`}
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
            className={`relative w-28 h-28 sm:w-32 sm:h-32 rounded-full border-4 flex items-center justify-center shadow-lg transition-colors ${
              isOffTrail
                ? 'border-rose-500 bg-rose-950/40 shadow-rose-900/40'
                : isDayMode
                ? 'border-slate-900 bg-slate-100 shadow-slate-400/50'
                : 'border-slate-700 bg-slate-950 shadow-black/60'
            }`}
          >
            {/* Cardinal Marks */}
            <span
              className={`absolute top-1 text-[11px] font-black tracking-widest ${
                isDayMode ? 'text-slate-800' : 'text-slate-400'
              }`}
            >
              N
            </span>
            <span
              className={`absolute bottom-1 text-[11px] font-black tracking-widest ${
                isDayMode ? 'text-slate-600' : 'text-slate-500'
              }`}
            >
              S
            </span>
            <span
              className={`absolute right-1 text-[11px] font-black tracking-widest ${
                isDayMode ? 'text-slate-600' : 'text-slate-500'
              }`}
            >
              E
            </span>
            <span
              className={`absolute left-1 text-[11px] font-black tracking-widest ${
                isDayMode ? 'text-slate-600' : 'text-slate-500'
              }`}
            >
              W
            </span>

            {/* Inner Ring */}
            <div
              className={`w-20 h-20 sm:w-24 sm:h-24 rounded-full border ${
                isDayMode ? 'border-slate-300' : 'border-slate-800'
              } flex items-center justify-center`}
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
                  fill={isOffTrail ? '#ef4444' : '#22c55e'}
                  stroke={isDayMode ? '#000000' : '#ffffff'}
                  strokeWidth="2.5"
                  strokeLinejoin="round"
                />
                {/* Arrow Tail */}
                <polygon
                  points="50,94 62,60 50,68 38,60"
                  fill={isDayMode ? '#94a3b8' : '#334155'}
                  stroke={isDayMode ? '#64748b' : '#1e293b'}
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                />
                {/* Central Pivot Circle */}
                <circle
                  cx="50"
                  cy="50"
                  r="6"
                  fill={isDayMode ? '#0f172a' : '#f8fafc'}
                  stroke={isOffTrail ? '#ef4444' : '#22c55e'}
                  strokeWidth="3"
                />
              </svg>
            </div>
          </div>

          <div
            className={`mt-1 text-[11px] font-bold tracking-wider uppercase ${
              isOffTrail ? 'text-rose-400 font-extrabold' : isDayMode ? 'text-slate-700' : 'text-slate-400'
            }`}
          >
            {isOffTrail ? 'OFF TRAIL' : `${Math.round(distanceToTarget)}m AHEAD`}
          </div>
        </div>
      </div>
    </div>
  );
};
