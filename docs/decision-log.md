# Decision log

This records decisions made in the task thread and separates them from provisional implementation
defaults that still need owner confirmation.

## Answered

- HD-001: keep **SlopFilter** as the product and extension name.
- HD-002: use the **MIT** licence. The copyright-holder line in `LICENSE` still needs owner confirmation.
- HD-004: estimate posting rate from **consecutive timestamps already visible in the timeline**. Do not fetch author profiles or use an X API key.
- HD-014: use plain TypeScript and direct DOM APIs for extension UI.

## Provisional, not silently treated as final

- HD-006: the scheduled drift workflow defaults to the committed fixture until an owner-approved live target is supplied through `SLOPFILTER_DRIFT_TARGET`.
- HD-008: the three PRD content labels use equal treatment and a provisional 0.80 confidence cutoff.
- HD-009: no hard-veto rules are enabled until the five-layer evidence rules are explicitly approved.
- HD-007: the classifier/embedder pair and immutable revisions are implemented provisionally; classifier licensing still needs confirmation.
- HD-012: a shared offscreen document with a dedicated worker is implemented provisionally to avoid one model copy per X tab.
- HD-013: runtime downloads from `huggingface.co` and its model CDN are implemented provisionally; the pinned models use WASM, WebGPU remains disabled after benchmarking, and the cross-origin-isolated harness measured roughly 1.9–2.1 MB of user-agent memory for the scoring path.
- HD-010: use `onnx-community/CommunityForensics-DeepfakeDet-ViT-ONNX` at revision `f9fc6516b37cd7d1bec3b94847b3682ce97249f0`, MIT licence, 384px input, and the `q4f16` artifact (~21.2 MB). Image inference is capped at four thumbnails per post.
- HD-011: use `@contentauth/c2pa-web@0.13.2`. Parse adapter-provided X thumbnail URLs locally; X stripping credentials is expected, but the layer is retained for future adapters and any media that preserves a manifest.

## Research outcome

The selected image model is documented in [`model-runtime-evaluation.md`](./model-runtime-evaluation.md),
and the C2PA package is loaded with local worker/WASM assets so it adds no remote script dependency.
