#!/usr/bin/env node
// Adzuna only runs when something emits scan_method: adzuna AND keys exist.
// Keys live in provider-secrets.json (0600), never in suitor.config.json.

import assert from 'assert/strict';
import { spawn } from 'child_process';
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { waitForSuitorServer } from './regression_server_wait.mjs';

const APP_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const profileRoot = mkdtempSync(join(tmpdir(), 'Suitor-adzuna-'));
const configDir = resolve(profileRoot, 'config');
const runtimeRoot = resolve(profileRoot, '.suitor-runtime');
const assessmentsRoot = resolve(profileRoot, 'Assessments');
const personKey = 'Adzuna Test';
const port = 23000 + Math.floor(Math.random() * 2000);
const tokenPath = resolve(runtimeRoot, `${personKey.toLowerCase()}.app-token`);

mkdirSync(configDir, { recursive: true });
mkdirSync(runtimeRoot, { recursive: true });
mkdirSync(assessmentsRoot, { recursive: true });
writeFileSync(resolve(profileRoot, 'Candidate Search Profile.md'), '# Candidate Search Profile\n', 'utf8');
writeFileSync(resolve(profileRoot, 'Candidate Search Profile.json'), JSON.stringify({
  targetRoleDirection: { summary: 'Program leadership' },
  compensation: { summary: '$120,000 base floor' },
  logistics: { summary: 'Remote' },
  scoring: {
    weights: { role: 25, environment: 20, compensation: 20, lifestyle: 15, growth: 10, risk: 10 },
    thresholds: { shortlist: 75, manual_review_min: 65, reject_below: 65 },
    hardFilters: { excludeKeywords: [], automaticRejections: [], manualReviewCriteria: [] },
  },
}, null, 2), 'utf8');
writeFileSync(resolve(profileRoot, 'Job Scan Prompt.md'), '# Job Scan Prompt\n', 'utf8');
writeFileSync(resolve(profileRoot, 'Applications Tracker.md'), '# Applications Tracker\n\n', 'utf8');
writeFileSync(resolve(configDir, 'suitor.config.json'), JSON.stringify({
  onboarded: true,
  personKey,
  candidateName: 'Sample Candidate',
  candidateFirst: 'Sample',
  candidateInitials: 'SC',
  assistantName: 'Assistant',
  profileRoot,
  runtimeRoot,
  assessmentsRoot,
  host: '127.0.0.1',
  port,
  llm: { provider: 'openai', permissionMode: 'default' },
  intake: {
    tier1: { basics: 'Ready', targetRole: 'Program leadership', logistics: 'Remote', compensation: '$120,000 floor' },
    tier2: { experience: 'Verified', strengths: 'Execution', voice: 'Direct' },
    tier3: {},
    interview: { responses: {}, classifications: {} },
  },
  connections: { providers: {}, rssFeeds: [], targetCompanies: [] },
}, null, 2), 'utf8');

const adzunaSource = readFileSync(resolve(APP_ROOT, 'providers', 'adzuna.mjs'), 'utf-8');
assert.doesNotMatch(adzunaSource, /Atlanta/, 'Adzuna fallback where must not default to Atlanta');
assert.doesNotMatch(adzunaSource, /Chief of Staff/, 'Adzuna fallback what must not default to Chief of Staff');

const app = readFileSync(resolve(APP_ROOT, 'web', 'static', 'app.js'), 'utf-8');
assert.match(app, /fieldAdzuna|adzunaAppId|Adzuna API/, 'connections UI exposes Adzuna credentials');
assert.doesNotMatch(app, /Atlanta OR Remote/, 'Adzuna UI must not ship Atlanta as a default');
assert.doesNotMatch(app, /Chief of Staff/, 'Adzuna UI must not ship Chief of Staff as a default');

const childEnv = { ...process.env };
delete childEnv.ADZUNA_APP_ID;
delete childEnv.ADZUNA_APP_KEY;

