import React from 'react';
import { AppSettings } from '../types';
import { X, Sliders, Volume2, Vibrate, Sun, Compass, Ruler } from 'lucide-react';
import { METERS_PER_FOOT, formatShortDistance } from '../utils/units';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onUpdateSettings: (newSettings: AppSettings) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
}) => {
  if (!isOpen) return null;

  const isDayMode = settings.highContrastMode === 'sunlight-bright';
  const units = settings.units ?? 'imperial';
  const isImperial = units === 'imperial';

  // Off-trail slider: stored in meters, displayed in the chosen unit
  const thresholdSlider = isImperial
    ? {
        min: 50,
        max: 250,
        step: 25,
        value: Math.round(settings.offTrailThreshold / METERS_PER_FOOT / 25) * 25,
        minLabel: '50 ft',
        maxLabel: '250 ft',
        toMeters: (v: number) => v * METERS_PER_FOOT,
      }
    : {
        min: 15,
        max: 80,
        step: 5,
        value: Math.round(settings.offTrailThreshold / 5) * 5,
        minLabel: '15 m',
        maxLabel: '80 m',
        toMeters: (v: number) => v,
      };

  return (
    <div className="fixed inset-0 z-[1000] flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-4 select-none">
      <div
        id="settings-modal-dialog"
        className="w-full max-w-md rounded-t-[var(--radius-lg)] sm:rounded-[var(--radius-lg)] p-6 shadow-2xl bg-[var(--surface)] text-[var(--text)]"
        style={{ border: 'var(--border-w-strong) solid var(--border-color)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4" style={{ borderBottom: '1px solid var(--border-color)' }}>
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-[var(--accent-2)]" />
            <h2 className="text-xl font-extrabold tracking-tight font-[family-name:var(--font-display)]">Navigation Settings</h2>
          </div>
          <button
            id="close-settings-btn"
            onClick={onClose}
            className="p-2 rounded-[var(--radius-sm)] text-[var(--text-secondary)] hover:opacity-70 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Settings Form */}
        <div className="py-4 space-y-5">
          {/* Units */}
          <div>
            <div className="flex items-center justify-between">
              <label className="text-sm font-extrabold uppercase tracking-wider flex items-center gap-1.5">
                <Ruler className="w-4 h-4 text-[var(--accent-2)]" />
                Units
              </label>
            </div>
            <div className="mt-2.5 flex gap-2">
              {([
                ['imperial', 'Miles & feet'],
                ['metric', 'Kilometers & meters'],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  id={`units-${value}-btn`}
                  onClick={() => onUpdateSettings({ ...settings, units: value })}
                  className="flex-1 py-2 rounded-[var(--radius-sm)] text-xs font-extrabold transition border"
                  style={
                    units === value
                      ? { background: 'var(--accent-2)', color: '#fff', borderColor: 'var(--accent-2)' }
                      : { background: 'var(--surface-2)', color: 'var(--text)', borderColor: 'var(--border-color)' }
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Off-Trail Threshold Slider */}
          <div>
            <div className="flex items-center justify-between">
              <label className="text-sm font-extrabold uppercase tracking-wider">
                Off-Trail Alert Distance
              </label>
              <span className="text-lg font-extrabold text-[var(--accent-2)]">
                {formatShortDistance(settings.offTrailThreshold, units)}
              </span>
            </div>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              Triggers warning banner, beep, and vibration if further than this for 3 fixes in a row.
            </p>
            <div className="mt-3 flex items-center gap-3">
              <span className="text-xs font-bold text-[var(--text-secondary)]">{thresholdSlider.minLabel}</span>
              <input
                id="off-trail-threshold-slider"
                type="range"
                min={thresholdSlider.min}
                max={thresholdSlider.max}
                step={thresholdSlider.step}
                value={thresholdSlider.value}
                onChange={e => {
                  const meters = thresholdSlider.toMeters(parseInt(e.target.value, 10));
                  onUpdateSettings({
                    ...settings,
                    offTrailThreshold: meters,
                    // clear threshold automatically adjusts to ~65% of alert threshold (e.g. 20 m for 30 m)
                    offTrailClearThreshold: Math.max(10, Math.round(meters * 0.65)),
                  });
                }}
                className="w-full accent-[var(--accent-2)] h-2 rounded-lg cursor-pointer"
                style={{ background: 'var(--border-color)' }}
              />
              <span className="text-xs font-bold text-[var(--text-secondary)]">{thresholdSlider.maxLabel}</span>
            </div>
          </div>

          {/* Lookahead Distance for Arrow */}
          <div>
            <div className="flex items-center justify-between">
              <label className="text-sm font-extrabold uppercase tracking-wider flex items-center gap-1.5">
                <Compass className="w-4 h-4 text-[var(--info)]" />
                Target Lookahead Distance
              </label>
              <span className="text-base font-extrabold text-[var(--info)]">
                {formatShortDistance(settings.lookAheadDistance, units)}
              </span>
            </div>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              Distance ahead along trail that compass arrow aims toward.
            </p>
            <div className="mt-2.5 flex gap-2">
              {[25, 40, 60].map(dist => (
                <button
                  key={dist}
                  onClick={() => onUpdateSettings({ ...settings, lookAheadDistance: dist })}
                  className="flex-1 py-2 rounded-[var(--radius-sm)] text-xs font-extrabold uppercase transition border"
                  style={
                    settings.lookAheadDistance === dist
                      ? { background: 'var(--info)', color: '#fff', borderColor: 'var(--info)' }
                      : { background: 'var(--surface-2)', color: 'var(--text)', borderColor: 'var(--border-color)' }
                  }
                >
                  {formatShortDistance(dist, units)}
                </button>
              ))}
            </div>
          </div>

          {/* Sound & Vibration Toggles */}
          <div className="space-y-3 pt-2" style={{ borderTop: '1px solid var(--border-color)' }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Volume2 className="w-4 h-4 text-[var(--accent-2)]" />
                <div>
                  <div className="text-sm font-bold">Audio Alerts & Chimes</div>
                  <div className="text-xs text-[var(--text-secondary)]">Beep on off-trail, chime on turn cues</div>
                </div>
              </div>
              <input
                id="toggle-beep-setting"
                type="checkbox"
                checked={settings.beepEnabled}
                onChange={e => onUpdateSettings({ ...settings, beepEnabled: e.target.checked })}
                className="w-6 h-6 accent-[var(--accent-2)] rounded cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Vibrate className="w-4 h-4 text-[var(--accent-2)]" />
                <div>
                  <div className="text-sm font-bold">Device Vibration</div>
                  <div className="text-xs text-[var(--text-secondary)]">Haptic vibration for turns & warnings</div>
                </div>
              </div>
              <input
                id="toggle-vibrate-setting"
                type="checkbox"
                checked={settings.vibrateEnabled}
                onChange={e => onUpdateSettings({ ...settings, vibrateEnabled: e.target.checked })}
                className="w-6 h-6 accent-[var(--accent-2)] rounded cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sun className="w-4 h-4 text-[var(--accent)]" />
                <div>
                  <div className="text-sm font-bold">Theme</div>
                  <div className="text-xs text-[var(--text-secondary)]">Sunlit Trail (day) vs Sport Bold (night)</div>
                </div>
              </div>
              <button
                id="toggle-high-contrast-mode"
                onClick={() =>
                  onUpdateSettings({
                    ...settings,
                    highContrastMode: isDayMode ? 'dark-slate' : 'sunlight-bright',
                  })
                }
                className="px-3 py-1.5 rounded-[var(--radius-sm)] font-extrabold text-xs uppercase border transition"
                style={{ background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)' }}
              >
                {isDayMode ? 'Sunlit Trail' : 'Sport Bold'}
              </button>
            </div>
          </div>
        </div>

        {/* Done Button */}
        <button
          id="save-settings-btn"
          onClick={onClose}
          className="mt-2 w-full py-3.5 rounded-[var(--radius-lg)] active:scale-98 font-extrabold text-sm uppercase tracking-wider text-white shadow-lg transition hover:opacity-90"
          style={{ background: 'var(--accent-2)' }}
        >
          Save & Close
        </button>
      </div>
    </div>
  );
};
