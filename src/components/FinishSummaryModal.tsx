import React from 'react';
import { Trophy, Clock, Route, TrendingUp, ChevronLeft, Repeat, X, Download } from 'lucide-react';
import { formatTotalTime, formatDist } from './StatsBar';
import { Units, formatElevationParts } from '../utils/units';
import { exportBreadcrumbsToGPX } from '../utils/gpxParser';
import { BreadcrumbPoint } from '../types';

interface FinishSummaryModalProps {
  isOpen: boolean;
  trailName: string;
  totalElapsedSeconds: number;
  totalDistanceMeters: number;
  elevationGainMeters: number;
  highContrastMode: 'dark-slate' | 'sunlight-bright';
  onClose: () => void;
  onBackToTrails: () => void;
  onReverseTrail?: () => void;
  breadcrumbs?: BreadcrumbPoint[][];
  units?: Units;
}

export const FinishSummaryModal: React.FC<FinishSummaryModalProps> = ({
  isOpen,
  trailName,
  totalElapsedSeconds,
  totalDistanceMeters,
  elevationGainMeters,
  highContrastMode,
  onClose,
  onBackToTrails,
  onReverseTrail,
  breadcrumbs = [],
  units = 'imperial',
}) => {
  if (!isOpen) return null;

  const isDayMode = highContrastMode === 'sunlight-bright';
  const dist = formatDist(totalDistanceMeters, units);
  const gain = formatElevationParts(elevationGainMeters, units);

  const handleDownloadTrackGPX = () => {
    if (!breadcrumbs || breadcrumbs.length === 0) return;
    const gpxContent = exportBreadcrumbsToGPX(trailName, breadcrumbs);
    const blob = new Blob([gpxContent], { type: 'application/gpx+xml;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const sanitizedName = trailName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    link.href = url;
    link.download = `${sanitizedName || 'my_hike'}_recorded_track.gpx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div
      id="finish-summary-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="finish-summary-title"
      className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div
        id="finish-summary-modal-card"
        className={`w-full max-w-md rounded-3xl p-6 shadow-2xl border transition-all text-center relative ${
          isDayMode
            ? 'bg-white border-slate-200 text-slate-900'
            : 'bg-slate-900 border-slate-700 text-white'
        }`}
      >
        {/* Close icon */}
        <button
          id="finish-summary-close-btn"
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-black/10 dark:hover:bg-white/10 transition"
          aria-label="Close summary and view map"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Celebratory Icon */}
        <div className="w-16 h-16 mx-auto mb-3 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center shadow-lg shadow-emerald-500/20 animate-bounce">
          <Trophy className="w-9 h-9" />
        </div>

        <div className="inline-block px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-emerald-500 text-white mb-2 shadow-sm">
          Destination Reached
        </div>

        <h2 id="finish-summary-title" className="text-2xl font-black tracking-tight mb-1">
          Trail Completed!
        </h2>
        <p className="text-sm font-semibold text-slate-400 mb-6 truncate max-w-xs mx-auto">
          {trailName}
        </p>

        {/* 3 Metric Cards: Time, Distance, Gain */}
        <div className="grid grid-cols-3 gap-2.5 mb-6">
          {/* Time */}
          <div
            id="finish-summary-time-tile"
            className={`p-3 rounded-2xl border text-center ${
              isDayMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-800/80 border-slate-700/80'
            }`}
          >
            <Clock className="w-4 h-4 mx-auto mb-1 text-sky-400" />
            <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">
              Time
            </div>
            <div className="text-base sm:text-lg font-black tracking-tight mt-0.5">
              {formatTotalTime(totalElapsedSeconds)}
            </div>
          </div>

          {/* Distance */}
          <div
            id="finish-summary-dist-tile"
            className={`p-3 rounded-2xl border text-center ${
              isDayMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-800/80 border-slate-700/80'
            }`}
          >
            <Route className="w-4 h-4 mx-auto mb-1 text-emerald-400" />
            <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">
              Distance
            </div>
            <div className="text-base sm:text-lg font-black tracking-tight mt-0.5">
              {dist.val} <span className="text-xs font-normal text-slate-400">{dist.unit}</span>
            </div>
          </div>

          {/* Gain */}
          <div
            id="finish-summary-gain-tile"
            className={`p-3 rounded-2xl border text-center ${
              isDayMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-800/80 border-slate-700/80'
            }`}
          >
            <TrendingUp className="w-4 h-4 mx-auto mb-1 text-amber-400" />
            <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">
              Gain
            </div>
            <div className="text-base sm:text-lg font-black tracking-tight mt-0.5">
              +{gain.val} <span className="text-xs font-normal text-slate-400">{gain.unit}</span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-2.5">
          {/* Save my track as GPX */}
          {breadcrumbs && breadcrumbs.some(seg => seg.length > 0) && (
            <button
              id="save-track-gpx-btn"
              onClick={handleDownloadTrackGPX}
              className={`w-full py-3 px-4 rounded-xl border font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-sm transition active:scale-[0.98] ${
                isDayMode
                  ? 'bg-amber-100 hover:bg-amber-200 border-amber-300 text-amber-950'
                  : 'bg-amber-500/15 hover:bg-amber-500/25 border-amber-500/40 text-amber-300'
              }`}
            >
              <Download className="w-4 h-4 text-amber-500 shrink-0" />
              Save my track as GPX
            </button>
          )}

          <button
            id="finish-summary-done-btn"
            onClick={onBackToTrails}
            className="w-full py-3.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/40 transition active:scale-[0.98]"
          >
            <ChevronLeft className="w-4 h-4" />
            Back to Saved Trails
          </button>

          {onReverseTrail && (
            <button
              id="finish-summary-reverse-btn"
              onClick={onReverseTrail}
              className={`w-full py-3 px-4 rounded-xl border font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition active:scale-[0.98] ${
                isDayMode
                  ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-800'
                  : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
              }`}
            >
              <Repeat className="w-4 h-4 text-indigo-400" />
              Reverse Direction & Return
            </button>
          )}

          <button
            id="finish-summary-review-map-btn"
            onClick={onClose}
            className="w-full py-2 text-xs font-bold text-slate-400 hover:text-slate-200 transition"
          >
            Review Trail on Map
          </button>
        </div>
      </div>
    </div>
  );
};
