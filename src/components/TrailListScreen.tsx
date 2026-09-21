import React, { useRef, useState } from 'react';
import { Trail } from '../types';
import { parseGpx, generateSampleTrails } from '../utils/gpxParser';
import {
  Upload,
  Navigation,
  Trash2,
  Mountain,
  MapPin,
  Calendar,
  Layers,
  Sparkles,
  Sun,
  Moon,
  AlertCircle,
  Play,
  Repeat
} from 'lucide-react';
import { PWAInstallButton } from './PWAInstallButton';

interface TrailListScreenProps {
  savedTrails: Trail[];
  onSelectTrail: (trail: Trail) => void;
  onSaveTrail: (trail: Trail) => void;
  onDeleteTrail: (trailId: string) => void;
  onReverseTrail?: (trail: Trail) => void;
  highContrastMode: 'dark-slate' | 'sunlight-bright';
  onToggleTheme: () => void;
  resumableSession?: {
    trail: Trail;
    elapsedSeconds: number;
    lastDistanceAlong: number | null;
  } | null;
  onResumeHike?: () => void;
  onDiscardSession?: () => void;
}

export const TrailListScreen: React.FC<TrailListScreenProps> = ({
  savedTrails,
  onSelectTrail,
  onSaveTrail,
  onDeleteTrail,
  onReverseTrail,
  highContrastMode,
  onToggleTheme,
  resumableSession,
  onResumeHike,
  onDiscardSession,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const isDayMode = highContrastMode === 'sunlight-bright';

  // Format meters to km / miles
  const formatDist = (meters: number) => {
    return `${(meters / 1000).toFixed(1)} km (${(meters * 0.000621371).toFixed(1)} mi)`;
  };

  const handleFileUpload = async (file: File) => {
    setErrorMessage(null);
    try {
      if (!file.name.toLowerCase().endsWith('.gpx') && file.type !== 'application/gpx+xml') {
        // Still attempt parsing as GPX in case mime is text/xml
      }
      const text = await file.text();
      const trail = parseGpx(text, file.name);
      onSaveTrail(trail);
      onSelectTrail(trail);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to parse GPX file';
      setErrorMessage(msg);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
    // reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
  };

  const handleLoadSample = (sample: Trail) => {
    onSaveTrail(sample);
    onSelectTrail(sample);
  };

  const sampleTrails = generateSampleTrails();

  return (
    <div
      id="trail-list-screen"
      className={`min-h-screen flex flex-col transition-colors select-none ${
        isDayMode ? 'bg-slate-50 text-slate-900' : 'bg-slate-950 text-slate-100'
      }`}
    >
      {/* Header */}
      <header
        className={`px-4 py-3.5 border-b sticky top-0 z-20 flex items-center justify-between ${
          isDayMode ? 'bg-white border-slate-300 shadow-sm' : 'bg-slate-900 border-slate-800'
        }`}
      >
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center text-white shadow-md">
            <Mountain className="w-6 h-6 stroke-[2.5]" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight leading-none">Trail Navigator</h1>
            <p className="text-[11px] font-bold text-slate-400 mt-0.5">GPX Hiking & Turn Guidance</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <PWAInstallButton />
          <button
            id="toggle-theme-btn"
            onClick={onToggleTheme}
            className={`p-2.5 rounded-xl border font-bold text-xs flex items-center gap-1.5 transition active:scale-95 ${
              isDayMode
                ? 'bg-slate-100 border-slate-300 text-slate-700'
                : 'bg-slate-800 border-slate-700 text-slate-300'
            }`}
            title={isDayMode ? 'Switch to Dark Slate' : 'Switch to Sunlight Bright Day Mode'}
            aria-label="Toggle theme mode"
          >
            {isDayMode ? <Moon className="w-4 h-4 text-indigo-600" /> : <Sun className="w-4 h-4 text-amber-400" />}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-xl w-full mx-auto p-4 space-y-4">
        {/* Resume Hike Banner */}
        {resumableSession && (
          <div
            id="resume-hike-banner"
            className={`p-4 rounded-2xl border-2 transition shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
              isDayMode
                ? 'bg-emerald-50 border-emerald-500 text-slate-900'
                : 'bg-emerald-950/40 border-emerald-500 text-slate-100'
            }`}
          >
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-md">
                <Navigation className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-md bg-emerald-600/20 text-emerald-600 dark:text-emerald-400 text-[10px] font-black uppercase tracking-wider">
                    Unfinished Hike
                  </span>
                </div>
                <h3 className="text-base font-black tracking-tight mt-0.5 line-clamp-1">
                  {resumableSession.trail.name}
                </h3>
                <div className="flex items-center gap-3 text-xs font-bold text-slate-500 dark:text-slate-400 mt-1">
                  <span>
                    ⏱️ {Math.floor(resumableSession.elapsedSeconds / 60)}m {resumableSession.elapsedSeconds % 60}s elapsed
                  </span>
                  {resumableSession.lastDistanceAlong !== null && resumableSession.lastDistanceAlong !== undefined && (
                    <span>
                      📍 {(resumableSession.lastDistanceAlong / 1000).toFixed(2)} km in
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 self-stretch sm:self-auto pt-1 sm:pt-0">
              <button
                id="resume-hike-btn"
                onClick={onResumeHike}
                className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-md transition active:scale-95"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                Resume Hike
              </button>
              <button
                id="discard-hike-btn"
                onClick={onDiscardSession}
                className={`px-3 py-2.5 rounded-xl border text-xs font-bold transition active:scale-95 ${
                  isDayMode
                    ? 'border-slate-300 text-slate-500 hover:bg-slate-100'
                    : 'border-slate-700 text-slate-400 hover:bg-slate-800'
                }`}
                title="Discard session"
                aria-label="Discard session"
              >
                Discard
              </button>
            </div>
          </div>
        )}

        {/* Error Alert */}
        {errorMessage && (
          <div
            id="gpx-error-banner"
            className="p-3.5 rounded-xl bg-rose-500/15 border-2 border-rose-500 text-rose-600 dark:text-rose-400 flex items-start gap-3 text-sm font-semibold"
          >
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <div className="flex-1">
              <strong className="block font-black">Upload Failed</strong>
              {errorMessage}
            </div>
          </div>
        )}

        {/* Upload GPX Box */}
        <div
          id="upload-gpx-dropzone"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`relative p-6 rounded-2xl border-3 border-dashed cursor-pointer text-center transition active:scale-[0.99] flex flex-col items-center justify-center ${
            isDragging
              ? 'border-emerald-500 bg-emerald-500/10'
              : isDayMode
              ? 'border-slate-300 bg-white hover:border-emerald-500 shadow-sm'
              : 'border-slate-700 bg-slate-900 hover:border-emerald-500'
          }`}
        >
          <input
            id="gpx-file-input"
            ref={fileInputRef}
            type="file"
            accept=".gpx,application/gpx+xml,text/xml"
            onChange={handleFileChange}
            className="hidden"
          />

          <div className="w-14 h-14 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-lg mb-3">
            <Upload className="w-7 h-7 stroke-[2.5]" />
          </div>

          <h2 className="text-xl font-black tracking-tight">Load a GPX Trail</h2>
          <p className="mt-1 text-xs sm:text-sm font-medium text-slate-400 max-w-xs">
            Tap to select or drag & drop any <strong className="text-emerald-500">.gpx</strong> hiking file
          </p>

          <button
            id="browse-gpx-btn"
            type="button"
            className="mt-4 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-sm uppercase tracking-wider shadow-md transition"
          >
            Choose File
          </button>
        </div>

        {/* Saved Trails Section */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Layers className="w-4 h-4" />
              Saved Trails ({savedTrails.length})
            </h3>
          </div>

          {savedTrails.length === 0 ? (
            <div
              className={`p-6 rounded-2xl border text-center ${
                isDayMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
              }`}
            >
              <MapPin className="w-8 h-8 mx-auto text-slate-400 mb-2" />
              <p className="font-bold text-sm">No saved trails yet</p>
              <p className="text-xs text-slate-400 mt-1">
                Upload a GPX file above or select one of the built-in demo trails below.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {savedTrails.map(trail => (
                <div
                  key={trail.id}
                  id={`saved-trail-card-${trail.id}`}
                  className={`p-4 rounded-2xl border-2 transition shadow-sm flex flex-col justify-between gap-3 ${
                    isDayMode
                      ? 'bg-white border-slate-200 hover:border-emerald-500'
                      : 'bg-slate-900 border-slate-800 hover:border-emerald-500'
                  }`}
                >
                  <div>
                    <h4 className="text-lg font-black tracking-tight leading-tight line-clamp-1">
                      {trail.name}
                    </h4>
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-bold text-slate-400">
                      <span className="text-emerald-500 font-extrabold">
                        {formatDist(trail.totalDistance)}
                      </span>
                      {trail.elevationGain !== undefined && (
                        <span>+{trail.elevationGain} m gain</span>
                      )}
                      {trail.elevationLoss !== undefined && (
                        <span>-{trail.elevationLoss} m loss</span>
                      )}
                      {trail.waypoints && trail.waypoints.length > 0 && (
                        <span className="text-indigo-400 font-bold">{trail.waypoints.length} waypoints</span>
                      )}
                      <span>{trail.points.length} track points</span>
                      <span>{trail.turnCues.length} turn cues</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1 border-t border-slate-800/20 dark:border-slate-800">
                    <button
                      id={`start-nav-btn-${trail.id}`}
                      onClick={() => onSelectTrail(trail)}
                      className="flex-1 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-98 text-white font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 shadow-md transition"
                    >
                      <Navigation className="w-4 h-4" />
                      Start Navigation
                    </button>
                    {onReverseTrail && (
                      <button
                        id={`reverse-trail-btn-${trail.id}`}
                        onClick={() => onReverseTrail(trail)}
                        className={`p-3 rounded-xl border hover:bg-indigo-500/10 hover:border-indigo-500 hover:text-indigo-400 active:scale-95 transition ${
                          isDayMode
                            ? 'border-slate-200 text-slate-500'
                            : 'border-slate-800 text-slate-400'
                        }`}
                        title="Reverse direction"
                        aria-label="Reverse trail direction"
                      >
                        <Repeat className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      id={`delete-trail-btn-${trail.id}`}
                      onClick={() => onDeleteTrail(trail.id)}
                      className={`p-3 rounded-xl border hover:bg-rose-500/10 hover:border-rose-500 hover:text-rose-500 active:scale-95 transition ${
                        isDayMode
                          ? 'border-slate-200 text-slate-400'
                          : 'border-slate-800 text-slate-400'
                      }`}
                      title="Delete trail"
                      aria-label="Delete saved trail"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Demo / Sample Trails */}
        <div className="pt-2">
          <h3 className="text-sm font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5 mb-2">
            <Sparkles className="w-4 h-4 text-amber-400" />
            Quick Demo Trails (No File Needed)
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {sampleTrails.map(sample => (
              <button
                key={sample.id}
                id={`load-sample-${sample.id}`}
                onClick={() => handleLoadSample(sample)}
                className={`p-3 rounded-xl border text-left transition active:scale-98 ${
                  isDayMode
                    ? 'bg-white border-slate-200 hover:border-emerald-500 shadow-sm'
                    : 'bg-slate-900 border-slate-800 hover:border-emerald-500'
                }`}
              >
                <div className="font-extrabold text-sm line-clamp-1">{sample.name}</div>
                <div className="text-xs font-bold text-emerald-500 mt-0.5">
                  {formatDist(sample.totalDistance)} · +{sample.elevationGain}m
                </div>
                <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
                  <span>{sample.turnCues.length} turns</span> · <span>Tap to load & test</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
};
