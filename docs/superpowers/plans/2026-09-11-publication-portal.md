# Publication and Bilingual Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn approved run candidates into a safe public dataset and a bilingual editorial portal deployed through GitHub and Vercel.

**Architecture:** The publisher reads only review candidates, performs deterministic redaction and allow-list packaging, then stages a public manifest inside the repository. A Next.js portal statically reads those manifests at build time; Vercel provides preview and production deployment while GitHub remains the public source of truth.

**Tech Stack:** TypeScript, Zod, Vitest, Next.js App Router, React, Playwright, Vercel CLI, Git CLI.

**Spec:** `docs/superpowers/specs/2026-09-11-xataka-ai-bench-design.md`

## Global Constraints

- Publication always requires explicit human approval.
- Publish summaries and selected evidence, not raw transcripts by default.
- Support Spanish and English from the first public release.
- Preserve the original canonical prompt; translations are informational.
- Do not implement accounts, votes, comments, a global ranking, or a database.
- Use one Vercel project for the portal and static results; dynamic results are explicit exceptions.
- A deployment failure must not change the benchmark outcome.

---

### Task 1: Implement secret and path detection

**Files:**
- Create: `packages/publisher/package.json`
- Create: `packages/publisher/src/scanner/types.ts`
- Create: `packages/publisher/src/scanner/secrets.ts`
- Create: `packages/publisher/src/scanner/paths.ts`
- Create: `packages/publisher/src/scanner/index.ts`
- Create: `packages/publisher/test/scanner.test.ts`
- Create: `packages/publisher/test/fixtures/unsafe/*`

**Interfaces:**
- Produces: `scanCandidate(root, policy): Promise<ScanReport>`.
- Produces: findings with severity, rule id, file, byte range and publish-blocking status.

- [ ] **Step 1: Create malicious and accidental-disclosure fixtures**

  Include fake API keys, bearer headers, `.env`, private URLs, `/Users/javipas` paths, SSH material, source maps containing paths and benign strings that resemble identifiers.

- [ ] **Step 2: Write failing scanner tests**

  Require blocking of high-confidence secrets, redaction of local paths, explicit review for ambiguous findings and zero secret values in the report itself.

- [ ] **Step 3: Run and confirm failure**

  Run `pnpm --filter @aibench/publisher test -- scanner`; expect missing scanner.

- [ ] **Step 4: Implement streaming scanners**

  Avoid loading large binaries into memory, identify text by media type and size, redact reports, and skip binaries unless an allow-listed metadata extractor exists.

- [ ] **Step 5: Verify and commit**

  Run publisher tests and `pnpm check`; commit as `feat: scan publication candidates`.

### Task 2: Implement allow-list packaging and approval records

**Files:**
- Create: `packages/publisher/src/package.ts`
- Create: `packages/publisher/src/approval.ts`
- Create: `packages/publisher/src/index.ts`
- Create: `packages/publisher/test/package.test.ts`
- Modify: `apps/cli/src/main.ts`
- Create: `apps/cli/src/commands/review.ts`

**Interfaces:**
- Produces: `buildPublicationCandidate(runId): Promise<PublicationCandidate>`.
- Produces: `approveCandidate(candidateId, reviewer, digest): Promise<ApprovalRecord>`.
- Produces: `aibench review <candidate-id>`.

- [ ] **Step 1: Write failing packaging and approval tests**

  Assert explicit inclusion of public manifest, summary, source, selected evidence and demo build; reject generated caches, raw logs, environment files, unlicensed inputs and digest changes after approval.

- [ ] **Step 2: Run and confirm failure**

  Run publisher tests; expect missing package and approval modules.

- [ ] **Step 3: Implement deterministic packaging**

  Copy only allow-listed classes, normalize public paths, hash the entire package and emit a complete inclusion/exclusion report under private review state.

- [ ] **Step 4: Implement immutable approval**

  Record reviewer, UTC time, package digest and decision. Any package change invalidates approval and returns the candidate to review.

- [ ] **Step 5: Verify and commit**

  Run `pnpm check`; commit as `feat: package and approve public results`.

### Task 3: Stage public manifests without pushing

**Files:**
- Create: `packages/publisher/src/stage.ts`
- Create: `packages/publisher/test/stage.test.ts`
- Create: `apps/cli/src/commands/publish.ts`
- Modify: `apps/cli/src/main.ts`
- Create: `published/README.md`

