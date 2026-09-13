import { describe, expect, test } from "vitest";
import { buildRepairPrompt } from "../src/index.js";

describe("standardized repair prompt", () => {
  test("contains only the original prompt, objective diagnostics and the fixed neutral instruction", () => {
    const prompt = buildRepairPrompt("Crea una página con un formulario.", [
      { validator: "required-files", observation: "Missing: index.html" },
      { validator: "command", observation: "Exit code: 1" },
    ]);

    expect(prompt).toContain("Crea una página con un formulario.");
    expect(prompt).toContain("Missing: index.html");
    expect(prompt).toContain("Exit code: 1");
    expect(prompt).toContain("No añadas funcionalidades ajenas al encargo.");
    expect(prompt).not.toContain("bonito");
    expect(prompt).not.toContain("Xataka");
  });

  test("rejects editorial hints from repair diagnostics", () => {
    expect(() => buildRepairPrompt("Prompt", [{ validator: "editor", observation: "Hazlo más bonito" }])).toThrow(/objective/i);
  });
});
