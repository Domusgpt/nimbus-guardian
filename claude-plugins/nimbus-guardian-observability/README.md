# Nimbus Guardian Observability Claude Plugin

This plugin exposes Claude Code commands that wrap the Nimbus Guardian observability CLI tooling. Install it when you need to
inspect live fingerprint telemetry, fetch history snapshots, or summarize sink incidents without leaving Claude Code.

## Commands

| Command | Purpose |
| --- | --- |
| `/observability-digest` | Capture snapshot, history overview, and incident summaries in a single CLI run. |
| `/observability-status` | Fetch the latest observability snapshot (optionally including history) from the dashboard API. |
| `/observability-history` | Retrieve recent snapshots plus overview analytics for deeper trend analysis. |
| `/observability-stream` | Subscribe to the SSE stream and monitor live fingerprint and sink telemetry. |
| `/observability-incidents` | Summarize degraded or failing sink incidents with filter controls. |

Each command runs the underlying `node cli.js` entry point with the appropriate subcommand and guides you through optional flags
like cookies, headers, and output format. Start with `/observability-digest` when you want a comprehensive briefing, then pivot
to the more focused commands for deeper dives or continuous monitoring.

## Installation

From within Claude Code, run:

```shell
/plugin marketplace add ./claude-plugins
/plugin install nimbus-guardian-observability@claude-plugins
```

Alternatively, install directly from the plugin path:

```shell
/plugin install ./claude-plugins/nimbus-guardian-observability
```

## Requirements

- Node.js dependencies must be installed (`npm install`).
- The Nimbus Guardian dashboard server should be running when querying live APIs.
- Authenticated deployments may require a `guardian_session` cookie or additional headers.
