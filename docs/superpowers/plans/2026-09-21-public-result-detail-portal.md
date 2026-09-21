# Public Result Detail Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let readers navigate from a public test or system to an immutable, bilingual result page with only approved source, evidence and demo material.

**Architecture:** A validated public index under `published/` supplies the benchmark and system identity deliberately absent from v1.0 publication manifests; the web data layer joins that index to parsed manifests without reading `state/`, `benchmarks/` or `systems/`. Static locale routes render lists and detail views, while a path guard resolves every downloadable file inside the published run directory only.

**Tech Stack:** TypeScript, Zod, Next.js App Router static export, React, Vitest, pnpm, Node.js 22.

**Spec:** `docs/superpowers/specs/2026-09-21-portal-detail-and-local-console-design.md`

## Global Constraints

- Portal data comes exclusively from `published/`; it never reads `state/`, private configuration, raw logs, workspaces or model credentials.
- Public URL routes remain locale-prefixed under `/es` and `/en`; root redirects to `/es`.
- Do not infer benchmark or system identity by parsing a `runId`.
- No global score, winner, votes, accounts or automatic publication/promotion.
- Demos use an iframe only when `demo.kind === "static"`; it must have `sandbox` and no `allow-same-origin`, `allow-forms`, `allow-popups` or permission tokens.
- Source/evidence paths must be validated relative paths and resolved under `published/runs/<runId>/`.
- Keep `AIBENCH_HOME=/Volumes/MacOS_VMs/xataka-ai-bench`; use Node 22 and `pnpm check` for verification.

## Review Focus

- A crafted `../` path or symlink in public metadata cannot make the portal read outside its run directory; Task 2 tests it.
- A v1.0 manifest missing index metadata remains visible in generic lists but has no fabricated benchmark/system association; Task 1 tests it.
- A failed exhibit result has no synthetic score or playable iframe; Task 3 tests it.
- A static demo cannot receive same-origin or popup privileges; Task 3 tests its rendered iframe attributes.
- Locale routes that reference unknown benchmark, system or run identifiers render a static not-found response rather than a blank page; Task 4 tests it.

---

### Task 1: Define and load the explicit public result index

**Files:**
- Create: `packages/contracts/src/public-catalog.ts`
- Modify: `packages/contracts/src/index.ts`
- Create: `packages/contracts/test/public-catalog.test.ts`
- Create: `published/catalog.json`
- Modify: `apps/web/src/lib/content.ts`
- Modify: `apps/web/test/content.test.ts`

**Interfaces:**
- Consumes: `PublicationManifest`, `RunIdSchema`, `RelativePathSchema`.
- Produces: `PublicCatalogIndex`, `parsePublicCatalogIndex(input)`, `loadPublicCatalog(publishedRoot): Promise<PublicCatalog>` and `getPublicRunContext(catalog, runId): PublicRunContext | null`.

- [ ] **Step 1: Write failing contract tests**

```ts
test("accepts a context only for a run present in the public catalog", () => {
  expect(() => parsePublicCatalogIndex({
    schemaVersion: "1.0.0",
    runs: [{
      runId: "20260915T111513Z-space-station-fps-opencode-qwen38-ninfer-medium-2bbbf0",
      benchmark: { slug: "space-station-fps", title: { es: "Estación espacial", en: "Space station" } },
      system: { slug: "opencode-qwen38-ninfer-medium", displayName: "OpenCode + Qwen" },
      status: "validation-failure",
      canonicalPrompt: { locale: "es", text: "Prompt público." },
    }],
  })).not.toThrow();
});

test("rejects duplicate run identities and path-like slugs", () => {
  expect(() => parsePublicCatalogIndex(/* duplicate or ../slug fixture */)).toThrow();
});
```

- [ ] **Step 2: Run the contract test to verify failure**

Run: `pnpm vitest run packages/contracts/test/public-catalog.test.ts`

Expected: FAIL because `parsePublicCatalogIndex` is not exported.

- [ ] **Step 3: Implement the schema and root export**

```ts
export const PublicRunContextSchema = z.object({
  runId: RunIdSchema,
  benchmark: z.object({ slug: SlugSchema, title: BilingualTextSchema }).strict(),
  system: z.object({ slug: SlugSchema, displayName: z.string().min(1) }).strict(),
  status: z.enum(["completed", "validation-failure", "infra-error", "incomplete", "legacy-unverified"]),
  canonicalPrompt: z.object({ locale: z.enum(["es", "en"]), text: z.string().min(1) }).strict(),
}).strict();
```

Add `PublicCatalogIndexSchema` with a unique `runId` refinement. Create `published/catalog.json` with the approved first result's explicit benchmark/system identity, localized titles, `validation-failure`, and the canonical public prompt text. Do not add endpoints, raw run logs, local paths or secrets.

- [ ] **Step 4: Extend the web data loader and write failing loader tests**

Add the `index` field to `PublicCatalog`. Read and validate `published/catalog.json` if present; return `{ runs, index: { runs: [] } }` when it is absent so v1.0 public packages remain readable. Test a run with a matching index context, an unindexed run, malformed JSON, and duplicate index identifiers.

