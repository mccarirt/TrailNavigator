import React, { useState } from 'react';
import {
  Play,
  Pause,
  FastForward,
  AlertTriangle,
  ShieldCheck,
  Gauge,
  ChevronDown,
  ChevronUp,
  X,
  Trophy,
  RotateCcw,
} from 'lucide-react';
import { Units, formatSpeed } from '../utils/units';

interface SimulationControlsProps {
  isSimulating: boolean;
  onToggleSimulation: () => void;
  speedKmh: number;
  onChangeSpeed: (newSpeed: number) => void;
  onDriftOffTrail: () => void;
  onReturnToTrail: () => void;
  onJumpToNextTurn: () => void;
  onJumpToEnd?: () => void;
  onTurnAroundAt?: (pct: number) => void;
  isReverseMode?: boolean;
  onClose: () => void;
  isDriftingOffTrail: boolean;
  highContrastMode: 'dark-slate' | 'sunlight-bright';
  units?: Units;
}

export const SimulationControls: React.FC<SimulationControlsProps> = ({
  isSimulating,
  onToggleSimulation,
  speedKmh,
  onChangeSpeed,
  onDriftOffTrail,
  onReturnToTrail,
  onJumpToNextTurn,
  onJumpToEnd,
  onTurnAroundAt,
  isReverseMode = false,
  onClose,
  isDriftingOffTrail,
  highContrastMode,
  units = 'imperial',
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [turnAroundPct, setTurnAroundPct] = useState(50);

  // Mini / Collapsed bar: Very sleek pill that leaves the map completely unobstructed
  if (!isExpanded) {
    return (
      <div
        id="simulation-controls-mini"
        className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-full border-2 border-amber-500 shadow-xl backdrop-blur-md transition-all select-none bg-[var(--surface)]/95 text-[var(--text)]"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping shrink-0" />
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-amber-500 truncate">
            Sim {formatSpeed(speedKmh, units)}
          </span>
          {isDriftingOffTrail && (
            <span className="px-1.5 py-0.2 rounded text-white text-[9px] font-extrabold uppercase animate-pulse" style={{ background: 'var(--danger)' }}>
              Off-Trail
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            id="sim-mini-walk-toggle-btn"
            onClick={onToggleSimulation}
            className={`px-2.5 py-1 rounded-full font-extrabold text-[11px] uppercase tracking-wide flex items-center gap-1 transition active:scale-95 ${
              isSimulating
                ? 'bg-amber-500 text-black hover:bg-amber-400'
                : 'text-white hover:opacity-90'
            }`}
            style={isSimulating ? undefined : { background: 'var(--accent-2)' }}
          >
            {isSimulating ? (
              <>
                <Pause className="w-3 h-3 fill-current" /> Pause
              </>
            ) : (
              <>
                <Play className="w-3 h-3 fill-current" /> Walk
              </>
            )}
          </button>

          <button
            id="sim-mini-drift-toggle-btn"
            onClick={isDriftingOffTrail ? onReturnToTrail : onDriftOffTrail}
            className="px-2 py-1 rounded-full font-extrabold text-[10px] uppercase tracking-wide border transition active:scale-95"
            style={
              isDriftingOffTrail
                ? { background: 'var(--danger)', color: '#fff', borderColor: 'var(--danger)' }
                : { background: 'var(--surface-2)', color: 'var(--text)', borderColor: 'var(--border-color)' }
            }
            title={isDriftingOffTrail ? 'Step on trail' : 'Drift 45m off-trail'}
          >
            {isDriftingOffTrail ? 'On Trail' : 'Drift 45m'}
          </button>

          <button
            id="sim-expand-controls-btn"
            onClick={() => setIsExpanded(true)}
            className="p-1 rounded-full border transition active:scale-95 bg-[var(--surface-2)] text-[var(--text)] border-[var(--border-color)]"
            title="Expand simulation controls"
            aria-label="Expand simulator controls"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>

          <button
            id="sim-close-btn"
            onClick={onClose}
            className="p-1 rounded-full text-[var(--text-secondary)] hover:opacity-70"
            title="Close test simulator"
            aria-label="Close test simulator"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  // Expanded panel
  return (
    <div
      id="simulation-controls-panel"
      className="p-3 rounded-[var(--radius-lg)] border-2 border-amber-500 select-none shadow-2xl backdrop-blur-md bg-[var(--surface)]/95 text-[var(--text)]"
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping" />
          <span className="text-xs font-extrabold uppercase tracking-wider text-amber-500">
            Desk Test Simulation
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            id="toggle-sim-play-btn"
            onClick={onToggleSimulation}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-sm)] font-extrabold text-xs uppercase tracking-wider shadow transition active:scale-95 ${
              isSimulating
                ? 'bg-amber-500 text-black hover:bg-amber-400'
                : 'text-white hover:opacity-90'
            }`}
            style={isSimulating ? undefined : { background: 'var(--accent-2)' }}
          >
            {isSimulating ? (
              <>
                <Pause className="w-3.5 h-3.5 fill-current" /> Pause
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" /> Walk
              </>
            )}
          </button>

          <button
            id="sim-collapse-controls-btn"
            onClick={() => setIsExpanded(false)}
            className="p-1.5 rounded-[var(--radius-sm)] border transition active:scale-95 bg-[var(--surface-2)] text-[var(--text)] border-[var(--border-color)]"
            title="Collapse simulator to pill"
            aria-label="Collapse simulation panel"
          >
            <ChevronUp className="w-4 h-4" />
          </button>

          <button
            id="sim-close-expanded-btn"
            onClick={onClose}
            className="p-1.5 rounded-[var(--radius-sm)] text-[var(--text-secondary)] hover:opacity-70"
            title="Close test simulator"
            aria-label="Close test simulator"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Speed Slider */}
      <div className="flex items-center gap-3 bg-black/10 p-2 rounded-[var(--radius-sm)]">
        <Gauge className="w-4 h-4 text-[var(--text-secondary)] shrink-0" />
        <span className="text-xs font-bold text-[var(--text-secondary)] shrink-0">Speed:</span>
        <input
          id="sim-speed-slider"
          type="range"
          min="2"
          max="35"
          step="1"
          value={speedKmh}
          onChange={e => onChangeSpeed(parseInt(e.target.value, 10))}
          className="w-full accent-amber-500 h-2 rounded-lg cursor-pointer"
          style={{ background: 'var(--border-color)' }}
        />
        <span className="text-xs font-extrabold min-w-[70px] text-right text-amber-500">
          {formatSpeed(speedKmh, units)}
        </span>
      </div>

      {/* Interactive Desk Test Buttons */}
      <div className="grid grid-cols-2 gap-2 mt-2">
        {/* Drift off-trail test button */}
        <button
          id="test-drift-off-trail-btn"
          onClick={isDriftingOffTrail ? onReturnToTrail : onDriftOffTrail}
          className="py-2 px-2.5 rounded-[var(--radius-sm)] text-xs font-extrabold uppercase tracking-wide flex items-center justify-center gap-1.5 border transition active:scale-95 hover:opacity-90"
          style={
            isDriftingOffTrail
              ? { background: 'var(--danger)', color: '#fff', borderColor: 'var(--danger)' }
              : { background: 'transparent', color: 'var(--danger)', borderColor: 'var(--danger)' }
          }
        >
          {isDriftingOffTrail ? (
            <>
              <ShieldCheck className="w-4 h-4" /> Step On-Trail
            </>
          ) : (
            <>
              <AlertTriangle className="w-4 h-4" /> Drift 45m Off-Trail
            </>
          )}
        </button>

        {/* Jump to next turn test button */}
        <button
          id="test-jump-next-turn-btn"
          onClick={onJumpToNextTurn}
          className="py-2 px-2.5 rounded-[var(--radius-sm)] text-xs font-extrabold uppercase tracking-wide flex items-center justify-center gap-1.5 border transition active:scale-95 hover:opacity-90"
          style={{ borderColor: 'var(--info)', color: 'var(--info)' }}
        >
          <FastForward className="w-4 h-4" />
          Test Turn Cue
        </button>

        {/* Jump to finish test button */}
        {onJumpToEnd && (
          <button
            id="test-jump-finish-btn"
            onClick={onJumpToEnd}
            className="col-span-2 py-2 px-2.5 rounded-[var(--radius-sm)] text-xs font-extrabold uppercase tracking-wide flex items-center justify-center gap-1.5 border transition active:scale-95 hover:opacity-90"
            style={{ borderColor: 'var(--accent-2)', color: 'var(--accent-2)' }}
          >
            <Trophy className="w-4 h-4" />
            Test Finish Arrival (&lt; 25m)
          </button>
        )}

        {/* Turn around at X% test button */}
        {onTurnAroundAt && (
          <div
            id="sim-turn-around-container"
            className="col-span-2 p-2.5 rounded-[var(--radius-sm)] bg-black/20 border border-amber-500/30 flex flex-col gap-2"
          >
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold flex items-center gap-1 text-amber-400">
                <RotateCcw className="w-3.5 h-3.5" /> Turn around at:
              </span>
              <div className="flex items-center gap-1">
                {[25, 40, 50, 75].map(preset => (
                  <button
                    key={preset}
                    onClick={() => setTurnAroundPct(preset)}
                    className="px-1.5 py-0.5 rounded text-[10px] font-bold border transition"
                    style={
                      turnAroundPct === preset
                        ? { background: '#f59e0b', color: '#000', borderColor: '#fbbf24' }
                        : { background: 'var(--surface-2)', color: 'var(--text)', borderColor: 'var(--border-color)' }
                    }
                  >
                    {preset}%
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                id="sim-turnaround-slider"
                type="range"
                min="10"
                max="90"
                step="5"
                value={turnAroundPct}
                onChange={e => setTurnAroundPct(parseInt(e.target.value, 10))}
                className="w-full accent-amber-500 h-2 rounded-lg cursor-pointer"
                style={{ background: 'var(--border-color)' }}
              />
              <span className="text-xs font-extrabold min-w-[34px] text-right text-amber-400">
                {turnAroundPct}%
              </span>
              <button
                id="sim-turnaround-btn"
                onClick={() => onTurnAroundAt(turnAroundPct)}
                className="px-2.5 py-1.5 rounded-[var(--radius-sm)] text-xs font-extrabold uppercase tracking-wide bg-amber-500 hover:bg-amber-400 text-black shadow transition active:scale-95 shrink-0 flex items-center gap-1"
                title={`Turn around at ${turnAroundPct}% and walk back`}
              >
                <RotateCcw className="w-3 h-3" />
                Turn around at {turnAroundPct}%
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
