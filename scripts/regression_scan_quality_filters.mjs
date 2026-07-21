#!/usr/bin/env node

import assert from 'assert/strict';
import { spawnSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { htmlToPlainText } from '../providers/_html_text.mjs';
import { isQuickReject, isSearchResultNoise, localEvaluationDecision, readProfileHardRejectPhrases } from './scan_quality_filters.mjs';

assert.equal(isQuickReject({
  company: 'Example Staffing',
  title: 'Program Lead',
  location: 'United States',
}, ['staffing']), true, 'configured company exclusions should filter matching jobs');

assert.equal(isQuickReject({
  company: 'Example Company',
  title: 'Product Marketing Manager',
  location: 'Remote - US',
}, ['product marketing']), true, 'configured title exclusions should filter matching jobs');

assert.equal(isQuickReject({
  company: 'Example Company',
  title: 'Program Lead',
  location: 'Remote - US',
}, []), false, 'no profile exclusions should mean no profile-specific quick rejects');

assert.equal(isQuickReject({
  company: 'Example Company',
  title: 'Program Lead',
  location: 'United States - Remote',
}, ['unrelated phrase']), false, 'non-matching configured exclusions should not reject a role');

assert.equal(localEvaluationDecision({
  manualMatches: ['heavy travel'],
  total: 52,
  floor: 75,
}), 'manual_review', 'manual-review criteria should win over a below-floor score');
assert.equal(localEvaluationDecision({
  hardMatches: ['commission only'],
  manualMatches: ['heavy travel'],
  total: 92,
  floor: 75,
}), 'passed', 'hard filters should win over manual-review criteria and score');
assert.equal(localEvaluationDecision({ total: 52, floor: 75 }), 'passed');
assert.equal(localEvaluationDecision({ total: 82, floor: 75 }), 'shortlisted');

assert.equal(isSearchResultNoise({
  title: '5,000+ Director Alliances jobs in United States',
  url: 'https://www.linkedin.com/jobs/search/?keywords=director%20alliances',
}), true, 'generic LinkedIn search pages should not become job cards');

assert.equal(isSearchResultNoise({
  title: 'Director of Strategic Partnerships Jobs, Employment',
  url: 'https://www.indeed.com/q-director-strategic-partnerships-jobs.html',
}), true, 'generic aggregator search pages should not become job cards');

assert.equal(isSearchResultNoise({
  title: 'Chief of Staff to the CEO',
  url: 'https://jobs.ashbyhq.com/example/123',
}), false, 'real ATS job URLs should not be treated as search-result noise');

const websearchSource = readFileSync(resolve('providers', 'websearch.mjs'), 'utf-8');
assert.doesNotMatch(websearchSource, /r\.jina\.ai\/http:\/\/r\.jina\.ai/i, 'Jina fallback should use a single reader prefix');
assert.doesNotMatch(websearchSource, /\.endsWith\(['"]duckduckgo\.com['"]\)/, 'DuckDuckGo host checks should use parsed host equality/subdomain validation');
assert.doesNotMatch(websearchSource, /duckduckgo\\\.com\$/, 'blocked search hosts should not use suffix regexes that match attacker-controlled hostnames');
assert.equal(htmlToPlainText('<p>Director&nbsp;&amp;&nbsp;Ops</p>'), 'Director & Ops');
assert.equal(htmlToPlainText('&amp;lt;script&amp;gt;alert(1)&amp;lt;/script&amp;gt;'), '&lt;script&gt;alert(1)&lt;/script&gt;');
assert.equal(htmlToPlainText('<script>x</script><div>Visible</div>'), 'Visible');
assert.equal(htmlToPlainText('<style>x</style><div>Visible</div>'), 'Visible');
assert.equal(htmlToPlainText('<div>Before</div><script>x</script><div>After</div>'), 'Before After');
assert.equal(htmlToPlainText('<script>if (a < b) { alert(a); }</script><div>After</div>'), 'After');

const profileRoot = mkdtempSync(join(tmpdir(), 'Suitor-scan-quality-'));
try {
  writeFileSync(join(profileRoot, 'Candidate Search Profile.json'), JSON.stringify({
    scoring: {
      hardFilters: {
        excludeKeywords: ['commission only'],
        automaticRejections: ['weekly travel'],
      },
    },
  }), 'utf8');
  assert.deepEqual(
    readProfileHardRejectPhrases(profileRoot, 'Sample'),
    ['commission only', 'weekly travel'],
    'quick scan should load profile-local hard filters',
  );
  const portalsPath = join(profileRoot, 'portals.yml');
  writeFileSync(portalsPath, [
    'providers:',
    '  websearch: true',
    'tracked_companies:',
    '  - name: "Explicit Websearch Target"',
    '    scan_method: websearch',
    '    scan_query: "site:example.com jobs"',
    '    enabled: true',
    'search_queries:',
    '  - name: "Search Query Target"',
    '    query: "site:example.com jobs"',
    '    enabled: true',
  ].join('\n') + '\n', 'utf-8');
  const run = spawnSync(process.execPath, ['scan.mjs', '--dry-run', '--json', '--no-websearch'], {
    cwd: resolve('.'),
    env: {
      ...process.env,
      SUITOR_PROFILE_ROOT: profileRoot,
      SUITOR_PORTALS_PATH: portalsPath,
      SUITOR_RUNTIME_ROOT: join(profileRoot, '.suitor-runtime'),
      SUITOR_PERSON_KEY: 'test',
    },
    encoding: 'utf-8',
    timeout: 20000,
  });
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
  const payload = JSON.parse(run.stdout);
  assert.equal(payload.companiesScanned, 0, JSON.stringify(payload));
  assert.deepEqual(Object.keys(payload.bySource), [], JSON.stringify(payload.bySource));
} finally {
  rmSync(profileRoot, { recursive: true, force: true });
}

console.log('scan quality filter regression passed');
