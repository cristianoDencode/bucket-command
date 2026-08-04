import { describe, expect, it } from "vitest";
import { monacoLanguageFor } from "../src/renderer/languages";

describe("renderer language mapping", () => {
  it("maps formatted document languages to stable Monaco language ids", () => {
    expect(monacoLanguageFor("html")).toBe("html");
    expect(monacoLanguageFor("markdown")).toBe("markdown");
    expect(monacoLanguageFor("sql")).toBe("sql");
  });
});
