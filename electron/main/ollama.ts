import type { OllamaModel } from "../shared/contracts.js";

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
