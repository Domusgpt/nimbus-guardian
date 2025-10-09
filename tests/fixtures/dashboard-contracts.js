import { expect } from 'vitest';

export function createGuardianScanFixture() {
  return {
    issues: [
      {
        id: 'gitignore-missing',
        severity: 'HIGH',
        category: 'Security',
        message: '.gitignore missing critical patterns',
        details: ['.env', '.env.*', '*.env'],
        autoFixable: true,
        needsExplanation: true
      },
      {
        id: 'no-env-example',
        severity: 'MEDIUM',
        category: 'Documentation',
        message: 'Missing .env.example for team reference',
        autoFixable: true,
        needsExplanation: true
      }
    ],
    warnings: [
      {
        id: 'docs-style',
        severity: 'LOW',
        category: 'Documentation',
        message: 'Consider adding README status badges',
        needsExplanation: false
      }
    ],
    fixes: [
      {
        id: 'gitignore-missing',
        summary: 'Added standard secret patterns to .gitignore',
        command: 'npx guardian fix gitignore-missing'
      }
    ],
    insights: [
      {
        id: 'release-notes',
        message: 'Document environment expectations before next release'
      }
    ],
    summary: 'Scan completed successfully'
  };
}

export function expectGuardianIssueContract(issue) {
  expect(issue).toBeTruthy();
  expect(typeof issue).toBe('object');
  expect(typeof issue.message).toBe('string');
  expect(issue.message.length).toBeGreaterThan(0);

  if ('id' in issue) {
    expect(typeof issue.id).toBe('string');
    expect(issue.id.length).toBeGreaterThan(0);
  }

  if ('severity' in issue) {
    expect(typeof issue.severity).toBe('string');
    expect(issue.severity.length).toBeGreaterThan(0);
  }

  if ('category' in issue) {
    expect(typeof issue.category).toBe('string');
    expect(issue.category.length).toBeGreaterThan(0);
  }

  if ('details' in issue && issue.details !== undefined && issue.details !== null) {
    const validDetails = Array.isArray(issue.details) || typeof issue.details === 'string';
    expect(validDetails).toBe(true);
  }

  if ('autoFixable' in issue) {
    expect(typeof issue.autoFixable).toBe('boolean');
    if (issue.autoFixable) {
      expect(typeof issue.id).toBe('string');
    }
  }

  if ('needsExplanation' in issue) {
    expect(typeof issue.needsExplanation).toBe('boolean');
  }
}
