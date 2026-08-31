export interface ResilientFetchOptions {
  service: string;
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
}

const retryableStatuses = new Set([429, 500, 502, 503, 504]);

export function isRetryableHttpStatus(status: number): boolean {
  return retryableStatuses.has(status);
}

export function integrationHttpError(service: string, status: number, detail = ""): Error {
  const suffix = detail.trim() ? `: ${detail.trim().slice(0, 300)}` : "";
  if (status === 401) return new Error(`${service} authentication expired or was rejected (HTTP 401). Reconnect the integration.${suffix}`);
  if (status === 403) return new Error(`${service} permission was denied (HTTP 403). Check account roles and granted permissions.${suffix}`);
  if (status === 429) return new Error(`${service} rate limit was reached (HTTP 429). Retry shortly.${suffix}`);
  if (status >= 500) return new Error(`${service} is temporarily unavailable (HTTP ${status}). Retry shortly.${suffix}`);
  return new Error(`${service} returned HTTP ${status}${suffix}`);
}

export async function resilientFetch(
  input: string | URL,
  init: RequestInit = {},
  options: ResilientFetchOptions
): Promise<Response> {
  const retries = Math.max(0, options.retries ?? 1);
  const retryDelayMs = Math.max(0, options.retryDelayMs ?? 200);
  const timeoutMs = Math.max(1, options.timeoutMs ?? 30_000);
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(input, {
        ...init,
        signal: init.signal ?? AbortSignal.timeout(timeoutMs)
      });
      if (response.ok || !isRetryableHttpStatus(response.status) || attempt === retries) return response;
    } catch (error) {
      lastError = error;
      if (attempt === retries) {
        const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
        throw new Error(timedOut
          ? `${options.service} request timed out. Check the service and retry.`
          : `${options.service} is offline or unreachable. Check the connection and retry.`);
      }
    }

    if (retryDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
  }

  throw lastError instanceof Error ? lastError : new Error(`${options.service} request failed`);
}
