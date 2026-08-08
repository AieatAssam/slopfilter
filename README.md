# SlopFilter

> **🚧 Work in progress.** Under active construction and not ready for use. Interfaces, defaults, and packaging will change without notice.

SlopFilter is a Chrome extension foundation for collapsing low-quality posts in your X timeline using local, on-device signals. It reads visible X image thumbnails for optional C2PA checks; it does not request full-resolution media.

## Privacy

Filtering, settings, and statistics stay on the device. Runtime network access is limited to one-time model downloads and visible X thumbnail reads for optional C2PA checks.

## Development

- `npm ci` — install the pinned development dependencies.
- `npm run build` — build the unpacked extension into `dist/`.
- `npm run lint` — check formatting and lint rules.
- `npm run typecheck` — run the strict TypeScript check.
- `npm run test:unit` — run unit tests.
- `npm run build:test` — build the harness-enabled extension; required before E2E.
- `npm run test:e2e` — run the Playwright end-to-end suite.

Implementation state, constraints, and open work live in [`plan/index.yaml`](plan/index.yaml).

## Loading the extension

Open `chrome://extensions`, enable Developer mode, choose Load unpacked, and select the repository's `dist/` directory.
