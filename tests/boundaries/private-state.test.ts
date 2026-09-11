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

    const credentialSamples = [
      "private-key.pem",
      "credentials.json",
      "client.credentials.json",
      "session.token",
      "id_rsa",
      "id_ed25519",
      "service-account-production.json",
    ];
    const ignored = execFileSync(
      "git",
      [
        "check-ignore",
        "state/example.json",
        "legacy/source",
        ".env.local",
        ...credentialSamples,
      ],
      { cwd: repositoryRoot, encoding: "utf8" },
    ).trim().split("\n");

    expect(ignored).toEqual([
      "state/example.json",
      "legacy/source",
      ".env.local",
      ...credentialSamples,
    ]);

    const trackedFiles = execFileSync("git", ["ls-files"], {
      cwd: repositoryRoot,
      encoding: "utf8",
    }).trim().split("\n");
    const credentialShaped = trackedFiles.filter((path) => {
      if (path.endsWith(".env.example")) return false;
      if (path.startsWith("packages/publisher/test/fixtures/unsafe/")) return false;
      return /(^|\/)(?:\.env(?:\..+)?|credentials?(?:\..+)?|[^/]+\.credentials\.json|service-account[^/]*\.json|id_rsa|id_ed25519|secrets?(?:\..+)?|[^/]+\.(?:key|pem|p12|pfx|token))$/i.test(path);
    });
    expect(credentialShaped).toEqual([]);
    for (const sample of credentialSamples) {
      expect(/(^|\/)(?:credentials?(?:\..+)?|[^/]+\.credentials\.json|service-account[^/]*\.json|id_rsa|id_ed25519|[^/]+\.(?:key|pem|p12|pfx|token))$/i.test(sample)).toBe(true);
    }
  });
});
