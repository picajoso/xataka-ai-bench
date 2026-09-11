# Foundation, Storage, and Contracts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the external-SSD project, verified legacy archive, TypeScript workspace, private-state boundary, and versioned data contracts without executing an AI model.

**Architecture:** `/Volumes/MacOS_VMs/xataka-ai-bench/platform` is the only Git repository; `/Volumes/MacOS_VMs/xataka-ai-bench/state` and `legacy` stay outside it. Human-authored definitions use YAML, immutable run records use JSON/JSONL, and Zod schemas are the runtime authority.

**Tech Stack:** Node.js 22.20.0, pnpm 11.0.8, TypeScript strict mode, Vitest, Zod, YAML, execa.

**Spec:** `docs/superpowers/specs/2026-09-11-xataka-ai-bench-design.md`

## Global Constraints

- Store every project file and runtime artifact under `/Volumes/MacOS_VMs/xataka-ai-bench`.
- Never fall back to the internal disk when the external volume is unavailable.
- Do not delete or modify `/Users/javipas/qwen-vs-codex-tests`.
- Keep secrets, raw logs, workspaces, caches, and review candidates outside the Git repository.
- Use TypeScript strict mode and Node.js 22.
- Do not add a database.
- The existing ten prompts remain candidates until reviewed individually.

---

### Task 1: Create the Git and TypeScript workspace boundary

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `vitest.config.ts`
- Create: `eslint.config.mjs`
- Create: `.gitignore`
- Create: `apps/cli/package.json`
- Create: `packages/contracts/package.json`
- Create: `packages/config/package.json`
- Create: `tests/boundaries/private-state.test.ts`

**Interfaces:**
- Produces: workspace packages `@aibench/contracts` and `@aibench/config`.
- Produces: a repository-boundary test that fails if private runtime directories appear under `platform`.

- [x] **Step 1: Initialize the repository**

  Initialize `platform` with branch `main`. Confirm the only existing files are the approved specification and plans.

- [x] **Step 2: Add the minimal workspace configuration**

  Set `packageManager` to `pnpm@11.0.8`, engines to Node `>=22 <23`, enable strict TypeScript checks, and add scripts `test`, `typecheck`, `lint` and `check`.

- [x] **Step 3: Add explicit ignore rules**

  Ignore generated packages, build output, coverage, environment files, temporary capture files and any accidental `state` or `legacy` directory under the repository.

- [x] **Step 4: Write the boundary test**

  Assert that `state`, `workspaces`, `raw-logs`, `.env`, and credential-shaped files are absent from and ignored by the repository.

- [x] **Step 5: Install and verify**

  Run `pnpm install`, `pnpm test`, and `pnpm typecheck`; all must pass.

- [x] **Step 6: Review tracked files and commit**

  Run `git status --short --ignored`, verify that sibling `state` and `legacy` cannot be staged, and commit as `chore: initialize ai bench workspace`.

### Task 2: Verify storage and create the safety inventory

**Files:**
- Create: `scripts/verify-storage.sh`
- Create: `scripts/archive-legacy.sh`
- Create: `docs/storage-baseline.md`
- Test: `tests/scripts/verify-storage.test.ts`

**Interfaces:**
- Produces: exit code `0` only when `/Volumes/MacOS_VMs/xataka-ai-bench` is the active writable APFS volume.
- Produces: `legacy/inventory.sha256` and `legacy/inventory.json` beside the copied legacy tree.

- [x] **Step 1: Write the failing storage-script tests**

  Cover mounted, missing, read-only, wrong-volume and insufficient-space cases by injecting `BENCH_ROOT` and fixture command output.

- [x] **Step 2: Run the focused tests and confirm failure**

  Run `pnpm vitest run tests/scripts/verify-storage.test.ts`; expect failure because the scripts do not exist.

- [x] **Step 3: Implement storage verification**

  `verify-storage.sh` must resolve the physical mount, require the prefix `/Volumes/MacOS_VMs/`, confirm write access without leaving a file behind, report available bytes, APFS format, ownership mode, encryption state and Docker availability.

- [x] **Step 4: Implement recoverable legacy archival**

  `archive-legacy.sh` must copy `/Users/javipas/qwen-vs-codex-tests/` to `/Volumes/MacOS_VMs/xataka-ai-bench/legacy/qwen-vs-codex-tests/`, preserve metadata, generate sorted SHA-256 inventories on both sides, compare them, and refuse to remove the source.

- [x] **Step 5: Record the storage baseline**

  Document the observed APFS volume, USB protocol, free space, disabled ownership, absent encryption, and the decision required before raw sensitive logs are retained.

