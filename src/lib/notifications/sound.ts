// Shared notification + chat sound helper. Used by both NotificationBell
// and ChatBell so the two have a consistent sound system + a single
// preference key.
//
// Default: ON. Disable from /cabinet/setari (clients) or
// /dashboard/setari (partners) — both pages render NotificationSoundToggle.

const SOUND_PREF_KEY = "epetrecere.notification-sound-enabled";

/** Returns true if sound is enabled. Defaults to true on first visit. */
export function isSoundEnabled(): boolean {
  if (typeof window === "undefined") return true;
  const v = localStorage.getItem(SOUND_PREF_KEY);
  return v === null ? true : v === "1";
}

export function setSoundEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(SOUND_PREF_KEY, enabled ? "1" : "0");
}

/** Internal: play a two-note chime with the WebAudio API. */
function playChime(opts: {
  startFreq: number;
  endFreq: number;
  duration: number;
  type?: OscillatorType;
}): void {
  if (typeof window === "undefined") return;
  if (!isSoundEnabled()) return;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = opts.type ?? "sine";
    osc.frequency.setValueAtTime(opts.startFreq, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(
      opts.endFreq,
      ctx.currentTime + opts.duration * 0.45,
    );
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(
      0.001,
      ctx.currentTime + opts.duration,
    );
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + opts.duration);
  } catch {
    /* silent — autoplay blocked or audio failed */
  }
}

/** "Notification arrived" — bright two-note chime (descending). */
export function playNotificationChime(): void {
  playChime({ startFreq: 880, endFreq: 660, duration: 0.4 });
}

/** "Chat message arrived" — softer ascending chime to distinguish from
 *  the notification chime. Same WebAudio path so the same preference
 *  toggle controls both. */
export function playMessageChime(): void {
  playChime({ startFreq: 520, endFreq: 720, duration: 0.35 });
}
