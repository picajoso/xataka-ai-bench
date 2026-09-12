# Runner, Adapters, and Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Execute one benchmark sequentially through a deterministic fake adapter, Codex CLI, or OpenCode while preserving state, enforcing limits, and isolating generated work.

**Architecture:** A state-machine runner consumes validated benchmark and system profiles, creates an immutable run directory, delegates agent-specific behavior to adapters, and writes append-only JSONL events. A Docker-compatible isolation layer owns the disposable workspace; native mode is explicit and experimental.

**Tech Stack:** TypeScript, Node.js child processes through execa, Vitest, Docker CLI, Codex CLI `exec --json`, OpenCode `run --format json`.

**Spec:** `docs/superpowers/specs/2026-09-11-xataka-ai-bench-design.md`

## Global Constraints

- Execute official runs sequentially under a global lock.
- Default limits are 30 minutes for first-shot and 15 minutes for repair.
- Distinguish system failure from `INFRA_ERROR`.
- Never print, persist, or publish secret values.
- Never fall back from the external SSD to internal storage.
- Do not execute a real paid or local model during automated tests.

---

### Task 1: Implement the adapter contract and deterministic fake

**Files:**
- Create: `packages/adapters/package.json`
- Create: `packages/adapters/src/types.ts`
- Create: `packages/adapters/src/fake.ts`
- Create: `packages/adapters/src/index.ts`
- Create: `packages/adapters/test/contract.test.ts`
- Create: `packages/adapters/test/fake.test.ts`

**Interfaces:**
- Produces: `AgentAdapter.preflight(context): Promise<PreflightReport>`.
- Produces: `AgentAdapter.start(context): AsyncIterable<AdapterEvent>`.
- Produces: `AgentAdapter.cancel(reason): Promise<void>`.
- Produces: `FakeAdapter` with scripted events, delays, exit states and file changes.

- [x] **Step 1: Write the adapter contract tests**

  Test success, structured messages, tool events, stderr diagnostics, cancellation, non-zero exit, malformed event and delayed timeout scenarios.

- [x] **Step 2: Run and confirm failure**

  Run `pnpm --filter @aibench/adapters test`; expect missing exports.

- [x] **Step 3: Implement normalized adapter events**

  Define `session.started`, `message.delta`, `tool.started`, `tool.finished`, `usage`, `diagnostic`, `session.finished` and `adapter.error`, preserving raw vendor events separately.

- [x] **Step 4: Implement the deterministic fake**

  Allow tests to create files only inside the supplied workspace and emit reproducible timestamps through an injected clock.

- [x] **Step 5: Verify and commit**

  Run package tests and `pnpm typecheck`; commit as `feat: define agent adapter contract`.

### Task 2: Implement append-only run storage and state transitions

**Files:**
- Create: `packages/runner/package.json`
- Create: `packages/runner/src/run-store.ts`
- Create: `packages/runner/src/state-machine.ts`
- Create: `packages/runner/src/ids.ts`
- Create: `packages/runner/test/run-store.test.ts`
- Create: `packages/runner/test/state-machine.test.ts`

**Interfaces:**
- Produces: `createRun(plan): Promise<RunHandle>`.
- Produces: `appendEvent(runId, event): Promise<void>` using atomic append.
- Produces: `transition(runId, nextState, reason?): Promise<RunManifest>`.
- Produces: sortable `run_id` values containing UTC time and a random suffix.

- [x] **Step 1: Write failing state and persistence tests**

  Cover every allowed transition, forbidden regression, interrupted write, resume after process death, immutable terminal records and separate technical attempt identifiers.

- [x] **Step 2: Run and confirm failure**

  Run `pnpm --filter @aibench/runner test`; expect missing store and state machine.

- [x] **Step 3: Implement atomic manifests and append-only events**

  Write a temporary manifest in the same directory, sync, then rename. Never rewrite `events.jsonl`; append a terminal correction event if reconciliation is needed.

