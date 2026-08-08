# Image and provenance evaluation

Date: 2026-08-05

This records the evidence and owner decisions for HD-010 and HD-011.

## HD-010: image-forensics candidate

The recommended candidate is
[`onnx-community/CommunityForensics-DeepfakeDet-ViT-ONNX`](https://huggingface.co/onnx-community/CommunityForensics-DeepfakeDet-ViT-ONNX)
at revision `f9fc6516b37cd7d1bec3b94847b3682ce97249f0`.

The model card identifies a ViT-Small ONNX model trained across 2.7 million images and 4,803
generators, with Transformers.js support and an MIT licence. The selected `q4f16` ONNX artifact is
about 21.2 MB, below the roughly 37 MB int8/quantized alternatives. The extension uses the pinned
revision, 384px model input, and the existing 0.80 confidence threshold; inference is WASM-backed
and capped at four thumbnails per post.

Alternative candidates reviewed were larger or had weaker deployment/licensing characteristics:
`capcheck/ai-image-detection` is an 86M-parameter ViT-Base CIFAKE model, while `Modotte/AIRealNet`
is a substantially larger SwinV2 model. Neither is preferred for the extension's thumbnail budget.

## HD-011: provenance viability on X

Three public thumbnail URLs observed in the signed-in X Home timeline were fetched as JPEG CDN
responses and inspected for C2PA/JUMBF marker strings. They returned successfully, but none exposed a
marker in the downloaded thumbnail bytes. This is a small sample and is not proof that every X image
lacks credentials.

Independent recent research reports that Twitter/X CDN processing strips C2PA credentials from
uploaded images, which makes cryptographic provenance unavailable after upload in that setting:
[`GPT-Image-2 and the Provenance Gap`](https://arxiv.org/abs/2604.25370).

Decision: implement SF-201 with `@contentauth/c2pa-web@0.13.2`, using its local worker and WASM
assets. X stripping credentials is expected to make the signal neutral on many X thumbnails, but
the parser remains useful for other platform adapters and for any X media that retains a manifest.
