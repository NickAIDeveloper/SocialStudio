# Playwright E2E smoke tests

Tests for the Performance hub + Smart Posts flows. Unit tests stay under
`src/**` and are owned by Vitest; these live here so the two runners never
collide.

## Required env vars

Set before running:

```
E2E_USER_EMAIL=<seeded test account email>
E2E_USER_PASSWORD=<seeded test account password>
```

The test account must exist and have at least one Instagram account
connected via Meta (so the Meta source toggle is enabled and the IG
picker can render). When the env vars are absent the suite auto-skips so
a dev running `npm run test:e2e` without setup gets a clean pass instead
of a crash.

Optional:

```
E2E_BASE_URL=http://localhost:3000   # defaults to http://localhost:${PORT:-3000}
```

## Run

```
npm run test:e2e              # run all specs
npx playwright test --list    # list tests without executing
```

The config starts `npm run dev` for you and reuses an existing server
when one is already running.

## Intercepts, not live services

LLM-touching endpoints (`/api/smart-posts/generate`,
`/api/smart-posts/god-mode`) are intercepted with `page.route()` and
answered with canned fixtures. Tests never hit Cerebras or Meta.
