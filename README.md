# SqueekPulse

A living particle canvas powered by SqueekChain’s real hamster wheel. Choose **Nebula, Vortex, Rain, or Pulse**, stir the particles with your pointer or a touch, adjust the field, and download the current artwork as a PNG.

The application and production build have **zero package dependencies**. The site uses HTML, CSS, JavaScript modules, and Canvas 2D. Fonts, icons, and the share image are local. No wallet, account, backend, analytics, or private configuration is needed.

## Install, build, and preview

Install Node.js 22 or newer. There are no frontend packages to install; `npm ci` is available for workflows that expect a lockfile installation step.

```sh
npm ci
npm run build
npm run preview
```

Open **http://localhost:4173/preview/**. Stop the foreground preview with Ctrl+C. Pass a different port with `npm run preview -- 8080`.

The complete static export is included in **`dist/`**. Serve that directory with any static HTTP host. All runtime asset URLs and JavaScript imports are relative, including the favicon and Open Graph image, so it works under a gateway subpath. No server rewrites are needed. Opening the file directly with `file://` is not supported by browser module and fetch security rules.

`npm run build` replaces `dist/` with an exact copy of `index.html`, `src/`, and `assets/`. Rebuild after editing any of those paths. The source and export are both intentionally delivered; no dependency directories or caches belong in the submission.

## The signal behind the art

Public sources, read directly in the browser:

- [SqueekChain status](https://api.squeekchain.com/v1/status)
- [SqueekChain economy](https://api.squeekchain.com/v1/economy/state)

The first request starts on load. Subsequent pairs run 15 seconds after the previous pair completes, with an 8-second timeout and no overlapping refreshes. Polling and animation suspend when the page is hidden. The refresh button retries immediately. The API base and poll interval live in `src/telemetry.js`.

| Reading | Interpretation | Effect |
| --- | --- | --- |
| `measurement.rpmMilli` | Divide by 1,000 for RPM | Particle speed |
| `measurement.coreStatus` | `SPINNING`/`RUNNING` versus resting or unknown | Expansion and brightness |
| `builder.anchor.blockProgress` | Divide by 1,000,000,000 for a fraction | Base hue from 140° to 220° |
| `supply.miningMintedBaseUnits` | Scale by `asset.decimals` | Subtle particle glow |

Confirmed progress comes only from `builder.anchor`, never optimistic `builder.projected` values. SQK mined excludes the premint. Displayed token amounts are approximate visual readings, not financial accounting.

Freshness uses the sensor’s `observedAt`, `freshness`, and `staleAfterSeconds`. Economy observations expire after 120 seconds. A failed or semantically unavailable source retains its last successful value **marked stale**. With no previous reading, it shows `–`. Missing or stale wheel data uses a visibly labeled **Ambient** drift; synthetic telemetry is never substituted. Turning off “Follow the wheel” also selects ambient art while keeping real readings visible.

## Controls

Mode buttons change the particle geometry. Density changes the actual particle count (400–2,800); intensity multiplies motion (0.25–2×); trail length controls the frame fade. Reset restores the default Nebula settings and live influence. Reshuffle generates a new arrangement.

Pause freezes the artwork while data continues updating. Focus the canvas and press **Space** to pause or resume. Reduced-motion preference starts the artwork paused and suppresses decorative transitions. Pointer movement bends the field; touching it makes a ripple. Fullscreen uses the browser API, with a keyboard-accessible immersive fallback. Save image exports the real canvas pixels as PNG, without interface chrome.

## Validation

JavaScript is typechecked with TypeScript’s strict `checkJs` mode, configured in `jsconfig.json`. The optional validation tools are not application or build dependencies.

```sh
npm run typecheck
npm test
npm run check:export
```

The first typecheck downloads pinned TypeScript 5.9.3 into `test/scratch/` if it is not already available there. It needs network access once. The build and unit tests need only Node.js.

To reproduce browser validation with disposable tooling:

```sh
npm install --prefix test/scratch/tooling --cache test/scratch/npm-cache --logs-dir test/scratch/npm-logs --package-lock=false --no-audit --no-fund playwright@1.65.0 axe-core@4.11.0 typescript@5.9.3
PLAYWRIGHT_BROWSERS_PATH="$PWD/test/scratch/browsers" node test/scratch/tooling/node_modules/playwright/cli.js install chromium
PLAYWRIGHT_BROWSERS_PATH="$PWD/test/scratch/browsers" node tests/browser.mjs test/scratch/tooling/node_modules/playwright/index.mjs test/scratch/tooling/node_modules/axe-core/axe.min.js
```

The browser script manages its own bounded preview at `/preview/` and closes it on completion. An optional first argument accepts a Playwright-compatible launcher module. Fixtures in `tests/fixtures.mjs` are used only by tests and are absent from the static export.

Actual worker results on 2026-11-08:

| Check | Result |
| --- | --- |
| `npm run build` | Passed; complete static export produced |
| `npm run typecheck` | Passed; strict checkJs, no diagnostics |
| Documented preview | Passed; foreground server rendered the page and served local runtime assets at `/preview/` |
| `npm test` | 10/10 passed, including short-interval polling and partial failures |
| Browser interaction validation | 21/21 passed in headless Chromium, including touch emulation, native fullscreen and its fallback |
| axe-core 4.11.0 | No WCAG rule violations at 390, 1440, or with the explanation dialog open |
| Pinned `taste@1` probe | 16/16 passed at 320, 390, and 1440 |
| Live API verification | Both public endpoints returned HTTP 200 in the browser; a subsequent poll arrived after 15,345 ms; no console errors, page errors, or failed requests |
| Export integrity and budget | Checked with `npm run check:export`; complete local assets, matching source/export, below the 8 MiB limit |

The final live observation showed 0.0 RPM, Resting, 82.0% confirmed block progress, and 11.78M mined SQK. Those are observations, not hardcoded site values.

The provided browser connector failed to launch; inspection used a local headless Chromium fallback. Live browser requests required the environment’s network proxy; the application contains only the public API origin. WebKit installation was attempted, but launch failed because required system libraries were unavailable. **WebKit, physical devices, screen readers, native browser zoom, and the animation timeline at 10% speed were not verified.** A 200% root-text enlargement check passed; it is distinct from native zoom. The probe cannot resolve every canvas-overlap contrast pair; seven opaque text/background pairs were measured separately, all above 4.5:1.

See [the consolidated review](artifacts/validation.md), [the design system](DESIGN.md), [mobile evidence](artifacts/mobile.png), and [desktop evidence](artifacts/desktop.png). These are worker observations, not independent certification.

## Files and submission budget

`src/particles.js` owns the renderer; `src/telemetry.js` owns fetching, validation, freshness, and visual mappings; `src/app.js` owns controls and presentation. `src/styles.css` contains tokens and responsive components. `scripts/` contains dependency-free build, preview, and export verification, plus optional authoring/check tooling.

`assets/social.png` is a finished 1200×630 share image made with the real particle renderer. Its optional authoring source is `scripts/create-social.mjs`; regenerate with the same Playwright module argument as the browser checks, then rebuild. The font’s OFL license is in `assets/FONT-LICENSE.txt`; design-guide attribution is in [NOTICE.md](NOTICE.md).

The explicit path budgets are recorded in `artifacts/submission-budget.json`. `.gitignore` has a 512-byte budget and excludes dependency/cache directories at every nesting level plus `test/scratch/`, each with a submission budget of zero. `dist/` is deliberately included. No Git metadata was modified.
