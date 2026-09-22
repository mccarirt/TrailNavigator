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
  Repeat,
  Footprints
} from 'lucide-react';
import { PWAInstallButton } from './PWAInstallButton';
import { Units, formatDistance, formatElevation } from '../utils/units';

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
  units?: Units;
  onChangeUnits?: (units: Units) => void;
  onStartFreeHike?: () => void;
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
  units = 'imperial',
  onChangeUnits,
  onStartFreeHike,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const isDayMode = highContrastMode === 'sunlight-bright';

  // Format meters in the selected units (miles/feet or km/meters)
  const formatDist = (meters: number) => formatDistance(meters, units);

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
      className="min-h-screen flex flex-col select-none bg-[var(--bg)] text-[var(--text)] font-[family-name:var(--font-body)]"
    >
      {/* Header */}
      <header
        className="px-4 py-3.5 sticky top-0 z-20 flex items-center justify-between bg-[var(--surface)]"
        style={{ borderBottom: 'var(--border-w-strong) solid var(--border-color)' }}
      >
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-[var(--radius-md)] bg-[var(--accent)] flex items-center justify-center text-white shadow-md">
            <Mountain className="w-6 h-6 stroke-[2.5]" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight leading-none font-[family-name:var(--font-display)]">Trail Navigator</h1>
            <p className="text-[11px] font-bold text-[var(--text-secondary)] mt-0.5">GPX Hiking & Turn Guidance</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <PWAInstallButton />
          {onChangeUnits && (
            <button
              id="toggle-units-btn"
              onClick={() => onChangeUnits(units === 'imperial' ? 'metric' : 'imperial')}
              className="px-3 py-2.5 rounded-[var(--radius-sm)] border font-extrabold text-xs transition active:scale-95 bg-[var(--surface-2)] border-[var(--border-color)] text-[var(--text)]"
              title="Switch between miles/feet and kilometers/meters"
              aria-label="Toggle units"
            >
              {units === 'imperial' ? 'mi · ft' : 'km · m'}
            </button>
          )}
          <button
            id="toggle-theme-btn"
            onClick={onToggleTheme}
            className="p-2.5 rounded-[var(--radius-sm)] border font-bold text-xs flex items-center gap-1.5 transition active:scale-95 bg-[var(--surface-2)] border-[var(--border-color)] text-[var(--text)]"
            title={isDayMode ? 'Switch to Sport Bold night mode' : 'Switch to Sunlit Trail day mode'}
            aria-label="Toggle theme mode"
          >
            {isDayMode ? <Moon className="w-4 h-4 text-[var(--accent-2)]" /> : <Sun className="w-4 h-4 text-[var(--accent)]" />}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-xl w-full mx-auto p-4 space-y-4">
        {/* Resume Hike Banner */}
        {resumableSession && (
          <div
            id="resume-hike-banner"
            className="p-4 rounded-[var(--radius-lg)] transition shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[var(--surface)]"
            style={{ border: 'var(--border-w-strong) solid var(--accent-2)' }}
          >
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-[var(--radius-md)] bg-[var(--accent-2)] text-white flex items-center justify-center shrink-0 shadow-md">
                <Navigation className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-md bg-[var(--accent-2)]/20 text-[var(--accent-2)] text-[10px] font-extrabold uppercase tracking-wider">
                    Unfinished Hike
                  </span>
                </div>
                <h3 className="text-base font-extrabold tracking-tight mt-0.5 line-clamp-1 font-[family-name:var(--font-display)]">
                  {resumableSession.trail.name}
                </h3>
                <div className="flex items-center gap-3 text-xs font-bold text-[var(--text-secondary)] mt-1">
                  <span>
                    ⏱️ {Math.floor(resumableSession.elapsedSeconds / 60)}m {resumableSession.elapsedSeconds % 60}s elapsed
                  </span>
                  {resumableSession.lastDistanceAlong !== null && resumableSession.lastDistanceAlong !== undefined && (
                    <span>
                      📍 {formatDistance(resumableSession.lastDistanceAlong, units)} in
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 self-stretch sm:self-auto pt-1 sm:pt-0">
              <button
                id="resume-hike-btn"
                onClick={onResumeHike}
                className="flex-1 sm:flex-none px-4 py-2.5 rounded-[var(--radius-md)] bg-[var(--accent-2)] hover:opacity-90 text-white font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-md transition active:scale-95"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                Resume Hike
              </button>
              <button
                id="discard-hike-btn"
                onClick={onDiscardSession}
                className="px-3 py-2.5 rounded-[var(--radius-md)] border text-xs font-bold transition active:scale-95 border-[var(--border-color)] text-[var(--text-secondary)] hover:opacity-80"
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
            className="p-3.5 rounded-[var(--radius-md)] bg-[var(--danger)]/15 text-[var(--danger)] flex items-start gap-3 text-sm font-semibold"
            style={{ border: 'var(--border-w-strong) solid var(--danger)' }}
          >
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <div className="flex-1">
              <strong className="block font-extrabold">Upload Failed</strong>
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
          className="relative p-6 rounded-[var(--radius-lg)] border-dashed cursor-pointer text-center transition active:scale-[0.99] flex flex-col items-center justify-center bg-[var(--surface)] hover:opacity-90"
          style={{
            borderWidth: 'var(--border-w-strong)',
            borderStyle: 'dashed',
            borderColor: isDragging ? 'var(--accent)' : 'var(--border-color)',
          }}
        >
          <input
            id="gpx-file-input"
            ref={fileInputRef}
            type="file"
            accept=".gpx,application/gpx+xml,text/xml"
            onChange={handleFileChange}
            className="hidden"
          />

          <div className="w-14 h-14 rounded-[var(--radius-lg)] bg-[var(--accent)] text-white flex items-center justify-center shadow-lg mb-3">
            <Upload className="w-7 h-7 stroke-[2.5]" />
          </div>

          <h2 className="text-xl font-extrabold tracking-tight font-[family-name:var(--font-display)]">Load a GPX Trail</h2>
          <p className="mt-1 text-xs sm:text-sm font-medium text-[var(--text-secondary)] max-w-xs">
            Tap to select or drag & drop any <strong className="text-[var(--accent)]">.gpx</strong> hiking file
          </p>

          <button
            id="browse-gpx-btn"
            type="button"
            className="mt-4 px-5 py-2.5 rounded-[var(--radius-md)] bg-[var(--accent)] hover:opacity-90 text-white font-extrabold text-sm uppercase tracking-wider shadow-md transition"
          >
            Choose File
          </button>
        </div>

        {/* Free Hike: no planned route, just record wherever you go */}
        {onStartFreeHike && (
          <button
            id="start-free-hike-btn"
            type="button"
            onClick={onStartFreeHike}
            className="w-full p-4 rounded-[var(--radius-lg)] border flex items-center gap-3 text-left transition active:scale-[0.99] bg-[var(--surface)] border-[var(--border-color)] hover:border-[var(--accent-2)]"
          >
            <div className="w-11 h-11 rounded-[var(--radius-md)] bg-[var(--accent-2)] text-white flex items-center justify-center shrink-0 shadow-md">
              <Footprints className="w-6 h-6" />
            </div>
            <div>
              <div className="font-extrabold text-sm">Start a Free Hike</div>
              <div className="text-xs text-[var(--text-secondary)]">No trail needed — just track where you go, then save or export it</div>
            </div>
          </button>
        )}

        {/* Saved Trails Section */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-extrabold uppercase tracking-wider text-[var(--text-secondary)] flex items-center gap-1.5">
              <Layers className="w-4 h-4" />
              Saved Trails ({savedTrails.length})
            </h3>
          </div>

          {savedTrails.length === 0 ? (
            <div
              className="p-6 rounded-[var(--radius-lg)] border text-center bg-[var(--surface)] border-[var(--border-color)]"
            >
              <MapPin className="w-8 h-8 mx-auto text-[var(--text-secondary)] mb-2" />
              <p className="font-bold text-sm">No saved trails yet</p>
              <p className="text-xs text-[var(--text-secondary)] mt-1">
                Upload a GPX file above or select one of the built-in demo trails below.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {savedTrails.map(trail => (
                <div
                  key={trail.id}
                  id={`saved-trail-card-${trail.id}`}
                  className="p-4 rounded-[var(--radius-lg)] transition shadow-sm flex flex-col justify-between gap-3 bg-[var(--surface)] hover:border-[var(--accent)]"
                  style={{ border: 'var(--border-w) solid var(--border-color)' }}
                >
                  <div>
                    <h4 className="text-lg font-extrabold tracking-tight leading-tight line-clamp-1 font-[family-name:var(--font-display)]">
                      {trail.name}
                    </h4>
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-bold text-[var(--text-secondary)]">
                      <span className="text-[var(--accent)] font-extrabold">
                        {formatDist(trail.totalDistance)}
                      </span>
                      {trail.elevationGain !== undefined && (
                        <span>+{formatElevation(trail.elevationGain, units)} gain</span>
                      )}
                      {trail.elevationLoss !== undefined && (
                        <span>-{formatElevation(trail.elevationLoss, units)} loss</span>
                      )}
                      {trail.waypoints && trail.waypoints.length > 0 && (
                        <span className="text-[var(--info)] font-bold">{trail.waypoints.length} waypoints</span>
                      )}
                      <span>{trail.points.length} track points</span>
                      <span>{trail.turnCues.length} turn cues</span>
                    </div>
                  </div>

                  <div
                    className="flex items-center gap-2 pt-1"
                    style={{ borderTop: 'var(--border-w) solid var(--border-color)' }}
                  >
                    <button
                      id={`start-nav-btn-${trail.id}`}
                      onClick={() => onSelectTrail(trail)}
                      className="flex-1 py-3 px-4 rounded-[var(--radius-md)] bg-[var(--accent)] hover:opacity-90 active:scale-98 text-white font-extrabold text-sm uppercase tracking-wider flex items-center justify-center gap-2 shadow-md transition"
                    >
                      <Navigation className="w-4 h-4" />
                      Select This Route
                    </button>
                    {onReverseTrail && (
                      <button
                        id={`reverse-trail-btn-${trail.id}`}
                        onClick={() => onReverseTrail(trail)}
                        className="py-3 px-3 rounded-[var(--radius-md)] border border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--info)] hover:border-[var(--info)] active:scale-95 transition flex items-center justify-center gap-1.5 font-extrabold text-xs uppercase tracking-wider whitespace-nowrap"
                        title="Swap which end of the trail you start from"
                        aria-label="Reverse trail direction"
                      >
                        <Repeat className="w-4 h-4 shrink-0" />
                        Reverse
                      </button>
                    )}
                    <button
                      id={`delete-trail-btn-${trail.id}`}
                      onClick={() => onDeleteTrail(trail.id)}
                      className="p-3 rounded-[var(--radius-md)] border border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--danger)] active:scale-95 transition"
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
          <h3 className="text-sm font-extrabold uppercase tracking-wider text-[var(--text-secondary)] flex items-center gap-1.5 mb-2">
            <Sparkles className="w-4 h-4 text-[var(--accent)]" />
            Quick Demo Trails (No File Needed)
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {sampleTrails.map(sample => (
              <button
                key={sample.id}
                id={`load-sample-${sample.id}`}
                onClick={() => handleLoadSample(sample)}
                className="p-3 rounded-[var(--radius-md)] border text-left transition active:scale-98 bg-[var(--surface)] border-[var(--border-color)] hover:border-[var(--accent)]"
              >
                <div className="font-extrabold text-sm line-clamp-1">{sample.name}</div>
                <div className="text-xs font-bold text-[var(--accent)] mt-0.5">
                  {formatDist(sample.totalDistance)} · +{formatElevation(sample.elevationGain ?? 0, units)}
                </div>
                <div className="text-[11px] text-[var(--text-secondary)] mt-1 flex items-center gap-1">
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
