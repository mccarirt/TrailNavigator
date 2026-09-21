import React from 'react';
import { AppSettings } from '../types';
import { X, Sliders, Volume2, Vibrate, Sun, Compass } from 'lucide-react';

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

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-4 select-none">
      <div
        id="settings-modal-dialog"
        className={`w-full max-w-md rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl border transition-colors ${
          isDayMode
            ? 'bg-white border-slate-300 text-slate-900'
            : 'bg-slate-900 border-slate-800 text-white'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-700/50">
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-emerald-500" />
            <h2 className="text-xl font-black tracking-tight">Navigation Settings</h2>
          </div>
          <button
            id="close-settings-btn"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Settings Form */}
        <div className="py-4 space-y-5">
          {/* Off-Trail Threshold Slider */}
          <div>
            <div className="flex items-center justify-between">
              <label className="text-sm font-black uppercase tracking-wider">
                Off-Trail Alert Distance
              </label>
              <span className="text-lg font-black text-emerald-500">
                {settings.offTrailThreshold} meters
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Triggers warning banner, beep, and vibration if further than this for 3 fixes in a row.
            </p>
            <div className="mt-3 flex items-center gap-3">
              <span className="text-xs font-bold text-slate-400">15m</span>
              <input
                id="off-trail-threshold-slider"
                type="range"
                min="15"
                max="80"
                step="5"
                value={settings.offTrailThreshold}
                onChange={e =>
                  onUpdateSettings({
                    ...settings,
                    offTrailThreshold: parseInt(e.target.value, 10),
                    // clear threshold automatically adjusts to ~65% of alert threshold (e.g. 20m for 30m)
                    offTrailClearThreshold: Math.max(10, Math.round(parseInt(e.target.value, 10) * 0.65)),
                  })
                }
                className="w-full accent-emerald-500 h-2 bg-slate-700 rounded-lg cursor-pointer"
              />
              <span className="text-xs font-bold text-slate-400">80m</span>
            </div>
          </div>

          {/* Lookahead Distance for Arrow */}
          <div>
            <div className="flex items-center justify-between">
              <label className="text-sm font-black uppercase tracking-wider flex items-center gap-1.5">
                <Compass className="w-4 h-4 text-sky-400" />
                Target Lookahead Distance
              </label>
              <span className="text-base font-black text-sky-400">
                {settings.lookAheadDistance} m
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Distance ahead along trail that compass arrow aims toward.
            </p>
            <div className="mt-2.5 flex gap-2">
              {[25, 40, 60].map(dist => (
                <button
                  key={dist}
                  onClick={() => onUpdateSettings({ ...settings, lookAheadDistance: dist })}
                  className={`flex-1 py-2 rounded-xl text-xs font-black uppercase transition border ${
                    settings.lookAheadDistance === dist
                      ? 'bg-sky-600 text-white border-sky-400'
                      : isDayMode
                      ? 'bg-slate-100 border-slate-300 text-slate-700'
                      : 'bg-slate-800 border-slate-700 text-slate-300'
                  }`}
                >
                  {dist} m
                </button>
              ))}
            </div>
          </div>

          {/* Sound & Vibration Toggles */}
          <div className="space-y-3 pt-2 border-t border-slate-700/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Volume2 className="w-4 h-4 text-emerald-500" />
                <div>
                  <div className="text-sm font-bold">Audio Alerts & Chimes</div>
                  <div className="text-xs text-slate-400">Beep on off-trail, chime on turn cues</div>
                </div>
              </div>
              <input
                id="toggle-beep-setting"
                type="checkbox"
                checked={settings.beepEnabled}
                onChange={e => onUpdateSettings({ ...settings, beepEnabled: e.target.checked })}
                className="w-6 h-6 accent-emerald-500 rounded cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Vibrate className="w-4 h-4 text-emerald-500" />
                <div>
                  <div className="text-sm font-bold">Device Vibration</div>
                  <div className="text-xs text-slate-400">Haptic vibration for turns & warnings</div>
                </div>
              </div>
              <input
                id="toggle-vibrate-setting"
                type="checkbox"
                checked={settings.vibrateEnabled}
                onChange={e => onUpdateSettings({ ...settings, vibrateEnabled: e.target.checked })}
                className="w-6 h-6 accent-emerald-500 rounded cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sun className="w-4 h-4 text-amber-400" />
                <div>
                  <div className="text-sm font-bold">Sunlight High-Contrast Theme</div>
                  <div className="text-xs text-slate-400">Bright Daylight mode vs Dark Slate</div>
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
                className={`px-3 py-1.5 rounded-xl font-black text-xs uppercase border transition ${
                  isDayMode
                    ? 'bg-amber-500 text-black border-amber-400'
                    : 'bg-slate-800 text-slate-200 border-slate-700'
                }`}
              >
                {isDayMode ? 'Day Mode' : 'Dark Slate'}
              </button>
            </div>
          </div>
        </div>

        {/* Done Button */}
        <button
          id="save-settings-btn"
          onClick={onClose}
          className="mt-2 w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:scale-98 font-black text-sm uppercase tracking-wider text-white shadow-lg transition"
        >
          Save & Close
        </button>
      </div>
    </div>
  );
};
