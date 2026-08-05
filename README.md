# SlopFilter

SlopFilter is a Chrome extension foundation for collapsing low-quality posts in your X timeline using local, on-device signals. Nothing leaves your browser.

## Privacy

No data leaves the browser. The only network call is the one-time model download; all filtering, settings, and statistics stay on the device.

## Development

- `npm ci` — install the pinned development dependencies.
- `npm run build` — build the unpacked extension into `dist/`.
- `npm run lint` — check formatting and lint rules.
- `npm run typecheck` — run the strict TypeScript check.
- `npm run test:unit` — run unit tests.
- `npm run test:e2e` — run the Playwright end-to-end suite.

## Loading the extension

Open `chrome://extensions`, enable Developer mode, choose Load unpacked, and select the repository's `dist/` directory.
