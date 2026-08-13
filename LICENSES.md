# Third-party models and runtimes

SlopFilter does not bundle model files. The user's browser fetches pinned model artifacts from the
model host when the relevant feature is enabled.

| Component | Revision / version | Artifact | Size | Declared licence |
| --- | --- | --- | ---: | --- |
| `Xenova/all-MiniLM-L6-v2` | `751bff37182d3f1213fa05d7196b954e230abad9` | `model_quantized.onnx` | 22.97 MB | Apache-2.0 |
| `onnx-community/CommunityForensics-DeepfakeDet-ViT-ONNX` | `f9fc6516b37cd7d1bec3b94847b3682ce97249f0` | `model_q4f16.onnx` | 21.23 MB | MIT |
| `trentmkelly/slop-detector-mini-2` | `30775d5640f1ac6524d6a469d02e531e37852360` | `onnx/model_quantized.onnx` | 23.12 MB | none declared on the source repository |
| `@contentauth/c2pa-web` | `0.13.2` | package runtime and local WASM assets | package | Apache-2.0 |

The optional `trentmkelly/slop-detector-mini-2` model declares no licence on its source repository;
no licence is inferred from its TaylorAI/gte-tiny base model. It is fetched only after opt-in and is
not bundled or redistributed by this extension.
