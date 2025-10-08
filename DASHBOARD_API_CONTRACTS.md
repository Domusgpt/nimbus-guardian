# Holographic Dashboard API Contracts

This guide documents the HTTP endpoints that power the holographic deployment dashboard. It summarizes the request methods the UI issues, the response fields the front-end reads, and the fallback behaviors that surface when the data is absent or stale. Implement server handlers so they satisfy these contracts to keep the dashboard resilient online, offline, and under degraded network conditions.

## Conventions shared by every endpoint

- **JSON over HTTPS.** All calls are `fetch` requests that expect a `2xx` status and a JSON payload. Non-OK responses surface an error toast, so normalize recoverable errors into `200` payloads when possible.【F:dashboard-holographic.html†L1194-L1235】
- **Abortable requests.** Each request runs through a cancellable helper with per-endpoint timeouts. Prefer streaming or fast-failing handlers so retries do not overlap for long durations.【F:dashboard-holographic.html†L1194-L1235】【F:dashboard-holographic.html†L2644-L2740】
- **Local cache awareness.** Responses are cached for one hour with a `{ timestamp, data }` record. When offline the UI falls back to the cache and marks the card as stale, so populate timestamp fields to let the dashboard show relative “updated” times.【F:dashboard-holographic.html†L1180-L1334】【F:dashboard-holographic.html†L2644-L2845】
- **Recognized timestamps.** Any of `timestamp`, `updatedAt`, `generatedAt`, `scannedAt`, `completedAt`, `finishedAt`, or `createdAt` (top-level or nested under `meta`) is parsed into the “Updated” metadata chips.【F:dashboard-holographic.html†L1181-L1399】

## Endpoint reference

### `GET /api/status`
Fetches the project overview card.

- **Request:** simple `GET`, no body.【F:dashboard-holographic.html†L2644-L2685】
- **Response shape:**
  - `projectName` (string) – rendered title, falls back to `package.name` if absent.【F:dashboard-holographic.html†L2094-L2112】
  - `experienceLevel` (string enum) – displayed as title case in metrics.【F:dashboard-holographic.html†L2098-L2112】
  - `package` (object or null) – expects `name`, `version`, `dependencies`, `devDependencies` counts.【F:dashboard-holographic.html†L2094-L2112】【F:dashboard-server.js†L199-L215】
  - `git` (object or null) – `branch` and `uncommitted` counts set badge color and metrics.【F:dashboard-holographic.html†L2098-L2136】【F:dashboard-server.js†L220-L233】
  - Optional timestamp fields (see conventions) to drive “Synced …” copy.【F:dashboard-holographic.html†L2114-L2143】
- **Offline expectations:** returning `null` or omitting fields shows contextual empty-state messaging, while cached payloads mark the badge as “Offline” or “Cached”.【F:dashboard-holographic.html†L2059-L2136】【F:dashboard-holographic.html†L2644-L2740】

### `POST /api/scan`
Runs the Guardian security scan and feeds both the security card and the unified issues list.

- **Request:** `POST` with no body (dashboard triggers a rescan directly), 60 s timeout.【F:dashboard-holographic.html†L2778-L2790】
- **Response shape:**
  - `issues` (array) – each entry needs `message`, optional `severity`, `file`, `details` (string or string[]), plus optional `autoFixable` and `id` for the Auto-fix buttons.【F:dashboard-holographic.html†L1906-L2008】
  - `warnings` (array) – same schema as `issues` but rendered in the “Warnings” severity bucket.【F:dashboard-holographic.html†L1991-L2008】
  - Optional aggregates (counts, summary) are ignored; only severity counts drive badges and progress bars.【F:dashboard-holographic.html†L2199-L2243】
  - Timestamp fields improve recency labels on both the security card and issues card.【F:dashboard-holographic.html†L2213-L2243】【F:dashboard-holographic.html†L3197-L3200】
- **Offline expectations:** when unreachable the UI replays cached data; without cache it displays “Offline — scan unavailable.”【F:dashboard-holographic.html†L2151-L2243】【F:dashboard-holographic.html†L2742-L2845】

### `GET /api/tools`
Surfaces detected and missing tooling plus recommendations.

- **Request:** `GET`, cached for two minutes, default timeout 20 s.【F:dashboard-holographic.html†L2848-L2890】
- **Response shape:**
  - `detected` (array) – each item may provide `name`, `provider`, `command`, `version`, `package`, or `cliRequired.command`; the UI picks the first truthy value for the metric value.【F:dashboard-holographic.html†L2285-L2314】
  - `missing` (array) – expects descriptive fields (`name`, `category`, `reason`) plus optional `install`, `installCommand`, `command`, or `cliRequired` metadata to drive Install/Docs buttons and detail text.【F:dashboard-holographic.html†L2316-L2384】
  - `recommendations` (array) – each entry should include `reason`, `category`, `suggestion`, and optional `options[]` names for supporting hints.【F:dashboard-holographic.html†L2388-L2414】
  - Timestamp fields let the “Tools updated” chip reflect freshness.【F:dashboard-holographic.html†L2430-L2445】
