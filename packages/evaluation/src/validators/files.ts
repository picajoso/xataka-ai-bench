import { lstat, readFile, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { type EvaluationContext, type ValidationResult, type Validator } from "../types.js";

function safePath(root: string, requested: string): string | null {
  if (!requested || isAbsolute(requested)) return null;
  const candidate = resolve(root, requested);
  const relation = relative(root, candidate);
  return relation === "" || relation === ".." || relation.startsWith("../") || isAbsolute(relation) ? null : candidate;
}

async function containedExistingPath(root: string, requested: string): Promise<"missing" | "unsafe" | "present"> {
  const candidate = safePath(root, requested);
  if (!candidate) return "unsafe";
  try {
    const stat = await lstat(candidate);
    if (stat.isSymbolicLink()) return "unsafe";
    const physicalRoot = await realpath(root);
    const physicalCandidate = await realpath(candidate);
    const relation = relative(physicalRoot, physicalCandidate);
    return relation === "" || (!relation.startsWith("../") && relation !== ".." && !isAbsolute(relation)) ? "present" : "unsafe";
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "missing";
    throw error;
  }
}

function result(id: string, status: ValidationResult["status"], observations: string[], publicSummary: string): ValidationResult {
  const now = new Date().toISOString();
  return { validator: { id, version: "1.0.0", method: "filesystem" }, status, startedAt: now, finishedAt: now, observations, privateRawOutputRef: null, publicSummary };
}

export class RequiredFilesValidator implements Validator {
  constructor(private readonly required: string[]) {}

  async run(context: EvaluationContext): Promise<ValidationResult> {
    const observations: string[] = [];
    let failed = false;
    for (const path of this.required) {
      const state = await containedExistingPath(context.outputPath, path);
      if (state === "present") observations.push(`Present: ${path}`);
      if (state === "missing") { observations.push(`Missing: ${path}`); failed = true; }
      if (state === "unsafe") { observations.push(`Unsafe path: ${path}`); failed = true; }
    }
    return result("required-files", failed ? "failed" : "passed", observations, failed ? "One or more required output files are missing or unsafe." : "All required output files are present.");
  }
}

export class ForbiddenFilesValidator implements Validator {
  constructor(private readonly forbidden: string[]) {}

  async run(context: EvaluationContext): Promise<ValidationResult> {
    const observations: string[] = [];
    for (const path of this.forbidden) {
      if (await containedExistingPath(context.outputPath, path) === "present") observations.push(`Forbidden: ${path}`);
    }
    return result("forbidden-files", observations.length ? "failed" : "passed", observations, observations.length ? "Forbidden output files were found." : "No forbidden output files were found.");
  }
}

export class JsonSchemaValidator implements Validator {
  constructor(private readonly path: string, private readonly predicate: (value: unknown) => boolean) {}

  async run(context: EvaluationContext): Promise<ValidationResult> {
    const candidate = safePath(context.outputPath, this.path);
    if (!candidate || await containedExistingPath(context.outputPath, this.path) !== "present") {
      return result("json-schema", "failed", [`Missing or unsafe JSON: ${this.path}`], "Declared JSON output is missing or unsafe.");
    }
    try {
      const parsed = JSON.parse(await readFile(candidate, "utf8"));
      return this.predicate(parsed)
        ? result("json-schema", "passed", [`Valid JSON: ${this.path}`], "JSON output satisfies the declared schema.")
        : result("json-schema", "failed", [`Schema mismatch: ${this.path}`], "JSON output does not satisfy the declared schema.");
    } catch {
      return result("json-schema", "failed", [`Invalid JSON: ${this.path}`], "JSON output does not satisfy the declared schema.");
    }
  }
}
