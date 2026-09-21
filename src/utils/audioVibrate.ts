let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioCtxClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioCtxClass) {
      audioCtx = new AudioCtxClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

/**
 * Initializes and unlocks AudioContext on first user touch / click
 */
export function unlockAudio() {
  const ctx = getAudioContext();
  if (ctx && ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
}

/**
 * Plays an urgent high-contrast dual-tone beep for off-trail alert
 */
export function playOffTrailBeep() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gainNode = ctx.createGain();

    const now = ctx.currentTime;
    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(880, now); // A5
    osc1.frequency.setValueAtTime(660, now + 0.15); // E5

    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(440, now);
    osc2.frequency.setValueAtTime(330, now + 0.15);

    gainNode.gain.setValueAtTime(0.3, now);
    gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.35);

    osc1.connect(gainNode);
    osc2.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.35);
    osc2.stop(now + 0.35);
  } catch (err) {
    console.warn('Could not play off-trail beep:', err);
  }
}

/**
 * Plays a pleasant turn guidance chime
 */
export function playTurnChime() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(587.33, now); // D5
    osc.frequency.setValueAtTime(880, now + 0.1); // A5

    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.3);
  } catch (err) {
    console.warn('Could not play turn chime:', err);
  }
}

/**
 * Vibrates the device using navigator.vibrate with safe feature check
 */
export function triggerVibration(pattern: number | number[]) {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(pattern);
    }
  } catch (e) {
    console.warn('Vibration not permitted or unsupported:', e);
  }
}

/**
 * Specific vibration pattern for Off-Trail warning
 */
export function vibrateOffTrail() {
  // Urgent burst
  triggerVibration([300, 150, 300, 150, 500]);
}

/**
 * Celebratory arrival vibration
 */
export function vibrateArrival() {
  triggerVibration([200, 100, 200, 100, 450]);
}

/**
 * Celebratory arrival fanfare sound
 */
export function playArrivalFanfare() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      const noteStart = now + idx * 0.12;
      osc.frequency.setValueAtTime(freq, noteStart);
      gain.gain.setValueAtTime(0.25, noteStart);
      gain.gain.exponentialRampToValueAtTime(0.01, noteStart + 0.32);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(noteStart);
      osc.stop(noteStart + 0.32);
    });
  } catch (err) {
    console.warn('Could not play arrival fanfare:', err);
  }
}

/**
 * Distinct vibration patterns for Turn cues (30m away)
 */
export function vibrateTurnCue(turnType: string) {
  if (turnType.includes('left')) {
    // Left turn: Short tap then longer buzz (tap-BUZZ)
    triggerVibration([120, 90, 380]);
  } else if (turnType.includes('right')) {
    // Right turn: Longer buzz then short tap (BUZZ-tap)
    triggerVibration([380, 90, 120]);
  } else if (turnType === 'u-turn') {
    // U-turn: Triple rapid buzz
    triggerVibration([180, 100, 180, 100, 450]);
  } else {
    // Standard prompt
    triggerVibration([200]);
  }
}
