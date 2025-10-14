---
description: Retrieve recent observability history with overview analytics from Nimbus Guardian.
---

# Nimbus Observability History

Use this command to collect recent observability snapshots plus the aggregated history overview analytics that Nimbus Guardian
exposes. It is ideal for diagnosing sink regressions or summarizing recent fingerprint activity.

## Steps
1. Confirm the dashboard API is reachable and that history tracking is enabled (configure `GUARDIAN_OBSERVABILITY_HISTORY_LIMIT`
   if a custom window is required).
2. Determine the number of history entries to fetch and whether the requester wants the overview analytics.
3. Ask if authenticated access or custom headers are needed, and whether they want formatted console output or JSON for
   automation.
4. Run the CLI using the status command with history enabled:
   ```bash
   node cli.js observability-status \
     --url http://localhost:3333/api/observability \
     --history <count> \
     --cookie <cookie-or-header> \
     --header KEY:VALUE \
     --timeout <seconds> \
     --json
   ```
   Adjust the URL or omit flags that are not required. When `--json` is omitted the CLI prints formatted history summaries along
   with the latest snapshot. Including `--json` returns a structured object containing `snapshot`, `history`, and `overview` keys.
5. Share the resulting data, calling out notable trends such as sink incidents, health regressions, or fingerprint spikes.

## Tips
- For deeper trend analysis, export the JSON payload and plot the metrics externally.
- Combine this command with `/observability-incidents` when you need a filtered view of notable sink outages detected within the
  same window.
