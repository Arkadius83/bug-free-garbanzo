import type { InterfacePreferences } from "../../electron/shared/interface-preferences";
import { defaultInterfacePreferences } from "../../electron/shared/interface-preferences";

export type InterfaceSound = "success" | "error" | "notification" | "completion";
let preferences = defaultInterfacePreferences;
let playing: HTMLAudioElement | null = null;
let lastPlayed = -Infinity;
export function configureInterfaceSounds(next: InterfacePreferences) { preferences = next; if (!next.soundsEnabled && playing) { playing.pause(); playing = null; } }
export function playInterfaceSound(kind: InterfaceSound): void {
  if (!preferences.soundsEnabled || preferences.soundVolume === 0 || Date.now() - lastPlayed < 900) return;
  lastPlayed = Date.now();
  try {
    playing?.pause();
    const audio = new Audio(new URL(`../../assets/sounds/${kind}.wav`, import.meta.url).href);
    audio.volume = preferences.soundVolume;
    playing = audio;
    void audio.play().catch(() => { if (playing === audio) playing = null; });
    audio.onended = () => { if (playing === audio) playing = null; };
  } catch { playing = null; }
}
