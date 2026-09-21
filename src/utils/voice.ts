// Spoken turn-by-turn / alert announcements via the browser's built-in SpeechSynthesis API.

function getSynth(): SpeechSynthesis | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  return window.speechSynthesis;
}

/**
 * Primes speech playback from a user gesture. Mobile browsers only reliably allow
 * SpeechSynthesis audio that traces back to a real tap, the same autoplay-policy
 * restriction Web Audio has - so this runs alongside unlockAudio() at every point
 * a desk-test or real navigation session can start.
 */
export function unlockSpeech() {
  const synth = getSynth();
  if (!synth) return;
  try {
    const utter = new SpeechSynthesisUtterance(' ');
    utter.volume = 0;
    synth.speak(utter);
  } catch (err) {
    console.warn('Could not unlock speech synthesis:', err);
  }
}

/**
 * Speaks a short announcement, cancelling anything still queued first so cues
 * from rapid-fire events (e.g. a turn right after an off-trail alert) don't
 * stack up and read out of order.
 */
export function speak(text: string) {
  const synth = getSynth();
  if (!synth) return;
  try {
    synth.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 1;
    utter.pitch = 1;
    utter.volume = 1;
    synth.speak(utter);
  } catch (err) {
    console.warn('Could not speak announcement:', err);
  }
}
