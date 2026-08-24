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
        num_predict: 320
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
  const data = await response.json() as { message?: { content?: string }; error?: string };
  const content = data.message?.content?.trim();
  if (!content) throw new Error(data.error || "Ollama returned an empty response");
  return { content, model: input.model, language: input.language, channel: input.channel, generatedAt: new Date().toISOString() };
}