- [ ] **Step 5: Run focused tests to verify green**

Run: `pnpm vitest run packages/contracts/test/public-catalog.test.ts apps/web/test/content.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the public data contract**

```bash
git add packages/contracts/src/public-catalog.ts packages/contracts/src/index.ts packages/contracts/test/public-catalog.test.ts published/catalog.json apps/web/src/lib/content.ts apps/web/test/content.test.ts
git commit -m "feat: add explicit public result index"
```

### Task 2: Add safe public result file resolution

**Files:**
- Modify: `apps/web/src/lib/content.ts`
- Modify: `apps/web/test/content.test.ts`

**Interfaces:**
- Consumes: `PublicCatalog`, `PublicationManifest.includedPaths`, `evidencePaths` and a requested `runId`.
- Produces: `getPublicRun(catalog, runId): PublicRun | null`, `listPublicFiles(run): PublicFile[]` and `readPublicTextFile(publishedRoot, runId, relativePath): Promise<string | null>`.

- [ ] **Step 1: Write failing path-safety tests**

```ts
test("reads an included text file inside the published run", async () => {
  await expect(readPublicTextFile(root, runId, "source/index.html")).resolves.toContain("<!doctype");
});

test("rejects undeclared, traversal and symlink-escape paths", async () => {
  await expect(readPublicTextFile(root, runId, "../private.txt")).resolves.toBeNull();
  await expect(readPublicTextFile(root, runId, "raw.log")).resolves.toBeNull();
});
```

- [ ] **Step 2: Run the focused test to verify failure**

Run: `pnpm vitest run apps/web/test/content.test.ts`

Expected: FAIL because `readPublicTextFile` is not exported.

- [ ] **Step 3: Implement the allow-list resolver**

Resolve `published/runs/<runId>` and candidate paths with `realpath`. Return `null` unless the path is declared in `includedPaths` or `evidencePaths`, resolves below the run root, is a regular UTF-8 text file, and is no larger than 256 KiB. Expose file metadata from the manifest without reading arbitrary filesystem paths.

- [ ] **Step 4: Run focused tests to verify green**

Run: `pnpm vitest run apps/web/test/content.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the file boundary**

```bash
git add apps/web/src/lib/content.ts apps/web/test/content.test.ts
git commit -m "feat: guard public result files"
```

### Task 3: Render public result details and safe demo states

**Files:**
- Create: `apps/web/src/components/RunFacts.tsx`
- Create: `apps/web/src/components/RunFiles.tsx`
- Create: `apps/web/src/components/RunDemo.tsx`
- Create: `apps/web/src/app/[locale]/runs/[run]/page.tsx`
- Modify: `apps/web/src/lib/content.ts`
- Create: `apps/web/test/run-detail.test.tsx`

**Interfaces:**
- Consumes: `PublicRun` and its optional `PublicRunContext`.
- Produces: static route `/[locale]/runs/[run]` and `RunDemo({ demo }: { demo: PublicationManifest["demo"] })`.

- [ ] **Step 1: Write failing component and route tests**

```tsx
test("renders a validation failure without a score or iframe", async () => {
  const page = await RunPage({ params: Promise.resolve({ locale: "es", run: runId }) });
  expect(renderToStaticMarkup(page)).toContain("Resultado oficial fallido");
  expect(renderToStaticMarkup(page)).not.toContain("<iframe");
});

test("sandboxes an approved static demo", () => {
  expect(renderToStaticMarkup(<RunDemo demo={{ kind: "static", path: "demo/index.html" }} />))
    .toContain('sandbox=""');
});
```

- [ ] **Step 2: Run the focused test to verify failure**

Run: `pnpm vitest run apps/web/test/run-detail.test.tsx`

Expected: FAIL because the route and components do not exist.

- [ ] **Step 3: Implement localized run page copy and components**

Add localized labels for official status, benchmark, system, canonical prompt, approved files, evidence, no-demo explanation and public package hash. The route resolves a manifest/context only through `loadPublicCatalog`; it calls `notFound()` for unknown run IDs. Render `RunFacts`, the canonical prompt in `<pre>`, and `RunFiles` links under `/runs/<run>/files/...` only after Task 4 adds their route. For this first failed run, render the sanctioned failure explanation and source list.

`RunDemo` must return a message when `demo === null`; for a static demo it renders only:

```tsx
<iframe src={demoUrl} title="Approved result demo" sandbox />
```

External demos render an ordinary external link with `rel="noreferrer"`, not an iframe.

- [ ] **Step 4: Run focused tests to verify green**

