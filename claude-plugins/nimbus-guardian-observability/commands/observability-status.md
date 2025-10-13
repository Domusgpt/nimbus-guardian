---
description: Fetch a one-shot observability snapshot (and optional history) from the Nimbus Guardian dashboard API.
---

# Nimbus Observability Status

Use this command to inspect the most recent observability snapshot that the dashboard API exposes. It can also return a limited
history window in the same call so you can confirm recent trends without switching tools.

## Steps
1. Confirm the dashboard is running locally or that you have network access to the remote deployment you want to query.
2. Collect any optional inputs:
   - **URL** override if the dashboard is not running on `http://localhost:3333`.
   - `guardian_session` cookie (or a full `Cookie` header) when authentication is required.
   - Extra headers that should accompany the request (format: `KEY:VALUE`).
   - History length if you need recent snapshots.
   - Whether the caller prefers the formatted TUI output or raw JSON.
3. Run the CLI:
   ```bash
   node cli.js observability-status \
     --url <status-url> \
     --cookie <cookie-or-header> \
     --header KEY:VALUE \
     --history <count> \
     --timeout <seconds> \
     --json
   ```
   Omit any options that are not needed for the request. The command defaults to the local dashboard URL, no cookie, no extra
   headers, zero history entries, a 5 second timeout, and formatted console output.
4. Share the snapshot (and any retrieved history/overview data) with the requester. When JSON output is used, return the raw
   payload.

## Tips
- Combine this command with `/observability-history` when you need a deeper dive into longer history windows.
- If you see repeated timeout warnings, confirm the dashboard is listening on the expected port and increase the timeout if
  necessary.
