# 🎨 DASHBOARD INTEGRATION GUIDE

## Current Status
- ✅ Backend API working (dashboard-server.js)
- ✅ Frontend UI designed (public/dashboard.html)
- ❌ Frontend shows hardcoded data
- ❌ Not connected via API

## Integration Steps

### Option 1: Quick Integration (Recommended for MVP)

Add this JavaScript to the end of `public/dashboard.html` before the closing `</script>` tag:

```javascript
// API Configuration
const API_BASE = window.location.origin + '/api';
let scanInProgress = false;

// Load project status on page load
async function loadProjectStatus() {
    try {
        const response = await fetch(`${API_BASE}/status`);
        if (!response.ok) throw new Error('API not available');

        const data = await response.json();

        // Update Project Status Card
        updateElement('[data-project-name]', data.projectName || 'Unknown');
        updateElement('[data-experience-level]', data.experienceLevel || 'intermediate');

        if (data.package) {
            updateElement('[data-dependencies]', data.package.dependencies || 0);
            updateElement('[data-dev-dependencies]', data.package.devDependencies || 0);
        }

        if (data.git) {
            updateElement('[data-git-branch]', data.git.branch || 'main');
        }

        console.log('✅ Project status loaded');
    } catch (error) {
        console.warn('⚠️  Running in demo mode (API not available)');
        showDemoWarning();
    }
}

// Run scan
async function runScan() {
    if (scanInProgress) return;

    scanInProgress = true;
    const button = document.querySelector('[data-scan-button]');
    const originalText = button?.textContent || 'SCAN PROJECT';

    if (button) {
        button.disabled = true;
        button.textContent = 'Scanning...';
    }

    try {
        const response = await fetch(`${API_BASE}/scan`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        if (!response.ok) throw new Error('Scan failed');

        const results = await response.json();
        displayScanResults(results);

        console.log('✅ Scan completed:', results);
    } catch (error) {
        console.error('❌ Scan failed:', error);
        alert('Scan failed. Make sure dashboard server is running: nimbus dashboard');
    } finally {
        scanInProgress = false;
        if (button) {
            button.disabled = false;
            button.textContent = originalText;
        }
    }
}

// Display scan results
function displayScanResults(results) {
    const { issues = [], warnings = [] } = results;

    // Count by severity
    const critical = issues.filter(i => i.severity === 'CRITICAL').length;
    const high = issues.filter(i => i.severity === 'HIGH').length;
    const medium = issues.filter(i => i.severity === 'MEDIUM').length;

    // Update Security Scan Card
    updateElement('[data-critical]', critical);
    updateElement('[data-high]', high);
    updateElement('[data-medium]', medium);
    updateElement('[data-warnings]', warnings.length);

    // Update status badge
    const statusBadge = document.querySelector('.status-badge');
    if (statusBadge) {
        if (critical > 0) {
            statusBadge.className = 'status-badge status-error';
            statusBadge.textContent = 'Critical Issues';
        } else if (high > 0) {
            statusBadge.className = 'status-badge status-warning';
            statusBadge.textContent = 'Issues Detected';
        } else {
            statusBadge.className = 'status-badge status-success';
            statusBadge.textContent = 'All Clear';
        }
    }

    // Update issues list
    const issuesList = document.querySelector('[data-issues-list]');
    if (issuesList && issues.length > 0) {
        issuesList.innerHTML = issues.slice(0, 10).map(issue => `
            <li class="issue-item">
                <span class="issue-icon">${getSeverityIcon(issue.severity)}</span>
                <div class="issue-text">
                    <strong>${issue.severity}:</strong> ${issue.message}
                    ${issue.file ? `<small>File: ${issue.file}</small>` : ''}
                </div>
                ${issue.autoFixable ? '<button class="btn" onclick="fixIssue(\'' + issue.id + '\')">FIX NOW</button>' : ''}
            </li>
        `).join('');
    }
}

// Fix an issue
async function fixIssue(issueId) {
    try {
        const response = await fetch(`${API_BASE}/fix`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ issueId })
        });

        if (!response.ok) throw new Error('Fix failed');

        const result = await response.json();
        alert(result.success ? '✅ Fixed!' : '❌ Could not fix: ' + result.message);

        // Re-scan to update
        runScan();
    } catch (error) {
        alert('❌ Fix failed: ' + error.message);
    }
}

// Helper functions
function updateElement(selector, value) {
    const element = document.querySelector(selector);
    if (element) element.textContent = value;
}

function getSeverityIcon(severity) {
    const icons = {
        'CRITICAL': '🔴',
        'HIGH': '🟠',
        'MEDIUM': '🟡',
        'LOW': '⚪'
    };
    return icons[severity] || '💡';
}

function showDemoWarning() {
    const warning = document.createElement('div');
    warning.className = 'alert-box';
    warning.style.position = 'fixed';
    warning.style.top = '20px';
    warning.style.right = '20px';
    warning.style.zIndex = '9999';
    warning.innerHTML = `
        <strong>⚠️  DEMO MODE</strong><br>
        Dashboard server not running. Showing demo data.<br>
        Run: <code>nimbus dashboard</code>
    `;
    document.body.appendChild(warning);
}

// Initialize on page load
window.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Initializing Nimbus Dashboard...');

    // Load initial data
    loadProjectStatus();

    // Setup scan button
    const scanButton = document.querySelector('[data-scan-button]');
    if (scanButton) {
        scanButton.addEventListener('click', runScan);
    }

    // Auto-scan on load (optional)
    // setTimeout(runScan, 1000);
});
```