- [x] **Step 4: Implement strict transitions**

  Permit infrastructure retry only from `INFRA_ERROR`; model failures remain terminal outcomes. Keep publication status orthogonal to benchmark status.

- [x] **Step 5: Verify and commit**

  Run package tests and `pnpm check`; commit as `feat: persist immutable run state`.

### Task 3: Implement planning, locking, timeout, and cancellation

**Files:**
- Create: `packages/runner/src/planner.ts`
- Create: `packages/runner/src/lock.ts`
- Create: `packages/runner/src/executor.ts`
- Create: `packages/runner/test/planner.test.ts`
- Create: `packages/runner/test/executor.test.ts`

**Interfaces:**
- Produces: `createBatchPlan(benchmarks, systems, options): BatchPlan`.
- Produces: `withGlobalRunLock(fn): Promise<T>`.
- Produces: `executeRun(plan, adapter, isolation): Promise<RunManifest>`.

- [ ] **Step 1: Write failing planner and executor tests**

  Test Cartesian selection, explicit exclusions, sequential order, lock contention, SIGINT, first-shot timeout, repair timeout and cleanup after adapter failure.

- [ ] **Step 2: Run and confirm failure**

  Run `pnpm --filter @aibench/runner test`; expect planner and executor imports to fail.

- [ ] **Step 3: Implement deterministic plans**

  Sort by benchmark slug then system slug, record exact versions and hashes, and require explicit confirmation metadata before an official plan becomes executable.

- [ ] **Step 4: Implement cross-process locking and timeouts**

  Store a PID/host lock under `state`, detect stale locks safely, send graceful cancellation, then terminate the owned process tree after a bounded grace period.

- [ ] **Step 5: Verify and commit**

  Run runner tests and `pnpm check`; commit as `feat: plan and control sequential runs`.

### Task 4: Implement Docker-compatible isolation

**Files:**
- Create: `packages/runner/src/isolation/types.ts`
- Create: `packages/runner/src/isolation/docker.ts`
- Create: `packages/runner/src/isolation/native.ts`
- Create: `packages/runner/test/isolation.test.ts`
- Create: `images/agent-runner/Dockerfile`
- Create: `images/agent-runner/entrypoint.sh`

**Interfaces:**
- Produces: `IsolationProvider.prepare(run): Promise<IsolatedWorkspace>`.
- Produces: `IsolatedWorkspace.exec(command): AsyncIterable<ProcessEvent>`.
- Produces: `IsolatedWorkspace.dispose(): Promise<void>`.

- [x] **Step 1: Write failing isolation contract tests**

  Prove workspace confinement, read-only fixture mounting, writable output, network policy translation, process cleanup and rejection of native mode for an official run.

- [x] **Step 2: Run and confirm failure**

  Run `pnpm --filter @aibench/runner test -- isolation`; expect missing providers.

- [x] **Step 3: Implement the Docker provider**

  Use explicit bind mounts under the external SSD, a non-root container user, capped CPU/memory/pids, a read-only root filesystem where compatible, and named network policies. Do not mount the Docker socket.

- [x] **Step 4: Implement labeled native mode**

  Require `executionClass: experimental-native`; make it impossible to emit an official comparable result from this provider.

- [ ] **Step 5: Verify with a harmless fixture**

  Run contract tests against the fake provider in CI and the real Docker provider only when `AIBENCH_DOCKER_TESTS=1`. Confirm the workspace is removed and the source fixture unchanged.

- [ ] **Step 6: Commit isolation**

  Commit as `feat: isolate benchmark workspaces`.

### Task 5: Implement the Codex adapter

**Files:**
- Create: `packages/adapters/src/codex.ts`
- Create: `packages/adapters/src/jsonl.ts`
- Create: `packages/adapters/test/codex.test.ts`
- Create: `systems/examples/codex-agentrouter.example.yaml`

