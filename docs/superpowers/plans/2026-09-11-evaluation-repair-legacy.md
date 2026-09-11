# Evaluation, Repair, and Legacy Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Validate and capture heterogeneous outputs, run the standardized repair pass, and convert existing experiments into honest legacy records without changing their source directories.

**Architecture:** Evaluation is plugin-based and selected by each benchmark definition. Objective validators produce facts rather than a universal score; capture recipes produce evidence; repair consumes only the original prompt and objective diagnostics. The legacy importer builds candidate records from a read-only archive and records unknown metadata explicitly.

**Tech Stack:** TypeScript, Vitest, Playwright, execa, Sharp for image metadata, Git CLI for read-only diffs.

**Spec:** `docs/superpowers/specs/2026-09-11-xataka-ai-bench-design.md`

## Global Constraints

- Do not invent missing legacy metadata.
- Do not modify legacy source trees or nested Git repositories.
- Keep evaluation facts separate from editorial judgments.
- Capture desktop by default only when a benchmark requests visual evidence.
- Preserve first-shot and repair as distinct immutable stages.
- Do not activate the existing ten candidate tests without individual review.

---

### Task 1: Define validator and evidence contracts

**Files:**
- Create: `packages/evaluation/package.json`
- Create: `packages/evaluation/src/types.ts`
- Create: `packages/evaluation/src/report.ts`
- Create: `packages/evaluation/src/index.ts`
- Create: `packages/evaluation/test/report.test.ts`

**Interfaces:**
- Produces: `Validator.run(context): Promise<ValidationResult>`.
- Produces: `EvidenceCollector.collect(context): Promise<Evidence[]>`.
- Produces: `buildEvaluationReport(results, evidence): EvaluationReport`.

- [ ] **Step 1: Write failing evaluation-report tests**

  Cover pass, fail, warning, skipped, unavailable, timed-out and errored validators; prove that an exhibitive benchmark may have no numeric score.

- [ ] **Step 2: Run and confirm failure**

  Run `pnpm --filter @aibench/evaluation test`; expect missing exports.

- [ ] **Step 3: Implement typed validation facts**

  Store validator id/version, command or method, timestamps, status, observations, private raw-output reference and public-safe summary.

- [ ] **Step 4: Implement report assembly**

  Keep objective results, editorial notes and publication readiness in separate fields. Never synthesize a global score.

- [ ] **Step 5: Verify and commit**

  Run evaluation tests and `pnpm check`; commit as `feat: define evaluation and evidence contracts`.

### Task 2: Implement common process and file validators

**Files:**
- Create: `packages/evaluation/src/validators/command.ts`
- Create: `packages/evaluation/src/validators/files.ts`
- Create: `packages/evaluation/src/validators/json.ts`
- Create: `packages/evaluation/src/validators/index.ts`
- Create: `packages/evaluation/test/validators.test.ts`

**Interfaces:**
- Produces: `CommandValidator`, `RequiredFilesValidator`, `JsonSchemaValidator`, and `ForbiddenFilesValidator`.

- [ ] **Step 1: Write failing validator tests**

  Cover exit codes, stdout/stderr caps, timeouts, missing files, symlink escapes, JSON schema failures and forbidden credential filenames.

- [ ] **Step 2: Run and confirm failure**

  Run the focused validator tests; expect missing implementations.

- [ ] **Step 3: Implement validators inside isolation**

  Execute commands only through `IsolatedWorkspace.exec`; cap output bytes and preserve overflow privately. Resolve every file path against the output root.

- [ ] **Step 4: Verify and commit**

  Run package tests and `pnpm check`; commit as `feat: add common output validators`.

### Task 3: Implement browser validation and desktop capture

**Files:**
- Create: `packages/evaluation/src/browser/server.ts`
- Create: `packages/evaluation/src/browser/validate.ts`
- Create: `packages/evaluation/src/browser/capture.ts`
- Create: `packages/evaluation/test/browser.test.ts`
- Create: `packages/evaluation/test/fixtures/web-app/*`

**Interfaces:**
- Produces: `validateWebApp(recipe, workspace): Promise<WebValidationResult>`.
- Produces: `captureDesktop(recipe, workspace): Promise<Evidence[]>`.

- [ ] **Step 1: Create a fixture with intentional console and resource errors**

  Add a deterministic local web fixture containing one healthy route and one failing route; write tests for startup, readiness, console collection and screenshot dimensions.

- [ ] **Step 2: Run and confirm failure**

  Run `pnpm --filter @aibench/evaluation test -- browser`; expect missing browser helpers.

- [ ] **Step 3: Implement server lifecycle and readiness**

  Start only the benchmark-declared command, wait for the declared URL, allocate a recorded port, and terminate the owned process tree after capture.

- [ ] **Step 4: Implement Playwright capture**

  Default to a fixed desktop viewport, reduced motion and clean browser profile. Record console errors, failed requests, final URL, screenshot hash and optional scripted interactions. Mobile and video remain opt-in.

- [ ] **Step 5: Verify determinism and commit**

  Run the browser tests twice and compare metadata, excluding timestamps; commit as `feat: capture reproducible web evidence`.

### Task 4: Implement the standardized repair pass

**Files:**
- Create: `packages/evaluation/src/repair/prompt.ts`
- Create: `packages/evaluation/src/repair/runner.ts`
- Create: `packages/evaluation/test/repair.test.ts`
- Modify: `apps/cli/src/main.ts`
- Create: `apps/cli/src/commands/repair.ts`

