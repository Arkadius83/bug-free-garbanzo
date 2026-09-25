import { useEffect, useState } from "react";
import type { DistroKidConnection } from "../../../electron/shared/contracts";
import { Button } from "../../ui/Button";
import { StatusBadge } from "../../ui/StatusBadge";
import { SectionCard } from "../../ui/SectionCard";

interface Props {
  releaseId: string | null;
  title: string;
}

function sanitizeError(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : fallback;
  return message.replace(/^Error invoking remote method '[^']+': Error: /, "");
}

export function DistroKidDistributionCard({ releaseId, title }: Props) {
  const [connection, setConnection] = useState<DistroKidConnection | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    const studio = window.studio;
    if (studio && typeof studio.getDistroKidConnection === "function") void studio.getDistroKidConnection().then(value => { if (live) setConnection(value); }).catch(() => {});
    return () => { live = false; };
  }, []);

  const sessionOpen = connection?.connected === true;

  async function run(action: () => Promise<void>, fallback: string) {
    if (!window.studio) return;
    setBusy(true);
    setMessage("");
    try { await action(); }
    catch (error) { setMessage(sanitizeError(error, fallback)); }
    finally { setBusy(false); }
  }

  async function openUpload() {
    if (!releaseId || typeof window.studio?.openDistroKidUpload !== "function") return;
    await run(async () => {
      const session = await window.studio!.openDistroKidUpload(releaseId);
      setConnection(await window.studio!.getDistroKidConnection());
      setMessage(`Upload window open for "${session.payload.songTitle}". Sign in if needed, then fill and review manually.`);
    }, "Could not open the DistroKid upload window");
  }

  async function fillForm() {
    if (typeof window.studio?.fillDistroKidForm !== "function") return;
    await run(async () => {
      const result = await window.studio!.fillDistroKidForm();
      setMessage(result.message);
    }, "Could not fill the DistroKid form");
  }

  async function closeSession() {
    if (typeof window.studio?.closeDistroKidSession !== "function") return;
    await run(async () => {
      setConnection(await window.studio!.closeDistroKidSession());
      setMessage("DistroKid session closed.");
    }, "Could not close the DistroKid session");
  }

  return <SectionCard title="DistroKid" meta={<StatusBadge label={sessionOpen ? "Window open" : "Not open"} tone={sessionOpen ? "success" : "neutral"} />} className="foundation-card foundation-distrokid">
    <p className="foundation-empty">Browser-assisted upload. MAM prepares the form data — you review and submit on DistroKid yourself.</p>
    <div className="foundation-actions">
      <Button variant="secondary" disabled={!releaseId || busy} onClick={() => void openUpload()}>{sessionOpen ? "DistroKid window →" : "Open DistroKid upload"}</Button>
      <Button variant="secondary" disabled={!sessionOpen || busy} onClick={() => void fillForm()}>Fill form from MAM</Button>
      {sessionOpen && <Button variant="ghost" disabled={busy} onClick={() => void closeSession()}>Close session</Button>}
    </div>
    {!releaseId && <p className="foundation-empty">Save the release first to prepare its DistroKid form.</p>}
    <p className="foundation-feedback" role="status">{message}</p>
  </SectionCard>;
}
