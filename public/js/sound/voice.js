// The race caller's voice, using the browser's built-in speech synthesis.
// Pace 0-2 (calm, lively, frantic) speeds the voice up as the race builds.
//
// Calls come faster than anyone can say them, so:
//   urgent lines (the start, the bell, the turn for home, the result) cut in straight away
//   other lines wait for the current one to finish, and are dropped once they're stale
const STALE_MS = 2500;
const RATES = [1.1, 1.22, 1.38];
const PITCHES = [1, 1.06, 1.14];

export function createVoice({ onSpeakingChange = () => {} } = {}) {
  const synth = 'speechSynthesis' in window ? window.speechSynthesis : null;
  let enabled = true;
  let voice = null;
  let current = null; // keep a reference so the browser doesn't drop its events
  let waiting = null;

  // Prefer an Australian voice, then a British one, then any English voice
  function chooseVoice() {
    const english = synth.getVoices().filter((v) => /^en/i.test(v.lang));
    voice =
      english.find((v) => /^en[-_]au/i.test(v.lang)) ??
      english.find((v) => /uk english male/i.test(v.name)) ??
      english.find((v) => /^en[-_]gb/i.test(v.lang)) ??
      english.find((v) => v.default) ??
      english[0] ??
      null;
  }

  if (synth) {
    synth.cancel(); // clear anything left over from a previous page
    chooseVoice();
    synth.addEventListener?.('voiceschanged', chooseVoice);
    window.addEventListener('pagehide', () => synth.cancel());
  }

  function speak(text, pace) {
    const line = new SpeechSynthesisUtterance(text);
    line.lang = voice?.lang ?? 'en-AU';
    if (voice) line.voice = voice;
    line.rate = RATES[pace] ?? RATES[0];
    line.pitch = PITCHES[pace] ?? PITCHES[0];
    line.onstart = () => onSpeakingChange(true);
    line.onend = line.onerror = () => {
      if (current !== line) return;
      current = null;
      onSpeakingChange(false);
      const next = waiting;
      waiting = null;
      if (next && performance.now() - next.at < STALE_MS) speak(next.text, next.pace);
    };
    current = line;
    synth.speak(line);
  }

  return {
    supported: Boolean(synth),
    say(text, { urgent = false, pace = 0 } = {}) {
      if (!synth || !enabled) return;
      const spoken = text.replace(/#\d+\s+/g, ''); // say names, not saddle-cloth numbers
      try {
        if (urgent) {
          waiting = null;
          current = null;
          synth.cancel();
          speak(spoken, pace);
        } else if (current) {
          waiting = { text: spoken, pace, at: performance.now() };
        } else {
          speak(spoken, pace);
        }
      } catch (err) {
        // Speech is a nice extra; never let it interrupt the race
        current = null;
        console.warn('Commentary voice failed:', err);
      }
    },
    setEnabled(on) {
      enabled = on;
      if (!on && synth) {
        waiting = null;
        current = null;
        synth.cancel();
        onSpeakingChange(false);
      }
    },
  };
}
