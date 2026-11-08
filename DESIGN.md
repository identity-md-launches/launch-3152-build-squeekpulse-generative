# SqueekPulse design system

## Overview

SqueekPulse is an interactive art instrument for people following SqueekChain’s hamster wheel. A dark, quiet interface frames one luminous particle field. Lime marks the primary playback action, selected controls, and live activity; the artwork supplies the changing color.

The hierarchy is product identity, a short introduction, the working canvas and controls, then telemetry. The canvas and playback/save actions fit on the first 390×844 screen. This is a single-page experience, not a component-library package. Its reusable patterns are the classes in `src/styles.css`, markup in `index.html`, and handlers in `src/app.js`.

## Colors

Canonical primitives and semantic aliases are in `src/styles.css:9`. The implemented theme is dark only.

| Semantic token | Value | Role |
| --- | --- | --- |
| `--color-bg` | `#101210` | Page |
| `--color-surface` | `#171a17` | Buttons, mode previews, telemetry, dialog |
| `--color-surface-hover` | `#1e221e` | Neutral hover |
| `--color-border` | `#292e28` | Surface separation and dividers |
| `--color-control-border` | `#3e473c` | Unselected mode outline, tracks |
| `--color-text` | `#f0f2ec` | Primary text |
| `--color-text-secondary` | `#a0aa9d` | Descriptions, labels, units |
| `--color-accent` | `#c4f582` | Primary fill, selected outline, active tracks |
| `--color-accent-hover` | `#d7ffa8` | Primary hover |
| `--color-selected-bg` | `#232f1c` | Selected mode |
| `--color-on-accent` | `#17200f` | Primary action label |
| `--color-focus` | `#d7ffa8` | Keyboard outline |
| `--color-warning` | `#e7c88c` | Stale data and feed notices |
| `--color-canvas` | `#0b0f0e` | Particle background and opaque overlay labels |

Canvas helper text uses the local color `#b0bdb3`. `src/particles.js` uses the matching canvas background and data-derived HSLA particle colors. Art color is not a status indicator. Running, resting, stale, and offline states all have explicit text; mode selection also has a checkmark and `aria-pressed`.

Measured rendered text pairs: main text/page **16.68:1**, secondary/page **7.82:1**, secondary/surface **7.30:1**, primary action **13.39:1**, selected mode **12.45:1**, canvas hint **9.90:1**, canvas title **17.10:1**. See `artifacts/contrast.json`. Opaque label backgrounds and canvas edge masks protect labels from changing particles. These measurements do not certify every pixel or interaction state.

## Typography

The local variable **Space Grotesk** face is `assets/space-grotesk-latin.woff2`, loaded with `font-display: swap` and a preload. The fallback stack is `Arial, sans-serif`. Interface weights are 400, 500, and 600. The local face was loaded during rendered checks. `ui-monospace, SFMono-Regular, Consolas, monospace` is reserved for slider values, units, edition numbers, and keyboard keys.

| Token | Default | Use |
| --- | --- | --- |
| `--text-small` | 12px / .75rem | Secondary labels, units, data descriptions |
| `--text-label` | 14px / .875rem | Body, buttons, section labels |
| `--text-body` | 16px / 1rem | Introduction, controls heading |
| `--text-title` | 20px / 1.25rem | Brand, dialog heading, mobile readings |
| `--text-data` | 28px / 1.75rem | Desktop telemetry |
| `--text-display` | 40px / 2.5rem | Main heading; 32px below 1200, 28px below 540 |

Body line height is 1.5, headings 1.18–1.4, and numeric readings 1.25. Main heading tracking is −.05em (−.045em on phones), with modest −.015 to −.035em tracking on secondary headings and numeric/brand roles. Labels have natural spacing and sentence case. Numeric readings request `tabular-nums`. Font sizes use rem; enlarged labels and telemetry reflow rather than truncate.

## Layout

Spacing tokens are `--space-1/2/3/4/6/8/10`: **4, 8, 12, 16, 24, 32, and 40px**. Shared margins and inter-group spacing use these tokens; small optical offsets align icons and canvas labels.

`.page-width` is at most 1344px with 48px side margins at standard desktop widths. `.workspace` has a flexible canvas, a 280px control column, and a 32px gap. The canvas is 440–552px tall. The header is at least 96px tall. Controls are in document flow, with the canvas preceding settings in reading order.

| Breakpoint | Implemented adaptation |
| --- | --- |
| ≥1600px | Page max 1440px, 64px nominal side margins, 300px settings, 40px workspace gap |
| ≤1199px | 32px side margins, 252px settings, 24px gap, 32px headline |
| ≤899px | 20px side margins, one workspace column, 440px canvas; settings become two columns; telemetry becomes two columns |
| ≤539px | 16px side margins, 72px minimum header, 326px canvas, settings stacked; mode tiles fit four across at normal text size; metrics fit two across |
| ≤359px | 290px canvas; compact brand/buttons; canvas count omitted because density remains visible in settings |

