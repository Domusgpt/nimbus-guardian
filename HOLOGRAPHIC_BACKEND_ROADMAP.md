# Holographic Dashboard Non-UI Roadmap

This roadmap summarizes the workstreams that sit behind the holographic dashboard experience and how they will evolve alongside the ongoing frontend refactor. It captures what already exists in the repository, the interfaces that power the UI, and the milestones scheduled for the next implementation passes.

## Current Server & Engine Capabilities
- **Dashboard API server (`dashboard-server.js`)** — Already exposes status, scan, tools, auto-fix, chat, git-status, and deployments endpoints that the dashboard consumes today. The service bootstraps Guardian Engine, Tool Detector, and AI Assistant instances per request and ships CORS-friendly JSON responses for the UI.【F:dashboard-server.js†L1-L124】
- **Guardian analysis engine (`guardian-engine.js`)** — Provides the rule orchestration, scan summaries, and auto-fix hooks invoked by the dashboard server. It remains the authoritative source for risk scoring and remediation payloads that surface in the UI cards.【F:guardian-engine.js†L1-L160】
- **AI assistant bridge (`ai-assistant.js`)** — Coordinates Claude and Gemini API calls for the `/api/chat` and future inline explanations, wiring responses back into the assistant loader that was introduced during the frontend refactor.【F:ai-assistant.js†L1-L120】
- **Shared CLI & automation scripts** — Utilities such as `guardian-engine.js`, `cli.js`, and `tool-detector.js` are also consumed by the command-line workflows, ensuring parity between dashboard actions and scripted pipelines.【F:cli.js†L1-L160】【F:tool-detector.js†L1-L120】

## Near-Term Non-UI Focus (Sessions 12–14)
1. **Session 12 — API contract validation & mocks**
   - Build reusable fixture generators for `/api/status`, `/api/scan`, and `/api/deployments` so Vitest suites can validate serialization independent of the live engine.
   - Add snapshot coverage that compares the mock payloads against the documented contracts to catch schema drift early.
   - Deliverable: `tests/api-contracts.test.js` exercising the server handlers with in-memory responses.
2. **Session 13 — Backend performance instrumentation**
   - Add timing and cache metrics to the dashboard server so we can observe slow scans or degraded git operations without relying on UI heuristics.
   - Expose the metrics through a lightweight `/api/metrics` endpoint and log roll-ups for local development.
   - Deliverable: instrumentation utilities plus documentation updates describing how to enable metrics in development builds.
3. **Session 14 — Assistant service hardening**
   - Implement request budgeting, retry logic, and structured error shapes for the AI assistant bridge to keep the dashboard resilient when upstream models throttle or fail.
   - Extend the assistant Vitest coverage to assert retry caps and error propagation into the frontend toast helpers.
   - Deliverable: hardened assistant service and updated tests covering the non-UI logic.

## Longer-Term Backlog
- **Deployment provider integrations** — Layer in adapters for Firebase Hosting, Cloud Run, and GitHub Actions logs so the dashboard deployments card can surface provider-specific metadata beyond the current stub responses.
- **Multi-project workspaces** — Introduce a project registry within `.guardian/` that lets operators switch between repositories without restarting the server, aligning dashboard UX with the CLI multi-target roadmap.
- **Security event streaming** — Expose WebSocket or SSE channels for high-severity findings so the dashboard can update in real time without waiting for the scheduled refresh cycle.

## Tracking & Communication
- Progress on the milestones above will continue to be recorded in `HOLOGRAPHIC_REFACTOR_PROCESS.md` with explicit session entries so stakeholders can see when we pivot from frontend to backend work.
- Any shared libraries that emerge from these server-side passes will be cataloged alongside the existing UI modules inside `SHARED_DASHBOARD_UTILITIES.md` to keep cross-dashboard consumers in sync.
