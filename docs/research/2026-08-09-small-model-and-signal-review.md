# Small-model and signal review — 2026-08-09

Owner-facing review behind decisions HD-017 and HD-018. Nothing here is a shipped
decision; the plan records the outcome, this file records the evidence.

## 1. Download budget is the binding constraint

`plan/index.yaml` budgets **<100MB first-run download**. Measured over the pinned
revisions on 2026-08-09 (weights only, tokenizer and WASM excluded):

| Pinned model | File | Bytes |
| --- | --- | --- |
| `Xenova/mobilebert-uncased-mnli` (zero-shot classifier) | `model_quantized.onnx` | 26.97 MB |
| `Xenova/all-MiniLM-L6-v2` (embedder) | `model_quantized.onnx` | 22.97 MB |
| `onnx-community/CommunityForensics-DeepfakeDet-ViT-ONNX` | `model_q4f16.onnx` | 21.23 MB |
| **Total committed** | | **71.17 MB** |

Roughly 29MB of headroom before tokenizers and ONNX runtime assets. Any proposal
costing more than ~20MB replaces something rather than adding to it.

## 2. Text detectors reviewed (ONNX, transformers.js-loadable)

Filtered the Hub for `text-classification` + `onnx`. Sizes are the quantized ONNX
export; `id2label` read from each `config.json`.

| Model | Base | Quantized | `id2label` | Licence on the repo | Verdict |
| --- | --- | --- | --- | --- | --- |
| `trentmkelly/slop-detector-mini-2` | gte-tiny, 6L/384h | 23.1 MB | `{0: human, 1: llm}` | **none declared** | Only candidate that fits — but it is an authorship classifier |
| `onnx-community/e5-small-lora-ai-generated-detector-ONNX` | e5-small + LoRA, 12L/384h | 34.2 MB | **absent from config** | **none declared** | Over budget; unimplementable without a label map |
| `onnx-community/chatgpt-detector-roberta-ONNX` | RoBERTa-base | 125.9 MB | `{0: Human, 1: ChatGPT}` | none declared | Dead on budget |
| `onnx-community/tmr-ai-text-detector-ONNX` | RoBERTa-base | 125.9 MB | `{0: human, 1: ai}` | MIT | Dead on budget |
| `onnx-community/answerdotai-ModernBERT-base-ai-detector-ONNX` | ModernBERT-base, 22L | 150.9 MB | absent | none declared | Dead on budget |
| `onnx-community/bert-tiny-finetuned-sms-spam-detection-ONNX` | bert-tiny | ~4 MB | SMS spam | none declared | Cheap, but SMS-domain; no evidence it transfers to timeline posts |

Every label map above is an **authorship** map — human vs. llm/ai/ChatGPT. Renaming
the layer does not change what the model asserts.

## 3. Why the whole family is a decision, not a ticket

- PRD section 1 rejects the approach, not the wording: "Existing solutions rely on
  AI-content detection, which is fundamentally unreliable."
- `plan/index.yaml` constraint: no string may claim, imply, **or hedge** that a post
  was written by AI.
- The literature agrees on the failure mode that matters here. Detector accuracy
  degrades sharply as text shortens — X posts are far below the 150-word samples
  that already produce unstable results — and seven popular detectors misclassified
  over 61% of non-native-English TOEFL essays as AI-generated, one of them ~98%.
  A 280-character, non-native-English post is the worst case for this family, and
  it is a large share of any real timeline.

Consequence: a fitting, cheap model exists (`slop-detector-mini-2`), and adopting it
still costs 23 of the 29 spare MB, ships an undeclared licence, and puts an
authorship claim at the centre of a product whose PRD is built on refusing one.
Recorded as **HD-017**, open, owner's call.

## 4. Where the pipeline can be enriched without any of that

Ranked by evidence-per-byte:

1. **Near-duplicate and template repetition (SF-219).** The durable content-side
   feature in the coordinated-posting literature is distributional, not stylistic:
   MinHash/LSH and character n-gram cosine remain the standard, and neural
   embeddings have not consistently beaten MinHash at robust near-duplicate
   detection. Zero new download — the embedder is already pinned for Layer 5, and a
   character-5-gram SimHash pre-gate keeps the batch inside the 100ms budget.
   "Near-identical to 6 other posts in this feed" is observable evidence, not an
   authorship claim.
2. **Structural engagement-bait features (SF-220).** Call-to-action phrasing,
   hashtag and mention stuffing, emoji-bulleted or numbered list runs under a
   one-line hook. Zero model, works on first run before any download, mostly
   language-neutral, and quotable verbatim in a reason label. It also closes the
   current hole where Layer 3 scores 0 whenever the classifier has not loaded.
3. **A labelled calibration corpus with a false-positive gate (SF-221).** Six
   contributions and a threshold, all provisional, and nothing measures the combined
   outcome — which is how the weighted-mean defect survived to 2026-08-08. Gate
   asymmetrically: block on false positives over labelled-ordinary and hard-negative
   rows (terse posts, non-native phrasing, non-Latin scripts, news and sports
   accounts), report recall without enforcing it.
4. **Retire the zero-shot MNLI classifier (HD-018).** `mobilebert-uncased-mnli` is
   the single largest download at 26.97 MB and runs one forward pass per candidate
   label per post. With SF-220 covering the structural cases, the same three PRD
   labels can be scored as cosine distance to prototype centroids in the embedder
   already loaded for Layer 5 — one pass, no second model, ~27MB off the first-run
   download. It changes a literally-pinned model id under HD-007, so it is a
   decision, not a silent swap.

## 5. Not recommended

- **Perplexity or log-rank zero-shot detection** (DetectLLM and successors): needs a
  causal LM in the browser, blows the budget, and is an authorship claim.
- **Fine-tuning anything.** PRD non-goal: "Training or publishing custom models."
- **Multilingual detector variants.** Same authorship problem, larger downloads.

## Sources

- [Detection of Machine-Generated Tweets through a Hybrid CNN-LSTM Framework](https://www.ijcsejournal.org/wp-content/uploads/2025/11/Detection-of-Machine-Generated-Tweets-through-a-Hybrid-CNN-LSTM-Deep-Learning-Framework.pdf)
- [Towards Possibilities & Impossibilities of AI-generated Text Detection: A Survey](https://arxiv.org/pdf/2310.15264)
- [AI detectors have a bias against non-native English speakers](https://www.advancedsciencenews.com/ai-detectors-have-a-bias-against-non-native-english-speakers/)
- [The accuracy-bias trade-offs in AI text detection tools](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12453642/)
- [RETSim: Resilient and Efficient Text Similarity](https://arxiv.org/pdf/2311.17264)
- [Uncovering Coordinated Networks on Social Media: Methods and Case Studies](https://btrantruong.github.io/assets/pdf/uncover.pdf)
- [Machine learning-based social media bot detection: a literature review](https://link.springer.com/article/10.1007/s13278-022-01020-5)
- [Transformers.js documentation](https://huggingface.co/docs/transformers.js/en/index)
