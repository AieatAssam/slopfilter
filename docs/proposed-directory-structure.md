# Proposed Directory Structure — SlopFilter

Canonical instruction source for implementation agents is [`plan.yaml`](../plan.yaml).
This document is the human-readable companion for repository layout decisions.

---

## 1. Existing structure

The repository is **empty**. Verified on 2026-08-05:

```text
/Users/aieat/Documents/git/slop-filter-chrome-extension/
    (no files, no directories, no .git)
```

Consequences that hold for the whole plan:

- There are **no existing conventions** to preserve. Every convention below is newly proposed and must be treated as authoritative once `SF-001` lands.
- There are **no existing commands**. `plan.yaml` records every `existing_commands` entry as `null`. Any command referenced by a later ticket is created by an earlier ticket in the same plan. No ticket may invoke a command that no prior ticket created.
- There is **no Git history and no remote**. `SF-001` establishes the repository baseline on top of the planning commit.

Verified host tooling (not repository state):

| Tool | Version | Notes |
|---|---|---|
| Node.js | v24.17.0 | satisfies Vite 8, Vitest 4, Playwright 1.62 |
| npm | 11.13.0 | the **only** package manager present; `pnpm` and `yarn` are not installed |
| git | 2.50.1 (Apple Git-155) | |

npm is therefore selected as the package manager by verified elimination, not by preference. This is not a `human_decisions` entry.

### Toolchain decisions (verified 2026-08-05, not assumed)

Every dependency is at its latest published version. Two decisions were settled empirically rather than from recall:

**Biome 2.5.7 replaces ESLint + typescript-eslint + Prettier + eslint-config-prettier.** One binary for lint and format, and — decisively — it ships its own TypeScript parser and declares **no `typescript` peer dependency**. `typescript-eslint@8.66.0` (latest stable) caps its peer at `typescript <6.1.0`, so keeping it would have pinned the project to TypeScript 5.9.3. All three rules this plan relies on were confirmed present via `biome explain`: `lint/style/noRestrictedImports`, `lint/style/noRestrictedGlobals`, `lint/suspicious/noConsole`. A live probe confirmed the `src/core/` boundary fires on a nested import and on a `chrome` global reference, and stays silent for files outside `src/core/`.

Two Biome behaviours are load-bearing and easy to get wrong:
- All three rules default to severity **`warn`**, which would not fail the lint gate. Each override sets `"level": "error"` explicitly.
- A single-star glob (`@/adapters/*`) was confirmed **not** to match `@/adapters/x/adapter`. Every restricted-import group uses `**`.

*Accepted tradeoff:* Biome does no whole-program type-aware linting, so rules like `no-floating-promises` are unavailable. Nothing in this plan depends on them — the purity boundary is purely syntactic, and type correctness stays enforced by `tsc --noEmit`.

**TypeScript 7.0.2** is usable because of the above. Two breaking changes were found by running `tsc@7.0.2` directly and both affect `tsconfig.json`:
- `baseUrl` **has been removed** — its presence is a hard error (`TS5102`).
- `paths` targets must be relative — a bare `src/*` fails with `TS5090`.

