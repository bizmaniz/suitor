#!/usr/bin/env node

import assert from 'assert/strict';
import { spawnSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { htmlToPlainText } from '../providers/_html_text.mjs';
import { isQuickReject, isSearchResultNoise } from './scan_quality_filters.mjs';

assert.equal(isQuickReject({
  company: 'Ladders',
  title: 'Chief of Staff',
  location: 'United States',
}), true, 'Ladders should not enter the active scan board');

assert.equal(isQuickReject({
  company: 'Robert Half',
  title: 'Director of Strategic Operations',
  location: 'Remote - US',
}), true, 'staffing/recruiting intermediaries should be filtered');

assert.equal(isQuickReject({
  company: 'Acme AI',
  title: 'Product Marketing Manager',
  location: 'Remote - US',
}), true, 'product marketing should be filtered from operator scans');

assert.equal(isQuickReject({
  company: 'Formic',
  title: 'Chief of Staff to the CEO',
  location: 'United States - Remote',
}), false, 'real founder-adjacent operator roles should survive quick reject');

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
