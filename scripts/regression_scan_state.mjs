#!/usr/bin/env node

import { spawn } from 'child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { DatabaseSync } from 'node:sqlite';

const APP_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const profileRoot = mkdtempSync(join(tmpdir(), 'Suitor-regression-'));
const port = 19000 + Math.floor(Math.random() * 2000);
const runtimeRoot = resolve(profileRoot, '.suitor-runtime');
const tokenPath = resolve(runtimeRoot, 'Test Candidate.app-token');

function writeProfileFiles() {
  mkdirSync(runtimeRoot, { recursive: true });
  mkdirSync(resolve(profileRoot, 'Applications'), { recursive: true });
  mkdirSync(resolve(profileRoot, 'Assessments'), { recursive: true });
  writeFileSync(resolve(profileRoot, 'Candidate Search Profile.md'), [
    '# Candidate Search Profile - Test Candidate',
    '',
    'Shortlist floor is controlled by JSON for regression testing.',
  ].join('\n'), 'utf-8');
  writeFileSync(resolve(profileRoot, 'Candidate Search Profile.json'), JSON.stringify({
    scoring: {
      thresholds: {
        shortlist: 82,
        manual_review_min: 65,
        reject_below: 65,
      },
    },
  }, null, 2), 'utf-8');
  writeFileSync(resolve(profileRoot, 'Job Scan Prompt.md'), '# Job Scan Prompt - Test Candidate\n', 'utf-8');
  writeFileSync(resolve(profileRoot, 'Applications Tracker.md'), [
    '# Applications Tracker - Test Candidate',
    '',
    '## Active Applications',
    '',
    '| Company | Role | Status | Date | Score | Notes |',
    '| --- | --- | --- | --- | --- | --- |',
    '',
    '## Rejected / Close-Outs',
    '',
    '| Company | Role | Status | Date | Score | Notes |',
    '| --- | --- | --- | --- | --- | --- |',
    '',
  ].join('\n'), 'utf-8');
}

function delay(ms) {
  return new Promise(resolveDelay => setTimeout(resolveDelay, ms));
}

async function waitForServer(child) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (child.exitCode != null) throw new Error(`server exited early with ${child.exitCode}`);
    if (existsSync(tokenPath)) {
      const token = readFileSync(tokenPath, 'utf-8').trim();
      if (token) {
        try {
          const res = await fetch(`http://127.0.0.1:${port}/api/bootstrap`, {
            headers: { 'X-Suitor-App-Token': token },
          });
          if (res.status === 200) return token;
        } catch {}
      }
    }
    await delay(250);
  }
  throw new Error('server did not become ready');
}

async function api(token, path, options = {}) {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    ...options,
    headers: {
      'X-Suitor-App-Token': token,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });
  const contentType = res.headers.get('content-type') || '';
  const body = contentType.includes('json') ? await res.json().catch(() => null) : await res.text().catch(() => '');
  return { res, body };
}

function assert(condition, message, evidence = '') {
  if (!condition) throw new Error(`${message}${evidence ? `\n${evidence}` : ''}`);
}

function postJson(token, path, value) {
  return api(token, path, { method: 'POST', body: JSON.stringify(value) });
}

function sectionBody(markdown, heading) {
  const lines = String(markdown || '').split(/\r?\n/);
  const out = [];
  let active = false;
  for (const line of lines) {
    if (/^##\s+/.test(line)) {
      active = heading.test(line);
      continue;
    }
    if (active) out.push(line);
  }
  return out.join('\n');
}

