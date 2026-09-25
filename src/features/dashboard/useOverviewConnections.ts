import { useEffect, useState } from "react";
import type { DistroKidConnection, TikTokConnection } from "../../../electron/shared/contracts";

/** Refresh on entry/focus, using the same trusted connection source as Settings. */
export function useOverviewConnections() {
  const [tikTok, setTikTok] = useState<TikTokConnection | null>(null);
  const [distroKid, setDistroKid] = useState<DistroKidConnection | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  useEffect(() => {
    let disposed = false;
    let sequence = 0;
    const refresh = async () => {
      const current = ++sequence;
      const studio = window.studio;
      if (studio?.getTikTokConnection) {
        try {
          const result = await studio.getTikTokConnection();
          if (!disposed && current === sequence) { setTikTok(result); setConnectionError(null); }
        } catch {
          if (!disposed && current === sequence) { setTikTok(null); setConnectionError("Connection status could not be refreshed"); }
        }
      }
      if (studio?.getDistroKidConnection) {
        try {
          const result = await studio.getDistroKidConnection();
          if (!disposed && current === sequence) setDistroKid(result);
        } catch {
          if (!disposed && current === sequence) setDistroKid(null);
        }
      }
    };
    void refresh();
    window.addEventListener("focus", refresh);
    return () => { disposed = true; window.removeEventListener("focus", refresh); };
  }, []);
  return { tikTok, distroKid, connectionError };
}
