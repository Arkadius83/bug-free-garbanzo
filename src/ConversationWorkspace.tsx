import { useEffect, useMemo, useRef, useState } from "react";
import type { ArtistAlias, ConversationMessage, ConversationRuntimeState, ProviderExecutionTrace, ReleaseSummary, SystemStatus } from "../electron/shared/contracts";
import { buildProviderTraceViewModel } from "../electron/shared/provider-trace-view-model";

type ConversationWorkspaceProps = {
  artistId: ArtistAlias;
  artistName: string;
  release?: ReleaseSummary | null;
  status?: SystemStatus | null;
  activeModel?: string | null;
  onModelChange: (model: string | null) => void;
  onOpenRelease: () => void;
};

const MAX_SESSION_MESSAGES = 16;
type ConversationUiMessage = ConversationMessage & {
  providerTrace?: ProviderExecutionTrace | null;
  providerLabel?: string | null;
  modelLabel?: string | null;
};

const starterMessages: ConversationUiMessage[] = [
  {
    id: "welcome",
    role: "assistant",
    content: "Tell me what you want to create or organize for the current release. I can help shape campaign copy, next actions, artwork briefs, scheduling ideas, and release checklists.",
    createdAt: new Date(0).toISOString()
  }
];

function boundedHistory(messages: ConversationUiMessage[]): ConversationMessage[] {
  return messages
    .filter((message) => message.id !== "welcome")
    .map(({ id, role, content, createdAt }) => ({ id, role, content, createdAt }))
    .slice(-MAX_SESSION_MESSAGES);
}

function cleanError(error: unknown): string {
  const raw = error instanceof Error ? error.message : "AI Studio could not generate a response.";
  return raw.replace(/^Error invoking remote method '[^']+': Error: /, "");
}

