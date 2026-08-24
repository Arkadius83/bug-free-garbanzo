import type { OllamaModel } from "../shared/contracts.js";
import type { GenerateCampaignDraftInput, GeneratedCampaignDraft } from "../shared/contracts.js";

interface OllamaTagsResponse {
  models?: Array<{
    name?: string;
    size?: number;
    modified_at?: string;
  }>;
}

export async function discoverOllamaModels(): Promise<OllamaModel[]> {
  const response = await fetch("http://127.0.0.1:11434/api/tags", {
    signal: AbortSignal.timeout(2_000)
  });

  if (!response.ok) {
    throw new Error(`Ollama returned HTTP ${response.status}`);
  }

  const data = (await response.json()) as OllamaTagsResponse;
  return (data.models ?? []).flatMap((model) => {
    if (!model.name) return [];
    return [{
      name: model.name,
      size: model.size ?? 0,
      modifiedAt: model.modified_at ?? ""
    }];
  });
}

const languageNames = { pl: "Polish", de: "German", en: "English" } as const;

export async function generateCampaignDraft(input: GenerateCampaignDraftInput): Promise<GeneratedCampaignDraft> {
  const required = [input.model, input.artistName, input.title, input.primaryGenre];
  if (required.some((value) => !value.trim())) throw new Error("Model, artist, title and genre are required");

  const response = await fetch("http://127.0.0.1:11434/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(300_000),
    body: JSON.stringify({
      model: input.model,
      stream: false,
      think: false,
      keep_alive: "15m",
      options: {
        temperature: 0.55,
        top_p: 0.9,
        num_ctx: 3072,
        num_predict: input.model.toLowerCase().startsWith("deepseek-r1") ? 900 : 400
      },
      messages: [
        {
          role: "system",
          content: `You are a precise music promotion copywriter. Write in ${languageNames[input.language]}. Return only the finished ${input.channel} copy, without headings, analysis, markdown fences or invented links, quotes, achievements, events or collaborations. Preserve all supplied facts exactly. Match the artist voice. Keep the result platform-appropriate and concise.`
        },
        {
          role: "user",
          content: [
            `Artist: ${input.artistName}`,
            `Artist voice: ${input.artistVoice}`,
            `Track: ${input.title}`,
            `Genre: ${input.primaryGenre}`,
            `Story: ${input.story || "No additional story supplied."}`,
            `Release date: ${input.releaseDate || "not announced"}`,
            `Channel: ${input.channel}`,
            input.channel === "Instagram" ? "Use 4-7 relevant hashtags and one natural call to action." : "Use one natural call to action."
          ].join("\n")
        }
      ]
    })
  });

  if (!response.ok) throw new Error(`Ollama generation failed with HTTP ${response.status}`);
  const data = await response.json() as {
    message?: { content?: string; thinking?: string };
    error?: string;
    done_reason?: string;
    eval_count?: number;
  };
  const content = stripThinking(data.message?.content ?? "");
  if (!content) {
    const reasoningTokens = data.message?.thinking?.trim().length ?? 0;
    if (reasoningTokens > 0) throw new Error("DeepSeek finished its reasoning budget before producing the final copy. Please retry once with the warmed model.");
    throw new Error(data.error || `Ollama returned an empty response${data.done_reason ? ` (${data.done_reason})` : ""}`);
  }
  return { content, model: input.model, language: input.language, channel: input.channel, generatedAt: new Date().toISOString() };
}

function stripThinking(value: string): string {
  return value.replace(/<think>[\s\S]*?<\/think>\s*/gi, "").trim();
}

export async function runPlanningAgent(model: string, task: string, releaseTitle: string | null): Promise<string> {
  if (!model.trim() || !task.trim()) throw new Error("Model and task are required");
  const response = await fetch("http://127.0.0.1:11434/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(300_000),
    body: JSON.stringify({
      model, stream: false, think: false, keep_alive: "15m",
      options: { temperature: .35, top_p: .85, num_ctx: 3072, num_predict: model.toLowerCase().startsWith("deepseek-r1") ? 900 : 500 },
      messages: [
        { role: "system", content: "You are a safe release-management assistant. Complete only research, planning, checking or drafting work. Never claim to publish, upload, delete, contact people, change accounts, or perform an external action. Return a concise practical result that a human can review." },
        { role: "user", content: ["Release: " + (releaseTitle || "Unspecified"), "Task: " + task, "Produce the requested draft, checklist or recommendation. Clearly label anything that still needs human approval."].join("\n") }
      ]
    })
  });
  if (!response.ok) throw new Error("Ollama agent failed with HTTP " + response.status);
  const data = await response.json() as { message?: { content?: string; thinking?: string }; error?: string };
  const content = stripThinking(data.message?.content ?? "");
  if (!content) throw new Error(data.error || "Ollama agent returned an empty response");
  return content;
}
