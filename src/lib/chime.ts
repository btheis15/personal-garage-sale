"use client";

/**
 * A soft two-note chime when a sale turns Paid (from the Om Threads Sell app). Phones only allow
 * sound after a tap, so the first tap anywhere unlocks it.
 */
let audio: AudioContext | null = null;

function unlock() {
  try {
    audio ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (audio.state === "suspended") audio.resume();
  } catch {
    /* no sound: fine */
  }
}

if (typeof window !== "undefined") {
  document.addEventListener("touchend", unlock, { passive: true });
  document.addEventListener("click", unlock);
}

export function chime() {
  try {
    if (!audio) return;
    if (audio.state === "suspended") audio.resume();
    const t = audio.currentTime;
    [880, 1320].forEach((f, i) => {
      const osc = audio!.createOscillator();
      const gain = audio!.createGain();
      const at = t + i * 0.12;
      osc.type = "sine";
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.25, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.35);
      osc.connect(gain).connect(audio!.destination);
      osc.start(at);
      osc.stop(at + 0.4);
    });
  } catch {
    /* no sound: fine */
  }
}
