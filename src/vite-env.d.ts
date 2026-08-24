/// <reference types="vite/client" />

import type { StudioApi } from "../electron/shared/contracts";

declare global {
  interface Window {
    studio?: StudioApi;
  }
}

export {};