**Interfaces:**
- Produces: `stageApprovedCandidate(approval): Promise<StagedPublication>`.
- Produces: `aibench publish <candidate-id> --stage-only`.

- [ ] **Step 1: Write failing staging tests**

  Cover approved digest, duplicate id, immutable existing publication, path collision, unsupported dynamic demo and rollback after interrupted copy.

- [ ] **Step 2: Run and confirm failure**

  Run publisher staging tests; expect missing implementation.

- [ ] **Step 3: Implement atomic staging**

  Stage under a temporary repository directory, validate every public manifest, then rename into `published/runs/<run-id>`. Never invoke Git push or Vercel from this function.

- [ ] **Step 4: Verify Git diff safety**

  Make the CLI print the exact staged paths, total bytes and scanner digest. Require a clean repository before staging and leave changes uncommitted for human inspection.

- [ ] **Step 5: Verify and commit**

  Run `pnpm check`; commit as `feat: stage approved public results`.

### Task 4: Create the bilingual portal data layer

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/next.config.ts`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/src/lib/content.ts`
- Create: `apps/web/src/lib/i18n.ts`
- Create: `apps/web/src/lib/routes.ts`
- Create: `apps/web/src/messages/es.json`
- Create: `apps/web/src/messages/en.json`
- Create: `apps/web/test/content.test.ts`

**Interfaces:**
- Produces: `loadPublicCatalog(): PublicCatalog`.
- Produces: `getMessages(locale): Messages` for locales `es` and `en`.
- Produces: stable locale-prefixed routes under `/es` and `/en`.

- [ ] **Step 1: Write failing content and locale tests**

  Test empty catalog, one exhibitive result, objective facts, missing translation fallback, stable slugs and rejection of invalid public manifests.

- [ ] **Step 2: Run and confirm failure**

  Run `pnpm --filter @aibench/web test`; expect missing web app.

- [ ] **Step 3: Configure static public-data loading**

  Read `published` at build time, validate through shared contracts and never contact private state or a runtime database.

- [ ] **Step 4: Implement explicit bilingual messages**

  Keep UI copy translated. Display canonical prompts verbatim and label `prompt.en.md` as an informational translation when Spanish is canonical.

- [ ] **Step 5: Verify and commit**

  Run web tests and `pnpm check`; commit as `feat: load bilingual public catalog`.

### Task 5: Build the editorial home and navigation

**Files:**
- Create: `apps/web/src/app/[locale]/layout.tsx`
- Create: `apps/web/src/app/[locale]/page.tsx`
- Create: `apps/web/src/app/[locale]/methodology/page.tsx`
- Create: `apps/web/src/components/Header.tsx`
- Create: `apps/web/src/components/FeaturedResult.tsx`
- Create: `apps/web/src/components/BenchmarkCard.tsx`
- Create: `apps/web/src/styles/globals.css`
- Create: `apps/web/e2e/home.spec.ts`

**Interfaces:**
- Produces: editorial homepage, locale switcher, methodology route and catalog entry points.

- [ ] **Step 1: Write failing Playwright navigation tests**

  Assert Spanish and English headings, language persistence, keyboard navigation, empty-state messaging and links to tests, systems, comparison and methodology.

- [ ] **Step 2: Run and confirm failure**

  Run `pnpm --filter @aibench/web e2e -- home.spec.ts`; expect missing routes.

- [ ] **Step 3: Implement the approved editorial-hybrid layout**

  Lead with the project explanation and a featured result, followed by recent batches, benchmark cards and an explicit comparison action. Do not place a leaderboard on the home page.

- [ ] **Step 4: Verify accessibility and responsive desktop behavior**

  Test at the standard desktop viewport plus a narrow fallback. Require logical heading order, visible focus and no horizontal overflow.

- [ ] **Step 5: Verify and commit**

  Run web unit/e2e tests and `pnpm check`; commit as `feat: build editorial benchmark home`.

### Task 6: Build benchmark, system, matrix, and run pages

