import { contextBridge, ipcRenderer } from "electron";
import type { StudioApi } from "../shared/contracts.js";

const api: StudioApi = {
  getSystemStatus: () => ipcRenderer.invoke("studio:get-system-status")
};

contextBridge.exposeInMainWorld("studio", api);
