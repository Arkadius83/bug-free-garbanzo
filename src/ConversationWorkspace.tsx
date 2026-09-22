import { useMemo, useState } from "react";
import type { ArtistAlias, ReleaseSummary, SystemStatus } from "../electron/shared/contracts";

type ConversationRole = "user" | "assistant";

type ConversationMessage = {
  id: string;
  role: ConversationRole;
  content: string;
  createdAt: string;
};

type ConversationWorkspaceProps = {
  artistId: ArtistAlias;
  artistName: string;
  release?: ReleaseSummary | null;
  status?: SystemStatus | null;
  onOpenRelease: () => void;
};

const starterMessages: ConversationMessage[] = [
  {
    id: "welcome",
    role: "assistant",
    content: "Tell me what you want to create or organize for the current release. I can help shape campaign copy, next actions, artwork briefs, scheduling ideas, and release checklists.",
    createdAt: new Date(0).toISOString()
  }
];

export function ConversationWorkspace({ artistId, artistName, release, status, onOpenRelease }: ConversationWorkspaceProps) {
  const [messages, setMessages] = useState<ConversationMessage[]>(starterMessages);
  const [input, setInput] = useState("");
  const [workStatus, setWorkStatus] = useState("Waiting for your next request.");
  const activeWorkspace = useMemo(() => release ? `${release.title} by ${release.artistName}` : `${artistName} workspace`, [artistName, release]);
  const modelLabel = status?.ollama.available ? `${status.ollama.models.length} local model${status.ollama.models.length === 1 ? "" : "s"} available` : "Local AI is starting";

  function sendMessage() {
    const content = input.trim();
    if (!content) return;
    const now = new Date().toISOString();
    const userMessage: ConversationMessage = { id: `user-${Date.now()}`, role: "user", content, createdAt: now };
    const assistantMessage: ConversationMessage = {
      id: `assistant-${Date.now()}`,
      role: "assistant",
      content: "I have your request. The next step is to connect this workspace to the planning and execution services, but for now this conversation view is the clean front door for AI Studio work.",
      createdAt: new Date(Date.now() + 1).toISOString()
    };
    setMessages((current) => [...current, userMessage, assistantMessage]);
    setInput("");
    setWorkStatus("Request captured. Ready for the next integration step.");
  }

  return (
    <div className="page-content conversation-page">
      <header className="conversation-header">
        <div>
          <span className="eyebrow">AI Studio</span>
          <h1>Conversation workspace.</h1>
          <p>Start with a normal request. The studio keeps the current artist, release, and work status in view while you shape the next move.</p>
        </div>
        <button className="primary" onClick={onOpenRelease}>Open release</button>
      </header>

      <section className="conversation-shell">
        <aside className="conversation-context panel">
          <div className="panel-heading"><span className="eyebrow">Workspace</span><h2>Active context</h2></div>
          <div className="context-stack"><span><small>PROJECT</small><b>{activeWorkspace}</b></span><span><small>ARTIST</small><b>{artistName}</b></span><span><small>ALIAS</small><b>{artistId}</b></span><span><small>AI STATUS</small><b>{modelLabel}</b></span></div>
          <div className="current-work"><small>CURRENT WORK</small><strong>{workStatus}</strong><p>No autonomous action runs from this conversation area yet.</p></div>
          <div className="voice-placeholder"><small>VOICE</small><strong>Input and playback placeholder</strong><p>Future voice capture and spoken responses will attach here.</p></div>
        </aside>

        <section className="conversation-main panel">
          <div className="conversation-history" aria-label="Conversation history">
            {messages.map((message) => <article className={`conversation-message ${message.role}`} key={message.id}><small>{message.role === "assistant" ? "AI Studio" : "You"} · {message.createdAt === new Date(0).toISOString() ? "ready" : new Date(message.createdAt).toLocaleTimeString()}</small><p>{message.content}</p></article>)}
          </div>
          <div className="conversation-composer">
            <textarea rows={3} value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) sendMessage(); }} placeholder="Ask AI Studio to plan a release task, draft a post, organize campaign work, or think through the next step..." />
            <button className="primary" disabled={!input.trim()} onClick={sendMessage}>Send</button>
          </div>
        </section>
      </section>
    </div>
  );
}