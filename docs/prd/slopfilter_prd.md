# PRD: SlopFilter Browser Extension

**Version:** 0.1 · **Status:** Draft · **Owner:** Aieat Assam
**Working title:** SlopFilter (placeholder, revisit before launch)

---

## 1. Problem Statement

Social media feeds are increasingly dominated by low-quality, mass-produced "slop": engagement bait, content-farm output, AI-generated imagery, and generic motivational spam. Existing solutions rely on AI-content detection, which is fundamentally unreliable: current text detectors are biased toward calling AI text "human" and paraphrased or lightly edited AI content evades them almost entirely.

Users do not actually want an AI detector. They want a **slop filter**. Slop has reliable detectable properties: behavioural patterns (mass posting, churn), missing provenance metadata, image forensics signals, semantic content-type patterns, and, most importantly, *the user's own taste*. This extension filters on those signals rather than making fragile authorship claims.

## 2. Goals and Non-Goals

### Goals

- Reduce visible slop in the user's feed on **one platform (X/Twitter)** to a level users perceive as a dramatic improvement.
- All inference runs **in-browser via WASM/WebGPU**. No servers, no accounts, no API keys, no data leaving the machine.
- **Negligible page-performance impact**: no perceptible increase to initial page load; filtering latency under 100ms per newly rendered batch of posts.
- **Never claim authorship.** Every hidden post shows a reason label based on observable evidence ("this account posts 40+ times/day", "matches your downvoted content"), never "this is AI-written".
- **Automated drift detection**: continuous CI validation that the platform's DOM structure matches our adapters, with alerting when selectors break.

### Non-Goals (explicitly excluded from initial scope)

- Video content analysis.
- BYOK / cloud model integration.
- Platforms other than X/Twitter.
- Training or publishing custom models.
- Mobile browsers.
- Server-side components of any kind.

## 3. Target Platform: X (Twitter)

Chosen as the first platform because:

- Highest concentration of reported slop complaints (bots, engagement bait, content farms).
- Feed DOM is React-based but has stable-ish marker attributes (`data-testid`) historically, making adapter-based scraping tractable.
- Single-column, infinite-scroll feed is the simplest filtering topology (no mixed media grids, no nested comment trees in the primary surface).

**Surfaces in scope:** Home timeline (For You and Following), notifications tab excluded, search results and profiles are stretch goals.

## 4. Product Overview

SlopFilter is a browser extension that scores each post in the feed against a set of transparent, layered signals. Posts exceeding the user's threshold are collapsed (dimmed, one-line placeholder with reason label) rather than deleted, with a one-click "show anyway" and "this was wrong" feedback control.

### Signal Layers (v1)

| Layer | Signal | Implementation | Cost |
|---|---|---|---|
| 1 | Behavioural: account post frequency, account age vs post count, engagement ratio | DOM-derived counts, heuristics | Free (JS) |
| 2 | Provenance: C2PA/content-credentials metadata on images | Metadata parse on image fetch (thumbnails only) | Free (JS/WASM) |
| 3 | Content-type classification: engagement bait, generic motivational, giveaway/crypto spam | Zero-shot text classifier (e.g. `Xenova/distilbert`-class, ~70MB) via Transformers.js | ~5ms/post on WebGPU |
| 4 | Image forensics: diffusion/GAN artefact detection on inline images | Lightweight WASM vision model on thumbnails | ~20ms/image |
| 5 | **Taste model**: semantic similarity to user's downvoted posts | `all-MiniLM-L6-v2`-class embedding model (~25MB), cosine similarity against downvote cluster centroids in IndexedDB | 3–15ms/post |

Scores are combined as a **weighted additive score with hard-veto rules** (e.g. proven absence of provenance + AI watermark = high confidence). Weights are user-tunable in an advanced settings panel; sensible defaults ship for the 95% case.

### Feedback Loop

Every action is reversible and teaches the system:

- **Thumbs-down on any post** → embed it, add to downvote set (cap ~1,000 embeddings, ~1.5MB), re-cluster centroids.
- **"Wrong call" on a hidden post** → add to an allowlist/similarity-exclusion set, log which layer misfired (telemetry stays local).
- **Account-level controls**: mute account, trust account (never filter), filter this author's images only.

### Transparency UX

- Collapsed posts show a single line: *"Hidden: posts 40+/day · similar to content you downvoted"*.
- A per-post score breakdown is one click away (which layers fired, their scores).
- A weekly local-only stats panel: posts seen vs hidden, by reason.

## 5. Technical Architecture

### Components

- **Content script (per-site adapter)**: DOM observation (MutationObserver on the timeline container), post extraction, placeholder rendering, feedback UI injection. The adapter is the only platform-specific code; all signal layers are platform-agnostic.
- **Offscreen document / Web Worker**: runs Transformers.js inference. WASM backend by default, WebGPU when available. Small models (<100M params) run faster on WASM than WebGPU due to GPU dispatch overhead; WebGPU reserved for the classifier where benchmarks show wins.
- **Storage**: `chrome.storage.local` for settings and allowlists; IndexedDB for embeddings and stats.
- **Scoring pipeline**: pure, stateless, unit-testable TypeScript module consuming a normalized `Post` object from the adapter.

### Performance Budgets

| Metric | Budget | Enforcement |
|---|---|---|
| Extension impact on initial page load | < 50ms | CI benchmark against baseline page load |
| Model load | Lazy, background, after first paint; feed works unfiltered until ready | Manual + CI |
| Per-post scoring latency | < 100ms for a scroll batch of ~10 posts | CI performance test |
| Memory footprint | < 300MB total (models + embeddings) | CI |
| Total model download (first run) | < 100MB, cached in browser | Release checklist |