- **Offline expectations:** omit arrays or return empty arrays to trigger friendly empty-state guidance; cached payloads show “Offline — showing cached tool inventory.”【F:dashboard-holographic.html†L2245-L2438】【F:dashboard-holographic.html†L2848-L2944】

### `GET /api/deployments`
Lists deployment providers, Firebase projects, and recent deploys.

- **Request:** `GET` with a 45 s timeout.【F:dashboard-holographic.html†L2946-L2987】
- **Response shape:** array of provider objects where each object contains:
  - `platform` (string) – rendered as the section title via `titleCase` (“Firebase Deployments”, etc.).【F:dashboard-holographic.html†L1733-L1759】
  - Either `projects` (array of Firebase-style projects) including `displayName`, `projectId`, `projectNumber`, and optional `resources.defaultHostingSite`, or `deployments` (array) with `name`/`project`/`target`, `state`/`readyState`, `createdAt`/`ready`/`updatedAt`, and optional `url` or `inspectUrl` links.【F:dashboard-holographic.html†L1767-L1792】【F:dashboard-server.js†L269-L303】
  - Timestamp data on each entry lets the dashboard surface relative “x minutes ago” chips and overall recency metadata.【F:dashboard-holographic.html†L1733-L1803】【F:dashboard-holographic.html†L2455-L2515】
- **Offline expectations:** empty arrays render “No deployment providers detected yet” or offline notices; cached responses show stale warnings.【F:dashboard-holographic.html†L2448-L2515】【F:dashboard-holographic.html†L2946-L3040】

### `GET /api/github`
Shows repository metadata for the linked GitHub project.

- **Request:** `GET`, 30 s timeout.【F:dashboard-holographic.html†L3043-L3082】
- **Response shape:**
  - `name`/`repo`, `owner`/`organization` – combined into `owner/name` in the Overview section.【F:dashboard-holographic.html†L2564-L2582】
  - `description` (string) – optional, displayed below the heading.【F:dashboard-holographic.html†L2584-L2589】
  - `stargazerCount` (number) and `isPrivate` (boolean) – used for metric rows and the badge variant.【F:dashboard-holographic.html†L2591-L2629】【F:dashboard-server.js†L306-L337】
  - `url` (string) – opens in a new tab via “Open on GitHub”.【F:dashboard-holographic.html†L2600-L2607】
  - Optional `error` (string) – when present the card shows the message and marks the badge as “Unavailable/Offline/Pending”.【F:dashboard-holographic.html†L2518-L2561】
- **Offline expectations:** cached responses indicate offline or stale state; missing data shows actionable hints to reconnect.【F:dashboard-holographic.html†L2518-L2639】【F:dashboard-holographic.html†L3043-L3137】

### `GET /api/git-status`
Feeds the repository status timeline and augments the issues list.

- **Request:** `GET`, no body, default timeout.【F:dashboard-holographic.html†L3141-L3200】
- **Response shape:**
  - `branch` (string) – displayed as “On branch …”.【F:dashboard-holographic.html†L2011-L2032】【F:dashboard-server.js†L240-L264】
  - `status` (array) – each item requires `status` (two-letter git code) and `file`; severity badges derive from the status string.【F:dashboard-holographic.html†L1954-L1969】【F:dashboard-server.js†L247-L253】
  - `commits` (array) – objects with `hash` and `message` populate the “Recent commits” item.【F:dashboard-holographic.html†L2021-L2032】【F:dashboard-server.js†L255-L261】
  - Optional `error` string signals repo detection issues (displayed as an info item).【F:dashboard-holographic.html†L2011-L2018】
- **Offline expectations:** cached data (with optional `timestamp`) populates the list and prepends an “Offline mode” notice; without cache users see “Reconnect to sync repository status.”【F:dashboard-holographic.html†L3141-L3252】

### `POST /api/chat`
Connects the floating assistant to Claude or Gemini via the AI bridge.

- **Request:** `POST` with JSON body `{ "message": string }`. The mini chat widget immediately echoes the user message and waits for the response.【F:dashboard-server.js†L985-L1023】
- **Response shape:** the AI bridge returns `{ provider, response, model }`, where `provider` is "claude" or "gemini", `response` is the formatted text, and `model` names the underlying engine.【F:dashboard-server.js†L130-L142】【F:ai-assistant.js†L111-L212】
- **Error handling:** network or API failures should surface a descriptive `Error` message so the widget can print “Sorry, I encountered an error: …”.【F:dashboard-server.js†L1018-L1023】【F:ai-assistant.js†L178-L221】

## Related helper endpoints

The dashboard also calls `POST /api/fix` to trigger auto-remediation and `POST /api/install-tool` when users accept suggested install commands. Those responses should include `{ success, message }` so the UI can toast success and optionally refresh underlying cards.【F:dashboard-holographic.html†L3390-L3446】【F:dashboard-server.js†L119-L177】

By aligning server responses with these expectations you ensure the holographic dashboard renders coherent status, gracefully handles offline scenarios, and keeps the assistant conversational without manual tweaks.
