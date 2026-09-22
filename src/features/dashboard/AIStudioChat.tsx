import { useEffect, useRef, useState } from "react";
import type { ConversationMessage, ReleaseSummary, SystemStatus } from "../../../electron/shared/contracts";

interface ChatMessage { role: "user" | "assistant"; content: string; }

interface AIStudioChatProps { system: SystemStatus | null; release?: ReleaseSummary | null; }

export function AIStudioChat({ system, release }: AIStudioChatProps) {
  const models = system?.ollama.models ?? [];
  const [selectedModel, setSelectedModel] = useState(models[0]?.name ?? "");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeRequestId = useRef<string | null>(null);

  useEffect(() => {
    if (models.length > 0 && !models.find((m) => m.name === selectedModel)) {
      setSelectedModel(models[0].name);
    }
  }, [models, selectedModel]);

  function scrollToBottom() {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }

  useEffect(scrollToBottom, [messages]);

  async function sendMessage() {
    const text = input.trim();
    if (!text || !window.studio || loading) return;
    const model = selectedModel || null;
    if (!model) { setError("No model available. Pull a model in Settings."); return; }

    const requestId = `dashboard-chat-${Date.now()}`;
    activeRequestId.current = requestId;
    setError("");
    setLoading(true);

    const userMsg: ChatMessage = { role: "user", content: text };
    const assistantMsg: ChatMessage = { role: "assistant", content: "" };
    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput("");

    const history: ConversationMessage[] = messages.map((m, i) => ({
      id: `hist-${i}`,
      role: m.role,
      content: m.content,
      createdAt: new Date().toISOString(),
    }));

    try {
      const response = await window.studio.sendConversationMessage({
        requestId,
        model,
        message: text,
        history,
        stream: true,
        workspace: {
          projectName: "AI Studio Manager",
          artistId: release?.artistId ?? "the-arkadiusz",
          artistName: release?.artistName ?? "Artist",
          releaseId: release?.id ?? null,
          releaseTitle: release?.title ?? null,
          primaryGenre: release?.primaryGenre ?? null,
          releaseStatus: release?.status ?? null,
        },
      }, (chunk) => {
        if (activeRequestId.current !== requestId) return;
        if (chunk.content) {
          setMessages((prev) => prev.map((m, i) => i === prev.length - 1 ? { ...m, content: m.content + chunk.content } : m));
        }
      });

      if (activeRequestId.current === requestId) {
        setMessages((prev) => prev.map((m, i) => i === prev.length - 1 ? { ...m, content: m.content || response.content } : m));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Request failed.";
      setError(msg);
      setMessages((prev) => prev.map((m, i) => i === prev.length - 1 ? { ...m, content: msg } : m));
    } finally {
      if (activeRequestId.current === requestId) activeRequestId.current = null;
      setLoading(false);
    }
  }

  return (
    <section className="dashboard-panel ai-studio-chat">
      <div className="dashboard-panel-heading">
        <span className="dashboard-eyebrow">AI Studio</span>
        <select
          className="ai-studio-model-select"
          value={selectedModel}
          onChange={(e) => setSelectedModel(e.target.value)}
          aria-label="AI model"
        >
          {models.length === 0 && <option value="">No models</option>}
          {models.map((m) => (
            <option key={m.name} value={m.name}>{m.name}</option>
          ))}
        </select>
      </div>
      <div className="ai-studio-messages" ref={scrollRef}>
        {messages.length === 0 && (
          <p className="ai-studio-empty">Ask anything about your release, campaign or workflow.</p>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`ai-studio-msg ai-studio-msg-${msg.role}`}>
            <span className="ai-studio-msg-role">{msg.role === "user" ? "You" : "AI"}</span>
            <p>{msg.content || (loading && i === messages.length - 1 ? "Thinking..." : "")}</p>
          </div>
        ))}
      </div>
      {error && <div className="ai-studio-error">{error}</div>}
      <form className="ai-studio-input" onSubmit={(e) => { e.preventDefault(); void sendMessage(); }}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message..."
          aria-label="Chat message"
          disabled={loading}
        />
        <button type="submit" disabled={!input.trim() || loading} aria-label="Send message">{loading ? "..." : "→"}</button>
      </form>
    </section>
  );
}