**Files:**
- Create: `apps/web/src/app/[locale]/tests/page.tsx`
- Create: `apps/web/src/app/[locale]/tests/[benchmark]/page.tsx`
- Create: `apps/web/src/app/[locale]/systems/page.tsx`
- Create: `apps/web/src/app/[locale]/systems/[system]/page.tsx`
- Create: `apps/web/src/app/[locale]/compare/page.tsx`
- Create: `apps/web/src/app/[locale]/runs/[run]/page.tsx`
- Create: `apps/web/src/components/RunDemo.tsx`
- Create: `apps/web/src/components/RunFacts.tsx`
- Create: `apps/web/src/components/RunStages.tsx`
- Create: `apps/web/e2e/results.spec.ts`

**Interfaces:**
- Produces: test-first comparisons, secondary system pages, full matrix and immutable run details.

- [ ] **Step 1: Write failing result-navigation tests**

  Test first-shot/repair separation, absent result, legacy-unverified badge, exhibitive result without score, objective checks, system configuration, original prompt and evidence links.

- [ ] **Step 2: Run and confirm failure**

  Run `pnpm --filter @aibench/web e2e -- results.spec.ts`; expect missing pages.

- [ ] **Step 3: Implement test-first comparison pages**

  Make each benchmark page the primary comparison surface. Allow system filtering without presenting a global winner.

- [ ] **Step 4: Implement safe demos**

  Use a sandboxed iframe for approved static demos without same-origin privileges. Use external isolated URLs for approved dynamic exceptions. Fall back to captures and source when no safe demo exists.

- [ ] **Step 5: Implement matrix and system pages**

  Show coverage and status, not an aggregate score. Preserve withdrawn benchmark history and distinguish missing, incomplete, failed and infrastructure-error outcomes.

- [ ] **Step 6: Verify and commit**

  Run web tests, build and `pnpm check`; commit as `feat: add benchmark comparison portal`.

### Task 7: Add GitHub and Vercel preview workflow

**Files:**
- Create: `.github/workflows/check.yml`
- Create: `.github/workflows/preview.yml`
- Create: `apps/web/vercel.json`
- Create: `packages/publisher/src/deploy/vercel.ts`
- Create: `packages/publisher/test/vercel.test.ts`
- Modify: `apps/cli/src/commands/publish.ts`

**Interfaces:**
- Produces: CI checks for pull requests and optional Vercel preview after explicit repository configuration.
- Produces: `aibench publish <candidate-id> --create-commit` and separate `--deploy-preview` action.

- [ ] **Step 1: Write failing deployment command tests**

  Mock Git and Vercel; assert clean-tree checks, no automatic production promotion, preview URL capture, daily-limit error handling and unchanged benchmark status on deployment failure.

- [ ] **Step 2: Run and confirm failure**

  Run publisher deployment tests; expect missing deploy adapter.

- [ ] **Step 3: Implement reviewable Git commits**

  Create a local commit containing only the approved publication paths and generated catalog update. Do not push without a separate explicit user action.

- [ ] **Step 4: Implement Vercel preview deployment**

  Deploy the single portal project to Preview, record the generated URL in private publication state, run health/link checks, and require another explicit action for production promotion.

- [ ] **Step 5: Add CI without secrets in pull-request code**

  Run schema, unit, type, build and Playwright checks. Keep deployment credentials in provider-managed secrets and never expose them to untrusted benchmark code.

- [ ] **Step 6: Verify and commit**

  Run `pnpm check` and a mocked `--deploy-preview`; commit as `feat: publish reviewed results to preview`.

### Task 8: Complete a zero-cost end-to-end dry run

**Files:**
- Create: `docs/dry-run-report.md`
- Modify: `README.es.md`
- Modify: `README.en.md`

**Interfaces:**
- Produces: documented path from fake execution to local portal preview with no model API use and no external deployment.

- [ ] **Step 1: Execute the synthetic benchmark with the fake adapter**

  Plan, confirm, run, validate, create a repair result, package, scan, approve and stage it.

- [ ] **Step 2: Build and inspect both locales**

  Run the production web build and Playwright suite; verify the staged fake result appears in Spanish and English without raw data leakage.

- [ ] **Step 3: Test failure paths**

  Repeat with simulated timeout, infrastructure failure, secret finding and Vercel failure; confirm state classifications and that nothing is published.

- [ ] **Step 4: Document evidence and remaining operational approvals**

  Record commands, expected outputs and the separate approvals still required for GitHub push, Vercel connection and the first real model run.

- [ ] **Step 5: Final verification and commit**

  Run `pnpm check`, confirm a clean repository after committing, and commit as `test: verify end-to-end publication dry run`.