- [x] **Step 6: Run tests and a non-copying preflight**

  Run `pnpm vitest run tests/scripts/verify-storage.test.ts` and `scripts/verify-storage.sh`; both must pass. Do not invoke the archival script until the user explicitly approves the 3.2 GB copy.

- [x] **Step 7: Commit the storage guardrails**

  Commit as `chore: add external storage guardrails`.

### Task 3: Define and validate the core contracts

**Files:**
- Create: `packages/contracts/src/benchmark.ts`
- Create: `packages/contracts/src/system.ts`
- Create: `packages/contracts/src/run.ts`
- Create: `packages/contracts/src/evaluation.ts`
- Create: `packages/contracts/src/publication.ts`
- Create: `packages/contracts/src/index.ts`
- Create: `packages/contracts/test/contracts.test.ts`
- Create: `packages/contracts/test/fixtures/*.yaml`
- Create: `packages/contracts/test/fixtures/*.json`

**Interfaces:**
- Produces: Zod schemas and inferred types `BenchmarkDefinition`, `SystemProfile`, `BatchPlan`, `RunManifest`, `RunEvent`, `EvaluationReport`, and `PublicationManifest`.
- Produces: `parseBenchmark`, `parseSystemProfile`, `parseRunManifest`, `parseEvaluationReport`, and `parsePublicationManifest`.

- [ ] **Step 1: Write failing valid/invalid fixture tests**

  Cover semantic versions, lifecycle states, canonical prompt paths, network policy, time budgets, evaluation type, public-input declaration, agent/backend identity and immutable run identifiers.

- [ ] **Step 2: Run contract tests and confirm failure**

  Run `pnpm --filter @aibench/contracts test`; expect missing schema exports.

- [ ] **Step 3: Implement the schemas with strict unknown-key rejection**

  Require `schemaVersion`, stable slugs, ISO timestamps, explicit visibility, exact state enums and structured failure classification. Keep secrets represented only as environment-variable names.

- [ ] **Step 4: Add cross-field refinements**

  Reject official publication when inputs are not public, reject a repair without a parent first-shot run, and reject a translated prompt that claims the canonical prompt hash.

- [ ] **Step 5: Run contract tests and typecheck**

  Run `pnpm --filter @aibench/contracts test` and `pnpm typecheck`; both must pass.

- [ ] **Step 6: Commit the contracts**

  Commit as `feat: define benchmark data contracts`.

### Task 4: Implement deterministic hashing and catalog loading

**Files:**
- Create: `packages/contracts/src/hash.ts`
- Create: `packages/config/src/paths.ts`
- Create: `packages/config/src/catalog.ts`
- Create: `packages/config/src/index.ts`
- Create: `packages/config/test/catalog.test.ts`
- Create: `examples/smoke-benchmark/benchmark.yaml`
- Create: `examples/smoke-benchmark/prompt.es.md`
- Create: `examples/smoke-benchmark/prompt.en.md`

**Interfaces:**
- Produces: `hashFile(path): Promise<string>` and `hashDirectory(path): Promise<string>`.
- Produces: `resolveBenchPaths(env): BenchPaths` with `repoRoot`, `dataRoot`, `runsRoot`, `workspaceRoot`, `cacheRoot`, and `reviewRoot`.
- Produces: `loadBenchmark(path): Promise<LoadedBenchmark>`.

- [ ] **Step 1: Write failing hash and catalog tests**

  Prove stable ordering, line-ending normalization for text, byte preservation for binaries, translated-prompt separation and rejection of paths escaping the benchmark directory.

- [ ] **Step 2: Run tests and confirm failure**

  Run `pnpm --filter @aibench/config test`; expect missing implementations.

- [ ] **Step 3: Implement canonical hashing**

  Hash a versioned manifest containing relative path, content hash and media class. Never follow symlinks outside the test directory.

- [ ] **Step 4: Implement path resolution and catalog loading**

  Require `AIBENCH_HOME=/Volumes/MacOS_VMs/xataka-ai-bench`; fail with a clear error if the volume is unavailable. Load YAML and validate it through `@aibench/contracts`.

- [ ] **Step 5: Add the synthetic smoke benchmark**

  Use a harmless prompt that creates `answer.txt` containing `AI_BENCH_SMOKE_OK`. Mark it non-public and excluded from editorial results.

- [ ] **Step 6: Verify the foundation**

  Run `pnpm check`; expect all tests, lint and typechecking to pass.

- [ ] **Step 7: Commit the loader**

  Commit as `feat: load and hash benchmark definitions`.
