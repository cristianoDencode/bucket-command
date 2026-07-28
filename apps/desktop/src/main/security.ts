import type { BrowserWindowConstructorOptions } from "electron";
import { ipcChannels } from "../shared/api.js";

export const secureWebPreferences = {
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true
} satisfies BrowserWindowConstructorOptions["webPreferences"];

export const allowedIpcChannels = Object.values(ipcChannels);
