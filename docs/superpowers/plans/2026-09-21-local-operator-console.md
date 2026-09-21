# Local Operator Console Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a private, localhost-only dashboard for operating Xataka AI Bench without exposing private state, credentials, endpoints, raw logs, or workspaces.

**Architecture:** A new `apps/console` Node HTTP application binds only to `127.0.0.1` and renders server-side HTML. Its API layer uses validated identifiers to call existing CLI capabilities in-process; it never invokes a shell from form input. Read models are curated from catalog, run manifests, and review records, with every displayed string and filesystem link sanitized.

**Tech Stack:** Node.js 22, TypeScript, Node `http`, existing `@aibench/config`, `@aibench/contracts`, `@aibench/runner`, `@aibench/publisher`, and Vitest. No new browser framework or network-facing service.

**Spec:** `docs/superpowers/specs/2026-09-21-portal-detail-and-local-console-design.md`

## Global Constraints

- Bind the server exclusively to `127.0.0.1`; never add a LAN listener, tunnel, deployment target, or public API route.
- `AIBENCH_HOME` remains exactly `/Volumes/MacOS_VMs/xataka-ai-bench`; every filesystem reference must resolve below it.
- Never render credential values, environment-variable values, private endpoint URLs, raw JSONL logs, workspace files, or model transcripts.
- Use only validated benchmark, system, run, and candidate identifiers; no request supplies a filesystem path or shell argument.
- A plan/run/repair action has a preview and an explicit confirmation step. The console never approves, stages, publishes, or promotes a result automatically.
- The public Next/Vercel build remains separate and does not import or build `apps/console`.

## Review Focus

- A request with a traversal-like or malformed run/candidate identifier returns 404/400 without resolving a private path; Task 1 tests this.
- A manifest or candidate with a credential-shaped string cannot make that string appear in the HTML or JSON response; Task 1 tests this.
- The listener has no path to bind `0.0.0.0` or an arbitrary host; Task 2 tests its server options.
- A POST lacking the one-time confirmation token cannot create a plan, start a run, or start a repair; Task 3 tests every mutation.
- A candidate review action can prepare facts but cannot approve or stage a package; Task 3 tests the exact CLI arguments.

---

### Task 1: Define safe local-console read models

**Files:**
- Create: `apps/console/package.json`
- Create: `apps/console/tsconfig.json`
- Create: `apps/console/src/model.ts`
- Create: `apps/console/test/model.test.ts`
- Modify: `packages/runner/src/run-store.ts`
- Modify: `packages/runner/test/run-store.test.ts`

**Interfaces:**
- Consumes: `RunManifest`, `RunIdSchema`, `resolveBenchPaths()`.
- Produces: `listRuns(): Promise<RunManifest[]>`, `toConsoleRun(manifest): ConsoleRun`, `sanitizeConsoleText(value): string`, and `assertConsoleId(value, kind): string`.

- [ ] **Step 1: Write failing tests for list and sanitization**

```ts
test("lists only valid manifests and exposes a redacted run view", async () => {
  const runs = await new RunStore({ runsRoot }).listRuns();
  expect(runs.map((run) => run.runId)).toEqual([runId]);
  expect(toConsoleRun({ ...runs[0]!, failure: { classification: "INFRASTRUCTURE", summary: "token=private-value" } }).failureSummary)
    .toContain("[redacted]");
});

test("rejects path-like console identifiers", () => {
  expect(() => assertConsoleId("../state", "run")).toThrow("Invalid run identifier");
});
```

- [ ] **Step 2: Run the focused tests to verify failure**

Run: `pnpm vitest run packages/runner/test/run-store.test.ts apps/console/test/model.test.ts`

Expected: FAIL because `listRuns`, `toConsoleRun`, and `assertConsoleId` do not exist.

- [ ] **Step 3: Implement the minimum safe models**

```ts
async listRuns(): Promise<RunManifest[]> {
  const entries = await readdir(this.#runsRoot, { withFileTypes: true });
  return (await Promise.all(entries.filter((entry) => entry.isDirectory() && RunIdSchema.safeParse(entry.name).success)
    .map((entry) => this.loadRun(entry.name)))).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export function sanitizeConsoleText(value: string): string {
  return value.replace(/(?:sk-|token|api[_-]?key|secret|password)[^\s,]*/gi, "[redacted]").slice(0, 500);
}
```

