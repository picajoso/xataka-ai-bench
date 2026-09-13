import { mkdir, symlink, writeFile } from "node:fs/promises";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { CommandValidator, ForbiddenFilesValidator, JsonSchemaValidator, RequiredFilesValidator } from "../src/index.js";

const directories: string[] = [];
afterEach(() => directories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true })));
function outputRoot(): string { const directory = mkdtempSync(join(tmpdir(), "aibench-output-")); directories.push(directory); return directory; }
const context = (outputPath: string) => ({ runId: "run-1", outputPath });

describe("output file validators", () => {
  test("reports missing required files and rejects symlinks that escape the output", async () => {
    const root = outputRoot();
    await mkdir(join(root, "nested"));
    await writeFile(join(root, "nested", "answer.txt"), "ready");
    await symlink("/etc/hosts", join(root, "escaped.txt"));
    const validator = new RequiredFilesValidator(["nested/answer.txt", "missing.txt", "escaped.txt"]);

    const result = await validator.run(context(root));

    expect(result.status).toBe("failed");
    expect(result.observations).toEqual(["Present: nested/answer.txt", "Missing: missing.txt", "Unsafe path: escaped.txt"]);
  });

  test("finds forbidden credential-shaped output files", async () => {
    const root = outputRoot();
    await writeFile(join(root, ".env"), "SECRET=value");
    const result = await new ForbiddenFilesValidator([".env", "credentials.json"]).run(context(root));

    expect(result.status).toBe("failed");
    expect(result.publicSummary).toBe("Forbidden output files were found.");
    expect(result.observations).toEqual(["Forbidden: .env"]);
  });

  test("reports invalid JSON against a supplied structural predicate", async () => {
    const root = outputRoot();
    await writeFile(join(root, "result.json"), '{"ok":false}');
    const result = await new JsonSchemaValidator("result.json", (value): value is { ok: true } =>
      typeof value === "object" && value !== null && (value as { ok?: unknown }).ok === true,
    ).run(context(root));

    expect(result.status).toBe("failed");
    expect(result.publicSummary).toBe("JSON output does not satisfy the declared schema.");
  });
});

describe("command validator", () => {
  test("records a failed exit code and truncates public command output", async () => {
    const validator = new CommandValidator({ executable: "test", args: ["--check"] }, { outputLimitBytes: 8 });
    const workspace = {
      async *exec() {
        yield { type: "stdout" as const, data: "abcdefghijk" };
        yield { type: "stderr" as const, data: "failure detail" };
        yield { type: "exit" as const, exitCode: 1 };
      },
    };

    const result = await validator.run({ ...context(outputRoot()), workspace });

    expect(result.status).toBe("failed");
    expect(result.observations).toEqual(["Exit code: 1", "Standard output truncated after 8 bytes.", "Standard error truncated after 8 bytes."]);
    expect(result.publicSummary).toBe("Validation command failed with exit code 1.");
  });
});