### Step 2: Update HTML Elements

Add data attributes to make elements updatable:

```html
<!-- Project Status Card -->
<span data-project-name class="metric-value">Nimbus</span>
<span data-experience-level class="metric-value">Advanced</span>
<span data-dependencies class="metric-value">12</span>
<span data-dev-dependencies class="metric-value">1</span>
<span data-git-branch class="metric-value">main</span>

<!-- Security Scan Card -->
<span data-critical class="metric-value">0</span>
<span data-high class="metric-value">1</span>
<span data-medium class="metric-value">1</span>
<span data-warnings class="metric-value">3</span>

<!-- Scan Button -->
<button data-scan-button class="action-btn">SCAN PROJECT</button>

<!-- Issues List -->
<ul data-issues-list class="issue-list">
    <!-- Will be populated by JavaScript -->
</ul>
```

---

## Option 2: Full Rewrite (For Production)

Create a proper single-page app with:
- React/Vue/Svelte
- Proper state management
- WebSocket for real-time updates
- Better error handling

**Estimated Time**: 1-2 days

---

## Testing the Integration

### 1. Start Dashboard Server
```bash
nimbus dashboard
```

Should open http://localhost:3333

### 2. Open Browser DevTools
- Check Console for errors
- Check Network tab for API calls

### 3. Test API Endpoints Manually
```bash
# Status
curl http://localhost:3333/api/status

# Scan
curl -X POST http://localhost:3333/api/scan

# Tools
curl http://localhost:3333/api/tools
```

### 4. Test Dashboard Features
- [ ] Page loads without errors
- [ ] Project status shows real data
- [ ] Scan button works
- [ ] Issues display correctly
- [ ] Fix buttons work (if auto-fixable)

---

## Quick Integration (Minimal Changes)

If you want to ship FAST, just add this one script before `</body>`:

```html
<script>
// Quick API check on load
fetch('/api/status')
    .then(r => r.json())
    .then(data => {
        console.log('✅ Connected to backend:', data);
        // Update just the project name as proof
        document.querySelector('.metric-value').textContent = data.projectName;
    })
    .catch(err => {
        console.warn('⚠️  Backend not available, showing demo data');
    });
</script>
```

This proves the connection works. Full integration can come later.

---

## Recommendation

**For v1.0 Launch**: Keep demo data, add "Demo Mode" banner
**For v1.1**: Do quick integration (Option 1)
**For v2.0**: Full rewrite with React (Option 2)

The dashboard looks good as-is. Connection can wait!

---

# 🌟 A Paul Phillips Manifestation

**© 2025 Paul Phillips - Clear Seas Solutions LLC**
