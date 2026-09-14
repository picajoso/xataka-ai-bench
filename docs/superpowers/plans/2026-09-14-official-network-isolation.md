# Official Network Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce and measure the network policy of every official Docker run without exposing endpoints or credentials.

**Architecture:** A per-run internal Docker network joins the agent to a minimal TCP proxy sidecar. The sidecar alone also joins Docker's egress network and receives private destination data, while the agent sees only a synthetic alias. Preflight verifies the permitted alias works and a prohibited hostname fails, emitting safe diagnostics before an adapter can start.

**Tech Stack:** TypeScript, Docker CLI, Vitest, Node TCP networking.

**Spec:** `docs/superpowers/specs/2026-09-14-official-network-isolation-design.md`

## Global Constraints

- Official comparable execution is Docker `official-container` only.
- `blocked` must remain `--network none` with no network or sidecar.
- Private endpoints, ports and credential values never enter Git, run events or public manifests.
- Per-run networks and sidecars must be removed after success, failure, timeout and cancellation.
- Docker Desktop raw-IP egress is a documented limitation, not a claim of hard firewalling.

---

### Task 1: Define private endpoint and safe network evidence contracts

**Files:**
- Modify: `packages/config/src/catalog.ts`
- Modify: `examples/execution-profiles.example.yaml`
- Create: `packages/runner/src/network/types.ts`
- Create: `packages/runner/test/network-contract.test.ts`

**Interfaces:**
- Produces `PrivateEndpoint { alias, host, port }` only from `state/execution-profiles.yaml`.
- Produces `NetworkEvidence { proxyVersion, allowListHash }` with no destination values.

- [ ] **Step 1: Write failing contract tests** asserting an endpoint must have a synthetic alias, host and valid TCP port, and that generated evidence has only a SHA-256 digest.
- [ ] **Step 2: Run** `pnpm exec vitest run packages/runner/test/network-contract.test.ts` and confirm missing exports.
- [ ] **Step 3: Implement schemas and canonical hashing** in focused modules; reject URL-shaped hosts, invalid aliases and secret-like values.
- [ ] **Step 4: Re-run focused tests and typecheck.**
- [ ] **Step 5: Commit** with `feat: define private network contracts`.

### Task 2: Create and remove isolated Docker network resources

**Files:**
- Create: `packages/runner/src/network/docker-network.ts`
- Modify: `packages/runner/src/isolation/docker.ts`
- Create: `packages/runner/test/docker-network.test.ts`

**Interfaces:**
- Produces `NetworkProvisioner.create(runId, policy, endpoint): Promise<NetworkLease | null>`.
- `NetworkLease.dispose(): Promise<void>` removes the sidecar and per-run network idempotently.

- [ ] **Step 1: Write failing tests** using a Docker-command seam; assert `blocked` produces no lease, names derive from a run identifier and disposal always issues sidecar removal before network removal.
- [ ] **Step 2: Run** `pnpm exec vitest run packages/runner/test/docker-network.test.ts` and confirm failure.
- [ ] **Step 3: Implement the provisioner** with `docker network create --internal`, proxy sidecar startup attached to that internal network and Docker's egress network, and a unique synthetic alias; pass only environment-variable names or mounted private config, never values in CLI arguments.
- [ ] **Step 4: Integrate lease lifecycle** into `DockerIsolationProvider`, ensuring `dispose` runs in existing executor `finally` paths.
- [ ] **Step 5: Re-run focused tests and commit** with `feat: add per-run Docker network leases`.

### Task 3: Add proxy image and local endpoint forwarding

**Files:**
- Create: `images/network-proxy/Dockerfile`
- Create: `images/network-proxy/proxy.mjs`
- Create: `images/network-proxy/README.md`
- Create: `packages/runner/test/network-proxy.test.ts`

**Interfaces:**
- Proxy consumes an alias-facing listen port and one private host/port destination.
- Proxy emits a fixed version string and no destination details.

- [ ] **Step 1: Write failing unit tests** for configuration validation and a forwarding fixture; reject extra destinations and malformed private configuration.
- [ ] **Step 2: Run** `pnpm exec vitest run packages/runner/test/network-proxy.test.ts` and confirm the missing proxy module.
- [ ] **Step 3: Implement a minimal TCP forwarder** that accepts one configured destination and writes only lifecycle metadata to stdout.
- [ ] **Step 4: Build the image locally only after tests pass;** tag it with a pinned version and document the build command.
- [ ] **Step 5: Commit** with `feat: add single-destination network proxy`.

### Task 4: Measure preflight network isolation

**Files:**
- Create: `packages/runner/src/network/preflight.ts`
- Modify: `packages/runner/src/executor.ts`
- Create: `packages/runner/test/network-preflight.test.ts`

**Interfaces:**
- Produces `verifyNetworkIsolation(workspace, policy, endpoint): Promise<NetworkEvidence>`.
- Throws on permitted-endpoint failure or forbidden-control success before adapter preflight.

- [ ] **Step 1: Write failing tests** for accepted permitted reachability, rejected forbidden reachability and safe event payloads.
- [ ] **Step 2: Run** `pnpm exec vitest run packages/runner/test/network-preflight.test.ts` and confirm failure.
- [ ] **Step 3: Implement commands inside the isolated workspace** with bounded output; emit an executor diagnostic with proxy version and allow-list hash only.
- [ ] **Step 4: Ensure failures transition to `INFRA_ERROR`** through the existing executor error path and adapters are not started.
- [ ] **Step 5: Run focused tests and commit** with `feat: verify official network isolation`.

### Task 5: Wire private profiles, document limits and verify lifecycle

**Files:**
- Modify: `apps/cli/src/main.ts`
- Modify: `CLAUDE.md`
- Modify: `docs/superpowers/specs/2026-09-11-xataka-ai-bench-design.md`
- Create: `docs/network-isolation.md`
- Modify: `packages/runner/test/isolation.test.ts`

**Interfaces:**
- Official run setup resolves only the matching private endpoint profile.
- CLI returns a preflight/configuration error when network data is absent; it does not fall back to native execution.

- [ ] **Step 1: Write failing CLI and isolation tests** for missing endpoint configuration, rejected native fallback and cleanup after an adapter failure.
- [ ] **Step 2: Run focused tests** and confirm failure.
- [ ] **Step 3: Wire the matching profile to Docker requests** and validate no secrets occur in output.
- [ ] **Step 4: Document Docker Desktop raw-IP limitation** and the future Linux-VM hardening path in the methodology and developer operating guide.
- [ ] **Step 5: Run `pnpm check`, build the web portal and commit** with `feat: enforce official Docker network isolation`.
