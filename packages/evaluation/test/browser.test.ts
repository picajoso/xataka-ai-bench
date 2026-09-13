import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, test } from "vitest";
import { captureWebPage } from "../src/index.js";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));

describe("browser evidence", () => {
  test("captures a fixed desktop viewport and records browser console errors", async () => {
    const root = mkdtempSync(join(tmpdir(), "aibench-browser-"));
    roots.push(root);
    const page = join(root, "page.html");
    writeFileSync(page, '<main>ready</main><script>console.error("intentional browser error")</script>');

    const evidence = await captureWebPage({ url: pathToFileURL(page).href, outputPath: join(root, "evidence") });

    expect(evidence.screenshot.path).toBe("desktop.png");
    expect(evidence.screenshot.sha256).toMatch(/^sha256:/);
    expect(evidence.viewport).toEqual({ width: 1440, height: 900 });
    expect(evidence.consoleErrors).toEqual(["intentional browser error"]);
  });
});