So the alias is `"paths": {"@/*": ["./src/*"]}` with no `baseUrl`. The full strict flag set (`strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `isolatedModules`, `resolveJsonModule`) was confirmed to compile cleanly under 7.0.2, and `noUncheckedIndexedAccess` was confirmed still active.

---

## 2. Proposed structure

```text
.
├── .github/
│   └── workflows/
│       ├── ci.yml                                  # NEW  — SF-011
│       └── drift-monitor.yml                       # NEW  — SF-012
├── .gitignore                                      # NEW  — SF-001
├── biome.json                                      # NEW  — SF-002 (lint + format, replaces ESLint/Prettier)
├── LICENSE                                         # NEW  — SF-001 (blocked by HD-002)
├── README.md                                       # NEW  — SF-001
├── bench/
│   ├── page-load.bench.ts                          # NEW  — SF-013
│   └── scoring-latency.bench.ts                    # NEW  — SF-109
├── docs/
│   ├── implementation-plan.md                      # NEW  — planning baseline (this commit)
│   ├── proposed-directory-structure.md             # NEW  — planning baseline (this commit)
│   └── prd/
│       └── slopfilter_prd.md                       # NEW  — planning baseline (this commit)
├── e2e/
│   ├── specs/
│   │   ├── collapse.spec.ts                        # NEW  — SF-014
│   │   ├── selftest-pause.spec.ts                  # NEW  — SF-010
│   │   ├── feedback.spec.ts                        # NEW  — SF-105
│   │   ├── score-breakdown.spec.ts                 # NEW  — SF-107
│   │   ├── settings.spec.ts                        # NEW  — SF-108
│   │   ├── account-controls.spec.ts                # NEW  — SF-203
│   │   ├── stats.spec.ts                           # NEW  — SF-204
│   │   ├── settings-io.spec.ts                     # NEW  — SF-205
│   │   ├── model-progress.spec.ts                  # NEW  — SF-206
│   │   └── onboarding.spec.ts                      # NEW  — SF-207
│   └── support/
│       ├── extension.ts                            # NEW  — SF-003 (persistent-context extension fixture)
│       ├── harness.d.ts                            # NEW  — SF-003 (window.__slopfilterHarness global decl)
│       └── harness.ts                              # NEW  — SF-003 (harness page control helpers)
├── package.json                                    # NEW  — SF-001
├── playwright.bench.config.ts                      # NEW  — SF-013 (workers: 1, benchmarks only)
├── playwright.config.ts                            # NEW  — SF-003
├── plan.yaml                                       # NEW  — planning baseline (this commit)
├── public/
│   ├── content/
│   │   └── styles.css                              # NEW  — SF-001 shell, SF-009 rules
│   ├── manifest.json                               # NEW  — SF-001
│   └── icons/
│       ├── icon-16.png                             # NEW  — SF-001
│       ├── icon-48.png                             # NEW  — SF-001
│       └── icon-128.png                            # NEW  — SF-001
├── scripts/
│   ├── build-manifest.mjs                          # NEW  — SF-003 (injects harness host permission in test builds)
│   ├── sanitise-fixture.mjs                        # NEW  — SF-006 (sanitises the raw capture)
│   └── check-drift.mjs                             # NEW  — SF-012
├── src/
│   ├── adapters/
│   │   ├── types.ts                                # NEW  — SF-004 (PlatformAdapter contract)
│   │   └── x/
│   │       ├── adapter.ts                          # NEW  — SF-007
│   │       ├── selectors.json                      # NEW  — SF-005
│   │       ├── selectors.ts                        # NEW  — SF-005 (typed loader + validator)
│   │       └── selftest.ts                         # NEW  — SF-010
│   ├── content/
│   │   ├── index.ts                                # NEW  — SF-014 (content-script entry)
│   │   ├── observer.ts                             # NEW  — SF-014 (MutationObserver + batching)
│   │   ├── collapse.ts                             # NEW  — SF-009 (placeholder rendering)
│   │   ├── feedback.ts                             # NEW  — SF-105
│   │   └── breakdown.ts                            # NEW  — SF-107
│   ├── core/
│   │   ├── post.ts                                 # NEW  — SF-004 (normalized Post model)
│   │   ├── scoring/
│   │   │   ├── pipeline.ts                         # NEW  — SF-008 / SF-106
│   │   │   ├── weights.ts                          # NEW  — SF-106 (defaults + veto rules)
│   │   │   └── types.ts                            # NEW  — SF-008 (SignalResult, ScoreBreakdown)
│   │   └── signals/
│   │       ├── behavioural.ts                      # NEW  — SF-008  (Layer 1)
│   │       ├── provenance.ts                       # NEW  — SF-201  (Layer 2)
│   │       ├── contentType.ts                      # NEW  — SF-102  (Layer 3)
│   │       ├── imageForensics.ts                   # NEW  — SF-202  (Layer 4)
│   │       └── taste.ts                            # NEW  — SF-104  (Layer 5)
│   ├── offscreen/
│   │   ├── offscreen.html                          # NEW  — SF-101
│   │   ├── offscreen.ts                            # NEW  — SF-101
│   │   └── inference.worker.ts                     # NEW  — SF-101
│   ├── background/
│   │   └── service-worker.ts                       # NEW  — SF-010 (badge state, offscreen lifecycle)
│   ├── shared/
│   │   ├── messages.ts                             # NEW  — SF-004 (typed message contract)
│   │   └── logger.ts                               # NEW  — SF-001
│   ├── storage/
│   │   ├── settings.ts                             # NEW  — SF-108
│   │   ├── embeddings.ts                           # NEW  — SF-103 (IndexedDB)
│   │   ├── accounts.ts                             # NEW  — SF-203
│   │   └── stats.ts                                # NEW  — SF-204
│   └── ui/
│       ├── options/
│       │   ├── options.html                        # NEW  — SF-108
│       │   └── options.ts                          # NEW  — SF-108
│       └── popup/
│           ├── popup.html                          # NEW  — SF-010
│           └── popup.ts                            # NEW  — SF-010
├── tests/
│   ├── fixtures/
│   │   ├── dom/
│   │   │   └── x/
│   │   │       ├── timeline-baseline.html          # NEW  — SF-006
│   │   │       ├── timeline-high-frequency.html    # NEW  — SF-006
│   │   │       └── timeline-broken-selectors.html  # NEW  — SF-006
│   │   └── posts/
│   │       ├── raw/                                # gitignored — human capture (HD-015)
│   │       ├── posts-baseline.json                 # NEW  — SF-006
│   │       └── posts-scoring.json                  # NEW  — SF-008
│   ├── harness/
│   │   ├── index.html                              # NEW  — SF-003 (local feed harness for E2E)
│   │   └── harness.ts                              # NEW  — SF-003
│   └── unit/
│       ├── adapters/x/adapter.test.ts              # NEW  — SF-007
│       ├── adapters/x/selectors.test.ts            # NEW  — SF-005
│       ├── adapters/x/selftest.test.ts             # NEW  — SF-010
│       ├── core/post.test.ts                       # NEW  — SF-004
│       ├── core/scoring/pipeline.test.ts           # NEW  — SF-008 / SF-106
│       ├── core/signals/behavioural.test.ts        # NEW  — SF-008
│       ├── core/signals/contentType.test.ts        # NEW  — SF-102
│       ├── core/signals/taste.test.ts              # NEW  — SF-104
│       ├── core/signals/provenance.test.ts         # NEW  — SF-201
│       ├── core/signals/imageForensics.test.ts     # NEW  — SF-202
│       ├── storage/embeddings.test.ts              # NEW  — SF-103
│       ├── storage/settings.test.ts                # NEW  — SF-108
│       ├── storage/accounts.test.ts                # NEW  — SF-203
│       └── storage/stats.test.ts                   # NEW  — SF-204
├── tsconfig.json                                   # NEW  — SF-001
├── vite.config.ts                                  # NEW  — SF-001 (ES pass)
├── vite.content.config.ts                          # NEW  — SF-001 (IIFE pass, content script)
└── vitest.config.ts                                # NEW  — SF-002
```

**Directories are only created when a ticket writes a real file into them.** No implementation agent may create an empty directory because it appears in this tree.

---

## 3. Path rationale

| Path | Status | Purpose | Why here | Tickets |
|---|---|---|---|---|
| `public/manifest.json` | new | MV3 manifest, hand-written | Vite copies `public/` verbatim into `dist/`; avoids adding `@crxjs/vite-plugin` as a dependency the PRD never approved | SF-001 |
| `public/content/styles.css` | new | Injected-UI stylesheet | Lives under `public/` **deliberately**: Vite only emits CSS that a JS entry imports, and would flatten its name. The manifest declares `content/styles.css`, so it must be copied verbatim or Chromium refuses to load the extension | SF-001, SF-009 |
| `vite.config.ts` + `vite.content.config.ts` | new | Two build passes | Chromium content scripts are classic scripts, not ES modules, and Rollup cannot emit `es` and `iife` from one multi-input build. The ES pass (service worker, offscreen, pages) runs first with `emptyOutDir: true`; the IIFE pass (content script only) runs second with `emptyOutDir: false` | SF-001 |
| `biome.json` | new | Lint + format config and the `src/core/` purity overrides | One config replaces `eslint.config.js`, `.prettierrc.json`, and `.prettierignore`. Golden DOM fixtures are excluded with `!tests/fixtures/dom/**` so formatting can never corrupt a captured snapshot | SF-002 |
| `public/icons/` | new | Extension icons at 16/48/128 | Chrome Web Store and `action` require them; static assets belong in `public/` | SF-001 |
| `src/adapters/types.ts` | new | `PlatformAdapter` interface | PRD §5: "the adapter is the only platform-specific code". The contract must live outside `x/` so Phase 3 adapters reuse it without importing X code | SF-004 |
| `src/adapters/x/` | new | The single X/Twitter adapter | Platform-specific code is quarantined to exactly one directory | SF-005, SF-007, SF-010 |
| `src/adapters/x/selectors.json` | new | Versioned selector contract | PRD §5 hard requirement: selectors declared in a versioned `selectors.json` with description + `required` flag. JSON (not TS) so the CI drift monitor can read it without a build step | SF-005, SF-012 |
| `src/core/` | new | Platform-agnostic domain: `Post`, scoring, signals | PRD §5: "Scoring pipeline: pure, stateless, unit-testable TypeScript module". Nothing in `src/core/` may import from `src/adapters/`, `src/content/`, or any `chrome.*` API | SF-004, SF-008, SF-102, SF-104, SF-106, SF-201, SF-202 |
| `src/core/signals/` | new | One file per PRD signal layer | Direct 1:1 mapping to PRD §4 layers 1–5 keeps ticket-to-file attribution unambiguous | SF-008, SF-102, SF-104, SF-201, SF-202 |
| `src/content/` | new | DOM observation, collapse UI, feedback UI | The only code with live-page DOM access; kept separate from `core/` so `core/` stays testable in Node | SF-009, SF-014, SF-105, SF-107 |
| `src/offscreen/` | new | Offscreen document hosting the inference Web Worker | Transformers.js needs a DOM-ish, long-lived context; MV3 service workers are terminated aggressively and lack `document`. Exact hosting choice is **HD-012** | SF-101 |
| `src/background/service-worker.ts` | new | Badge state, offscreen document lifecycle | Only the service worker can call `chrome.action.setBadgeText` and `chrome.offscreen.*` | SF-010, SF-101 |
| `src/storage/` | new | `chrome.storage.local` and IndexedDB access | PRD §5 splits settings/allowlists (`chrome.storage.local`) from embeddings/stats (IndexedDB); one module per store keeps the split enforceable | SF-103, SF-108, SF-203, SF-204 |
| `src/ui/options/`, `src/ui/popup/` | new | Extension pages | Separated from `content/` because they run in extension origin with full API access | SF-010, SF-108 |
| `src/shared/messages.ts` | new | Typed message contract between contexts | Content script ↔ service worker ↔ offscreen must agree on one schema; a shared file prevents drift between three call sites | SF-004 |
| `tests/unit/` | new | Vitest unit tests, mirroring `src/` | Mirrored layout means a file's test path is derivable, never guessed | SF-002 onward |
| `tests/fixtures/dom/x/` | new | Golden DOM snapshots | PRD §5 "Golden snapshots": adapter parsing is validated without touching the live site | SF-006 |
| `tests/fixtures/posts/` | new | Normalized `Post` fixtures with known expected scores | PRD §6: "fixture posts with known expected scores" | SF-006, SF-008 |
| `tests/harness/` | new | Local static page reproducing captured X feed DOM | **E2E must not run against live x.com** — login walls, ToS, and flakiness make it non-deterministic and non-parallel-safe. The harness serves golden DOM at `http://localhost:5174` so E2E is hermetic. The live site is touched only by the drift monitor (SF-012) | SF-003 |
| `e2e/specs/` | new | Playwright specs | PRD §6 E2E row: load extension into Chromium, verify collapse/feedback/settings | SF-014 onward |
| `e2e/support/extension.ts` | new | Persistent-context fixture loading `dist/` unpacked | Chrome extensions require `launchPersistentContext` with `--load-extension`; centralising it stops each spec inventing its own launch flags | SF-003 |
| `bench/` | new | Page-load delta and scoring-latency benchmarks | PRD §5 performance budgets are CI-enforced; benchmarks are neither unit nor E2E and need their own runner config | SF-013, SF-109 |
| `scripts/build-manifest.mjs` | new | Emits `dist/manifest.json` with harness host permission for `test` builds only | Production manifest must not carry `http://localhost:*` host permission (store review risk, PRD §9) | SF-003 |
| `scripts/sanitise-fixture.mjs` | new | Strips identifying content from the raw human capture into a committable fixture | The raw capture contains real handles, names, and post text; `tests/fixtures/dom/x/raw/` is gitignored and only the sanitised output is committed | SF-006 |
| `scripts/check-drift.mjs` | new | Reads `selectors.json`, asserts each required selector resolves, emits a DOM diff | PRD §5 CI drift monitor | SF-012 |
| `.github/workflows/ci.yml` | new | lint + typecheck + unit + build + E2E on push/PR | Standard GitHub Actions location | SF-011 |
| `.github/workflows/drift-monitor.yml` | new | Daily scheduled drift check, opens an issue on failure | PRD §5 requires a *scheduled* action, separate from CI so a drift failure never blocks a merge | SF-012 |
| `docs/prd/slopfilter_prd.md` | new | Verbatim PRD copy | Requirement traceability | planning baseline |
| `docs/implementation-plan.md` | new | Human-readable plan overview | planning baseline | planning baseline |
| `docs/proposed-directory-structure.md` | new | This file | planning baseline | planning baseline |
| `plan.yaml` | new | Canonical agent-executable plan | planning baseline | planning baseline |

---

## 4. Boundary summary

| Concern | Location |
|---|---|
| Application source | `src/` |
| Platform-agnostic domain logic | `src/core/` (must not import `chrome.*` or DOM-live modules) |
| Platform-specific code | `src/adapters/x/` only |
| Shared UI / components | `src/content/` (in-page injected UI), `src/ui/` (extension pages). No component framework is proposed; see HD-014 |
| API / backend boundaries | **None.** PRD §2 non-goal: "Server-side components of any kind." The only outbound network call permitted at any time is the one-time model download (HD-013) |
| Configuration | `package.json`, `tsconfig.json`, `vite.config.ts`, `vite.content.config.ts`, `vitest.config.ts`, `playwright.config.ts`, `playwright.bench.config.ts`, `biome.json`, `public/manifest.json` |
| Runtime user configuration | `src/storage/settings.ts` backed by `chrome.storage.local` |
| Unit / integration tests | `tests/unit/` |
| E2E tests | `e2e/specs/` |
| Fixtures, golden snapshots, test data | `tests/fixtures/` |
| E2E harness (fake feed) | `tests/harness/` |
| Benchmarks | `bench/` |
| CI/CD | `.github/workflows/` |
| Documentation | `docs/` |

---

## 5. Paths deliberately not proposed

| Not proposed | Reason |
|---|---|
| `src/adapters/linkedin/`, `.../reddit/`, `.../facebook/` | PRD §7 Phase 3, gated on Phase 2 proof. Out of scope for this plan |
| Any server, API, or database directory | PRD §2 explicit non-goal |
| Model weight files committed to the repository | Distribution mechanism unresolved — **HD-013** |
| A component-framework directory (`src/components/`) | Whether any framework is used at all is **HD-014** |
| `src/ui/onboarding/` | Depends on HD-001 (product name) and the store-listing decision; SF-207 places it only once HD-001 resolves |
