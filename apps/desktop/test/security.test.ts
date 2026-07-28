import { describe, expect, it } from "vitest";
import { allowedIpcChannels, secureWebPreferences } from "../src/main/security.js";
import { exposedApiKeys } from "../src/shared/api.js";

describe("Electron dashboard security contract", () => {
  it("keeps the renderer isolated from Node.js", () => {
    expect(secureWebPreferences.contextIsolation).toBe(true);
    expect(secureWebPreferences.nodeIntegration).toBe(false);
    expect(secureWebPreferences.sandbox).toBe(true);
  });

  it("does not expose command execution through IPC or preload", () => {
    expect(allowedIpcChannels).not.toContain("commands:run");
    expect(allowedIpcChannels.join(" ")).not.toMatch(/run|exec|shell/i);
    expect(exposedApiKeys.join(" ")).not.toMatch(/run|exec|shell/i);
  });
});