const server = spawn(process.execPath, ['web/server.mjs'], {
  cwd: APP_ROOT,
  env: { ...childEnv, SUITOR_CONFIG_DIR: configDir },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let stdout = '';
let stderr = '';
server.stdout.on('data', chunk => { stdout += chunk.toString(); });
server.stderr.on('data', chunk => { stderr += chunk.toString(); });

async function api(token, path, options = {}) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    ...options,
    headers: {
      'X-Suitor-App-Token': token,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

try {
  const token = await waitForSuitorServer({
    port,
    tokenPath,
    child: server,
    getOutput: () => `${stdout}\n${stderr}`,
  });

  const enabledNoKeys = await api(token, '/api/adzuna', {
    method: 'POST',
    body: JSON.stringify({
      enabled: true,
      search: { what: 'operations', where: 'Remote', country: 'us' },
    }),
  });
  assert.equal(enabledNoKeys.response.status, 200, 'search terms can be saved without keys');
  let portals = readFileSync(resolve(profileRoot, 'portals.yml'), 'utf8');
  assert.doesNotMatch(portals, /scan_method:\s*adzuna/, 'keyless Adzuna must not emit a tracked_companies entry');

  const saved = await api(token, '/api/adzuna', {
    method: 'POST',
    body: JSON.stringify({
      enabled: true,
      appId: 'test-app-id-1234',
      appKey: 'test-app-key-5678',
      search: { what: 'operations leadership', where: 'Remote', country: 'us' },
    }),
  });
  assert.equal(saved.response.status, 200, 'Adzuna save with fake keys should succeed');
  assert.equal(saved.body.configured, true);
  assert.equal(saved.body.enabled, true);
  assert.doesNotMatch(JSON.stringify(saved.body), /test-app-key-5678/, 'API must not echo the secret key');

  portals = readFileSync(resolve(profileRoot, 'portals.yml'), 'utf8');
  assert.match(portals, /scan_method:\s*adzuna/, 'enabled + keys emit scan_method: adzuna');
  assert.match(portals, /operations leadership/);
  assert.match(portals, /Remote/);

  const configJson = readFileSync(resolve(configDir, 'suitor.config.json'), 'utf8');
  assert.doesNotMatch(configJson, /test-app-id-1234/, 'App ID must not be written to suitor.config.json');
  assert.doesNotMatch(configJson, /test-app-key-5678/, 'App Key must not be written to suitor.config.json');

  const secretsPath = resolve(runtimeRoot, 'provider-secrets.json');
  const secrets = JSON.parse(readFileSync(secretsPath, 'utf8'));
  assert.equal(secrets.adzuna.appId, 'test-app-id-1234');
  assert.equal(secrets.adzuna.appKey, 'test-app-key-5678');
  assert.equal(statSync(secretsPath).mode & 0o777, 0o600, 'provider-secrets.json is mode 0600');

  const status = await api(token, '/api/connections');
  assert.equal(status.body.adzuna.status, 'connected', 'status line reflects the secrets file, not only process.env');

  const bootstrap = await api(token, '/api/bootstrap');
  assert.doesNotMatch(JSON.stringify(bootstrap.body), /test-app-key-5678/, 'bootstrap must not leak the key');

  writeFileSync(secretsPath, '{not-json', 'utf8');
  chmodSync(secretsPath, 0o600);
  const corrupt = await api(token, '/api/adzuna', {
    method: 'POST',
    body: JSON.stringify({ enabled: true, appId: 'other-id', appKey: 'other-key' }),
  });
  assert.equal(corrupt.response.status, 409, 'refuse to overwrite a corrupt secrets file');
  assert.match(readFileSync(secretsPath, 'utf8'), /\{not-json/, 'corrupt secrets file is left intact');

  const companies = await api(token, '/api/target-companies', {
    method: 'POST',
    body: JSON.stringify({
      companies: [
        { name: 'Example Corp', boards: ['https://job-boards.greenhouse.io/example'] },
        { name: 'Other Co', boards: ['https://careers.example.com/jobs'] },
      ],
    }),
  });
  assert.equal(companies.response.status, 200);
  assert.equal(companies.body.companies.length, 2);
  assert.equal(companies.body.companies[0].boards[0].provider, 'greenhouse');
  assert.equal(companies.body.companies[1].boards[0].provider, '');

  const lanes = await api(token, '/api/search-lanes', {
    method: 'POST',
    body: JSON.stringify({ lanes: ['ic ai', 'operations'] }),
  });
  assert.equal(lanes.response.status, 200);
  assert.equal(lanes.body.query, 'ic ai; operations');
  const afterLanes = JSON.parse(readFileSync(resolve(configDir, 'suitor.config.json'), 'utf8'));
  assert.equal(afterLanes.connections.linkedin.searchQuery, 'ic ai; operations');

  const notes = await api(token, '/api/application-notes', {
    method: 'POST',
    body: JSON.stringify({
      company: 'Example Corp',
      role: 'Program Lead',
      notes: 'Keep this through a rebuild.',
    }),
  });
  assert.equal(notes.response.status, 200);
  assert.equal(notes.body.identityKey, 'example corp::program lead');
  const loaded = await api(token, '/api/application-notes?company=Example%20Corp&role=Program%20Lead');
  assert.equal(loaded.body.notes.notes, 'Keep this through a rebuild.');

  console.log('regression_adzuna_config passed');
} finally {
  server.kill('SIGTERM');
  rmSync(profileRoot, { recursive: true, force: true });
}
