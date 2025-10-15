---
description: Subscribe to the Nimbus Guardian observability SSE feed and display live fingerprint + sink telemetry.
---

# Nimbus Observability Stream

Use this command to watch live observability updates from the dashboard SSE endpoint. It is helpful when validating sink
configuration changes or confirming that downstream exporters receive fresh telemetry.

## Steps
1. Ensure the dashboard server is running with observability streaming enabled and that the target endpoint is reachable.
2. Gather optional settings from the requester:
   - Alternate stream URL if the dashboard is not at `http://localhost:3333/api/observability/stream`.
   - Required `guardian_session` cookie or a complete `Cookie` header for authenticated deployments.
   - Extra headers that should be sent with the stream request.
   - Whether to print formatted summaries or raw JSON payloads.
   - Should the stream exit after the first payload (single-shot) or continue indefinitely?
   - Timeout duration or quiet mode preference.
3. Run the CLI with the collected options:
   ```bash
   node cli.js observability-stream \
     --url <stream-url> \
     --cookie <cookie-or-header> \
     --header KEY:VALUE \
     --once \
     --timeout <seconds> \
     --json \
     --quiet
   ```
   Remove any flags that do not apply. By default the command connects to the local dashboard, prints formatted summaries, keeps
   streaming until interrupted, and displays connection heartbeats.
4. Relay the stream output back to the requester. If the command stays open, monitor for additional instructions (e.g., when to
   stop streaming or what metrics to highlight).

## Tips
- Use `Ctrl+C` to stop the stream once enough telemetry has been captured.
- Pair this with `/observability-status` to provide a summary snapshot before or after the live session.
