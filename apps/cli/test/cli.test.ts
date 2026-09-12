import { describe, expect, test } from "vitest";
import { runCli } from "../src/main.js";

describe("aibench doctor", () => {
  test("reports an available external workspace as JSON", async () => {
    const result = await runCli(["doctor", "--json"], {
      doctor: () => ({ ok: true, home: "/Volumes/MacOS_VMs/xataka-ai-bench" }),
    });
    expect(result).toEqual({ exitCode: 0, output: '{"ok":true,"home":"/Volumes/MacOS_VMs/xataka-ai-bench"}\n' });
  });

  test("returns a non-zero result when the storage guard fails", async () => {
    const result = await runCli(["doctor"], { doctor: () => { throw new Error("External SSD is not mounted"); } });
    expect(result).toEqual({ exitCode: 1, output: "doctor: External SSD is not mounted\n" });
  });
});
