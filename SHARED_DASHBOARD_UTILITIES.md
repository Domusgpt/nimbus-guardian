# Shared Dashboard Utilities Overview

The holographic refactor promoted several reusable helpers into importable modules so other dashboards and admin views can
adopt the same UX behaviors without copying inline scripts. This guide summarizes the utilities that now live outside of the
main orchestrator, the problems they solve, and tips for consuming them in future front-ends.

## Directory Map

| Path | Purpose |
| --- | --- |
| `public/js/shared/time.js` | Parsing timestamp fields, formatting relative time strings, and extracting canonical update markers from API payloads. |
| `public/js/shared/notifications.js` | Toast stack management with stacking/timeout defaults shared across dashboards. |
| `public/js/shared/clipboard.js` | Robust `copyText` helper that wraps the async Clipboard API and `execCommand` fallbacks for legacy browsers. |
| `public/js/holographic/ui.js` | Holographic-specific DOM helpers: loading overlays, badge setters, timeline metric rendering, and meta label updaters. |
| `public/js/holographic/cards/card-utils.js` | Card-focused helpers for formatting tool labels, resolving install/docs metadata, and producing timeline entries. |
| `public/js/holographic/cards/security-utils.js` | Severity heuristics, progress indicators, and list item builders powering the security and git insight cards. |

## Importing the Utilities

All modules are written as standard ES modules and can be imported directly from other dashboards. Example usage inside a
custom tools card module:

```js
import {
  titleCase,
  resolveInstallCommand,
  resolveDocsLink
} from '../public/js/holographic/cards/card-utils.js';

import { copyText } from '../public/js/shared/clipboard.js';
```

The helpers are intentionally dependency-light; any required collaborators (such as `parseDateLike`) can be injected through
options if your host application already owns a parser.

## Testing Expectations

Vitest coverage lives under `tests/*.test.js` and exercises both shared and holographic-specific utilities. When extending
these helpers:

1. Add targeted unit tests alongside existing suites so downstream dashboards inherit proven behaviors.
2. Prefer dependency injection over global state to keep the helpers testable in isolation.
3. Update `HOLOGRAPHIC_REFACTOR_PROCESS.md` with a session summary so the refactor log reflects new shared surfaces.

## Integration Tips

- **Timeline Rendering:** Use `appendTimelineItem` and `formatRelativeTimeValue` to keep timestamp messaging and link affordances
  consistent across cards. These helpers gracefully no-op when required DOM elements or metadata are missing.
- **Security Insights:** The `security-utils` exports encapsulate the color/icon heuristics that the holographic dashboard uses.
  Import them rather than hard-coding severity mappings to keep the UX consistent when thresholds evolve.
- **Tooling Actions:** Pair `resolveInstallCommand` with the shared `copyText` helper so operators always have a working fallback,
  even when assistant automation is offline.

Following these patterns ensures any new dashboard stays aligned with the holographic experience while remaining easy to test
and extend.
