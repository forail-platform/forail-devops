# Forail Handbook Screenshot Generator

A small Playwright tool that captures annotated screenshots of every page in
the Forail UI and saves them to `../img/handbook/`. The output is consumed by
[`HANDBOOK.md`](../HANDBOOK.md).

This tool is **documentation tooling only** — it is intentionally outside
`forail-frontend` and `forail-backend` because it has no role in the
application's build, test, or runtime.

## How it annotates

Each shot is captured with two CSS injections:

1. A red outline + glow on the targeted element (`data-forail-highlight`).
2. A numbered red badge (1, 2, 3 …) anchored to its top-left corner
   (`data-forail-callout`).

The numbers correspond to a list under the image in `HANDBOOK.md` that
explains what each highlighted element does.

## One-time setup

```bash
cd forail-deploy/docs/screenshots
npm install
npx playwright install chromium
```

## Usage

Make sure the Forail stack is up and reachable at `FORAIL_URL`
(default `https://localhost`). Then:

```bash
# All shots
npm run screenshots

# A single shot id (see SHOTS object in screenshots.mjs)
node screenshots.mjs dashboard
```

## Configuration

Override via environment variables:

| Variable | Default | Purpose |
|---|---|---|
| `FORAIL_URL` | `https://localhost` | Base URL of the running Forail stack |
| `FORAIL_USER` | `admin` | Login username |
| `FORAIL_PASS` | `ForailAdmin2026!` | Login password |

## Adding a new shot

1. Open `screenshots.mjs`.
2. Add a new entry to the `SHOTS` object:
   ```js
   my_new_page: (p) => listPage(p, '/my_new_page', [
     { selector: 'main h1', n: 1 },
     { selector: 'main button.bg-primary', n: 2 },
   ]),
   ```
3. `node screenshots.mjs my_new_page` to test it.
4. Add `![My New Page](img/handbook/my_new_page.png)` plus the numbered legend
   under the matching section in `HANDBOOK.md`.
