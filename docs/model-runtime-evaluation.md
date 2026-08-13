# Local model runtime evaluation

Date: 2026-08-05

The extension uses Transformers.js in a shared Chrome offscreen document and a dedicated worker. WASM
is the default backend; WebGPU remains opt-in until a benchmark shows a win.

## Runtime audit

`@huggingface/transformers@4.2.0` initially reported four high-severity advisories through its
Node-only `onnxruntime-node` and `sharp` dependency paths. The browser build does not use those Node
paths, and the lockfile pins the supported patched versions `adm-zip@0.6.0` and `sharp@0.35.3` through
the package `overrides` field. `npm audit --audit-level=high` passes with zero findings.

## Pinned local models

| Role | Repository | Revision | Quantized artifact |
| --- | --- | --- | ---: |
| Text embedder | `Xenova/all-MiniLM-L6-v2` | `751bff37182d3f1213fa05d7196b954e230abad9` | ~23 MB |
| Image forensics | `onnx-community/CommunityForensics-DeepfakeDet-ViT-ONNX` | `f9fc6516b37cd7d1bec3b94847b3682ce97249f0` | `q4f16`, ~21.2 MB |

The two first-run models total about 44.20 MB before metadata and tokenizers. The image model uses the
smaller `model_q4f16.onnx` artifact instead of the roughly 37 MB int8/quantized alternatives. Its
model card declares MIT and the text embedder declares Apache-2.0.

The optional text-pattern model is documented in [`LICENSES.md`](../LICENSES.md); it is not part of
the first-run set and is fetched only after opt-in.

The larger `Xenova/nli-deberta-v3-xsmall` candidate was not selected because its quantized artifact
is ~87 MB before the embedder and supporting files.

## Browser benchmark observations

The scoring benchmark measures 15 batches of 10 posts after three warm-ups, with one thumbnail in
each batch so the image path is exercised. The current WASM path measured a 26.29 ms median and
1.14 ms IQR in the scoring run, under the 100 ms budget. The page-load run measured a 26.29 ms
scoring median and a 43.25 ms extension page-load median versus a 42.39 ms baseline (0.86 ms delta,
under the 50 ms budget). A temporary classifier WebGPU trial loaded but measured 11,857.40 ms median
on the same machine, so `WEBGPU_ALLOWLIST` remains empty.

The cross-origin-isolated local harness exposes `performance.measureUserAgentSpecificMemory`; the
scoring and page-load runs measured 1,962,184 and 1,883,132 bytes respectively, far below the 300 MB
budget. This is a harness measurement, not a claim about every browser configuration.