**Interfaces:**
- Produces: `buildRepairPrompt(originalPrompt, objectiveFailures): string`.
- Produces: `runRepair(parentRunId): Promise<RunManifest>`.
- Produces: `aibench repair <run-id>`.

- [ ] **Step 1: Write failing repair-policy tests**

  Assert that only the original prompt, objective diagnostics and the approved neutral instruction appear. Reject editorial hints and require the same adapter/profile/workspace lineage.

- [ ] **Step 2: Run and confirm failure**

  Run evaluation and CLI repair tests; expect missing implementation.

- [ ] **Step 3: Implement neutral prompt construction**

  Use the fixed instruction: “Revisa el resultado completo frente al prompt original, ejecuta las comprobaciones disponibles y corrige los incumplimientos o errores que detectes. No añadas funcionalidades ajenas al encargo.” Attach structured objective failures without interpretation.

- [ ] **Step 4: Implement repair execution**

  Copy the immutable first-shot output into a new repair workspace, link the new run to its parent, enforce 15 minutes by default, and preserve both final trees.

- [ ] **Step 5: Verify and commit**

  Run repair tests and `pnpm check`; commit as `feat: add standardized repair pass`.

### Task 5: Inventory and map legacy candidates

**Files:**
- Create: `legacy-migration/mapping.yaml`
- Create: `legacy-migration/README.md`
- Create: `packages/evaluation/src/legacy/inventory.ts`
- Create: `packages/evaluation/test/legacy-inventory.test.ts`

**Interfaces:**
- Produces: `inventoryLegacyTree(root): Promise<LegacyInventory>`.
- Produces: explicit mapping from historical folder names to safe profile slugs.

- [ ] **Step 1: Write failing inventory tests using a synthetic legacy tree**

  Cover generated dependency directories, nested Git repositories, empty runs, reference-only folders, `RESULTS.md`, screenshots and unknown directories.

- [ ] **Step 2: Run and confirm failure**

  Run `pnpm --filter @aibench/evaluation test -- legacy`; expect missing inventory logic.

- [ ] **Step 3: Implement read-only inventory**

  Classify source, generated, evidence, repository metadata and unknown files without following external symlinks or opening secret-shaped files.

- [ ] **Step 4: Encode the known historical mapping**

  Map `codex`, `oxalpha`, `qwen`, `qwen2` and `qwen3-medium` to the five profiles documented in the specification. Record test 09 as absent, test 08/qwen as empty and test 10/codex as reference-only.

- [ ] **Step 5: Verify against the copied archive and commit**

  Run inventory in report-only mode on `legacy/qwen-vs-codex-tests`; compare counts with the inspection baseline and commit as `feat: inventory legacy benchmark outputs`.

### Task 6: Build legacy candidate manifests without publishing

**Files:**
- Create: `packages/evaluation/src/legacy/import.ts`
- Create: `packages/evaluation/src/legacy/git-diff.ts`
- Create: `packages/evaluation/test/legacy-import.test.ts`
- Modify: `apps/cli/src/main.ts`
- Create: `apps/cli/src/commands/import-legacy.ts`

**Interfaces:**
- Produces: `importLegacy(mapping, source, destination): Promise<LegacyImportReport>`.
- Produces: `aibench import-legacy --dry-run` and explicit `--write-candidates` mode.

- [ ] **Step 1: Write failing import tests**

  Prove exclusion of `node_modules`, `.next`, `.venv`, `.gradle`, build directories and nested `.git`; prove preservation of source, lockfiles, screenshots, `RESULTS.md` and Git patch files.

- [ ] **Step 2: Run and confirm failure**

  Run the focused legacy import tests; expect missing importer.

- [ ] **Step 3: Implement safe candidate generation**

  Copy only classified public candidates into `state/review/legacy/<candidate-id>`, calculate hashes, label every record `legacy-unverified`, and set unknown duration/cost/version fields to explicit `null` with a reason.

- [ ] **Step 4: Reconstruct nested-repository evidence**

  For test 08, export the base commit id and patch without altering either repository. Treat divergent Codex and GLM fixes as separate results.

- [ ] **Step 5: Run dry import and review report**

  Require zero writes outside `state/review`, zero changes to legacy Git status and a complete list of excluded/generated material.

- [ ] **Step 6: Verify and commit**

  Run `pnpm check`; commit as `feat: create reviewable legacy imports`.

### Task 7: Add candidate benchmark drafting without activating tests

**Files:**
- Create: `apps/cli/src/commands/draft-benchmark.ts`
- Create: `packages/evaluation/src/legacy/draft-benchmark.ts`
- Create: `packages/evaluation/test/draft-benchmark.test.ts`

**Interfaces:**
- Produces: `aibench draft-benchmark <legacy-test> --status draft`.
- Produces: a draft directory under `state/review/benchmarks`, never directly under the public catalog.

- [ ] **Step 1: Write failing draft tests**

  Assert that prompts are copied byte-for-byte, English translations are marked informational, fixtures require an explicit public-license declaration, and the resulting status remains `draft`.

- [ ] **Step 2: Run and confirm failure**

  Run focused tests; expect missing command and drafting function.

- [ ] **Step 3: Implement draft generation**

  Use the supplied ten-prompt source as candidate input, but require individual human review before a draft can be promoted into `benchmarks/`.

- [ ] **Step 4: Verify and commit**

  Run `pnpm check`; commit as `feat: draft benchmarks from legacy material`.
