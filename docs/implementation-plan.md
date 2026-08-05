# Implementation Plan — SlopFilter

Human-readable overview. **[`plan.yaml`](../plan.yaml) is the canonical instruction source for implementation agents** — where the two disagree, `plan.yaml` wins.

| | |
|---|---|
| PRD source | `/Users/aieat/Downloads/slopfilter_prd.md` |
| PRD in repo | [`docs/prd/slopfilter_prd.md`](prd/slopfilter_prd.md) (byte-identical copy, SHA-256 `7714adbd…a6a1d6`) |
| Plan id | `slopfilter-x-extension` |
| Tickets | 30 (14 Phase 0, 9 Phase 1, 7 Phase 2) · 79 steps · 147 acceptance criteria |
| Blocking decisions | 15, of which **4 gate the very first ticket** |

---

## 1. Goal and user outcomes

Ship a Manifest V3 Chrome extension that collapses low-quality posts in the X/Twitter Home timeline using five layered, locally computed signals.

A user who installs it should get:

- Visibly less slop in the Home timeline, without ever being told a post was "written by AI".
- A one-line reason on every hidden post citing observable evidence ("posts 40+ times per day"), one click from a full per-layer score breakdown.
- Full reversibility: nothing is deleted, "Show anyway" always restores, and "This was wrong" both restores and teaches.
- A filter that learns their taste from their own downvotes, computed entirely on their machine.
- Honest degradation: when X's markup changes or models fail to load, the extension says so and shows an unfiltered feed rather than a broken one.

## 2. Non-goals

Video analysis · BYOK or any cloud model · any platform besides X/Twitter · training or publishing models · mobile browsers · **any server-side component at all** · Firefox and Safari · X notifications, search, and profile surfaces · cross-site topic muting · Chrome Web Store submission (listing copy is produced; submission is not) · running E2E against live x.com.

## 3. Assumptions verified from the repository and host

Everything below was checked, not assumed:

- **The repository is completely empty** — no files, no `.git`, no conventions to preserve. Every convention in this plan is newly established by `SF-001`/`SF-002` and is authoritative from that point.
- **No commands exist.** Every `existing_commands` entry in `plan.yaml` is `null`; the entire command surface is created by `SF-001`. No ticket invokes a command an earlier ticket did not create.
- **npm is the only package manager installed** (`pnpm` and `yarn` are absent) — selected by elimination, not preference.
- Node v24.17.0, npm 11.13.0, git 2.50.1.
- **Biome 2.5.7 can enforce the `src/core/` purity boundary.** A live probe confirmed `noRestrictedImports` fires on a nested import and `noRestrictedGlobals` on a `chrome` reference, and that both stay silent outside `src/core/`.
- **A single-star glob does not match nested paths.** `@/adapters/*` was confirmed *not* to match `@/adapters/x/adapter` — the boundary uses `**` everywhere, and `SF-002-S04` probes a deliberately nested path so a broken glob cannot pass.
- **TypeScript 7.0.2 removed `baseUrl`** (`TS5102`) and rejects non-relative `paths` targets (`TS5090`). Both confirmed by running `tsc@7.0.2`. The alias is `"paths": {"@/*": ["./src/*"]}` with no `baseUrl`; the full strict flag set compiles cleanly.
- **`typescript-eslint@8.66.0` caps its `typescript` peer at `<6.1.0`**, which is why Biome — with no `typescript` peer at all — is used instead of ESLint. That one decision is what allows every dependency to sit at its latest version.

## 4. Open decisions requiring human input

All 15 are in `plan.yaml` under `human_decisions`, with options and blast radius. The ones that gate the most work:

