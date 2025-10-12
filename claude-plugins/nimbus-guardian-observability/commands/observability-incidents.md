---
description: Retrieve and filter observability sink incidents detected by Nimbus Guardian.
---

# Nimbus Observability Incidents

Use this command to review degraded or failing sink incidents that the observability exporter has detected. You can filter by
status, sink name, open/closed state, and result count to focus on the most relevant events.

## Steps
1. Verify the dashboard API is available and that incident detection has been enabled (requires history tracking).
2. Gather filter options from the requester:
   - Alternate incidents URL if the API is not at `http://localhost:3333/api/observability/incidents`.
   - Authentication cookie or additional headers, when required.
   - Target sink names, statuses (`healthy`, `degraded`, `failing`), open vs. closed incidents, and/or a maximum number of
     results.
   - Whether the caller prefers formatted summaries or raw JSON output.
3. Run the CLI:
   ```bash
   node cli.js observability-incidents \
     --url <incidents-url> \
     --cookie <cookie-or-header> \
     --header KEY:VALUE \
     --status failing \
     --sink observability-log \
     --open \
     --closed \
     --limit <count> \
     --json
   ```
   Remove any options that do not apply. Flags omitted above fall back to sensible defaults: local API URL, all incidents, no
   status/sink filtering, formatted output.
4. Share the formatted incident summary (or JSON) with the requester. Highlight open incidents or recent regressions that may
   need attention.

## Tips
- Combine this command with `/observability-status` to provide current sink health alongside the incident ledger.
- When troubleshooting, start with no filters to understand the overall incident load before narrowing the query.