On phones, mode tiles use a 4rem minimum and metrics an 8.5rem minimum. Those grids naturally become fewer columns with enlarged text. The header, toolbar, metric readings, and footer can wrap. At 390px with root text doubled, metrics become one column and no horizontal overflow occurs.

Rendered widths checked: **320, 390, 800, and 1440**. The first 390×844 screen includes the actual canvas, Pause, Reshuffle, and Save image. Native browser zoom and RTL/localization variants were not tested; the product ships English only.

## Elevation & Depth

The interface is flat. Tonal surfaces and 1px borders establish structure; there are no box shadows, gradient text, or nested card surfaces. The canvas is an isolated art plane, with grid lines, particle halos, and gentle edge masks inside Canvas 2D.

The native explanation dialog uses a `#000b` backdrop. The skip link sits at z-index 20, fullscreen fallback at 25, and feedback toast at 30. Native dialog/fullscreen use browser top layers. The fullscreen fallback makes background siblings inert, locks page scrolling, contains focus, and restores focus when closed.

## Shapes

`--radius-control` is **8px**, used by buttons and mode tiles. `--radius-surface` is **14px**, used by the canvas, telemetry, and dialog. Mode previews use 7px upper corners inside the tile’s 1px outline. Status dots and switch thumbs are circular. The switch track is 34×20px with a 14px thumb.

The main canvas clips only its pixels to its rounded shape. Telemetry uses `overflow: clip` on phones to preserve the outer radius; text stays in auto-height cells and was checked for reflow. Do not add fixed-height text containers or ellipses to telemetry.

## Components

| Pattern | Source | Behavior and states |
| --- | --- | --- |
| `.button.primary` | `index.html`, `src/styles.css` | Lime playback action. Pause/Resume state includes label, icon, pressed state, and canvas indicator. Minimum 44px height. |
| `.button.secondary`, `.text-button`, `.icon-button` | Same | Reshuffle, save, reset, help, refresh, fullscreen. Named icons, neutral hover, native disabled state, visible focus. |
| `.mode-button` | `index.html`, `setMode` in `src/app.js` | Four native buttons with static canvas previews. Exactly one `aria-pressed`; selected outline, fill, checkmark, and live announcement. |
| `.slider-setting` | `index.html`, `updateSlider` | Native ranges with visible labels and outputs. Arrow keys work. Density is 400–2,800, intensity .25–2×, trails 0–95%. |
| `.live-setting` | `index.html`, `src/app.js` | Labeled native checkbox with switch role. Checked means use fresh telemetry; off means ambient art. |
| `.canvas-stage` | `src/particles.js`, `src/app.js` | Four geometries, pointer bending, touch ripple, resize observer, capped pixel ratio (2), elapsed-time motion, PNG export. Space pauses/resumes a focused canvas. |
| `.connection`, `.metric`, `.data-notice` | `renderFeed` | Connecting, fresh, unknown wheel state, resting, stale, offline, retained reading, and retry states. Status changes have text and color; no synthetic live values. |
| `#about-dialog` | `index.html`, `containFocus` | Native modal, descriptive heading, source links, Escape/backdrop/close actions, Tab wrapping, focus return. |
| `.toast`, `#announcement` | `src/app.js` | Stable polite status regions. Action feedback expires after 4.5s; save errors persist. Sensor values are not announced on every poll. |

Hover styling runs only on hover-capable devices. Interactive transitions are **150ms**, `cubic-bezier(.2, 0, 0, 1)`, with explicit properties. Press scale is .96 when motion is allowed. Reduced motion starts the particle field paused and disables those transitions. A visible Resume control allows an intentional opt-in. Forced-colors styles preserve outlines and control boundaries; that variant has not been rendered manually.

## Do’s and Don’ts

- Start another surface with `.page-width`, the existing spacing tokens, and the six type roles. Keep controls near the canvas they change.
- Use the filled accent for the primary playback action or an explicit selected state. Use neutral secondary actions for export and arrangement.
- Keep live, stale, and ambient distinctions in text. Use confirmed anchor progress, never projected values labeled as confirmed.
- Keep interface text on opaque backgrounds. Particle gradients and halos belong inside the artwork.
- Preserve native inputs, explicit labels, two-pixel focus outlines, focus containment, and motion preferences.
- Keep any additional page on relative links or hash navigation. Reuse local fonts and icons; rebuild `dist/` after source changes.

Design/review methodology and retained licenses are recorded in `NOTICE.md`. Validation coverage and remaining limitations belong in `artifacts/validation.md`, rather than being implied by this design description.
