import React, { useState } from 'react';
import { Trophy, Clock, Route, TrendingUp, ChevronLeft, Repeat, X, Download, Save, Check } from 'lucide-react';
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
  // Free Hike: recorded with no planned trail, so it can be saved as a real, repeatable
  // trail (with auto-generated turn cues) instead of just exported.
  freeHike?: boolean;
  onSaveAsTrail?: () => void;
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
  freeHike = false,
  onSaveAsTrail,
}) => {
  const [savedAsTrail, setSavedAsTrail] = useState(false);
  if (!isOpen) return null;

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
        className="w-full max-w-md rounded-[var(--radius-lg)] p-6 shadow-2xl text-center relative bg-[var(--surface)] text-[var(--text)]"
        style={{ border: 'var(--border-w-strong) solid var(--border-color)' }}
      >
        {/* Close icon */}
        <button
          id="finish-summary-close-btn"
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-[var(--radius-sm)] text-[var(--text-secondary)] hover:opacity-70 transition"
          aria-label="Close summary and view map"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Celebratory Icon */}
        <div
          className="w-16 h-16 mx-auto mb-3 rounded-[var(--radius-lg)] flex items-center justify-center shadow-lg animate-bounce"
          style={{ background: 'color-mix(in srgb, var(--accent-2) 20%, transparent)', color: 'var(--accent-2)', border: '1px solid var(--accent-2)' }}
        >
          <Trophy className="w-9 h-9" />
        </div>

        <div
          className="inline-block px-3 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wider text-white mb-2 shadow-sm"
          style={{ background: 'var(--accent-2)' }}
        >
          {freeHike ? 'Hike Recorded' : 'Destination Reached'}
        </div>

        <h2 id="finish-summary-title" className="text-2xl font-extrabold tracking-tight mb-1 font-[family-name:var(--font-display)]">
          {freeHike ? 'Nice Hike!' : 'Trail Completed!'}
        </h2>
        <p className="text-sm font-semibold text-[var(--text-secondary)] mb-6 truncate max-w-xs mx-auto">
          {trailName}
        </p>

        {/* 3 Metric Cards: Time, Distance, Gain */}
        <div className="grid grid-cols-3 gap-2.5 mb-6">
          {/* Time */}
          <div
            id="finish-summary-time-tile"
            className="p-3 rounded-[var(--radius-md)] border text-center bg-[var(--surface-2)] border-[var(--border-color)]"
          >
            <Clock className="w-4 h-4 mx-auto mb-1 text-[var(--info)]" />
            <div className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-secondary)]">
              Time
            </div>
            <div className="text-base sm:text-lg font-extrabold tracking-tight mt-0.5 font-[family-name:var(--font-display)]">
              {formatTotalTime(totalElapsedSeconds)}
            </div>
          </div>

          {/* Distance */}
          <div
            id="finish-summary-dist-tile"
            className="p-3 rounded-[var(--radius-md)] border text-center bg-[var(--surface-2)] border-[var(--border-color)]"
          >
            <Route className="w-4 h-4 mx-auto mb-1 text-[var(--accent-2)]" />
            <div className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-secondary)]">
              Distance
            </div>
            <div className="text-base sm:text-lg font-extrabold tracking-tight mt-0.5 font-[family-name:var(--font-display)]">
              {dist.val} <span className="text-xs font-normal text-[var(--text-secondary)]">{dist.unit}</span>
            </div>
          </div>

          {/* Gain */}
          <div
            id="finish-summary-gain-tile"
            className="p-3 rounded-[var(--radius-md)] border text-center bg-[var(--surface-2)] border-[var(--border-color)]"
          >
            <TrendingUp className="w-4 h-4 mx-auto mb-1 text-[var(--accent)]" />
            <div className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-secondary)]">
              Gain
            </div>
            <div className="text-base sm:text-lg font-extrabold tracking-tight mt-0.5 font-[family-name:var(--font-display)]">
              +{gain.val} <span className="text-xs font-normal text-[var(--text-secondary)]">{gain.unit}</span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-2.5">
          {/* Save this Free Hike as a real, repeatable trail (with auto-generated turn cues) */}
          {freeHike && onSaveAsTrail && (
            <button
              id="save-hike-as-trail-btn"
              onClick={() => {
                onSaveAsTrail();
                setSavedAsTrail(true);
              }}
              disabled={savedAsTrail}
              className="w-full py-3 px-4 rounded-[var(--radius-md)] font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-sm transition active:scale-[0.98] hover:opacity-90 disabled:active:scale-100 text-white"
              style={{ background: savedAsTrail ? 'var(--accent-2)' : 'var(--accent)' }}
            >
              {savedAsTrail ? (
                <>
                  <Check className="w-4 h-4 shrink-0" />
                  Saved to Your Trails
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 shrink-0" />
                  Save as a Repeatable Trail
                </>
              )}
            </button>
          )}

          {/* Save my track as GPX */}
          {breadcrumbs && breadcrumbs.some(seg => seg.length > 0) && (
            <button
              id="save-track-gpx-btn"
              onClick={handleDownloadTrackGPX}
              className="w-full py-3 px-4 rounded-[var(--radius-md)] border font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-sm transition active:scale-[0.98] hover:opacity-90"
              style={{ background: 'color-mix(in srgb, var(--accent) 15%, transparent)', borderColor: 'var(--accent)', color: 'var(--accent)' }}
            >
              <Download className="w-4 h-4 shrink-0" />
              Save my track as GPX
            </button>
          )}

          <button
            id="finish-summary-done-btn"
            onClick={onBackToTrails}
            className="w-full py-3.5 px-4 rounded-[var(--radius-md)] text-white font-extrabold text-sm uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg transition active:scale-[0.98] hover:opacity-90"
            style={{ background: 'var(--accent-2)' }}
          >
            <ChevronLeft className="w-4 h-4" />
            Back to Saved Trails
          </button>

          {onReverseTrail && (
            <button
              id="finish-summary-reverse-btn"
              onClick={onReverseTrail}
              className="w-full py-3 px-4 rounded-[var(--radius-md)] border font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition active:scale-[0.98] bg-[var(--surface-2)] border-[var(--border-color)] text-[var(--text)] hover:opacity-90"
            >
              <Repeat className="w-4 h-4 text-[var(--info)]" />
              Reverse Direction & Return
            </button>
          )}

          <button
            id="finish-summary-review-map-btn"
            onClick={onClose}
            className="w-full py-2 text-xs font-bold text-[var(--text-secondary)] hover:opacity-70 transition"
          >
            Review Trail on Map
          </button>
        </div>
      </div>
    </div>
  );
};
