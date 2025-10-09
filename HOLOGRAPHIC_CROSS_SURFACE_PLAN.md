# Holographic Dashboard Cross-Surface Development Plan

The holographic refactor has focused on modularizing the browser experience, but the product surface area also spans the local
 dashboard server, the Guardian CLI/engine, and Firebase-hosted automation. This plan maps how those workstreams intersect so s
takeholders know where non-UI work is progressing and when each integration milestone will land.

## Where Non-UI Development Lives Today
- **Dashboard API server (`dashboard-server.js`)**: serves the holographic shell and exposes `/api/status`, `/api/scan`, `/api/
  tools`, `/api/fix`, `/api/chat`, `/api/git-status`, `/api/deployments`, `/api/github`, and `/api/install-tool` endpoints. The 
  server already shells out to `GuardianEngine`, `ToolDetector`, and `AIAssistant`, so frontend wiring can lean on live data inst
ead of stubs.
- **Guardian engine & CLI (`guardian-engine.js`, `cli.js`)**: owns the deep project analysis, auto-fix routines, and command line
  ergonomics. Enhancements here propagate to `/api/scan` responses and the assistant’s remediation surface without touching the b
  rowser.
- **Automation & hosting (`functions/`, `firebase.json`)**: Firebase functions and hosting config underpin remote scan triggers, 
  webhook ingestion, and deployment telemetry. These surfaces give us the hooks we need for bundle reporting, deployment history,
  and chat persistence once the dashboard consumes real APIs.

## Near-Term Milestones Outside the UI
1. **Session 12 (Completed) – Integration Readiness Audit**
   - Validate each server endpoint against `DASHBOARD_API_CONTRACTS.md` to confirm response parity.
   - Document any gaps (missing fields, inconsistent casing, auth requirements) directly in this plan.
2. **Session 13 – Frontend ↔ Server Wiring (Deferred)**
   - ✅ Landed Vitest fixtures for Guardian engine scan responses and asserted `/api/scan` preserves issue, warning, fix, and insight metadata with `generatedAt` stamps.
   - ⏸️ Deferred the networking swap until after the Firebase automation landed so the dashboard can point at production-grade endpoints.
3. **Session 14 – Firebase Fulfillment & Backend Automation (Completed)**
   - ✅ Extracted a reusable license service that provisions Firestore documents, records admin analytics, and standardizes machine limits/expiry windows for CLI and Stripe flows.
   - ✅ Implemented Stripe webhook fulfillment, welcome/onboarding triggers, and an email queue writer so Cloud Functions can activate licenses without manual intervention.
   - ✅ Added Vitest coverage for the Firebase helpers and triggers to lock in the queue writes, analytics events, and usage bootstrap logic.
4. **Session 15 – CLI & Assistant Feedback Loop**
   - Surface Guardian engine remediation summaries inside the assistant module so `/api/fix` actions expose the same messaging as `cli.js`.
   - Align copy/Toast messaging with CLI exit codes to keep parity across interfaces.
5. **Session 16 – Deployment & Telemetry Hooks**
   - Integrate Firebase function endpoints for deployment history and GitHub insights, wiring progressive loading for long-run requests.
   - Capture bundle analyzer outputs as CI artifacts and publish size deltas to the dashboard timeline.

## Session 12 Audit Findings
- ✅ `/api/status` returns `generatedAt` metadata alongside project/git/package fields so the dashboard cache can compute relative timestamps without guessing.
- ✅ `/api/tools`, `/api/scan`, `/api/fix`, `/api/chat`, and `/api/install-tool` now stamp `generatedAt` on their payloads, giving the networking layer consistent cache metadata for assistant flows and remediation actions.
- ✅ `/api/git-status`, `/api/deployments`, and `/api/github` include `generatedAt` fields (and normalized owner/repo data) so the timeline, deployments card, and GitHub insights render fresh/offline states correctly.
- ✅ Follow-up complete: Guardian engine fixtures now assert security issue schemas so `/api/scan` payloads stay aligned while we wire the frontend to live responses after the Firebase automation pass.
- ✅ New this week: Firebase license fulfillment now queues transactional email, records admin analytics, and primes usage docs for newly activated customers so backend infrastructure is production ready before the dashboard consumes it.

## Tracking & Reporting
- The process log (`HOLOGRAPHIC_REFACTOR_PROCESS.md`) now points to this plan for the cross-surface roadmap and will be updated a
  fter each session with status notes.
- Each milestone above will produce dedicated checklist issues so backend and CLI owners can collaborate without blocking UI chang
eover.
- Bundle analyzer reports (`reports/holographic/`) continue capturing weight changes; future sessions will add server/CLI metrics
  beside them for a holistic release view.

## Risks & Mitigations
- **API drift**: lock API schemas via shared fixtures in the Vitest suite to detect breaking backend changes early.
- **Environment divergence**: document `.env` expectations and local Firebase emulator commands alongside this plan so engineers c
  an reproduce backend behavior while iterating on UI modules.
- **Resource contention**: schedule CLI and Firebase enhancements in alternating sessions to prevent stalled reviews and keep eac
  h surface moving forward weekly.