**Interfaces:**
- Consumes: `AgentAdapter` and `IsolatedWorkspace`.
- Produces: `CodexAdapter` using `codex exec --json --cd <workspace> --skip-git-repo-check` plus profile-defined safe arguments.

- [ ] **Step 1: Write failing parser and command tests**

  Use recorded synthetic JSONL fixtures to test messages, tool calls, usage, malformed lines, stderr and exit classification. Assert that secret values never enter command snapshots.

- [ ] **Step 2: Run and confirm failure**

  Run `pnpm --filter @aibench/adapters test -- codex`; expect missing adapter.

- [ ] **Step 3: Implement preflight and command construction**

  Verify the configured executable or wrapper, exact CLI version, selected model/profile, authentication presence and output mode. Treat the current shell alias as user configuration; never inspect or serialize its API key.

- [ ] **Step 4: Implement event normalization and cancellation**

  Preserve raw JSONL under private state, emit normalized events, capture the last response and classify exit, timeout and infrastructure failures.

- [ ] **Step 5: Verify without a model call and commit**

  Run fixture tests and a `--help` preflight only; commit as `feat: add codex cli adapter`.

### Task 6: Implement the OpenCode adapter

**Files:**
- Create: `packages/adapters/src/opencode.ts`
- Create: `packages/adapters/test/opencode.test.ts`
- Create: `systems/examples/opencode-lmstudio.example.yaml`
- Create: `systems/examples/opencode-ninfer.example.yaml`

**Interfaces:**
- Produces: `OpenCodeAdapter` using `opencode run --format json --dir <workspace> --model <provider/model>` and an explicit variant.

- [ ] **Step 1: Write failing parser and command tests**

  Cover JSON event normalization, `--variant`, attachments, connection errors, permission denials and secret redaction.

- [ ] **Step 2: Run and confirm failure**

  Run `pnpm --filter @aibench/adapters test -- opencode`; expect missing adapter.

- [ ] **Step 3: Implement preflight and command construction**

  Validate OpenCode 1.18.30 or the version pinned in the profile, provider/model availability, endpoint reachability and permission configuration. Use scoped permission rules; do not default to unrestricted `--auto` outside an external sandbox.

- [ ] **Step 4: Implement event normalization and cancellation**

  Preserve raw private events and emit the same normalized contract used by Codex.

- [ ] **Step 5: Verify without a model call and commit**

  Run fixture tests and a `--help` preflight only; commit as `feat: add opencode adapter`.

### Task 7: Expose the operational CLI

**Files:**
- Create: `apps/cli/src/main.ts`
- Create: `apps/cli/src/commands/doctor.ts`
- Create: `apps/cli/src/commands/list.ts`
- Create: `apps/cli/src/commands/plan.ts`
- Create: `apps/cli/src/commands/run.ts`
- Create: `apps/cli/src/commands/status.ts`
- Create: `apps/cli/test/cli.test.ts`

**Interfaces:**
- Produces: executable `aibench doctor|list|plan|run|status`.
- Consumes: config, contracts, runner and adapters packages.

- [ ] **Step 1: Write failing CLI acceptance tests**

  Test human-readable and `--json` output, exit codes, confirmation requirement, unavailable SSD, duplicate lock and fake-adapter success/failure.

- [ ] **Step 2: Run and confirm failure**

  Run `pnpm --filter @aibench/cli test`; expect missing commands.

- [ ] **Step 3: Implement commands with no interactive ambiguity**

  `plan` writes a signed-off plan file; `run` accepts only its identifier and requires `--confirm` for real adapters. Default all development tests to `fake`.

- [ ] **Step 4: Exercise the synthetic benchmark**

  Run `aibench doctor`, `aibench list`, `aibench plan --benchmark smoke --system fake`, and the confirmed fake run. Verify the immutable run directory and event log.

- [ ] **Step 5: Verify and commit**

  Run `pnpm check`; commit as `feat: expose benchmark runner cli`.