function ProviderDiagnostics({ trace }: { trace?: ProviderExecutionTrace | null }) {
  const model = buildProviderTraceViewModel(trace);
  if (!model.visible) return null;
  return (
    <details className="provider-diagnostics">
      <summary><span>Provider diagnostics</span><b className={`trace-status ${model.statusTone}`}>{model.finalStatus}</b><em>{model.duration}</em></summary>
      <div className="provider-diagnostics-body">
        <div className="provider-diagnostics-overview"><span>Fallback used</span><b>{model.fallbackUsed}</b></div>
        {model.attempts.map((attempt, index) => (
          <section className="provider-attempt" key={`${attempt.providerId}-${index}`}>
            <header><strong>{index + 1}. {attempt.providerName}</strong><b className={`trace-status ${attempt.statusTone}`}>{attempt.finalStatus}</b></header>
            <dl>
              <div><dt>Provider</dt><dd>{attempt.providerId}</dd></div>
              <div><dt>Duration</dt><dd>{attempt.duration}</dd></div>
              <div><dt>Fallback</dt><dd>{attempt.fallbackUsed}</dd></div>
              <div><dt>Exit code</dt><dd>{attempt.exitCode}</dd></div>
              <div><dt>Exit signal</dt><dd>{attempt.exitSignal}</dd></div>
              <div><dt>Valid result</dt><dd>{attempt.validResultReceived}</dd></div>
            </dl>
            {attempt.error ? <p className="provider-attempt-error">{attempt.error}</p> : null}
          </section>
        ))}
      </div>
    </details>
  );
}
export function ConversationWorkspace({ artistId, artistName, release, status, activeModel, onModelChange, onOpenRelease }: ConversationWorkspaceProps) {
  const [messages, setMessages] = useState<ConversationUiMessage[]>(starterMessages);
  const [input, setInput] = useState("");
  const [runtimeState, setRuntimeState] = useState<ConversationRuntimeState>("Ready");
  const [workStatus, setWorkStatus] = useState("Waiting for your next request.");
  const activeRequestId = useRef<string | null>(null);
  const cancelledRequestIds = useRef(new Set<string>());
  const historyRef = useRef<HTMLDivElement | null>(null);
  const shouldStickToBottom = useRef(true);
  const availableModels = status?.ollama.models ?? [];
  const isAuto = activeModel === null;
  const selectedModelName = isAuto ? null : (activeModel ?? null);
  const modelIsAvailable = selectedModelName !== null && availableModels.some((model) => model.name === selectedModelName);
  const activeWorkspace = useMemo(() => release ? `${release.title} by ${release.artistName}` : `${artistName} workspace`, [artistName, release]);
  const providerLabel = isAuto ? "Auto · Harness provider routing" : selectedModelName && modelIsAvailable ? `Local AI · ${selectedModelName}` : selectedModelName ? `${selectedModelName} not found` : "Select a model or use Auto";
  const busy = runtimeState === "Thinking" || runtimeState === "Responding";
  const canSend = Boolean(input.trim() && !busy);

  useEffect(() => {
    const element = historyRef.current;
    if (!element || !shouldStickToBottom.current) return;
    element.scrollTop = element.scrollHeight;
  }, [messages, runtimeState]);

  function handleHistoryScroll() {
    const element = historyRef.current;
    if (!element) return;
    shouldStickToBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 72;
  }

  async function sendMessage() {
    const content = input.trim();
    if (!content || !window.studio) return;
    if (!isAuto && !modelIsAvailable) {
      setRuntimeState("Error");
      setWorkStatus("Choose Auto or an available local AI model before sending.");
      return;
    }
    const requestId = `conversation-${Date.now()}`;
    activeRequestId.current = requestId;
    cancelledRequestIds.current.delete(requestId);
    shouldStickToBottom.current = true;
    const now = new Date().toISOString();
    const userMessage: ConversationUiMessage = { id: `user-${requestId}`, role: "user", content, createdAt: now };
    const assistantId = `assistant-${requestId}`;
    const assistantMessage: ConversationUiMessage = { id: assistantId, role: "assistant", content: "", createdAt: now };
    setMessages((current) => [...current, userMessage, assistantMessage]);
    setInput("");
    setRuntimeState("Thinking");
    setWorkStatus(isAuto ? "Routing with Auto..." : `Thinking with ${selectedModelName}...`);
    try {
      const response = await window.studio.sendConversationMessage({
        requestId,
        model: isAuto ? null : selectedModelName,
        message: content,
        history: boundedHistory(messages),
        stream: !isAuto,
        workspace: {
          projectName: "AI Studio Manager",
          artistId,
          artistName,
          releaseId: release?.id ?? null,
          releaseTitle: release?.title ?? null,
          primaryGenre: release?.primaryGenre ?? null,
          releaseStatus: release?.status ?? null
        }
      }, (chunk) => {
        if (activeRequestId.current !== requestId || cancelledRequestIds.current.has(requestId)) return;
        if (chunk.content) {
          setRuntimeState("Responding");
          setWorkStatus("Responding...");
          setMessages((current) => current.map((message) => message.id === assistantId ? { ...message, content: message.content + chunk.content } : message));
        }
      });
      if (!cancelledRequestIds.current.has(requestId)) {
        const providerModel = response.provider && response.model ? `${response.provider}/${response.model}` : response.provider ?? "unknown";
        setMessages((current) => current.map((message) => message.id === assistantId ? { ...message, content: message.content || response.content, providerTrace: response.trace ?? null, providerLabel: response.provider, modelLabel: response.model } : message).slice(-MAX_SESSION_MESSAGES - 1));
        setRuntimeState("Ready");
        setWorkStatus(response.streamed ? `Response from ${providerModel}.` : `Response from ${providerModel}. Streaming was not available, so the answer arrived at once.`);
      }
    } catch (error) {
      if (cancelledRequestIds.current.has(requestId)) {
        setMessages((current) => current.map((item) => item.id === assistantId && !item.content ? { ...item, content: "Response stopped." } : item));
        setRuntimeState("Ready");
        setWorkStatus("Response stopped.");
      } else {
        const message = cleanError(error);
        setMessages((current) => current.map((item) => item.id === assistantId ? { ...item, content: message } : item));
        setRuntimeState("Error");
        setWorkStatus(message);
      }
    } finally {
      if (activeRequestId.current === requestId) activeRequestId.current = null;
    }
  }

  async function stopResponse() {
    if (!window.studio || !activeRequestId.current) return;
    const requestId = activeRequestId.current;
    cancelledRequestIds.current.add(requestId);
    await window.studio.cancelConversation(requestId);
    setRuntimeState("Ready");
    setWorkStatus("Response stopped.");
    activeRequestId.current = null;
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
          <div className="context-stack"><span><small>PROJECT</small><b>{activeWorkspace}</b></span><span><small>ARTIST</small><b>{artistName}</b></span><span><small>AI</small><b>{providerLabel}</b></span><span><small>STATE</small><b>{runtimeState}</b></span></div>
          <label className="conversation-model-select">Model<select value={isAuto ? "" : (selectedModelName ?? "")} onChange={(event) => onModelChange(event.target.value || null)}><option value="">Auto · Harness provider routing</option>{availableModels.map((model) => <option value={model.name} key={model.name}>{model.name}</option>)}</select><small>{availableModels.length ? "Auto uses free providers first, then local fallback." : "Start Ollama to discover local models, or use Auto."}</small></label>
          <div className="current-work"><small>CURRENT WORK</small><strong>{workStatus}</strong><p>No autonomous action runs from this conversation area.</p></div>
          <div className="voice-placeholder"><small>VOICE</small><strong>Input and playback placeholder</strong><p>Future voice capture and spoken responses will attach here.</p></div>
        </aside>

        <section className="conversation-main panel">
          <div className="conversation-history" ref={historyRef} onScroll={handleHistoryScroll} aria-label="Conversation history">
            {messages.map((message) => <article className={`conversation-message ${message.role}`} key={message.id}><small>{message.role === "assistant" ? "AI Studio" : "You"} · {message.createdAt === new Date(0).toISOString() ? "ready" : new Date(message.createdAt).toLocaleTimeString()}</small><p>{message.content || (runtimeState === "Thinking" ? "Thinking..." : "")}</p><ProviderDiagnostics trace={message.providerTrace} /></article>)}
          </div>
          <div className="conversation-composer">
            <textarea rows={3} value={input} disabled={busy} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) void sendMessage(); }} placeholder="Ask AI Studio to plan a release task, draft a post, organize campaign work, or think through the next step..." />
            {busy ? <button className="danger-button" onClick={() => void stopResponse()}>Stop</button> : <button className="primary" disabled={!canSend} onClick={() => void sendMessage()}>Send</button>}
          </div>
        </section>
      </section>
    </div>
  );
}