# Decision log

This records decisions made in the task thread and separates them from provisional implementation
defaults that still need owner confirmation.

## Answered

- HD-001: keep **SlopFilter** as the product and extension name.
- HD-002: use the **MIT** licence, copyright holder **Aieat Assam**. Confirmed 2026-08-09; `LICENSE` already reads this and needs no change.
- HD-004: estimate posting rate from **consecutive timestamps already visible in the timeline**. Do not fetch author profiles or use an X API key. Re-opened 2026-08-08 because the in-viewport derivation almost never has two posts by one author; **closed 2026-08-09** — SF-215 (cross-session sightings cache) plus SF-216 (read X's own already-fetched HomeTimeline/detail responses) is the answer, and neither adds a request. Authenticated profile or API fetches stay rejected.
- HD-003 (2026-08-09): the drift monitor files issues against the **main repository**, `AieatAssam/slopfilter`. Because it is public, SF-224 sanitises the captured DOM on the runner before it reaches an artifact or an issue body, reusing `scripts/sanitise-fixture.mjs`. `drift-report.json` needs no change — it carries only contract version, target, timestamp, status, and selector ids.
- HD-019 (2026-08-09): ship `trentmkelly/slop-detector-mini-2` as it stands and document the position. The repo declares no licence, so no rights are expressly granted and the base model's Apache-2.0 does not carry to the derivative; the risk is accepted knowingly. Nothing is bundled — the user's browser fetches the model on opt-in. SF-223 records this in `README.md` and a new `LICENSES.md`.
- HD-014: use plain TypeScript and direct DOM APIs for extension UI.
- HD-017 (2026-08-09): a text-pattern detector **may** ship as one available signal, never as
  authoritative on its own. SF-223 implements it with no user-facing reason string, a weight capped
  below the hide threshold, an opt-in download, and a 180-character minimum. Reviewed in
  [`research/2026-08-09-small-model-and-signal-review.md`](./research/2026-08-09-small-model-and-signal-review.md).
  Licensing is unresolved — see HD-019.
- HD-018 (2026-08-09): retire `Xenova/mobilebert-uncased-mnli` and score the three PRD content labels
  as cosine distance to committed prototype centroids in the embedder already loaded for Layer 5.
  SF-222 implements it. First-run download 71.17 MB → 44.20 MB, which is what makes SF-223 fit at
  67.32 MB. The labels themselves are unchanged, so HD-008 stands.

## Provisional, not silently treated as final

- HD-006: the scheduled drift workflow defaults to the committed fixture until an owner-approved live target is supplied through `SLOPFILTER_DRIFT_TARGET`.
- HD-008: the three PRD content labels use equal treatment and a provisional 0.80 confidence cutoff.
- HD-009: no hard-veto rules are enabled until the five-layer evidence rules are explicitly approved.
- HD-007: the embedder and immutable model revisions are implemented provisionally; the retired classifier is no longer part of the model set.
- HD-012: a shared offscreen document with a dedicated worker is implemented provisionally to avoid one model copy per X tab.
- HD-013: runtime downloads from `huggingface.co` and its model CDN are implemented provisionally; the pinned models use WASM, WebGPU remains disabled after benchmarking, and the cross-origin-isolated harness measured roughly 1.9–2.1 MB of user-agent memory for the scoring path.
- HD-010: use `onnx-community/CommunityForensics-DeepfakeDet-ViT-ONNX` at revision `f9fc6516b37cd7d1bec3b94847b3682ce97249f0`, MIT licence, 384px input, and the `q4f16` artifact (~21.2 MB). Image inference is capped at four thumbnails per post.
- HD-011: use `@contentauth/c2pa-web@0.13.2`. Parse adapter-provided X thumbnail URLs locally; X stripping credentials is expected, but the layer is retained for future adapters and any media that preserves a manifest.

## Open, awaiting the owner

- HD-005: sign-off on the default thresholds in `src/core/scoring/weights.ts` and on the provisional
  constants added by SF-219 through SF-223. Deliberately left provisional — review once SF-221 has
  measured them.

## Research outcome

The selected image model is documented in [`model-runtime-evaluation.md`](./model-runtime-evaluation.md),
and the C2PA package is loaded with local worker/WASM assets so it adds no remote script dependency.
