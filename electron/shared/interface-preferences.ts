export interface InterfacePreferences { soundsEnabled: boolean; soundVolume: number; reducedMotion: boolean; }
export const defaultInterfacePreferences: InterfacePreferences = { soundsEnabled: false, soundVolume: 0.12, reducedMotion: false };
export function normalizeInterfacePreferences(value: unknown): InterfacePreferences {
  const input = value && typeof value === "object" ? value as Partial<InterfacePreferences> : {};
  return { soundsEnabled: input.soundsEnabled === true, soundVolume: typeof input.soundVolume === "number" && Number.isFinite(input.soundVolume) ? Math.min(1, Math.max(0, input.soundVolume)) : 0.12, reducedMotion: input.reducedMotion === true };
}
