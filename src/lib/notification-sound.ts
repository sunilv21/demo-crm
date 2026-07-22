// Synthesized notification chimes (Web Audio API) — no audio assets to ship.
// Best-effort only: silently no-ops if AudioContext is unavailable (SSR,
// unsupported browser) or blocked (no user gesture yet).

let sharedContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext || (window as any).webkitAudioContext;
  if (!Ctor) return null;
  if (!sharedContext) {
    sharedContext = new Ctor();
  }
  if (sharedContext.state === 'suspended') {
    sharedContext.resume().catch(() => {});
  }
  return sharedContext;
}

type Note = { freq: number; start: number; duration: number; gain?: number };

function playNotes(notes: Note[]) {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    for (const note of notes) {
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = note.freq;

      const startAt = now + note.start;
      const endAt = startAt + note.duration;
      const peakGain = note.gain ?? 0.2;

      gainNode.gain.setValueAtTime(0, startAt);
      gainNode.gain.linearRampToValueAtTime(peakGain, startAt + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.001, endAt);

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      oscillator.start(startAt);
      oscillator.stop(endAt + 0.02);
    }
  } catch {
    // best-effort — never let a chime failure break the caller
  }
}

/** Short two-note ascending chime for a newly arrived email. */
export function playNewMailChime() {
  playNotes([
    { freq: 740, start: 0, duration: 0.12 },
    { freq: 988, start: 0.1, duration: 0.16 },
  ]);
}

/** Distinct three-note rising chime for a completed campaign. */
export function playCampaignCompleteChime() {
  playNotes([
    { freq: 523, start: 0, duration: 0.12 },
    { freq: 659, start: 0.12, duration: 0.12 },
    { freq: 880, start: 0.24, duration: 0.22 },
  ]);
}

/** Descending two-note warning tone for a mailbox going into an error state. */
export function playMailboxAlertChime() {
  playNotes([
    { freq: 587, start: 0, duration: 0.14, gain: 0.22 },
    { freq: 392, start: 0.14, duration: 0.24, gain: 0.22 },
  ]);
}