`ConsoleRun` includes only `runId`, benchmark and system slugs, attempt kind, status, created/finished timestamps, publication status, and a sanitized failure summary. It contains no endpoint, profile, environment, output, event, or workspace field.

- [ ] **Step 4: Run the focused tests to verify green**

Run: `pnpm vitest run packages/runner/test/run-store.test.ts apps/console/test/model.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the safe read contract**

```bash
git add apps/console/package.json apps/console/tsconfig.json apps/console/src/model.ts apps/console/test/model.test.ts packages/runner/src/run-store.ts packages/runner/test/run-store.test.ts
git commit -m "feat: add safe local console read models"
```

### Task 2: Add a localhost-only console server and read routes

**Files:**
- Create: `apps/console/src/server.ts`
- Create: `apps/console/src/routes.ts`
- Create: `apps/console/src/html.ts`
- Create: `apps/console/src/bin.ts`
- Create: `apps/console/test/server.test.ts`
- Modify: `package.json`
- Modify: `pnpm-workspace.yaml`

**Interfaces:**
- Consumes: `ConsoleRun`, `resolveBenchPaths()`, `loadBenchmark()`, `loadSystemProfile()`, `RunStore.listRuns()`.
- Produces: `createConsoleServer(dependencies): Server`, `startConsole({ port? }): Promise<Server>`, and safe GET routes `/`, `/api/overview`, `/api/runs`, `/api/runs/:runId`.

- [ ] **Step 1: Write failing server tests**

```ts
test("binds only to loopback and never accepts a caller-selected host", async () => {
  const server = await startConsole({ port: 0 });
  expect(server.address()).toMatchObject({ address: "127.0.0.1" });
});

test("returns sanitized runs and rejects a path-like route id", async () => {
  expect((await request(server, "/api/runs")).body).not.toContain("token=");
  expect((await request(server, "/api/runs/..%2Fstate")).status).toBe(400);
});
```

- [ ] **Step 2: Run the server tests to verify failure**

Run: `pnpm vitest run apps/console/test/server.test.ts`

Expected: FAIL because the console server is absent.

- [ ] **Step 3: Implement read-only routes and HTML escaping**

```ts
export async function startConsole({ port = 3847 }: { port?: number } = {}): Promise<Server> {
  const server = createConsoleServer();
  await once(server.listen(port, "127.0.0.1"), "listening");
  return server;
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}
```

The overview reports only storage availability, Docker availability, available public benchmark/system slugs, and names of required environment variables. It does not print their values. Run detail exposes the curated `ConsoleRun` only. All route methods other than GET return 405 in this task.

- [ ] **Step 4: Run the server tests to verify green**

Run: `pnpm vitest run apps/console/test/server.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit read-only console delivery**

```bash
git add apps/console package.json pnpm-workspace.yaml
git commit -m "feat: add localhost operator console"
```

### Task 3: Add preview-then-confirm operator actions

**Files:**
- Create: `apps/console/src/actions.ts`
- Modify: `apps/console/src/routes.ts`
- Modify: `apps/console/src/html.ts`
- Modify: `apps/console/test/server.test.ts`

**Interfaces:**
- Consumes: `runCli(args)`, public catalog identifiers, `ConsoleRun` status, in-memory `ConfirmationStore`.
- Produces: `POST /actions/plan/preview`, `POST /actions/plan/confirm`, `POST /actions/run/preview`, `POST /actions/run/confirm`, `POST /actions/repair/preview`, `POST /actions/repair/confirm`, and `POST /actions/review/preview`.

- [ ] **Step 1: Write failing confirmation tests**

```ts
test("does not create a plan before confirmation", async () => {
  await request(server, "/actions/plan/preview", { benchmark: benchmarkSlug, system: systemSlug });
  expect(cliCalls).toEqual([]);
});

test("uses only fixed CLI argument shapes after a valid confirmation", async () => {
  const token = await previewPlan(server, benchmarkSlug, systemSlug);
  await confirm(server, token);
  expect(cliCalls).toEqual([["plan", "--benchmark", benchmarkSlug, "--system", systemSlug, "--confirm", "--json"]]);
});

test("review preparation never passes approve or publish arguments", async () => {
  await previewReview(server, candidateId);
  expect(cliCalls[0]).toEqual(["review", candidateId, "--json"]);
});
```

