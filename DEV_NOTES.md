# Development Notes

Centralized session-by-session log of Nimbus Guardian workstreams and forward-looking plans.

## Session Log

### Session 00 – Initial Assessment
- **Completed**
  - Identified critical arbitrary command execution via the dashboard `install-tool` endpoint.
  - Flagged inconsistent persistence of the user experience level between setup and runtime consumers.
  - Noted the AI scan pipeline ignored `.env` API keys saved by the setup wizard.
  - Highlighted documentation mismatches referencing the legacy `guardian` CLI name.
- **Tests**: _Not run (analysis only)._ 

### Session 01 – Baseline dashboard hardening
- **Completed**
  - Normalized configuration loading, enforced CSRF/origin validation, and restricted `/api/install-tool` to allow-listed commands.
  - Updated dashboard clients to send safe installer identifiers and surfaced manual installation guidance.
  - Persisted `experienceLevel` consistently while reusing `.env` AI credentials throughout setup, CLI, and engine flows.
- **Tests**: `node cli.js --help`

### Session 02 – API error handling & client sanitization
- **Completed**
  - Added an `HttpError` helper with strict JSON parsing, CSRF-aware body validation, and hardened headers.
  - Escaped server-provided data, rebuilt markup with safe strings, and guarded chat rendering paths on the dashboard.
- **Tests**: `node cli.js --help`, `node -e "require('./dashboard-server')"`

### Session 03 – Shared configuration service rollout
- **Completed**
  - Introduced `lib/config-service.js` to normalize experience levels, strip secrets, and hydrate API keys.
  - Rewired CLI and dashboard server to consume the centralized loader for consistent configuration state.
  - Routed setup wizard and Guardian engine through the shared helpers to keep saved configs clean.
- **Tests**: `node cli.js --help`, `node -e "require('./dashboard-server')"`

### Session 04 – Config resilience & tests
- **Completed**
  - Hardened the config service to migrate legacy fields, strip secrets, and surface recovery warnings.
  - Added automatic backups before rewriting normalized configuration data.
  - Created a `node:test` suite for the config service and wired `npm test` to execute it.
- **Tests**: `npm test`

### Session 05 – Dashboard data sourcing & secret hygiene
- **Completed**
  - Expanded `.gitignore` coverage and added a published `.env.example` for safe credential scaffolding.
  - Replaced embedded Firebase credentials in the holographic dashboard with API-driven data loading.
  - Updated the Firebase admin utility to hydrate from `.env` values and require explicit API keys.
  - Tuned Docker validator secret heuristics and regenerated the hardened test report.
- **Tests**: `npm test`

### Session 06 – Config warnings surfaced in UX
- **Completed**
  - Emitted migration warnings once per CLI session to highlight recovered configuration issues.
  - Propagated configuration warning metadata through the dashboard server responses.
  - Displayed warning banners in standard and holographic dashboards backed by live API data.
- **Tests**: `npm test`

### Session 07 – CSP-safe dashboard clients
- **Completed**
  - Added per-request CSP nonces for dashboard HTML responses.
  - Refactored built-in dashboard interactions to rely on data attributes and script listeners instead of inline handlers.
  - Updated the holographic dashboard template to accept CSRF/CSP context and bind controls programmatically.
- **Tests**: `npm test`

### Session 08 – Session-aware CSRF protection
- **Completed**
  - Issued HttpOnly session cookies, validated CSRF tokens on every API route, and rotated credentials for HTML shells.
  - Built a reusable `SessionManager` with deterministic token handling and expiration coverage.
  - Updated dashboard clients to send credentialed fetches, refresh CSRF tokens, and guide users through session lapses.
- **Tests**: `npm test`

### Session 09 – Fresh config per request & messaging alignment
- **Completed**
  - Ensured API handlers reload configuration for each request while maintaining CSRF validation.
  - Refreshed dashboard clients to include session credentials and token refreshes on every fetch.
  - Replaced lingering `guardian` CLI references with `nimbus` across guidance strings and dashboard templates.
- **Tests**: `npm test`

### Session 10 – CSP tightening across dashboards
- **Completed**
  - Required nonce-protected styles in the dashboard CSP and introduced utility classes for inline-free styling.
  - Migrated dashboard rendering to reuse the new classes for issue states and chat toggles.
  - Removed inline attributes from holographic dashboards by generating nonce-scoped style tags.
- **Tests**: `npm test`

### Session 11 – Shared status styling
- **Completed**
  - Added reusable status color classes for dashboard metrics to comply with strict CSP rules.
  - Updated holographic dashboards to leverage shared metric classes and scripted fix handlers.
  - Refined the simple dashboard and marketing pages to eliminate remaining inline styling.
  - Regenerated the automated report to capture the hardened dashboards.
- **Tests**: `npm test`

### Session 12 – Rate limiter introduction
- **Completed**
  - Built an in-memory rate limiter with deterministic unit coverage to back dashboard throttling.
  - Wired dashboard server POST routes to emit Retry-After guidance when throttled.
  - Taught dashboards to surface user-facing rate limit messaging using response headers.
- **Tests**: `npm test`

