import React, { useRef, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronUp, ChevronDown, Compass, Activity, Layers, Navigation, ArrowUpRight } from 'lucide-react';
import { TurnCue } from '../types';
import { Units, formatShortDistance } from '../utils/units';
import { CompassHeader } from './CompassHeader';
import { StatsBar, formatTotalTime, formatTimeRemaining } from './StatsBar';

interface NavigationBottomDrawerProps {
  isOpen: boolean;
  onToggleOpen: () => void;
  isFreeHike: boolean;
  // Compass props
  arrowAngle: number;
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
  // Stats props
  totalElapsedSeconds: number;
  paceSecondsPerKm: number | null;
  estimatedTimeRemainingSeconds: number | null;
  distanceRemaining: number;
  distanceSoFar: number;
  distanceFromTrail: number;
  offTrailThreshold: number;
  distanceActuallyWalked: number;
  isReverseMode?: boolean;
  // Common
  highContrastMode: 'dark-slate' | 'sunlight-bright';
  units: Units;
  onHeightChange?: (height: number) => void;
  activeTab?: 'all' | 'compass' | 'stats';
  onTabChange?: (tab: 'all' | 'compass' | 'stats') => void;
}

export const NavigationBottomDrawer: React.FC<NavigationBottomDrawerProps> = ({
  isOpen,
  onToggleOpen,
  isFreeHike,
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
  totalElapsedSeconds,
  paceSecondsPerKm,
  estimatedTimeRemainingSeconds,
  distanceRemaining,
  distanceSoFar,
  distanceFromTrail,
  offTrailThreshold,
  distanceActuallyWalked,
  isReverseMode = false,
  highContrastMode,
  units,
  onHeightChange,
  activeTab = 'all',
  onTabChange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef<number | null>(null);
  const currentTab = isFreeHike && activeTab === 'compass' ? 'stats' : activeTab;

  // Report height dynamically to parent so map buttons can position above it
  useEffect(() => {
    if (!onHeightChange) return;
    if (!isOpen) {
      onHeightChange(58); // Collapsed peek bar height
    } else {
      // Small timeout to allow DOM to measure, or compute from active tab
      const updateHeight = () => {
        if (containerRef.current) {
          const rect = containerRef.current.getBoundingClientRect();
          onHeightChange(Math.max(260, Math.min(rect.height, window.innerHeight * 0.62)));
        } else {
          onHeightChange(340);
        }
      };
      updateHeight();
      const timer = setTimeout(updateHeight, 250);
      return () => clearTimeout(timer);
    }
  }, [isOpen, currentTab, onHeightChange]);

  // Touch swipe handling
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartY.current === null) return;
    const deltaY = e.changedTouches[0].clientY - touchStartY.current;
    touchStartY.current = null;

    if (!isOpen && deltaY < -25) {
      // Swiped UP when collapsed -> expand
      onToggleOpen();
    } else if (isOpen && deltaY > 35) {
      // Swiped DOWN when expanded -> collapse
      onToggleOpen();
    }
  };

  return (
    <div
      id="navigation-bottom-drawer"
      ref={containerRef}
      className="absolute bottom-0 left-0 right-0 z-[450] flex flex-col pointer-events-auto bg-[var(--surface)] shadow-2xl transition-shadow"
      style={{
        borderTop: 'var(--border-w-strong) solid var(--border-color)',
      }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Drawer Drag Bar / Header (Always visible, tap or swipe up to toggle) */}
      <div
        id="bottom-drawer-handle"
        onClick={onToggleOpen}
        role="button"
        tabIndex={0}
        aria-expanded={isOpen}
        aria-label={isOpen ? 'Collapse compass and stats' : 'Swipe up for compass and stats'}
        className="w-full px-3 py-2 cursor-pointer flex flex-col items-center select-none bg-[var(--surface)] hover:bg-[var(--surface-2)]/60 transition active:scale-[0.99]"
      >
        {/* Visual Pill Indicator */}
        <div className="w-12 h-1.5 rounded-full bg-[var(--border-color)]/30 mb-1.5 transition-colors group-hover:bg-[var(--border-color)]/60" />

        {/* Collapsed Glance Row */}
        {!isOpen && (
          <div className="w-full flex items-center justify-between gap-2 max-w-xl mx-auto">
            {/* Left: Direction or Turn Glance */}
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-[var(--radius-sm)] flex items-center justify-center bg-[var(--accent-2)] text-white shrink-0 shadow-sm">
                <Navigation
                  className="w-4 h-4 transition-transform duration-300"
                  style={{ transform: `rotate(${arrowAngle}deg)` }}
                />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-black tracking-tight truncate text-[var(--text)]">
                  {nextTurnCue && distanceToNextTurn !== null
                    ? `${formatShortDistance(distanceToNextTurn, units)}: ${nextTurnCue.description}`
                    : directionHeadline || 'Follow Route'}
                </div>
                <div className="text-[10px] font-semibold text-[var(--text-secondary)] truncate">
                  {isOffTrail ? (
                    <span className="text-[var(--danger)] font-bold">
                      {formatShortDistance(offTrailDistance, units)} off trail
                    </span>
                  ) : (
                    directionSubline || 'On trail'
                  )}
                </div>
              </div>
            </div>

            {/* Right: Quick Stats Glance + Swipe Hint */}
            <div className="flex items-center gap-2 shrink-0">
              <div className="text-right">
                <div className="text-xs font-mono font-black text-[var(--text)]">
                  {formatTotalTime(totalElapsedSeconds)}
                </div>
                <div className="text-[10px] font-mono font-bold text-[var(--accent)]">
                  {isFreeHike
                    ? formatShortDistance(distanceActuallyWalked, units)
                    : formatTimeRemaining(estimatedTimeRemainingSeconds, distanceRemaining)}
                </div>
              </div>
              <div className="p-1 rounded-[var(--radius-sm)] bg-[var(--surface-2)] text-[var(--text-secondary)] border border-[var(--border-color)] flex items-center gap-0.5">
                <ChevronUp className="w-4 h-4 animate-bounce" />
                <span className="text-[9px] font-extrabold uppercase pr-1 hidden xs:inline">Swipe</span>
              </div>
            </div>
          </div>
        )}

        {/* Expanded Navigation Tabs & Collapse Row */}
        {isOpen && (
          <div
            className="w-full flex items-center justify-between gap-2 max-w-xl mx-auto"
            onClick={e => e.stopPropagation()}
          >
            {/* View Filter Tabs */}
            <div className="flex items-center gap-1 bg-[var(--surface-2)] p-0.5 rounded-[var(--radius-sm)] border border-[var(--border-color)]">
              {!isFreeHike && (
                <button
                  id="drawer-tab-all"
                  onClick={() => onTabChange?.('all')}
                  className={`px-2.5 py-1 rounded-[calc(var(--radius-sm)-2px)] text-[11px] font-extrabold uppercase tracking-wider transition flex items-center gap-1 ${
                    currentTab === 'all'
                      ? 'bg-[var(--accent)] text-white shadow-sm'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text)]'
                  }`}
                >
                  <Layers className="w-3 h-3" />
                  <span>All</span>
                </button>
              )}

              {!isFreeHike && (
                <button
                  id="drawer-tab-compass"
                  onClick={() => onTabChange?.('compass')}
                  className={`px-2.5 py-1 rounded-[calc(var(--radius-sm)-2px)] text-[11px] font-extrabold uppercase tracking-wider transition flex items-center gap-1 ${
                    currentTab === 'compass'
                      ? 'bg-[var(--accent-2)] text-white shadow-sm'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text)]'
                  }`}
                >
                  <Compass className="w-3 h-3" />
                  <span>Compass</span>
                </button>
              )}

              <button
                id="drawer-tab-stats"
                onClick={() => onTabChange?.('stats')}
                className={`px-2.5 py-1 rounded-[calc(var(--radius-sm)-2px)] text-[11px] font-extrabold uppercase tracking-wider transition flex items-center gap-1 ${
                  currentTab === 'stats'
                    ? 'bg-[var(--info)] text-white shadow-sm'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text)]'
                }`}
              >
                <Activity className="w-3 h-3" />
                <span>Trip Stats</span>
              </button>
            </div>

            {/* Collapse Button */}
            <button
              id="collapse-drawer-btn"
              onClick={onToggleOpen}
              className="p-1.5 rounded-[var(--radius-sm)] border border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text)] bg-[var(--surface-2)] active:scale-95 transition flex items-center gap-1"
              title="Collapse panel"
              aria-label="Collapse panel"
            >
              <span className="text-[10px] font-bold uppercase hidden sm:inline">Close</span>
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Expanded Content Area with Momentum Scrolling */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            className="w-full overflow-hidden flex flex-col"
          >
            <div
              id="drawer-scrollable-body"
              className="w-full max-h-[50vh] sm:max-h-[58vh] overflow-y-auto overscroll-contain px-3 pb-3 pt-1 space-y-3"
              style={{
                WebkitOverflowScrolling: 'touch',
              }}
            >
              {/* Compass & Turn Guidance View */}
              {!isFreeHike && (currentTab === 'all' || currentTab === 'compass') && (
                <div
                  id="drawer-compass-section"
                  className="rounded-[var(--radius-md)] overflow-hidden shadow-sm"
                  style={{ border: 'var(--border-w) solid var(--border-color)' }}
                >
                  <CompassHeader
                    arrowAngle={arrowAngle}
                    directionHeadline={directionHeadline}
                    directionSubline={directionSubline}
                    distanceToTarget={distanceToTarget}
                    nextTurnCue={nextTurnCue}
                    distanceToNextTurn={distanceToNextTurn}
                    isOffTrail={isOffTrail}
                    offTrailDistance={offTrailDistance}
                    headingSource={headingSource}
                    needsSensorPermission={needsSensorPermission}
                    onRequestPermission={onRequestPermission}
                    highContrastMode={highContrastMode}
                    units={units}
                  />
                </div>
              )}

              {/* Trip Stats & Pace View */}
              {(currentTab === 'all' || currentTab === 'stats') && (
                <div
                  id="drawer-stats-section"
                  className="rounded-[var(--radius-md)] overflow-hidden shadow-sm"
                  style={{ border: 'var(--border-w) solid var(--border-color)' }}
                >
                  <StatsBar
                    totalElapsedSeconds={totalElapsedSeconds}
                    paceSecondsPerKm={paceSecondsPerKm}
                    estimatedTimeRemainingSeconds={estimatedTimeRemainingSeconds}
                    distanceRemaining={distanceRemaining}
                    distanceSoFar={distanceSoFar}
                    distanceFromTrail={distanceFromTrail}
                    offTrailThreshold={offTrailThreshold}
                    highContrastMode={highContrastMode}
                    isReverseMode={isReverseMode}
                    distanceWalked={distanceActuallyWalked}
                    units={units}
                    freeHike={isFreeHike}
                  />
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