- [ ] **Step 2: Run action tests to verify failure**

Run: `pnpm vitest run apps/console/test/server.test.ts`

Expected: FAIL because action routes and confirmation tokens do not exist.

- [ ] **Step 3: Implement a one-time confirmation store and allow-listed actions**

```ts
type PendingAction = { token: string; kind: "plan" | "run" | "repair" | "review"; args: string[]; expiresAt: number };

export class ConfirmationStore {
  create(kind: PendingAction["kind"], args: string[]): PendingAction { /* random token, 5-minute expiry */ }
  consume(token: string, kind: PendingAction["kind"]): PendingAction | null { /* first use only */ }
}
```

Validate benchmark and system identifiers against the public catalog before previewing. Validate run IDs with `RunIdSchema` and permit repair only for a first-shot run with `FAILED` + `VALIDATION_FAILURE`. The run action fixes the adapter to `opencode`; no request can select executable, model, endpoint, environment, extra flags, or a shell command. Review invokes only `review <candidateId> --json`, never `--approve` or `publish`.

- [ ] **Step 4: Run action tests to verify green**

Run: `pnpm vitest run apps/console/test/server.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit confirmed actions**

```bash
git add apps/console
git commit -m "feat: add confirmed local console actions"
```

### Task 4: Document operation and prove public-build separation

**Files:**
- Modify: `README.es.md`
- Modify: `README.en.md`
- Modify: `apps/web/test/content.test.ts`
- Modify: `.github/workflows/check.yml`

**Interfaces:**
- Consumes: `pnpm --filter @aibench/console dev`, the public web build.
- Produces: documented local-only startup and a CI assertion that the public output does not contain console routes or private-state strings.

- [ ] **Step 1: Write the failing public separation assertion**

```ts
test("does not publish operator-console routes or private state references", () => {
  expect(readFileSync("apps/web/out/en.html", "utf8")).not.toContain("/api/runs");
  expect(readFileSync("apps/web/out/en.html", "utf8")).not.toContain("/state/");
});
```

- [ ] **Step 2: Run the assertion after a web build to verify it fails before the guard exists**

Run: `pnpm --filter @aibench/web build && pnpm vitest run apps/web/test/content.test.ts`

Expected: FAIL because the export-separation assertion is absent.

- [ ] **Step 3: Document and enforce local-only operation**

Document `pnpm --filter @aibench/console dev`, the fixed `http://127.0.0.1:3847` address, confirmation behavior, and the fact that a browser click remains human authorization for a model run. Add the static-output assertion to the post-build verification path; do not add `apps/console` to Vercel configuration.

- [ ] **Step 4: Run final verification**

Run:

```bash
env PATH=/Users/javipas/.nvm/versions/node/v22.20.0/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin pnpm check
env PATH=/Users/javipas/.nvm/versions/node/v22.20.0/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin pnpm --filter @aibench/web build
scripts/verify-public-export.sh
```

Expected: the complete suite and public export pass; the console remains absent from `apps/web/out`.

- [ ] **Step 5: Commit the documented console**

```bash
git add apps/console README.es.md README.en.md apps/web/test/content.test.ts .github/workflows/check.yml
git commit -m "docs: document local operator console"
```

## Plan Self-Review

- **Spec coverage:** Tasks 1–2 deliver curated private reads and a loopback-only server; Task 3 delivers the preview/confirmation workflow without automatic approval or publication; Task 4 proves deployment separation and documents operation. LAN authentication, votes, a public API, and automatic Vercel promotion are deliberately outside this plan.
- **Placeholder scan:** Every task names concrete files, routes, interfaces, tests, commands, and commit boundaries. No placeholder implementation or deferred behavior is used.
- **Type consistency:** `ConsoleRun`, `assertConsoleId`, `startConsole`, `ConfirmationStore`, and the action routes are defined before the consumers that depend on them.
- **Review focus:** Path-like identifiers and redaction are tested in Task 1; loopback binding in Task 2; confirmation, fixed CLI arguments, and non-approval review in Task 3; public-build separation in Task 4.
