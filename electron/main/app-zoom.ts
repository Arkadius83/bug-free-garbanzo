export const ZOOM_MIN_FACTOR = 0.7;
export const ZOOM_MAX_FACTOR = 1.5;
export const ZOOM_STEP = 0.1;

export function clampZoomFactor(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(ZOOM_MAX_FACTOR, Math.max(ZOOM_MIN_FACTOR, Math.round(value * 100) / 100));
}

export function stepZoomFactor(current: number, direction: "in" | "out"): number {
  return clampZoomFactor(current + (direction === "in" ? ZOOM_STEP : -ZOOM_STEP));
}

export function parseStoredZoomFactor(value: unknown): number {
  if (!value || typeof value !== "object" || Array.isArray(value)) return 1;
  const factor = (value as { zoomFactor?: unknown }).zoomFactor;
  return typeof factor === "number" ? clampZoomFactor(factor) : 1;
}

export function zoomPercent(factor: number): number {
  return Math.round(clampZoomFactor(factor) * 100);
}
export type ZoomCommand = "in" | "out" | "reset";

export type ZoomShortcutInput = {
  control?: boolean;
  meta?: boolean;
  type?: string;
  key?: string;
};

export function zoomCommandFromInput(input: ZoomShortcutInput): ZoomCommand | null {
  if (!input.control && !input.meta) return null;
  if (input.type !== "keyDown") return null;
  const key = input.key?.toLowerCase();
  if (key === "+" || key === "=" || key === "numadd") return "in";
  if (key === "-" || key === "numsub") return "out";
  if (key === "0" || key === "num0") return "reset";
  return null;
}
