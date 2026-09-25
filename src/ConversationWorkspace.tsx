import { useEffect, useMemo, useRef, useState } from "react";
import type { ArtistAlias, ConversationMessage, ConversationRuntimeState, ProviderExecutionTrace, ReleaseSummary, SystemStatus } from "../electron/shared/contracts";
import { buildProviderTraceViewModel } from "../electron/shared/provider-trace-view-model";
import { PageHeader } from "./ui/PageHeader";
import { SectionCard } from "./ui/SectionCard";
import { Button } from "./ui/Button";
import { Textarea } from "./ui/Textarea";

type ConversationWorkspaceProps = {
  artistId: ArtistAlias;
  artistName: string;
  release?: ReleaseSummary | null;
  status?: SystemStatus | null;
  activeModel?: string | null;
  onModelChange: (model: string | null) => void;
  onOpenRelease: () => void;
};

type Mode = "create" | "assistant";
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
  const [mode, setMode] = useState<Mode>("create");
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

  const handleGenerate = () => void sendMessage();

  const generateError = workStatus && !busy && runtimeState === "Error" ? workStatus : null;

  return (
    <div className="page-content conversation-page">
      <PageHeader eyebrow="AI Studio" title="Compact workspace." lead="Shape the brief, generate, and review in one view. The studio keeps the current artist, release, model, and work status in view while you work." actions={<Button onClick={onOpenRelease}>Open release</Button>} />

      <div className="ai-studio-context-bar">
        <span className="context-artist"><small>ARTIST</small><strong>{artistName}</strong></span>
        <span className="context-release"><small>RELEASE</small><strong>{release?.title ?? "No active release"}</strong></span>
        <Button variant="ghost" disabled={!release} onClick={() => void onOpenRelease()}>{release ? "Switch" : "None"}</Button>
        <span className="context-provider"><small>MODEL</small><strong>{providerLabel}</strong></span>
        <span className="context-status"><small>STATUS</small><strong>{runtimeState}</strong></span>
      </div>

      <div className="ai-studio-mode-bar">
        <button className={`mode-tab ${mode === "create" ? "active" : ""}`} onClick={() => setMode("create")}>Create</button>
        <button className={`mode-tab ${mode === "assistant" ? "active" : ""}`} onClick={() => setMode("assistant")}>Assistant</button>
      </div>

      {mode === "create" && (
        <div className="ai-studio-workspace ai-studio-create-layout">
          <div className="ai-studio-setup">
            <SectionCard eyebrow="Setup" title="Content">
              <label className="ui-field"><span className="ui-field-label">Content type</span><select value="draft" onChange={() => {}}><option value="draft">Draft</option><option value="promo">Promo</option><option value="campaign">Campaign</option></select></label>
              <label className="ui-field"><span className="ui-field-label">Channel</span><select value="Instagram" onChange={() => {}}><option>Instagram</option><option>Facebook</option><option>TikTok</option><option>SoundCloud</option><option>YouTube</option></select></label>
              <label className="ui-field"><span className="ui-field-label">Language</span><select value="en" onChange={() => {}}><option value="en">English</option><option value="de">Deutsch</option><option value="pl">Polski</option></select></label>
            </SectionCard>
          </div>

          <div className="ai-studio-create">
            <SectionCard eyebrow="CREATE" title="Creative workspace" actions={<Button disabled={!input.trim() || busy} onClick={() => void handleGenerate()}>{busy ? "Generating..." : "Generate"}</Button>}>
              <div className="create-workspace-body">
                <Textarea rows={5} value={input} disabled={busy} onChange={(event) => setInput(event.target.value)} placeholder="Describe what to create — campaign copy, task plans, artwork briefs, scheduling ideas..." />
                <div className="create-actions">
                  <Button disabled={!input.trim() || busy} onClick={() => void handleGenerate()} variant="primary">{busy ? "Generating..." : "Generate"}</Button>
                </div>
                {busy && <div className="generation-progress"><span>Generating with {isAuto ? "Auto" : selectedModelName}...</span></div>}
                {generateError && <div className="generation-error"><span>{generateError}</span></div>}
                {messages.filter((m) => m.role === "assistant" && m.content).length > 0 ? (
                  <div className="create-result">
                    <div className="preview-messages">{messages.filter((m) => m.role === "assistant" && m.content).map((m) => <article key={m.id}><p>{m.content}</p></article>)}</div>
                  </div>
                ) : !busy && !generateError ? (
                  <div className="analytics-empty"><strong>No output yet</strong><p>Generate content to see it here.</p></div>
                ) : null}
              </div>
            </SectionCard>
          </div>
        </div>
      )}

      {mode === "assistant" && (
        <div className="ai-studio-workspace ai-studio-assistant-layout">
          <SectionCard eyebrow="Assistant" title="Conversation" className="conversation-main">
            <div className="conversation-history v4-scroll" ref={historyRef} onScroll={handleHistoryScroll} aria-label="Conversation history">
              {messages.map((message) => <article className={`conversation-message ${message.role}`} key={message.id}><small>{message.role === "assistant" ? "AI Studio" : "You"} · {message.createdAt === new Date(0).toISOString() ? "ready" : new Date(message.createdAt).toLocaleTimeString()}</small><p>{message.content || (runtimeState === "Thinking" ? "Thinking..." : "")}</p><ProviderDiagnostics trace={message.providerTrace} /></article>)}
            </div>
            <div className="conversation-composer">
              <Textarea rows={2} value={input} disabled={busy} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) void sendMessage(); }} placeholder="Continue the conversation or press Enter+Ctrl to send..." />
              {busy ? <button className="danger-button" onClick={() => void stopResponse()}>Stop</button> : <button className="primary" disabled={!canSend} onClick={() => void sendMessage()}>Send</button>}
            </div>
            <div className="assistant-diagnostics-toggle">
              <ProviderDiagnostics />
            </div>
          </SectionCard>
        </div>
      )}
    </div>
  );
}
