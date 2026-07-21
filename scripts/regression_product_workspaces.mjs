#!/usr/bin/env node

import assert from 'assert/strict';
import { spawn } from 'child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { resolve, join } from 'path';
import { fileURLToPath } from 'url';
import { DatabaseSync } from 'node:sqlite';
import { chromium } from 'playwright';
import { waitForSuitorServer } from './regression_server_wait.mjs';

const APP_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const profileRoot = mkdtempSync(join(tmpdir(), 'Suitor-workspaces-'));
const configDir = resolve(profileRoot, 'config');
const runtimeRoot = resolve(profileRoot, '.suitor-runtime');
const assessmentsRoot = resolve(profileRoot, 'Assessments');
const personKey = 'Workspace Test';
const port = 22000 + Math.floor(Math.random() * 2000);
const tokenPath = resolve(runtimeRoot, `${personKey.toLowerCase()}.app-token`);

mkdirSync(configDir, { recursive: true });
mkdirSync(runtimeRoot, { recursive: true });
mkdirSync(assessmentsRoot, { recursive: true });
writeFileSync(resolve(profileRoot, 'Candidate Search Profile.md'), '# Candidate Search Profile\n', 'utf8');
writeFileSync(resolve(profileRoot, 'Candidate Search Profile.json'), JSON.stringify({
  targetRoleDirection: { summary: 'Program leadership and operations' },
  compensation: { summary: '$120,000 base floor' },
  logistics: { summary: 'Remote or hybrid' },
  scoring: {
    weights: { role: 25, environment: 20, compensation: 20, lifestyle: 15, growth: 10, risk: 10 },
    thresholds: { shortlist: 75, manual_review_min: 65, reject_below: 65 },
    hardFilters: { excludeKeywords: ['commission only'], automaticRejections: [], manualReviewCriteria: ['heavy travel'] },
  },
}, null, 2), 'utf8');
writeFileSync(resolve(profileRoot, 'Job Scan Prompt.md'), '# Job Scan Prompt\n', 'utf8');
writeFileSync(resolve(profileRoot, 'Applications Tracker.md'), '# Applications Tracker\n\n## Active Applications\n', 'utf8');
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
    tier2: { experience: 'Verified examples', strengths: 'Execution', voice: 'Direct' },
    tier3: {},
    interview: { responses: {}, classifications: {} },
  },
  connections: { providers: {}, rssFeeds: [], targetCompanies: [] },
}, null, 2), 'utf8');

const indexHtml = readFileSync(resolve(APP_ROOT, 'web', 'static', 'index.html'), 'utf8');
const serverSource = readFileSync(resolve(APP_ROOT, 'web', 'server.mjs'), 'utf8');
const rootPortals = readFileSync(resolve(APP_ROOT, 'portals.yml'), 'utf8');
assert.match(serverSource, /roleFit = profileAxisScore\(text, context\.role, 25\)/, 'local fallback should use the profile scoring model');
assert.match(serverSource, /manualMatches\.length[\s\S]+manual_review/, 'manual-review criteria should route to a manual decision');
assert.doesNotMatch(serverSource, /soft_floor_base_|hard_floor_base_|Salesforce-to-HubSpot|Hope Industrial/i, 'shared server code should not contain profile-specific scoring or resume history');
assert.match(rootPortals, /tracked_companies:\s*\[\]/, 'checked-in portal config should not ship target companies');
assert.match(rootPortals, /search_queries:\s*\[\]/, 'checked-in portal config should not ship profile-specific searches');
for (const view of ['applications', 'scans', 'capture', 'resume', 'learning', 'assessments', 'reference', 'settings']) {
  assert.match(indexHtml, new RegExp(`data-view="${view}"`), `${view} should be present in primary navigation`);
  assert.equal((indexHtml.match(new RegExp(`id="${view}View"`, 'g')) || []).length, 1, `${view} should have one workspace`);
}
const settingsHtml = indexHtml.slice(indexHtml.indexOf('id="settingsView"'), indexHtml.indexOf('</main>'));
assert.doesNotMatch(settingsHtml, /Email Import|Workplace Assessments|Reference Docs/, 'Settings should contain system controls, not knowledge or capture workspaces');

