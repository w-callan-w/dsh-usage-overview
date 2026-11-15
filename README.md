# DSH Usage Overview

[简体中文](README.zh-CN.md)

A usage overview plugin for DeepSeek Harness. It reads the harness's own session
records and presents token totals, an annual activity heatmap, daily token and
cache-hit-rate trends, and a per-model breakdown with a stacked day/week chart.

[GitHub](https://github.com/w-callan-w/dsh-usage-overview) · [Gitee](https://gitee.com/callanjones/deep-seek-harness-usage-plugin) · [npm](https://www.npmjs.com/package/dsh-usage-overview)

## Features

- **Headline metrics** — total tokens, peak day, longest chat, current and
  longest streaks, and prompt-cache hit rate.
- **Token activity** — a year of daily usage as a Sunday-aligned heatmap with
  five intensity levels.
- **Daily token trend** — one smoothed line per provider route, with a shared
  crosshair and per-route legend totals.
- **Daily cache hit rate** — input-token weighted cache hit rate per day, with
  gaps for days that had no input tokens.
- **Model usage** — a donut chart, an attributed model list (provider source,
  sessions, turns, tokens, share), and a stacked daily/weekly usage chart.
- **Range selector** — 7, 30, 90 days, or all time.
- **Fluid layout** — sized against the panel, not the window; the card strip,
  model panel, range control, and charts adapt continuously to the available
  width.
- **Light and dark themes** — colours come from DSH theme tokens, including the
  tooltip's own dark-surface label token.

| Desktop | Phone (390px) |
|---|---|
| ![Desktop](docs/dashboard.png) | ![Phone](docs/dashboard-mobile.png) |

## Install

The plugin is a DSH bundle. It needs a harness build that provides the
`webServer` service.

### From npm

The package is published as `dsh-usage-overview`. Add it to the active profile:

```sh
cd "$DSH_HOME/profiles/desktop"
pnpm add dsh-usage-overview
```

Then add `"dsh-usage-overview"` to `dsh.profile.bundles` in that profile's
`package.json` and restart DeepSeek Harness.

### From a local copy

1. Copy the package into the target profile:

   ```sh
   cp -r dsh-usage-overview "$DSH_HOME/profiles/desktop/node_modules/"
   ```

2. Add it to the profile's bundle list in
   `$DSH_HOME/profiles/desktop/package.json`:

   ```json
   {
     "dsh": {
       "profile": {
         "bundles": ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "dsh-usage-overview"]
       }
     }
   }
   ```

3. Restart DeepSeek Harness. The sidebar entry **用量统计** / **Usage** appears
   after the profile is composed.

The Desktop shell composes its profile once at launch. Editing files while it is
running does not mount a new bundle; quit and relaunch. A CLI-launched profile
with DSH's HMR bundle can reload on a manifest change.

## Usage

Open **用量统计** in the sidebar.

- The range selector controls the headline metrics, the daily token trend, the
  cache-rate chart, and the model usage trend.
- The activity heatmap always draws a year grid; the range selector does not
  change its window.
- Hovering a chart raises exact figures for the hovered day or week.
- The model usage chart has a **每日 / 每周** switch. Weeks start on Monday; a
  partial week at either end of the range remains visible.
- On narrow panels the heatmap scrolls horizontally and opens at the most recent
  weeks.

## Data

The plugin reads durable harness data only. It writes no harness state, calls no
model, and registers no model-facing tool.

1. **Session logs** — `$DSH_HOME/sessions/<workspace>/<session>/session.v4.jsonl.zstd`.
   Each log is a sequence of independently compressed zstd frames; every frame is
   decoded separately. Assistant messages carry their own timestamp, provider
   usage, provider, and model, which yields the real daily and per-route series.
2. **Session index** — directory names provide session identity, creation time,
   and log paths.
3. **Projection cache** — `$DSH_HOME/storages/session_projcache/sessions/*.json`
   is a fallback for unreadable logs and supplies session titles.
4. **Live session services** — `ctx.sessions.list()` and
   `ctx.sessionProjections.snapshot(session)` make an active session's running
   totals count immediately.

Cache reads are counted as billed tokens. The cache hit rate is:

```text
cacheRead / (cacheRead + cacheWrite + uncachedInput)
```

Output tokens are excluded because they are not cacheable.

## HTTP surface

Both routes are read-only.

| Route | Purpose |
|---|---|
| `GET /plugins/dsh-usage-overview/stats?range=7d\|30d\|90d\|all` | Aggregate dashboard document |
| `GET /plugins/dsh-usage-overview/session?id=<session-id>` | One durable session record |

A request is accepted when it comes from loopback, or when DSH's session
authentication vouches for it. The second path lets a phone reach the panel
through the remote tunnel without opening the route to anonymous callers.

The browser half is provided by DSH's client module system and advertised in the
page's boot graph.

## Development

No bundler or runtime dependency is required. Node.js runs the build and check
scripts directly.

```sh
node scripts/build.mjs
```

This copies the Host half (`lib/*.js`) from `src/` and bundles the browser half
into `lib/client.js` using DSH's module-loading format.

### Checks

| Command | Purpose |
|---|---|
| `node scripts/check-sources.mjs` | Client source syntax and stylesheet template |
| `node scripts/lint-bundle.mjs` | Built browser bundle parses |
| `node scripts/check-build-fresh.mjs` | Committed `lib/` matches a fresh build |
| `node scripts/test-aggregation.mjs` | Aggregation, attribution, cache-rate, and edge cases |
| `node scripts/render-check.mjs` | Bundle materializes and renders in a React stub |
| `node scripts/preview.mjs` | Static dashboard preview |
| `node scripts/responsive-check.mjs [origin]` | Seven widths, live resize, light/dark contrast, screenshots |
| `node scripts/verify-install.mjs` | Installed profile package, exports, routes, trust guard |
| `node scripts/verify-live.mjs [origin]` | Running host serves the routes and bundle |

`responsive-check.mjs` and `verify-live.mjs` need a running host; pass its origin
when it is not the default `http://127.0.0.1:50494`.

## Layout and theming

The dashboard measures the panel, not the viewport. The card strip flows on a
150px basis, the model panel and range control wrap by content width, and each
chart redraws at its measured pixel width. Type, spacing, and padding scale with
container query units, so there are no hard layout breakpoints.

Colours use DSH `--dsw-*` tokens for both themes. The tooltip is a dark surface in
both light and dark mode and therefore uses `--dsw-alias-tooltip-label`; small
labels and chart axes use the higher-contrast secondary label token. The
`responsive-check.mjs` theme pass enforces a minimum contrast ratio of 4.5:1.

## License

MIT
