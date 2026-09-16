import { useRef, useState } from "react";
import type { SystemStatus } from "../../../electron/shared/contracts";

interface ChatMessage { role: "user" | "assistant"; content: string; }

interface AIStudioChatProps { system: SystemStatus | null; }

export function AIStudioChat({ system }: AIStudioChatProps) {
  const models = system?.ollama.models ?? [];
  const [selectedModel, setSelectedModel] = useState(models[0]?.name ?? "");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  function sendMessage() {
    const text = input.trim();
    if (!text) return;
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setInput("");
    setTimeout(() => {
      setMessages((prev) => [...prev, { role: "assistant", content: selectedModel ? `Response from ${selectedModel} would appear here.` : "Select a model to begin." }]);
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }, 100);
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
            <p>{msg.content}</p>
          </div>
        ))}
      </div>
      <form className="ai-studio-input" onSubmit={(e) => { e.preventDefault(); sendMessage(); }}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message..."
          aria-label="Chat message"
        />
        <button type="submit" disabled={!input.trim()} aria-label="Send message">→</button>
      </form>
    </section>
  );
}
