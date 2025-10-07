# Holographic Dashboard API Contracts

The holographic dashboard pulls data from the Nimbus Guardian local server. Each endpoint should return JSON payloads that satisfy the structures below so the cards, caching, and accessibility helpers can render correctly.

## `/api/status`
Returns overall project metadata used by the Status card and cached assistant context.

```jsonc
{
  "projectName": "Nimbus Guardian",
  "experienceLevel": "advanced",
  "package": {
    "name": "nimbus-guardian",
    "version": "1.1.0",
    "dependencies": 12,
    "devDependencies": 6
  },
  "git": {
    "branch": "main",
    "uncommitted": 3
  },
  "lastUpdated": "2024-07-12T16:20:00Z"
}
```

*Notes*
- `package` may include raw manifests or derived counts; both are supported because the UI sums the dependency totals before rendering.【F:dashboard-holographic.js†L3640-L3684】
- `git.uncommitted` should be a numeric count so the badge state can highlight pending work.【F:dashboard-holographic.js†L3663-L3677】
- Include an ISO timestamp (or any `Date`-parseable value) in either `lastUpdated` or at the top level so the meta badge can show freshness.【F:dashboard-holographic.js†L3654-L3662】

## `/api/scan`
Provides security scan results, including issues and warnings.

```jsonc
{
  "issues": [
    {
      "id": "leaked-env",
      "severity": "CRITICAL",
      "message": "`.env` committed with secrets",
      "file": "apps/web/.env",
      "autoFixable": false
    }
  ],
  "warnings": [
    {
      "message": "Outdated dependency: express@4"
    }
  ],
  "timestamp": "2024-07-12T16:05:00Z"
}
```

*Notes*
- `issues` and `warnings` must be arrays; they may be empty but should always be present for consistent rendering and caching.【F:dashboard-holographic.js†L3698-L3734】
- Each issue’s `severity` is converted to uppercase and tallied to compute the badge and secure score.【F:dashboard-holographic.js†L3720-L3734】【F:dashboard-holographic-helpers.js†L78-L113】
- Include a timestamp so relative freshness messaging can be derived when the card rehydrates from cache.【F:dashboard-holographic.js†L3744-L3753】

## `/api/tools`
Describes detected, missing, and recommended tooling signals.

```jsonc
{
  "detected": [
    { "name": "Node", "version": "20.19.4" }
  ],
  "missing": [
    {
      "name": "Firebase CLI",
      "reason": "Deployments require `firebase-tools`.",
      "install": "npm install -g firebase-tools",
      "docs": "https://firebase.google.com/docs/cli"
    }
  ],
  "recommendations": [
    {
      "category": "Testing",
      "suggestion": "Add automated dashboard tests"
    }
  ],
  "timestamp": 1720806000000
}
```

*Notes*
- Populate `detected`, `missing`, and `recommendations` arrays even if they are empty; the UI branches depending on their length.【F:dashboard-holographic.js†L3706-L3827】
- Tool objects accept flexible field names (`install`, `installCommand`, `command`, `docs`, `documentation`, etc.); the helpers pick the first shell command or documentation link they encounter.【F:dashboard-holographic-helpers.js†L24-L69】
- Numeric timestamps are supported and automatically converted into local times for the card metadata.【F:dashboard-holographic-helpers.js†L48-L76】【F:dashboard-holographic.js†L3725-L3734】

## `/api/deployments`
Feeds the Deployments card with provider timelines.

```jsonc
{
  "providers": [
    {
      "platform": "firebase",
      "projects": [
        {
          "projectId": "guardian-dashboard",
          "projectNumber": "1234567890",
          "resources": { "defaultHostingSite": "guardian-dashboard" }
        }
      ]
    },
    {
      "platform": "vercel",
      "deployments": [
        {
          "name": "guardian-dashboard",
          "state": "READY",
          "url": "https://guardian.vercel.app",
          "createdAt": "2024-07-12T15:50:00Z"
        }
      ]
    }
  ],
  "timestamp": "2024-07-12T15:55:00Z"
}
```

*Notes*
- Each provider entry can include either `projects` or `deployments`; the UI renders the appropriate list with timeline metadata and optional URLs.【F:dashboard-holographic.js†L3417-L3465】
- Deployment objects benefit from `state`, `url`, and a parseable date so the interface can show relative ages and open external links.【F:dashboard-holographic.js†L3445-L3457】

## `/api/github`
Supplies repository insights for the GitHub card.

```jsonc
{
  "name": "nimbus-guardian",
  "owner": "Domusgpt",
  "description": "Holographic deployment dashboard",
  "stargazerCount": 42,
  "isPrivate": false,
  "url": "https://github.com/Domusgpt/nimbus-guardian",
  "timestamp": "2024-07-12T15:45:00Z"
}
```

*Notes*
- Provide `name` and optionally `owner` so the card can render the repository slug; `stargazerCount` and `isPrivate` power badge variants.【F:dashboard-holographic.js†L3878-L3942】
- Include a `url` to surface the “Open on GitHub” link in the card footer.【F:dashboard-holographic.js†L3944-L3954】

## `/api/git-status`
Returns git working tree information used to combine with scan results in the Issues card.

```jsonc
{
  "branch": "feature/holographic-tests",
  "ahead": 2,
  "behind": 0,
  "files": [
    { "path": "dashboard-holographic.js", "status": "M" },
    { "path": "dashboard-holographic-helpers.js", "status": "A" }
  ],
  "timestamp": "2024-07-12T16:10:00Z"
}
```

*Notes*
- `files` should include a `status` code (matching `git status --porcelain`) so the UI can assign severity and icons to each entry.【F:dashboard-holographic.js†L4002-L4080】【F:dashboard-holographic-helpers.js†L115-L126】
- `ahead`/`behind` counts feed additional metrics for remote divergence messaging.【F:dashboard-holographic.js†L3970-L3988】
- Provide timestamps to keep caching metadata accurate when the page restores offline results.【F:dashboard-holographic.js†L4018-L4026】

## `/api/chat`
Handles assistant interactions.

```jsonc
{
  "id": "chatcmpl-123",
  "messages": [
    { "role": "assistant", "content": "Here is what I found…" }
  ],
  "usage": {
    "inputTokens": 320,
    "outputTokens": 512
  }
}
```

*Notes*
- Responses may stream, but each chunk must contain an array of `{ role, content }` entries so the transcript builder can append without losing formatting.【F:dashboard-holographic.js†L3176-L3364】
- `usage` fields are optional yet recommended to populate the assistant context summary and export metadata.【F:dashboard-holographic.js†L3294-L3325】

## `/api/install-tool`
Initiated when a user clicks an install button.

```jsonc
{
  "status": "ok",
  "message": "Installation started",
  "command": "npm install -g firebase-tools"
}
```

*Notes*
- Return `status` (`ok` or `error`) and an optional `message` so toast notifications can reflect the outcome.【F:dashboard-holographic.js†L4860-L4915】
- Echoing the `command` helps the clipboard helper supply accurate fallback text if copying fails.【F:dashboard-holographic.js†L4890-L4906】

## `/api/fix`
Triggered by auto-fix buttons attached to scan issues.

```jsonc
{
  "status": "ok",
  "message": "Removed leaked .env file",
  "issueId": "leaked-env"
}
```

*Notes*
- Include the `issueId` that was processed so the client can correlate the toast and update cached results when appropriate.【F:dashboard-holographic.js†L4929-L5002】
- Non-200 responses or `{ status: 'error' }` should include a `message` explaining the failure for the inline notification.【F:dashboard-holographic.js†L4968-L4999】