### Session 13 – Fingerprint-aware throttling
- **Completed**
  - Bound dashboard sessions to hashed client fingerprints for cookie reuse checks.
  - Tied rate-limit buckets to fingerprints to avoid easy session rotation bypasses.
  - Extended the session manager with sanitized metadata helpers and destruction methods.
- **Tests**: `npm test`

### Session 14 – Configurable origin allow-list & dev log (current)
- **Date**: 2025-10-07 (UTC)
- **Completed**
  - Documented every session in this living development log and codified a structure for future updates.
  - Added `GUARDIAN_DASHBOARD_ALLOWED_ORIGINS` support so trusted external origins can access the dashboard APIs.
  - Updated the README and `.env.example` with guidance for configuring extra origins securely.
- **Tests**: `npm test`

### Session 15 – Dashboard security integration tests
- **Date**: 2025-10-07 (UTC)
- **Completed**
  - Added automated coverage that provisions a browser session and exercises dashboard CSRF, session, and rate limit enforcement paths.
  - Stubbed expensive engine helpers in the test harness to keep the suite deterministic while validating safe installer responses.
- **Tests**: `npm test`

### Session 16 – Expanded dashboard integration coverage
- **Date**: 2025-10-08 (UTC)
- **Completed**
  - Introduced dependency factory hooks in the dashboard server so tests can substitute safe Guardian engine and AI assistant stubs.
  - Broadened the security integration suite to cover scan and chat endpoints, confirming CSRF, session, and throttling behavior.
  - Refined the test harness utilities to reuse session bootstrapping logic across scenarios for clearer future extensions.
- **Tests**: `npm test`

### Session 17 – Tool insights & auto-fix coverage
- **Date**: 2025-10-08 (UTC)
- **Completed**
  - Added a tool detector factory to the dashboard server so tests can inject deterministic findings.
  - Expanded the security integration suite to validate sanitized tool installer metadata and the auto-fix workflow, including CSRF and rate-limit handling.
  - Preserved the hardened request flow by exercising validation errors and confirming retry guidance on throttled fix attempts.
- **Tests**: `npm test`

### Session 18 – Observability telemetry
- **Date**: 2025-10-09 (UTC)
- **Completed**
  - Introduced a dashboard observability service to capture session lifecycle activity and rate-limit outcomes without exposing raw identifiers.
  - Wired the session manager and rate limiter through the observability hooks and surfaced the aggregated metrics across every dashboard experience.
  - Added an `/api/observability` endpoint and companion unit/integration coverage to verify anonymized snapshots and throttling counters.
- **Tests**: `npm test`

### Session 19 – Persistent fingerprint telemetry
- **Date**: 2025-10-09 (UTC)
- **Completed**
  - Added a salted, disk-backed fingerprint store to persist hashed client fingerprints across dashboard restarts while respecting TTL and entry caps.
  - Surfaced fingerprint retention metrics in API status payloads and every dashboard client so operators can monitor persistent identities.
  - Expanded automated coverage with dedicated fingerprint store tests and refreshed integration harness stubs to validate the new telemetry.
- **Tests**: `npm test`

### Session 20 – Streaming fingerprint exporter
- **Date**: 2025-10-10 (UTC)
- **Completed**
  - Built an `ObservabilityExporter` SSE helper to stream anonymized fingerprint summaries to remote subscribers without leaking identifiers.
  - Added a `/api/observability/stream` endpoint and README guidance so operators can tail live fingerprint metrics with curl or log forwarders.
  - Extended the dashboard integration suite to validate the streaming feed alongside new unit coverage for the exporter utility.
- **Tests**: `npm test`

### Session 21 – CLI observability subscriber
- **Date**: 2025-10-10 (UTC)
- **Completed**
  - Added a reusable observability stream client that parses SSE payloads and handles graceful shutdowns for dashboards without browsers.
  - Introduced a `nimbus observability-stream` command with JSON, timeout, and single-shot flags so operators can monitor telemetry from terminals or pipelines.
  - Documented the CLI workflow in the README for smoother onboarding to the streaming exporter.
- **Tests**: `npm test`

### Session 22 – Disk-backed observability sink
- **Date**: 2025-10-10 (UTC)
- **Completed**
  - Extended the observability exporter with reusable sink hooks so telemetry can be forwarded beyond SSE clients.
  - Added a rotating log sink that persists fingerprint snapshots to disk when `GUARDIAN_OBSERVABILITY_LOG_PATH` is set.
  - Documented the new workflow and expanded unit and integration coverage for sink behavior and dashboard plumbing.
- **Tests**: `npm test`

## Upcoming Focus
- Continue migrating marketing and documentation assets to reference the living development log for onboarding new contributors.
- Explore lightweight mocks for git and deployment data so integration tests can assert dashboard presentation without shelling out to real services.
- Assess lightweight exporters so observability snapshots can be pushed to operator-controlled sinks or logs for remote dashboards.
- Evaluate lightweight CLI tooling that can authenticate and subscribe to the SSE observability feed without manual cookie handling.

## Session Update Template
Use the template below when adding the next session entry:

```
### Session XX – Title
- **Date**: YYYY-MM-DD (UTC)
- **Completed**
  - Key accomplishment 1
  - Key accomplishment 2
- **Tests**: command(s) executed
```
