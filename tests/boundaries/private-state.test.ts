import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const repositoryRoot = resolve(import.meta.dirname, "../..");

describe("public repository boundary", () => {
  test("keeps runtime state and credential files outside the repository", () => {
    const forbiddenDirectories = ["state", "legacy", "workspaces", "raw-logs"];
    for (const directory of forbiddenDirectories) {
      expect(existsSync(resolve(repositoryRoot, directory))).toBe(false);
    }

    const ignoreFile = readFileSync(resolve(repositoryRoot, ".gitignore"), "utf8");
    expect(ignoreFile).toContain("state/");
    expect(ignoreFile).toContain("legacy/");
    expect(ignoreFile).toContain(".env.*");

    const ignored = execFileSync(
      "git",
      ["check-ignore", "state/example.json", "legacy/source", ".env.local"],
      { cwd: repositoryRoot, encoding: "utf8" },
    ).trim().split("\n");

    expect(ignored).toEqual(["state/example.json", "legacy/source", ".env.local"]);
  });
});
