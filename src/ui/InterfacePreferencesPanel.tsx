import { Toggle } from "./Toggle";
import { useInterfacePreferences } from "./useInterfacePreferences";

export function InterfacePreferencesPanel() {
  const { preferences, update, error } = useInterfacePreferences();
  return <section className="settings-section"><h2>Interface</h2><div className="settings-row"><Toggle label="Interface sounds" checked={preferences.soundsEnabled} onChange={soundsEnabled => void update({ ...preferences, soundsEnabled })} /></div><label className="settings-label">Interface sound volume <span>{Math.round(preferences.soundVolume * 100)}%</span><input aria-label="Interface sound volume" type="range" min="0" max="1" step="0.01" value={preferences.soundVolume} onChange={event => void update({ ...preferences, soundVolume: Number(event.target.value) })} /></label><div className="settings-row"><Toggle label="Reduced motion" checked={preferences.reducedMotion} onChange={reducedMotion => void update({ ...preferences, reducedMotion })} /></div>{error && <p role="alert">{error}</p>}</section>;
}
