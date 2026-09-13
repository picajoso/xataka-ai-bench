import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { scanCandidate } from "../src/index.js";

const roots: string[] = [];

afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));

function candidate(): string {
  const root = mkdtempSync(join(tmpdir(), "aibench-publication-"));
  roots.push(root);
  return root;
}

describe("publication candidate scanner", () => {
  test("blocks secrets while keeping their values out of the report", async () => {
    const root = candidate();
    writeFileSync(join(root, "notes.txt"), "Authorization: Bearer secret-value-must-not-appear\n");

    const report = await scanCandidate(root);

    expect(report.blocked).toBe(true);
    expect(report.findings).toContainEqual(expect.objectContaining({ ruleId: "secret.bearer", severity: "block", file: "notes.txt" }));
    expect(JSON.stringify(report)).not.toContain("secret-value-must-not-appear");
  });

  test("blocks API-key shaped values without preserving the key", async () => {
    const root = candidate();
    writeFileSync(join(root, "client.ts"), "const key = 'sk-testkey-must-not-appear';\n");

    const report = await scanCandidate(root);

    expect(report.findings).toContainEqual(expect.objectContaining({ ruleId: "secret.api-key", severity: "block", file: "client.ts" }));
    expect(JSON.stringify(report)).not.toContain("sk-testkey-must-not-appear");
  });

  test("requires review for local paths while returning a redacted excerpt", async () => {
    const root = candidate();
    writeFileSync(join(root, "details.md"), "Creado en /Users/javipas/private/project\n");

    const report = await scanCandidate(root);

    expect(report.blocked).toBe(false);
    expect(report.findings).toContainEqual(expect.objectContaining({
      ruleId: "path.local", severity: "review", file: "details.md", excerpt: "Creado en [REDACTED_LOCAL_PATH]",
    }));
  });

  test("blocks environment files without reading their contents", async () => {
    const root = candidate();
    mkdirSync(join(root, "nested"));
    writeFileSync(join(root, "nested", ".env"), "PRIVATE_TOKEN=do-not-read\n");

    const report = await scanCandidate(root);

    expect(report.findings).toContainEqual(expect.objectContaining({ ruleId: "file.environment", severity: "block", file: "nested/.env" }));
    expect(JSON.stringify(report)).not.toContain("do-not-read");
  });

  test("blocks SSH private-key files without reading their contents", async () => {
    const root = candidate();
    writeFileSync(join(root, "id_rsa"), "PRIVATE-KEY-CONTENT-MUST-NOT-APPEAR\n");

    const report = await scanCandidate(root);

    expect(report.findings).toContainEqual(expect.objectContaining({ ruleId: "file.ssh-private-key", severity: "block", file: "id_rsa" }));
    expect(JSON.stringify(report)).not.toContain("PRIVATE-KEY-CONTENT-MUST-NOT-APPEAR");
  });
});