const server = spawn(process.execPath, ['web/server.mjs'], {
  cwd: APP_ROOT,
  env: { ...process.env, SUITOR_CONFIG_DIR: configDir },
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

let browser;
try {
  const token = await waitForSuitorServer({
    port,
    tokenPath,
    child: server,
    getOutput: () => `${stdout}\n${stderr}`,
  });

  const first = await api(token, '/api/capture', {
    method: 'POST',
    body: JSON.stringify({
      company: 'Example Company',
      role: 'Program Lead',
      url: 'https://example.com/jobs/program-lead',
      source: 'referral',
      jdText: 'Lead cross-functional programs with remote teams.',
    }),
  });
  assert.equal(first.response.status, 200);
  assert.equal(first.body.duplicate, false);
  assert.equal(first.body.captures.length, 1);

  const duplicate = await api(token, '/api/capture', {
    method: 'POST',
    body: JSON.stringify({
      company: 'Example Company',
      role: 'Program Lead',
      url: 'https://example.com/jobs/program-lead',
      source: 'recruiter',
      notes: 'Updated source note.',
    }),
  });
  assert.equal(duplicate.response.status, 200);
  assert.equal(duplicate.body.duplicate, true);
  assert.equal(duplicate.body.captures.length, 1);
  assert.equal(duplicate.body.captures[0].source, 'recruiter');

  const unsafe = await api(token, '/api/capture', {
    method: 'POST',
    body: JSON.stringify({ company: 'Example Company', role: 'Unsafe URL', url: 'file:///tmp/job.txt' }),
  });
  assert.equal(unsafe.response.status, 400, 'manual capture should reject non-http URLs');

  browser = await chromium.launch({ headless: true });
  for (const viewport of [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'tablet', width: 820, height: 1180 },
    { name: 'mobile', width: 390, height: 844 },
  ]) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${port}/`);
    const loginStatus = await page.evaluate(async presentedToken => {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: presentedToken }),
      });
      return response.status;
    }, token);
    assert.equal(loginStatus, 200, `${viewport.name} login should succeed`);
    await page.reload();
    await page.waitForSelector('#applicationsView.active');

    for (const view of ['applications', 'scans', 'capture', 'resume', 'learning', 'assessments', 'reference', 'settings']) {
      await page.click(`[data-view="${view}"]`);
      await page.waitForSelector(`#${view}View.active`);
      const layout = await page.evaluate(() => ({
        viewport: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        bodyWidth: document.body.scrollWidth,
      }));
      assert(layout.documentWidth <= layout.viewport + 1, `${viewport.name}/${view} document should not overflow horizontally: ${JSON.stringify(layout)}`);
      assert(layout.bodyWidth <= layout.viewport + 1, `${viewport.name}/${view} body should not overflow horizontally: ${JSON.stringify(layout)}`);
    }
    if (viewport.name === 'desktop' && process.env.SUITOR_WORKSPACE_SCREENSHOT) {
      await page.click('[data-view="capture"]');
      await page.screenshot({ path: resolve(process.env.SUITOR_WORKSPACE_SCREENSHOT), fullPage: true });
    }
    await context.close();
  }

  const captureId = duplicate.body.captures[0].id;
  const removed = await api(token, `/api/captures/${encodeURIComponent(captureId)}`, {
    method: 'DELETE',
    body: JSON.stringify({}),
  });
  assert.equal(removed.response.status, 200);
  assert.equal(removed.body.captures.length, 0);

  const db = new DatabaseSync(resolve(runtimeRoot, 'suitor.sqlite'), { readOnly: true });
  assert.equal(db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get().value, '3');
  const captureRow = db.prepare('SELECT deleted_at FROM captures WHERE id = ?').get(captureId);
  assert(captureRow.deleted_at, 'removed captures should remain as soft-deleted profile-local rows');
  db.close();

  console.log('product workspaces regression passed');
} finally {
  await browser?.close().catch(() => {});
  if (server.exitCode === null) {
    server.kill();
    await new Promise(resolveDone => server.once('exit', resolveDone));
  }
  rmSync(profileRoot, { recursive: true, force: true });
}
