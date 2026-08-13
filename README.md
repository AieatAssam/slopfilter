# SlopFilter

> **🚧 Work in progress.** Under active construction and not ready for use. Interfaces, defaults, and packaging will change without notice.

SlopFilter is a Chrome extension foundation for collapsing low-quality posts in your X timeline using local, on-device signals. It reads visible X image thumbnails for optional C2PA checks; it does not request full-resolution media.

## Privacy

Filtering, settings, and statistics stay on the device. Runtime network access is limited to one-time model downloads and visible X thumbnail reads for optional C2PA checks.

## Third-party models

Model files are fetched by the user's browser on demand and are never bundled. The optional text-pattern model is off by default, declares no licence on its source repository, and is downloaded only after opt-in. See [`LICENSES.md`](LICENSES.md).

## Development

- `npm ci` — install the pinned development dependencies.
- `npm run build` — build the unpacked extension into `dist/`.
- `npm run lint` — check formatting and lint rules.
- `npm run typecheck` — run the strict TypeScript check.
- `npm run test:unit` — run unit tests.
- `npm run build:test` — build the harness-enabled extension; required before E2E.
- `npm run test:e2e` — run the Playwright end-to-end suite.
- `npm run bench:commits -- --scenario bench/commit-evaluation.example.json` — run one declared
  check against clean archives of a pre-change and shipped commit.

## Commit evaluations

The commit evaluator runs the same shell check in two temporary Git archives, so neither copy has
`.git` history. It prints deterministic JSON containing each exit outcome, normalized diagnostics,
and whether the baseline outcome differs from the shipped outcome. The shipped check must pass for
the command to exit zero.

Use a scenario file or pass the three values directly:

```sh
npm run bench:commits -- \
  --baseline 753eea7 \
  --shipped a583807 \
  --command 'test -f scripts/check-drift.mjs'
```

The example scenario checks the drift monitor and page-load benchmark introduced by `a583807`.
Future evaluations should add one scenario per behavior and keep the command deterministic; this is
not an agent runner or a replacement for the existing unit, E2E, and performance checks.

Implementation state, constraints, and open work live in [`plan/index.yaml`](plan/index.yaml).

## Loading the extension

Open `chrome://extensions`, enable Developer mode, choose Load unpacked, and select the repository's `dist/` directory.
