import type { ProviderExecutionDiagnostic, ProviderExecutionTrace } from "./contracts.js";

export type ProviderTraceStatusTone = "success" | "warning" | "danger" | "neutral";

export interface ProviderTraceDiagnosticView {
  providerId: string;
  providerName: string;
  finalStatus: string;
  statusTone: ProviderTraceStatusTone;
  duration: string;
  fallbackUsed: string;
  exitCode: string;
  exitSignal: string;
  validResultReceived: string;
  error: string | null;
}

export interface ProviderTraceViewModel {
  visible: boolean;
  finalStatus: string;
  statusTone: ProviderTraceStatusTone;
  duration: string;
  fallbackUsed: string;
  attempts: ProviderTraceDiagnosticView[];
}

function statusTone(status: string): ProviderTraceStatusTone {
  if (status === "success") return "success";
  if (status === "cancelled" || status === "timeout") return "warning";
  if (status === "crash" || status === "invalid_result") return "danger";
  return "neutral";
}

function durationLabel(durationMs: unknown): string {
  return typeof durationMs === "number" && Number.isFinite(durationMs) && durationMs >= 0 ? `${Math.round(durationMs)} ms` : "unknown";
}

function booleanLabel(value: boolean): string {
  return value ? "Yes" : "No";
}

function nullableLabel(value: string | number | null | undefined): string {
  return value === null || value === undefined || value === "" ? "none" : String(value);
}

function diagnosticError(diagnostic: ProviderExecutionDiagnostic): string | null {
  const code = diagnostic.errorCode?.trim();
  const message = diagnostic.errorMessage?.trim();
  if (code && message) return `${code}: ${message}`;
  return code || message || null;
}

export function buildProviderTraceViewModel(trace: ProviderExecutionTrace | null | undefined): ProviderTraceViewModel {
  if (!trace || !Array.isArray(trace.diagnostics) || trace.diagnostics.length === 0) {
    return { visible: false, finalStatus: "", statusTone: "neutral", duration: "unknown", fallbackUsed: "No", attempts: [] };
  }

  return {
    visible: true,
    finalStatus: trace.finalStatus,
    statusTone: statusTone(trace.finalStatus),
    duration: durationLabel(trace.durationMs),
    fallbackUsed: booleanLabel(trace.fallbackUsed),
    attempts: trace.diagnostics.map((diagnostic) => ({
      providerId: diagnostic.providerId,
      providerName: diagnostic.providerName,
      finalStatus: diagnostic.finalStatus,
      statusTone: statusTone(diagnostic.finalStatus),
      duration: durationLabel(diagnostic.durationMs),
      fallbackUsed: booleanLabel(diagnostic.fallbackUsed),
      exitCode: nullableLabel(diagnostic.exitCode),
      exitSignal: nullableLabel(diagnostic.exitSignal),
      validResultReceived: booleanLabel(diagnostic.validResultReceived),
      error: diagnosticError(diagnostic)
    }))
  };
}