Run: `pnpm vitest run apps/web/test/run-detail.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit detail rendering**

```bash
git add apps/web/src/components apps/web/src/app/'[locale]'/runs apps/web/src/lib/content.ts apps/web/test/run-detail.test.tsx
git commit -m "feat: add public run detail pages"
```

### Task 4: Add static file delivery and linked benchmark/system pages

**Files:**
- Create: `apps/web/src/app/runs/[run]/files/[...path]/route.ts`
- Create: `apps/web/src/app/[locale]/tests/[benchmark]/page.tsx`
- Create: `apps/web/src/app/[locale]/systems/[system]/page.tsx`
- Modify: `apps/web/src/app/[locale]/tests/page.tsx`
- Modify: `apps/web/src/app/[locale]/systems/page.tsx`
- Modify: `apps/web/src/app/[locale]/compare/page.tsx`
- Modify: `apps/web/src/app/[locale]/page.tsx`
- Modify: `apps/web/test/content.test.ts`

**Interfaces:**
- Consumes: `PublicCatalogIndex` and `listPublicFiles`.
- Produces: public static navigation and a file route returning only allow-listed content.

- [ ] **Step 1: Write failing navigation tests**

```ts
test("groups only indexed runs by benchmark and system", () => {
  expect(listRunsForBenchmark(catalog, "space-station-fps")).toHaveLength(1);
  expect(listRunsForSystem(catalog, "opencode-qwen38-ninfer-medium")).toHaveLength(1);
});

test("does not create a route association for an unindexed public run", () => {
  expect(listRunsForBenchmark(catalog, "unknown")).toEqual([]);
});
```

Add route rendering tests with `notFound` mocked or a helper that returns `null` for unknown slugs. Add a route-handler test that returns 404 for a non-allow-listed file and `Content-Type: text/html; charset=utf-8` for `source/index.html`.

- [ ] **Step 2: Run focused tests to verify failure**

Run: `pnpm vitest run apps/web/test/content.test.ts`

Expected: FAIL because grouping helpers and routes do not exist.

- [ ] **Step 3: Implement grouping and navigation**

Implement `listRunsForBenchmark(catalog, slug)` and `listRunsForSystem(catalog, slug)` as exact joins on the validated public index. Make list and matrix views link to localized benchmark/system pages and from there to `/[locale]/runs/[runId]`. Every unknown slug calls `notFound()`.

The file route uses `readPublicTextFile`; it returns a `Response` with a safe text content type chosen from `.html`, `.css`, `.js`, `.md`, `.txt`, `.json` only. Reject all other extensions and all missing files with 404. Never proxy an arbitrary `path` query or link into the private tree.

- [ ] **Step 4: Run focused tests to verify green**

Run: `pnpm vitest run apps/web/test/content.test.ts apps/web/test/run-detail.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit navigation and delivery**

```bash
git add apps/web/src/app apps/web/src/lib/content.ts apps/web/test/content.test.ts apps/web/test/run-detail.test.tsx
git commit -m "feat: link public benchmark and system results"
```

### Task 5: Verify the exported portal and CI path

**Files:**
- Modify: `apps/web/test/content.test.ts`
- Modify: `README.es.md`
- Modify: `README.en.md`

**Interfaces:**
- Consumes: built `apps/web/out` and public route definitions.
- Produces: documented local verification commands and static-output assertions.

- [ ] **Step 1: Write failing static export assertions**

Add a test or shell assertion that expects `apps/web/out/es/runs/<run>.html`, `en/runs/<run>.html`, test and system route output after `pnpm --filter @aibench/web build`. Assert that the English file contains the English summary and that it contains no `192.168.` or credential-shaped string.

- [ ] **Step 2: Run the assertion to verify failure**

Run: `pnpm --filter @aibench/web build && pnpm vitest run apps/web/test/content.test.ts`

Expected: FAIL before static route generation is implemented.

- [ ] **Step 3: Document reader and operator verification**

Document the public route structure and local checks in both READMEs. State that a published failed result is a valid outcome and that Vercel production promotion remains explicit.

- [ ] **Step 4: Run final verification**

Run:

```bash
env PATH=/Users/javipas/.nvm/versions/node/v22.20.0/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin pnpm check
env PATH=/Users/javipas/.nvm/versions/node/v22.20.0/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin pnpm --filter @aibench/web build
git diff --check
```

Expected: all tests pass, all routes export, and the diff is whitespace-clean.

- [ ] **Step 5: Commit the verified portal**

```bash
git add apps/web README.es.md README.en.md
git commit -m "feat: publish navigable result detail portal"
```

## Plan Self-Review

- **Spec coverage:** Tasks 1–4 implement public identity, safe files, detail routes, system/test navigation and safe demos. Task 5 verifies export and documents reader behavior. GitHub/Vercel integration and the private console are intentionally separate deliveries.
- **Placeholder scan:** No deferred implementation markers are used; each task names exact files, interfaces, checks and commands.
- **Type consistency:** `PublicCatalogIndex`, `PublicRunContext`, `PublicCatalog`, `listRunsForBenchmark`, `listRunsForSystem`, `listPublicFiles` and `readPublicTextFile` are defined before their route consumers.
- **Review focus coverage:** Task 2 owns path and symlink safety; Task 1 owns missing/duplicate context; Task 3 owns failure/demo behavior; Task 4 owns unknown routes; Task 5 owns static export and public-content leakage checks.