| Decision | Question | Gates |
|---|---|---|
| **HD-001** | Final product name (PRD says the title is a placeholder) | `SF-001` and every user-facing surface |
| **HD-002** | Licence identifier and copyright holder | `SF-001` |
| **HD-004** | How posting frequency is derived — **the X timeline DOM does not expose posts-per-day, account age, or post count**, so the PRD's own example reason label has no data source | `SF-008`, `SF-014` |
| **HD-005** | The actual default threshold numbers (the PRD promises "sensible defaults" but specifies none) | `SF-008`, `SF-106`, `SF-108` |
| **HD-015** | Who captures the raw X timeline HTML — **no agent can log into X**, and the fixtures cannot be invented | `SF-006`, `SF-007`, `SF-012` |

Also open: **HD-003** (GitHub repo for drift issues), **HD-006** (drift-monitor target — X no longer serves a logged-out timeline), **HD-007**/**HD-008** (model ids, classifier labels), **HD-009** (veto rules — the PRD's only example references a signal that does not exist in any of the five layers), **HD-010**/**HD-011** (image-forensics model; whether C2PA survives X's re-encoding at all), **HD-012** (offscreen document vs per-tab worker), **HD-013** (download vs bundle weights), **HD-014** (UI framework or plain DOM).

> **Phase 0 cannot start until HD-001, HD-002, HD-004, HD-005, and HD-015 are answered.** HD-001 and HD-002 are the cheapest unblocks.

## 5. Phases

| Phase | Tickets | Exit criterion (from PRD §7) |
|---|---|---|
| **0 — Foundation** | `SF-001`…`SF-014` | Posts from accounts over the frequency threshold reliably collapse; the drift monitor demonstrably fires on a deliberate break; page-load delta < 50ms |
| **1 — ML signals** | `SF-101`…`SF-109` | Filtering latency < 100ms/batch; 20 downvotes measurably change what is hidden; all tests green |
| **2 — Polish and prove** | `SF-201`…`SF-207` | Feature-complete for X; 30+ days of owner usage; crash-free; drift monitor has caught a real or simulated markup change end to end |
| **3 — Stretch** | *not planned here* | PRD gates it on Phase 2 proof; other platform adapters, topic muting, BYOK, video, Safari are out of scope for this plan |

## 6. Ticket dependency overview

Single root (`SF-001`), maximum dependency depth 13, acyclic, and every ticket depends only on tickets defined before it.

| Ticket | Title | Depends on | Size | Pri | Risk | E2E |
|---|---|---|---|---|---|---|
| `SF-001` | Scaffold MV3 extension with npm, TypeScript, Vite | — | M | P0 | low | n/a (approval) |
| `SF-002` | Biome + Vitest with the core-purity import boundary | SF-001 | M | P0 | low | n/a (approval) |
| `SF-003` | Playwright harness, extension fixture, local feed page | SF-001, SF-002 | L | P0 | medium | applicable |
| `SF-004` | Normalized `Post`, `PlatformAdapter`, message schema | SF-001, SF-002 | M | P0 | medium | n/a (approval) |
| `SF-005` | Versioned selector contract and typed loader | SF-002, SF-004 | M | P0 | medium | n/a (approval) |
| `SF-006` | Capture, sanitise, commit golden DOM fixtures | SF-002, SF-003 | M | P0 | high | n/a (approval) |
| `SF-007` | X Home timeline adapter, fixture-driven | SF-004, SF-005, SF-006 | L | P0 | high | n/a (approval) |
| `SF-008` | Pure scoring pipeline + Layer 1 behavioural signal | SF-004, SF-006 | L | P0 | high | n/a (approval) |
| `SF-009` | Collapsed-post placeholder, reason label, show-anyway | SF-003, SF-008 | M | P0 | medium | **applicable** |
| `SF-010` | Selector self-test, paused badge, popup explanation | SF-005, SF-006, SF-009 | M | P0 | medium | **applicable** |
| `SF-011` | CI: lint, typecheck, unit, build, audit, E2E | SF-003, SF-009 | M | P1 | medium | n/a (approval) |
| `SF-012` | Scheduled drift monitor filing repository issues | SF-005, SF-006, SF-011 | L | P1 | high | n/a (approval) |
| `SF-013` | Page-load delta benchmark (50ms budget) | SF-003, SF-011 | M | P1 | medium | n/a (approval) |
| `SF-014` | Wire content script end to end | SF-007, SF-008, SF-009, SF-010 | L | P0 | high | **applicable** |
| `SF-101` | Inference host: Transformers.js, WASM default, WebGPU detect | SF-004, SF-014 | L | P0 | high | n/a (approval) |
| `SF-102` | Layer 3 content-type classifier | SF-008, SF-101 | M | P1 | medium | n/a (approval) |
| `SF-103` | IndexedDB downvote embedding store (1000-entry cap) | SF-004 | M | P1 | medium | n/a (approval) |
| `SF-104` | Layer 5 taste model over downvote centroids | SF-008, SF-101, SF-103 | L | P1 | medium | n/a (approval) |
| `SF-105` | Thumbs-down and wrong-call feedback controls | SF-009, SF-103, SF-104, SF-014 | L | P0 | medium | **applicable** |
| `SF-106` | Weighted multi-layer scoring, vetoes, tunable threshold | SF-008, SF-102, SF-104 | M | P0 | high | n/a (approval) |
| `SF-107` | Per-post score breakdown panel | SF-009, SF-106 | M | P2 | low | **applicable** |
| `SF-108` | Settings store and options page | SF-106 | M | P1 | medium | **applicable** |
| `SF-109` | Scoring-latency and memory benchmarks (100ms, 300MB) | SF-101, SF-102, SF-104, SF-106, SF-013 | M | P1 | medium | n/a (approval) |
| `SF-201` | Layer 2 provenance (C2PA content credentials) | SF-106 | M | P2 | high | n/a (approval) |
| `SF-202` | Layer 4 image forensics on thumbnails | SF-101, SF-106 | L | P2 | high | n/a (approval) |
| `SF-203` | Per-account mute, trust, images-only | SF-105, SF-106 | M | P2 | medium | **applicable** |
| `SF-204` | Local-only weekly stats panel | SF-103, SF-105 | M | P2 | low | **applicable** |
| `SF-205` | Settings export and import | SF-108, SF-203 | M | P3 | medium | **applicable** |
| `SF-206` | Model download progress and offline behaviour | SF-101, SF-204 | M | P2 | medium | **applicable** |
| `SF-207` | Onboarding, privacy page, store-listing copy | SF-108, SF-204, SF-206 | M | P2 | medium | **applicable** |

## 7. Architecture impact

Greenfield, so this is the architecture rather than a delta.

- **`src/core/` is pure and platform-agnostic** — the `Post` model, the scoring pipeline, and all five signal layers. It may not import adapter, content, storage, offscreen, background, or UI code, and may not touch `chrome.*`, DOM, or IndexedDB. Enforced by a Biome override that is *proven to fire* in `SF-002-S04` rather than merely configured.
- **`src/adapters/x/` is the only platform-specific code**, behind a `PlatformAdapter` interface, so a Phase 3 platform is one new adapter plus a selector contract plus fixtures.
- **The selector contract (`selectors.json`) is plain JSON**, read without a build step, so the in-extension self-test, the adapter, and the CI drift monitor all consume one source of truth.
- **Two build passes are required**, not a stylistic choice: Chromium content scripts are classic scripts, the MV3 service worker is an ES module, and Rollup cannot emit both formats from one multi-input build.
- **Fail-open is a hard invariant.** A failed self-test, an unloaded model, an unparseable post, or a thrown signal all result in *showing more*, never hiding more.

## 8. Data and integration impact

- **No server, no API, no database.** The only outbound network request in the entire product is the one-time model download, confined to `src/offscreen/models.ts` and verified by a grep that runs as an acceptance criterion in `SF-101` and again in `SF-207`.
- `chrome.storage.local`: settings, account overrides, exclusion set, first-run flag.
- IndexedDB: downvote embeddings (hard cap 1000, oldest-first eviction enforced *inside the insert transaction*), cluster centroids, weekly stats (bucketed by ISO week, pruned on write).
- **No post text is ever persisted** — the embedding store holds only vectors, ids, and timestamps, and settings export is asserted to contain no embedding or text key at any depth.

## 9. Test strategy

| Layer | Approach |
|---|---|
| **Unit** | Vitest, mirroring `src/`. Two projects: `tests/unit/core/**` runs in `node` (with a sentinel asserting no DOM globals), everything else in `jsdom` (with the opposite sentinel, so a uniform-environment misconfiguration cannot pass). Vitest 4 removed `environmentMatchGlobs`; the config uses `test.projects`. |
| **Fixture / integration** | Adapter parsing runs against committed golden DOM snapshots. Scoring runs against a fixture table where **every expected score carries a written `derivation` string**, so no expected value can be a fabricated number. |
| **Contract** | The selector contract is validated structurally by unit test, at runtime by the in-extension self-test, and against the live site by the drift monitor. |
| **E2E** | Playwright, Chromium only, against a **local harness at `http://localhost:5174` serving the same golden fixtures** — never live x.com, which would require login and be non-deterministic and non-parallel-safe. The extension fixture *throws* rather than yielding when no extension service worker appears, so no E2E test can pass vacuously. 12 tickets carry applicable E2E; the other 18 carry a written rationale for approval. |
| **Performance** | Two benchmarks with `workers: 1`, comparing medians over 15 measured runs after 3 warm-ups, both arms measured in the same run on the same machine. Each was required to be *demonstrated failing* before being accepted. |
| **Drift** | Daily scheduled Playwright run against the live site, with **distinct exit codes for drift (2) and unreachable target (3)** so a dead target never masquerades as markup change. |

Prohibited everywhere: `sleep`, `waitForTimeout`, fixed delays, arbitrary polling, weakening an assertion after a failure, or raising a timeout as the first remedy.

## 10. Cross-cutting considerations

- **Security / supply chain.** No remote code, no `eval`, no `unsafe-inline`. CSP gains only `'wasm-unsafe-eval'`, and only in `SF-101`. `npm audit --audit-level=high` is a gate. Every dependency is pinned exactly; no ticket may add an unlisted package.
- **Privacy.** Zero analytics, telemetry, and accounts. The claim is *verified* by a repository-wide grep, not merely written on the listing.
- **Performance.** Page-load delta < 50ms, per-batch scoring < 100ms, memory < 300MB, first-run download < 100MB. Budgets may never be raised to make a benchmark pass — a breach is a finding to report.
- **Accessibility.** Every injected control has an accessible name and keyboard reachability; the breakdown panel uses `aria-expanded`; every options control has an associated label. This is enforced structurally by the locator policy — `getByRole` first, `getByTestId` only where documented in a selector contract.
- **Observability.** Console-only logging via one auditable module. The user-facing signal is the paused badge and the popup status.
- **Rollback.** Every hide is reversible in the UI by construction; the extension can be disabled with no residue beyond local storage the user can clear from the stats panel.
- **Copy safety.** No string anywhere may claim, imply, or hedge AI authorship. Enforced by greps in `SF-008`, `SF-102`, `SF-201`, `SF-202`, and repository-wide in `SF-207`.

## 11. Definition of done for the initiative

1. All 30 tickets complete, each meeting its own definition of done.
2. `npm run lint`, `npm run typecheck`, `npm run test:unit`, `npm run build`, `npm run test:e2e`, and `npm audit --audit-level=high` all exit 0.
3. All four performance budgets measured and met, each benchmark having been demonstrated capable of failing.
4. The drift monitor has caught a deliberate break end to end, recorded in `docs/drift-monitor-demonstration.md`.
5. The `src/core/` purity boundary is proven to fire on a nested forbidden import.
6. No network call exists in `src/` outside the single approved model download.
7. No user-facing string claims AI authorship.
8. Every hidden post is reversible and cites observable evidence.
9. All 15 human decisions answered in writing, with none silently defaulted.

> This is a planning baseline. **No product code has been written.**
