# SlopFilter — agent entry point

`plan/index.yaml` is the instruction source. Read it, then read only the one
`plan/tickets/<id>.yaml` you are working. Nothing else in `plan/` needs loading.

- Shipped work is the `done:` ledger in `plan/index.yaml`. It exists in the repo — read the code, never rebuild it.
- Open work is `open_tickets:`. Work them in `depends_on` order.
- `constraints:`, `ui_rules:`, and `gates:` in `plan/index.yaml` apply to every change, ticket or not.
- Decisions in `plan/index.yaml` under `decisions:` are canonical; `docs/decision-log.md` is the owner's narrative copy.

Gates:

```bash
npm run lint && npm run typecheck && npm run test:unit && npm run build && npm run build:test && npm run test:e2e
```

E2E needs `npm run build:test` first — a production build omits the harness host
permission and every content-script spec fails.
