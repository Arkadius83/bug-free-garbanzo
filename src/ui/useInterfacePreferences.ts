import { useEffect, useState } from "react";
import { defaultInterfacePreferences, normalizeInterfacePreferences } from "../../electron/shared/interface-preferences";
import type { InterfacePreferences } from "../../electron/shared/interface-preferences";
import { configureInterfaceSounds } from "./interfaceSoundService";

const listeners = new Set<(value: InterfacePreferences) => void>();
let current = defaultInterfacePreferences;
function apply(value: InterfacePreferences) {
  current = normalizeInterfacePreferences(value);
  document.documentElement.dataset.reducedMotion = String(current.reducedMotion);
  configureInterfaceSounds(current);
  listeners.forEach(listener => listener(current));
}
export function useInterfacePreferences() {
  const [preferences, setPreferences] = useState(current);
  const [error, setError] = useState("");
  useEffect(() => {
    listeners.add(setPreferences);
    void window.studio?.getInterfacePreferences().then(apply).catch(() => setError("Interface preferences could not be loaded."));
    return () => { listeners.delete(setPreferences); };
  }, []);
  async function update(next: InterfacePreferences) {
    try { if (!window.studio) throw new Error("Application connection unavailable"); apply(await window.studio.saveInterfacePreferences(normalizeInterfacePreferences(next))); setError(""); }
    catch { setError("Interface preferences could not be saved. Please try again."); }
  }
  return { preferences, update, error };
}
