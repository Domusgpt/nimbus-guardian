---
description: Capture a one-stop Nimbus Guardian observability digest that includes the latest snapshot, history, and incident summary.
---

# Nimbus Observability Digest

Run this command when you need the full observability picture without juggling multiple helpers. It collects the most recent
snapshot, an optional history window with overview analytics, and the filtered incident ledger in a single CLI invocation.

## Steps
1. Ensure the dashboard API is reachable (local default: `http://localhost:3333`).
2. Gather optional inputs from the requester:
   - Alternate status/history/incidents URLs when targeting remote deployments.
   - Authentication cookies or custom headers for protected environments.
   - History depth (set `--history 0` to skip) and incident result limit (default: 5, `0` for summary-only).
   - Incident filters such as sink names, statuses, and whether to focus on open/closed records.
   - Output preference (`--json` for machine-readable payloads).
3. Run the CLI:
   ```bash
   node cli.js observability-digest \
     --url <status-url> \
     --history <count> \
     --incidents-limit <count> \
     --cookie <cookie-or-header> \
     --header KEY:VALUE \
     --status failing degraded \
     --sink webhook \
     --open \
     --closed \
     --json
   ```
   Omit any flags that are not required. Defaults assume the local dashboard, five history entries, five incident records, no
   additional headers, and formatted terminal output.
4. Share the combined digest with the requester. Include both the rendered summary and the incident breakdown, or attach the
   JSON payload when automated processing is needed.

## Tips
- Pair this command with `/observability-stream` when you need continuous updates after delivering the baseline digest.
- If the history overview is not needed, pass `--history 0` to skip extra requests while still returning snapshot and incident
  details.
