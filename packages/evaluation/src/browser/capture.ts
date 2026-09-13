import { createHash } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";

export async function captureWebPage(input: { url: string; outputPath: string }): Promise<{
  viewport: { width: number; height: number };
  consoleErrors: string[];
  screenshot: { path: string; sha256: string };
}> {
  const viewport = { width: 1440, height: 900 };
  await mkdir(input.outputPath, { recursive: true });
  const screenshotPath = join(input.outputPath, "desktop.png");
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport, reducedMotion: "reduce" });
    const consoleErrors: string[] = [];
    page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
    await page.goto(input.url, { waitUntil: "networkidle" });
    await page.screenshot({ path: screenshotPath, fullPage: true });
    const sha256 = `sha256:${createHash("sha256").update(await readFile(screenshotPath)).digest("hex")}`;
    return { viewport, consoleErrors, screenshot: { path: "desktop.png", sha256 } };
  } finally { await browser.close(); }
}
