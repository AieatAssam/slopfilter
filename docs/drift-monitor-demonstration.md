# Drift monitor demonstration

Date: 2026-08-05

The monitor was run against the committed fixtures and an unreachable local port.

## Baseline

Command:

```text
node scripts/check-drift.mjs --target file:///Users/aieat/Documents/git/slop-filter-chrome-extension/tests/fixtures/dom/x/timeline-baseline.html
```

Observed exit code: `0`

Observed output:

```text
drift status=ok failed=0 target=file:///Users/aieat/Documents/git/slop-filter-chrome-extension/tests/fixtures/dom/x/timeline-baseline.html
```

## Deliberate selector break

Command:

```text
node scripts/check-drift.mjs --target file:///Users/aieat/Documents/git/slop-filter-chrome-extension/tests/fixtures/dom/x/timeline-broken-selectors.html
```

Observed exit code: `2`

Observed output:

```text
drift status=drift failed=timeline-container target=file:///Users/aieat/Documents/git/slop-filter-chrome-extension/tests/fixtures/dom/x/timeline-broken-selectors.html
```

The scheduled workflow would use the issue title `Drift monitor: X selector contract failed`.

## Unreachable target

Command:

```text
node scripts/check-drift.mjs --target http://127.0.0.1:1/nothing
```

Observed exit code: `3`

Observed output:

```text
drift status=unreachable target=http://127.0.0.1:1/nothing
```

The scheduled workflow would use the separate issue title `Drift monitor: target unreachable`.
