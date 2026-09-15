import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { validateBrowserGameOutput } from "../src/index.js";

const temporaryDirectories: string[] = [];

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), "aibench-browser-output-"));
  temporaryDirectories.push(root);
  return root;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("validateBrowserGameOutput", () => {
  test("accepts a root entrypoint with every local JavaScript and stylesheet present", async () => {
    const root = fixture();
    mkdirSync(join(root, "assets"));
    writeFileSync(join(root, "index.html"), '<link href="assets/game.css" rel="stylesheet"><script src="assets/game.js"></script>');
    writeFileSync(join(root, "assets/game.css"), "body {}");
    writeFileSync(join(root, "assets/game.js"), "console.log('ready');");

    await expect(validateBrowserGameOutput(root)).resolves.toBeNull();
  });

  test("rejects an entrypoint that references a missing local script", async () => {
    const root = fixture();
    writeFileSync(join(root, "index.html"), '<script src="game.js"></script>');

    await expect(validateBrowserGameOutput(root)).resolves.toMatch(/Missing local resource: game\.js/);
  });
});