### DOM Drift Detection (hard requirement)

The platform's markup will change without notice. The extension must know before users do.

- **Selector contract**: every adapter selector is declared in a versioned `selectors.json` with a description and a `required: true/false` flag.
- **In-extension self-test**: on load, the adapter validates all required selectors resolve. Failures show a non-blocking badge state ("SlopFilter paused, platform markup changed") and disable filtering rather than silently failing or hiding everything.
- **CI drift monitor**: a scheduled GitHub Action (daily) runs Playwright against a logged-out X timeline (public posts), asserting the selector contract. On failure, it opens an issue in the repo with the failing selectors and a DOM diff.
- **Golden snapshots**: representative DOM fixtures are captured per adapter version; unit tests run the adapter against these snapshots so parser changes are validated without touching the live site.

## 6. Testing Strategy

| Layer | Approach |
|---|---|
| Scoring pipeline | Pure unit tests, fixture posts with known expected scores |
| Signal layers | Unit tests per layer; golden input/output pairs |
| Adapter parsing | Fixture-based tests against captured DOM snapshots |
| Drift detection | Daily scheduled Playwright CI against live site, auto-filed issues |
| Performance | CI benchmark: page load delta, per-batch scoring latency, memory |
| E2E | Playwright: load extension into Chromium, verify posts collapse, feedback controls work, settings persist |
| Model loading | Test WASM and WebGPU paths, fallback behaviour when WebGPU unavailable |

Target: every release requires green unit + fixture tests; drift monitor runs independently and only *alerts*.

## 7. Phased Deliverables

### Phase 0: Foundation (proof of pipeline)

- Extension scaffold (Manifest V3, TypeScript, Vite build).
- X adapter v1: post extraction from Home timeline only.
- Single signal: Layer 1 (behavioural heuristics) only, no ML models.
- Collapse UI with reason label and "show anyway".
- Selector contract + in-extension self-test + CI drift monitor.
- Unit + fixture tests, Playwright E2E skeleton.
- **Exit criteria:** extension reliably collapses posts from accounts exceeding posting-frequency threshold; drift monitor demonstrably fires when selectors are deliberately broken; page-load delta < 50ms.

### Phase 1: ML Signals

- Inference worker with Transformers.js, WASM default + WebGPU detection.
- Layer 3 (content-type classifier) and Layer 5 (taste model with thumbs-down feedback and IndexedDB embedding store).
- Scoring pipeline v1: weighted combination, tunable threshold, per-post score breakdown UI.
- Performance CI benchmarks enforced.
- **Exit criteria:** filtering latency < 100ms/batch; user can thumbs-down 20 posts and see measurable change in what gets hidden; all tests green.

### Phase 2: Polish and Prove

- Layer 2 (provenance/C2PA) and Layer 4 (image forensics, thumbnails only).
- Account controls (mute/trust), stats panel, settings export/import.
- Model download progress UX, offline behaviour, Firefox support evaluation (single codebase via polyfill, decide by effort).
- Store listing, onboarding flow, privacy page ("nothing leaves your browser", verifiable: no network calls besides model download).
- **Exit criteria:** X version feature-complete per scope; 30+ days of real usage by the owner; crash-free; drift monitor has caught and been used to fix at least one real or simulated markup change end-to-end.

### Phase 3 (Stretch Goals, gated on Phase 2 proof)

- **Platform adapters:** LinkedIn, Reddit, Facebook. Adapter contract already exists; each new platform = one adapter module + selector contract + fixture set + drift monitor config. Estimated per-platform effort: 20–30% of Phase 0–2 total.
- **Cross-site topic muting**: shared semantic blocklist ("hide posts about X") using the existing embedding model, works on every adapter.
- **Search results and profile surfaces on X.**
- **BYOK tier** for nuanced judgement calls on ambiguous posts.
- **Video support** via BYOK multimodal models on sampled frames (deferred deliberately; local video detection is not viable).
- **Safari support.**

## 8. Privacy and Trust

- Zero network calls at runtime except one-time model download from Hugging Face CDN. Verifiable via DevTools; stated on the store listing.
- No analytics, no telemetry, no accounts. All stats local.
- No authorship accusations anywhere in UI copy. All reason labels cite observable evidence.
- Open source from day one; the privacy claim must be auditable.

## 9. Risks

| Risk | Mitigation |
|---|---|
| X obfuscates DOM / removes `data-testid` attributes | Selector contract with multiple fallback selectors per element; drift monitor catches breaks in < 24h; in-extension graceful pause |
| Rate of DOM churn exceeds maintenance appetite | In-extension self-test means failure is visible and silent breakage is impossible; adapter design keeps fix surface small |
| X rebrand or anti-extension measures | Phase 3 adapters de-risk single-platform dependence |
| Model quality insufficient for taste learning | Taste model is one layer among five; threshold tunable; failure mode is "fewer posts hidden", never wrong accusations |
| Store review friction | No remote code, no broad host permissions beyond target site, clear privacy declaration |

## 10. Success Metrics

- Hidden-post "wrong call" rate under 10% (measured by user feedback control).
- User retention of the thumbs-down habit: 5+ downvotes in first week.
- Page-load delta under 50ms sustained across releases.
- Drift monitor mean-time-to-detection under 24h.
- Phase 3 gate: owner has used the X version daily for a month and would not browse without it.