function countCompanyRoleRows(markdown, heading, company, role) {
  const companyPattern = new RegExp(company.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const rolePattern = new RegExp(role.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  return sectionBody(markdown, heading)
    .split(/\r?\n/)
    .filter(line => line.startsWith('|') && companyPattern.test(line) && rolePattern.test(line))
    .length;
}

writeProfileFiles();

const server = spawn(process.execPath, ['web/server.mjs'], {
  cwd: APP_ROOT,
  env: {
    ...process.env,
    SUITOR_PERSON_KEY: 'Test Candidate',
    SUITOR_PROFILE_ROOT: profileRoot,
    SUITOR_PORT: String(port),
    SUITOR_CANDIDATE_NAME: 'Sample Candidate',
    SUITOR_CANDIDATE_FIRST: 'Test Candidate',
    SUITOR_ASSISTANT_NAME: 'Assistant',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let stdout = '';
let stderr = '';
server.stdout.on('data', chunk => { stdout += chunk.toString(); });
server.stderr.on('data', chunk => { stderr += chunk.toString(); });

try {
  const token = await waitForServer(server);

  const boot = await api(token, '/api/bootstrap');
  assert(boot.res.status === 200, 'bootstrap should authenticate', `HTTP ${boot.res.status}`);
  assert(boot.body.shortlistFloor === 82, 'bootstrap should expose profile-specific shortlist floor', JSON.stringify(boot.body));
  assert(boot.body.learningSummary?.personKey === 'test candidate', 'bootstrap should expose profile-local learning summary', JSON.stringify(boot.body.learningSummary || null));

  const placeholder = await postJson(token, '/api/scan-state/decision', {
    decision: 'passed',
    title: 'Company - Role',
  });
  assert(placeholder.res.status === 400, 'placeholder scan decision should be rejected', JSON.stringify(placeholder.body));

  const first = await postJson(token, '/api/scan-state/decision', {
    decision: 'shortlisted',
    company: 'Canopy',
    role: 'Strategic Partnerships Director',
    title: 'Strategic Partnerships Director - Canopy',
    url: 'https://example.com/canopy-role',
    score: 84,
    comp: '$185,000 - $220,000',
    location: 'Remote - US',
  });
  assert(first.res.status === 200, 'shortlist scan decision should save', JSON.stringify(first.body));

  const override = await postJson(token, '/api/scan-state/decision', {
    decision: 'passed',
    company: 'Canopy',
    role: 'Strategic Partnerships Director',
    title: 'Strategic Partnerships Director - Canopy',
    url: 'https://example.com/canopy-role',
    source: 'BuiltIn',
    score: 84,
    reason: 'User passed due to direct ecosystem conflict.',
  });
  assert(override.res.status === 200, 'newer overlapping scan decision should save', JSON.stringify(override.body));
  const canopyDecisions = override.body.scanState.decisions.filter(item => /canopy/i.test(`${item.company} ${item.title} ${item.url}`));
  assert(canopyDecisions.length === 1 && canopyDecisions[0].decision === 'passed', 'newer scan decision should override stale shortlist copy', JSON.stringify(canopyDecisions));
  assert(canopyDecisions[0].source === 'BuiltIn', 'scan decisions should preserve explicit source labels for learning summaries', JSON.stringify(canopyDecisions));

  const linkedInPass = await postJson(token, '/api/scan-state/decision', {
    decision: 'passed',
    company: 'Swooped',
    role: 'Chief of Staff',
    title: 'Chief of Staff - Swooped',
    url: 'https://www.linkedin.com/jobs/view/123456',
    source: 'linkedin-browser',
    score: 62,
    reason: 'User passed because this was a LinkedIn staffing wrapper, not a direct employer role.',
  });
  assert(linkedInPass.res.status === 200, 'LinkedIn-source pass should save for learning/source-quality summary', JSON.stringify(linkedInPass.body));

  const submitted = await postJson(token, '/api/application-submitted', {
    company: 'Product.AI',
    role: 'Chief of Staff to the CEO',
    title: 'Chief of Staff to the CEO - Product.AI',
    url: 'https://example.com/product-ai-cos',
    source: 'LinkedIn',
    score: 84,
    dateSubmitted: '2026-06-12',
  });
  assert(submitted.res.status === 200, 'application submitted should save', JSON.stringify(submitted.body));
  assert(submitted.body.scanState.decisions.some(item => item.decision === 'submitted' && /Product\.AI/i.test(item.company)), 'submitted application should add suppressive scan decision', JSON.stringify(submitted.body.scanState));
  assert(submitted.body.scanState.decisions.some(item => item.decision === 'submitted' && /Product\.AI/i.test(item.company) && item.source === 'LinkedIn'), 'submitted application should preserve source in suppressive scan decision', JSON.stringify(submitted.body.scanState));
  assert(/Product\.AI/.test(submitted.body.trackerMarkdown), 'submitted application should update tracker', submitted.body.trackerMarkdown);
  assert(/Source:\s*LinkedIn\./.test(submitted.body.trackerMarkdown), 'submitted application should preserve source in tracker notes', submitted.body.trackerMarkdown);

  const staleShortlist = await postJson(token, '/api/scan-state/decision', {
    decision: 'shortlisted',
    company: 'Product.AI',
    role: 'Chief of Staff to the CEO',
    title: 'Chief of Staff to the CEO - Product.AI',
    url: 'https://example.com/product-ai-cos',
    source: 'LinkedIn',
    score: 84,
    reason: 'Regression attempt to re-shortlist an already submitted application.',
  });
  assert(staleShortlist.res.status === 200, 'attempted shortlist for submitted application should return cleanly', JSON.stringify(staleShortlist.body));
  assert(staleShortlist.body.suppressedByTracker === true, 'submitted tracker row should suppress stale shortlist decisions', JSON.stringify(staleShortlist.body));
  const productAiDecisions = staleShortlist.body.scanState.decisions.filter(item => /Product\.AI/i.test(`${item.company} ${item.title}`));
  assert(productAiDecisions.some(item => item.decision === 'submitted'), 'submitted suppressive decision should remain visible after stale shortlist attempt', JSON.stringify(productAiDecisions));
  assert(!productAiDecisions.some(item => item.decision === 'shortlisted'), 'stale shortlist copy should not survive for an already submitted application', JSON.stringify(productAiDecisions));

  const rejected = await postJson(token, '/api/application-rejected', {
    company: 'PandaDoc',
    role: 'Director of Partnerships',
    title: 'Director of Partnerships - PandaDoc',
    source: 'BuiltIn',
    score: 75,
    dateRejected: '2026-06-12',
  });
  assert(rejected.res.status === 200, 'application rejected should save', JSON.stringify(rejected.body));
  assert(rejected.body.scanState.decisions.some(item => item.decision === 'rejected' && /PandaDoc/i.test(item.company)), 'rejected application should add suppressive scan decision', JSON.stringify(rejected.body.scanState));
  assert(rejected.body.scanState.decisions.some(item => item.decision === 'rejected' && /PandaDoc/i.test(item.company) && item.source === 'BuiltIn'), 'rejected application should preserve source in suppressive scan decision', JSON.stringify(rejected.body.scanState));
  assert(/PandaDoc/.test(rejected.body.trackerMarkdown) && /rejected/.test(rejected.body.trackerMarkdown), 'rejected application should update tracker', rejected.body.trackerMarkdown);
  assert(/Source:\s*BuiltIn\./.test(rejected.body.trackerMarkdown), 'rejected application should preserve source in tracker notes', rejected.body.trackerMarkdown);
  assert(countCompanyRoleRows(rejected.body.trackerMarkdown, /^##\s+Active Applications/i, 'PandaDoc', 'Director of Partnerships') === 0, 'rejected application should not leave a copy in Active Applications', rejected.body.trackerMarkdown);
  assert(countCompanyRoleRows(rejected.body.trackerMarkdown, /^##\s+Rejected\b/i, 'PandaDoc', 'Director of Partnerships') === 1, 'rejected application should have one rejected close-out row', rejected.body.trackerMarkdown);

  const stageUpdate = await postJson(token, '/api/application-stage-update', {
    company: 'Product.AI',
    role: 'Chief of Staff to the CEO',
    title: 'Chief of Staff to the CEO - Product.AI',
    status: 'screen_scheduled',
    interviewAt: '2026-06-03T13:30:00-04:00',
    score: 84,
    source: 'LinkedIn',
    materialsPath: 'Applications/Product.AI - Chief of Staff to the CEO',
    notes: 'Interview scheduled for Wednesday, June 3, 2026 at 1:30 PM ET.',
  });
  assert(stageUpdate.res.status === 200, 'application stage update should save', JSON.stringify(stageUpdate.body));
  assert(/Product\.AI/.test(stageUpdate.body.trackerMarkdown), 'stage update should preserve the company in tracker', stageUpdate.body.trackerMarkdown);
  assert(/screen_scheduled/.test(stageUpdate.body.trackerMarkdown), 'stage update should persist the new status', stageUpdate.body.trackerMarkdown);
  assert(/Interview scheduled for Wednesday, June 3, 2026 at 1:30 PM ET\./.test(stageUpdate.body.trackerMarkdown), 'stage update should persist interview notes', stageUpdate.body.trackerMarkdown);
  assert(stageUpdate.body.scanState.decisions.some(item => item.decision === 'screen_scheduled' && /Product\.AI/i.test(item.company)), 'stage update should add suppressive scan decision', JSON.stringify(stageUpdate.body.scanState));

  const reopened = await postJson(token, '/api/application-stage-update', {
    company: 'PandaDoc',
    role: 'Director of Partnerships',
    title: 'Director of Partnerships - PandaDoc',
    status: 'screen_scheduled',
    interviewAt: '2026-06-15T10:00:00-04:00',
    score: 75,
    notes: 'Employer reopened the process and scheduled a recruiter screen.',
  });
  assert(reopened.res.status === 200, 'stage update should save for a previously rejected application', JSON.stringify(reopened.body));
  assert(countCompanyRoleRows(reopened.body.trackerMarkdown, /^##\s+Active Applications/i, 'PandaDoc', 'Director of Partnerships') === 1, 'stage update should move reopened applications into Active Applications', reopened.body.trackerMarkdown);
  assert(countCompanyRoleRows(reopened.body.trackerMarkdown, /^##\s+Rejected\b/i, 'PandaDoc', 'Director of Partnerships') === 0, 'stage update should remove reopened applications from Rejected / Close-Outs', reopened.body.trackerMarkdown);
  assert(/Employer reopened the process and scheduled a recruiter screen/.test(reopened.body.trackerMarkdown), 'stage update should preserve new reopened-process notes', reopened.body.trackerMarkdown);

  const boomerangSubmit = await postJson(token, '/api/application-submitted', {
    company: 'Boomerang AI',
    role: 'Chief of Staff',
    title: 'Chief of Staff - Boomerang AI',
    score: 83,
    dateSubmitted: '2026-06-10',
    notes: 'Submitted with a note containing / slash and pipe | characters to verify tracker escaping.',
  });
  assert(boomerangSubmit.res.status === 200, 'boomerang submitted application should save', JSON.stringify(boomerangSubmit.body));
  const boomerangReject = await postJson(token, '/api/application-rejected', {
    company: 'Boomerang AI',
    role: 'Chief of Staff',
    title: 'Chief of Staff - Boomerang AI',
    score: 83,
    dateRejected: '2026-06-11',
    notes: 'Employer rejection received.',
  });
  assert(boomerangReject.res.status === 200, 'boomerang rejected application should save', JSON.stringify(boomerangReject.body));
  assert(countCompanyRoleRows(boomerangReject.body.trackerMarkdown, /^##\s+Active Applications/i, 'Boomerang AI', 'Chief of Staff') === 0, 'rejection should remove Boomerang AI from Active Applications', boomerangReject.body.trackerMarkdown);
  assert(countCompanyRoleRows(boomerangReject.body.trackerMarkdown, /^##\s+Rejected\b/i, 'Boomerang AI', 'Chief of Staff') === 1, 'rejection should add one Boomerang AI close-out row', boomerangReject.body.trackerMarkdown);
  const boomerangResubmit = await postJson(token, '/api/application-submitted', {
    company: 'Boomerang AI',
    role: 'Chief of Staff',
    title: 'Chief of Staff - Boomerang AI',
    score: 83,
    dateSubmitted: '2026-06-12',
    notes: 'Resubmitted after role reopened.',
  });
  assert(boomerangResubmit.res.status === 200, 'resubmitted application should save', JSON.stringify(boomerangResubmit.body));
  assert(countCompanyRoleRows(boomerangResubmit.body.trackerMarkdown, /^##\s+Active Applications/i, 'Boomerang AI', 'Chief of Staff') === 1, 'resubmission should restore exactly one active row', boomerangResubmit.body.trackerMarkdown);
  assert(countCompanyRoleRows(boomerangResubmit.body.trackerMarkdown, /^##\s+Rejected\b/i, 'Boomerang AI', 'Chief of Staff') === 0, 'resubmission should remove the stale rejected row', boomerangResubmit.body.trackerMarkdown);

  const learning = await api(token, '/api/learning-summary');
  assert(learning.res.status === 200, 'learning summary endpoint should respond', `HTTP ${learning.res.status}`);
  assert(learning.body.personKey === 'test candidate', 'learning summary should stay profile-local', JSON.stringify(learning.body));
  assert(((learning.body.tracker?.statusCounts?.submitted || 0) + (learning.body.tracker?.statusCounts?.interviewing || 0)) >= 1, 'learning summary should count active tracker history after stage updates', JSON.stringify(learning.body.tracker));
  assert(((learning.body.scanDecisions?.decisionCounts?.submitted || 0) + (learning.body.scanDecisions?.decisionCounts?.screen_scheduled || 0)) >= 1, 'learning summary should count active scan suppression decisions after stage updates', JSON.stringify(learning.body.scanDecisions));
  assert(learning.body.scanDecisions?.sourceCounts?.some(item => item.name === 'builtin' && item.count >= 1), 'learning summary should retain BuiltIn source counts from scan decisions', JSON.stringify(learning.body.scanDecisions));
  assert(learning.body.scanDecisions?.sourceCounts?.some(item => item.name === 'linkedin' && item.count >= 1), 'learning summary should retain LinkedIn source counts from scan decisions', JSON.stringify(learning.body.scanDecisions));
  assert(learning.body.tracker?.sourceCounts?.some(item => item.name === 'linkedin' && item.count >= 1), 'learning summary should retain LinkedIn source counts from tracker notes', JSON.stringify(learning.body.tracker));
  assert(learning.body.tracker?.sourceCounts?.some(item => item.name === 'builtin' && item.count >= 1), 'learning summary should retain BuiltIn source counts from tracker notes', JSON.stringify(learning.body.tracker));
  assert(learning.body.scanDecisions?.durableSuppressions?.bySource?.some(item => item.source === 'linkedin' && item.decisions.passed >= 1), 'durable suppression summary should show passed LinkedIn-source noise', JSON.stringify(learning.body.scanDecisions?.durableSuppressions));
  assert(learning.body.scanDecisions?.durableSuppressions?.companies?.some(item => item.name === 'Swooped'), 'durable suppression summary should preserve suppressive company memory', JSON.stringify(learning.body.scanDecisions?.durableSuppressions));

  const scanStateText = readFileSync(resolve(runtimeRoot, 'scan-state.json'), 'utf-8');
  JSON.parse(scanStateText);
  const learningText = readFileSync(resolve(runtimeRoot, 'learning-summary.json'), 'utf-8');
  JSON.parse(learningText);
  const jobDbPath = resolve(runtimeRoot, 'suitor.sqlite');
  assert(existsSync(jobDbPath), 'profile-local SQLite database should be created');
  const db = new DatabaseSync(jobDbPath, { readOnly: true });
  try {
    const appCount = db.prepare('SELECT COUNT(*) AS count FROM applications').get().count;
    const decisionCount = db.prepare('SELECT COUNT(*) AS count FROM scan_decisions').get().count;
    const productAi = db.prepare('SELECT status, source FROM applications WHERE normalized_company = ? AND normalized_role = ?')
      .get('product ai', 'chief of staff to the ceo');
    const canopy = db.prepare('SELECT decision, source FROM scan_decisions WHERE normalized_company = ? AND normalized_role = ?')
      .get('canopy', 'strategic partnerships director');
    assert(appCount >= 3, 'SQLite applications table should contain imported tracker/application rows', `count=${appCount}`);
    assert(decisionCount >= 3, 'SQLite scan_decisions table should contain explicit suppressive scan decisions', `count=${decisionCount}`);
    assert(productAi?.status === 'screen_scheduled' && productAi?.source === 'LinkedIn', 'SQLite should preserve latest application stage/source for Product.AI', JSON.stringify(productAi));
    assert(canopy?.decision === 'passed' && canopy?.source === 'BuiltIn', 'SQLite should preserve newer overriding Canopy scan decision', JSON.stringify(canopy));
  } finally {
    db.close();
  }

  const browserRoot = resolve(runtimeRoot, 'browser');
  mkdirSync(browserRoot, { recursive: true });
  writeFileSync(resolve(browserRoot, 'status.json'), JSON.stringify({
    state: 'needs_close',
    logs: [{
      at: '2026-01-01T00:00:00.000Z',
      text: `browserType.launchPersistentContext: Opening in existing browser session.
Call log:
  - <launching> chrome.exe --password-store=basic --user-data-dir=${resolve(browserRoot, 'chromium-profile')} --remote-debugging-pipe about:blank
  - <launched> pid=12345`,
    }],
    currentUrl: 'https://www.linkedin.com/jobs/',
    updatedAt: '2026-01-01T00:00:00.000Z',
    personKey: 'Test Candidate',
  }, null, 2), 'utf-8');
  const staleBrowserStatus = await api(token, '/api/browser/status');
  assert(staleBrowserStatus.res.status === 200, 'browser status endpoint should respond with stale needs_close state', `HTTP ${staleBrowserStatus.res.status}`);
  assert(staleBrowserStatus.body.state === 'idle', 'stale needs_close browser state should reset to idle when no profile process is running', JSON.stringify(staleBrowserStatus.body));
  assert((staleBrowserStatus.body.logs || []).some(item => /state was stale/i.test(item.text || '')), 'stale browser reset should be visible in Browser Activity logs', JSON.stringify(staleBrowserStatus.body));
  assert(!(staleBrowserStatus.body.logs || []).some(item => /--user-data-dir=|password-store=basic|pid=12345/i.test(item.text || '')), 'browser status endpoint should sanitize raw Playwright launch logs before returning them', JSON.stringify(staleBrowserStatus.body.logs));

  writeFileSync(resolve(browserRoot, 'linkedin-results.json'), JSON.stringify({
    generatedAt: new Date().toISOString(),
    query: 'Chief of Staff',
    results: [
      { title: 'Chief of Staff', company: 'Example AI', url: 'https://www.linkedin.com/jobs/view/123' },
      { title: 'Strategic Operations', company: 'Example Ops', url: 'https://www.linkedin.com/jobs/view/456' },
    ],
  }, null, 2), 'utf-8');
  const browserBefore = await api(token, '/api/browser/results');
  assert(browserBefore.res.status === 200, 'browser results endpoint should respond before clear', `HTTP ${browserBefore.res.status}`);
  assert(browserBefore.body.results.length === 2, 'browser results should expose active LinkedIn cards before clear', JSON.stringify(browserBefore.body));
  const browserClear = await postJson(token, '/api/browser/results/clear', {
    reason: 'Regression clear from scan-state test.',
  });
  assert(browserClear.res.status === 200, 'browser results clear should save', JSON.stringify(browserClear.body));
  assert(browserClear.body.clearedCount === 2, 'browser results clear should report cleared count', JSON.stringify(browserClear.body));
  const browserAfter = await api(token, '/api/browser/results');
  assert(browserAfter.res.status === 200, 'browser results endpoint should respond after clear', `HTTP ${browserAfter.res.status}`);
  assert(browserAfter.body.results.length === 0, 'cleared browser results should no longer surface active cards', JSON.stringify(browserAfter.body));
  const clearedPayload = JSON.parse(readFileSync(resolve(browserRoot, 'linkedin-results.json'), 'utf-8'));
  assert(Boolean(clearedPayload.clearedAt), 'browser results clear should persist a clearedAt marker', JSON.stringify(clearedPayload));

  console.log('PASS - regression scan-state/application mutation flow');
} catch (err) {
  console.error('FAIL - regression scan-state/application mutation flow');
  console.error(err.stack || err.message);
  if (stdout.trim()) console.error(`\nserver stdout:\n${stdout}`);
  if (stderr.trim()) console.error(`\nserver stderr:\n${stderr}`);
  process.exitCode = 1;
} finally {
  if (server.exitCode == null) server.kill();
  await delay(250);
  rmSync(profileRoot, { recursive: true, force: true });
}
