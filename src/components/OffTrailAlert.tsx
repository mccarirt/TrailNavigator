import React from 'react';
import { AlertOctagon, ArrowUpRight, Volume2, VolumeX, X } from 'lucide-react';

interface OffTrailAlertProps {
  isOpen: boolean;
  distanceOffTrail: number;
  bearingToTrail: number;
  heading: number;
  onDismiss: () => void;
  isAudioMuted: boolean;
  onToggleMute: () => void;
}

export const OffTrailAlert: React.FC<OffTrailAlertProps> = ({
  isOpen,
  distanceOffTrail,
  bearingToTrail,
  heading,
  onDismiss,
  isAudioMuted,
  onToggleMute,
}) => {
  if (!isOpen) return null;

  // Arrow angle pointing back to nearest trail point relative to user's heading
  const relativeAngle = ((bearingToTrail - heading + 360) % 360);

  return (
    <div
      id="off-trail-alert-overlay"
      role="alert"
      className="fixed top-0 left-0 right-0 z-[500] bg-rose-600 text-white shadow-2xl border-b-2 border-rose-400 select-none animate-in slide-in-from-top duration-300 pointer-events-auto"
    >
      <div className="max-w-4xl mx-auto px-4 py-2.5 sm:py-3 flex items-center justify-between gap-3">
        {/* Left: Alert icon & Direction arrow pointing back to nearest trail point */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="p-1.5 sm:p-2 rounded-xl bg-black/25 flex items-center justify-center">
            <AlertOctagon className="w-5 h-5 sm:w-6 sm:h-6 text-white stroke-[2.5]" />
          </div>
          <div
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-full border-2 border-white/80 bg-black/30 flex items-center justify-center shadow-md shrink-0"
            title={`Bearing to trail: ${Math.round(bearingToTrail)}°`}
          >
            <div
              className="transition-transform duration-300 ease-out"
              style={{ transform: `rotate(${relativeAngle}deg)` }}
            >
              <ArrowUpRight className="w-5 h-5 sm:w-6 sm:h-6 text-white -rotate-45 stroke-[3]" />
            </div>
          </div>
        </div>

        {/* Center: Message */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1
              id="off-trail-banner-text"
              className="text-sm sm:text-base font-black uppercase tracking-tight truncate drop-shadow-sm"
            >
              OFF TRAIL – {Math.round(distanceOffTrail)} m
            </h1>
            <span className="hidden sm:inline-block text-[10px] font-extrabold uppercase tracking-wider bg-black/30 px-2 py-0.5 rounded-md">
              Walk toward arrow
            </span>
          </div>
          <p className="text-[11px] sm:text-xs text-rose-100 font-semibold truncate">
            Trail is {Math.round(distanceOffTrail)} m away. Walk toward the arrow to re-join.
          </p>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            id="toggle-alert-sound-btn"
            onClick={onToggleMute}
            className="p-2 rounded-xl bg-black/30 hover:bg-black/50 active:scale-95 text-white transition"
            title={isAudioMuted ? 'Unmute alert audio' : 'Mute alert audio'}
            aria-label={isAudioMuted ? 'Unmute alert audio' : 'Mute alert audio'}
          >
            {isAudioMuted ? <VolumeX className="w-4 h-4 sm:w-5 sm:h-5" /> : <Volume2 className="w-4 h-4 sm:w-5 sm:h-5" />}
          </button>
          <button
            id="re-center-trail-btn"
            onClick={onDismiss}
            className="hidden sm:inline-flex px-3 py-1.5 rounded-xl bg-white text-rose-700 hover:bg-rose-50 active:scale-95 font-black text-xs uppercase tracking-wider shadow transition"
          >
            Got it
          </button>
          <button
            id="dismiss-off-trail-btn"
            onClick={onDismiss}
            className="p-2 rounded-xl bg-black/30 hover:bg-black/50 active:scale-95 text-white transition"
            title="Dismiss alert"
            aria-label="Dismiss banner"
          >
            <X className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};
