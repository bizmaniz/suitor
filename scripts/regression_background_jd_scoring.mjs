#!/usr/bin/env node
// Background JD scoring: POST /api/score-jd enqueues and returns immediately.
// The queue, concurrency cap, and GET/retry live in web/server.mjs.
//
// Never spends a model token: SUITOR_JD_SCORING_SCRIPT points every job at a
// local stub. Runs against a throwaway profile root in the OS temp dir.

import assert from 'assert/strict';
import { spawn } from 'child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { DatabaseSync } from 'node:sqlite';
import { identityKey, openJobDb, upsertScoredRole } from '../web/job_db.mjs';
import { delay, waitForSuitorServer } from './regression_server_wait.mjs';

const APP_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const profileRoot = mkdtempSync(join(tmpdir(), 'Suitor-bgjd-'));
const runtimeRoot = resolve(profileRoot, '.suitor-runtime');
const jobDbPath = resolve(runtimeRoot, 'suitor.sqlite');
const personKey = 'BgJd Test';
const candidateFirst = 'Test Candidate';

function assertTrue(condition, message, evidence = '') {
  if (!condition) throw new Error(`${message}${evidence ? `\n${evidence}` : ''}`);
}

function writeProfileFiles() {
  mkdirSync(runtimeRoot, { recursive: true });
  mkdirSync(resolve(profileRoot, 'Applications'), { recursive: true });
  mkdirSync(resolve(profileRoot, 'Assessments'), { recursive: true });
  writeFileSync(resolve(profileRoot, 'Candidate Search Profile.md'), '# Candidate Search Profile - Test Candidate\n', 'utf-8');
  writeFileSync(resolve(profileRoot, 'Candidate Search Profile.json'), JSON.stringify({
    scoring: { thresholds: { shortlist: 80, manual_review_min: 55, reject_below: 55 } },
  }, null, 2), 'utf-8');
  writeFileSync(resolve(profileRoot, 'Job Scan Prompt.md'), '# Job Scan Prompt - Test Candidate\n', 'utf-8');
  writeFileSync(resolve(profileRoot, 'Applications Tracker.md'), '# Applications Tracker - Test Candidate\n\n## Active Applications\n', 'utf-8');
}

const stubScoringScript = resolve(profileRoot, 'stub-verified-scan.mjs');
writeFileSync(stubScoringScript, [
  `import { readFileSync } from 'fs';`,
  `import { resolve } from 'path';`,
  `import { openJobDb, upsertScoredRole } from ${JSON.stringify(resolve(APP_ROOT, 'web', 'job_db.mjs'))};`,
  `function cliArg(name) { const i = process.argv.indexOf('--' + name); return i >= 0 ? process.argv[i + 1] : ''; }`,
  `async function main() {`,
  `  const text = readFileSync(cliArg('jd-file'), 'utf-8');`,
  `  const delayMatch = text.match(/STUB_DELAY_MS:(\\d+)/);`,
  `  if (delayMatch) await new Promise(r => setTimeout(r, Number(delayMatch[1])));`,
  `  if (text.includes('STUB_FAIL')) { console.error('stub scoring failure: STUB_FAIL marker present'); process.exit(1); }`,
  `  const db = openJobDb(resolve(process.env.SUITOR_RUNTIME_ROOT, 'suitor.sqlite'));`,
  `  try {`,
  `    upsertScoredRole(db, { company: cliArg('company'), role: cliArg('role'), url: cliArg('url') || '', score: 77, scoreText: 'Role 20/25, Environment 15/20, Compensation 15/20, Lifestyle 10/15, Growth 8/10, Risk 9/10 = 77 (stub)' });`,
  `  } finally { db.close(); }`,
  `  console.log('stub scoring complete');`,
  `}`,
  `main().catch(err => { console.error(err.message); process.exit(1); });`,
].join('\n'), 'utf-8');

function seedNeedsJdRole(company, role) {
  const db = openJobDb(jobDbPath);
  try {
    upsertScoredRole(db, {
      company, role, title: `${role} - ${company}`, url: '',
      source: 'LinkedIn', location: '', comp: '', score: null, scoreText: 'withheld - needs full JD',
    });
  } finally {
    db.close();
  }
}

function jobsRowCount(company, role) {
  const db = new DatabaseSync(jobDbPath, { readOnly: true });
  try {
    return Number(db.prepare('SELECT COUNT(*) AS n FROM jobs WHERE normalized_company = ? AND normalized_role = ?')
      .get(identityKey(company), identityKey(role))?.n || 0);
  } finally {
    db.close();
  }
}

function pastedJdFileCount() {
  return readdirSync(runtimeRoot).filter(name => name.startsWith('pasted-jd-')).length;
}

async function api(token, port, path, options = {}) {
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

function scoreJd(token, port, { company, role, jdText, url = '' }) {
  return api(token, port, '/api/score-jd', { method: 'POST', body: JSON.stringify({ company, role, jdText, url }) });
}

function retryJd(token, port, identity) {
  return api(token, port, '/api/score-jd/retry', { method: 'POST', body: JSON.stringify({ identity }) });
}

async function jobsFor(token, port) {
  const { body } = await api(token, port, '/api/jd-jobs');
  return body.jobs || [];
}

async function waitForJobs(token, port, predicate, timeoutMs = 10000, label = 'jobs to reach expected state') {
  const deadline = Date.now() + timeoutMs;
  let lastJobs = [];
  while (Date.now() < deadline) {
    lastJobs = await jobsFor(token, port);
    if (predicate(lastJobs)) return lastJobs;
    await delay(150);
  }
  throw new Error(`Timed out waiting for ${label}\n${JSON.stringify(lastJobs)}`);
}

function longText(prefix) {
  return `${prefix} ${'padding text to clear the 120 character minimum length check. '.repeat(3)}`;
}

writeProfileFiles();
seedNeedsJdRole('Alpha Robotics', 'Fleet Lead');
seedNeedsJdRole('Beta Systems', 'Ops Manager');
seedNeedsJdRole('Gamma Freight', 'Logistics Lead');
seedNeedsJdRole('Delta Analytics', 'Data Lead');
seedNeedsJdRole('Epsilon Health', 'Clinical Ops Lead');
seedNeedsJdRole('Zeta Networks', 'Field Engineer');

function spawnServer(port) {
  const server = spawn(process.execPath, ['web/server.mjs'], {
    cwd: APP_ROOT,
    env: {
      ...process.env,
      SUITOR_CONFIG_DIR: resolve(profileRoot, '.suitor-config'),
      SUITOR_PERSON_KEY: personKey,
      SUITOR_PROFILE_ROOT: profileRoot,
      SUITOR_PORT: String(port),
      SUITOR_CANDIDATE_NAME: 'Sample Candidate',
      SUITOR_CANDIDATE_FIRST: candidateFirst,
      SUITOR_ASSISTANT_NAME: 'Assistant',
      SUITOR_JD_SCORING_SCRIPT: stubScoringScript,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  server.stdout.on('data', chunk => { stdout += chunk.toString(); });
  server.stderr.on('data', chunk => { stderr += chunk.toString(); });
  return { server, getOutput: () => `${stdout}\n${stderr}`, getStdout: () => stdout, getStderr: () => stderr };
}

async function stopServer(server) {
  if (server.exitCode == null && server.signalCode == null) {
    server.kill();
    await new Promise(resolveDone => server.once('exit', resolveDone));
  }
}

const port = 21000 + Math.floor(Math.random() * 2000);
const tokenPath = resolve(runtimeRoot, `${personKey.toLowerCase()}.app-token`);
let failed = false;
let first;

try {
  first = spawnServer(port);
  const token = await waitForSuitorServer({ port, tokenPath, child: first.server, getOutput: first.getOutput });

  const serverSource = readFileSync(resolve(APP_ROOT, 'web', 'server.mjs'), 'utf-8');
  assert.match(serverSource, /const JD_JOB_CONCURRENCY = 2;/, 'JD_JOB_CONCURRENCY should be the documented cap of 2 - update this test deliberately if that cap is ever revisited');

  const slow = { jdText: longText('STUB_DELAY_MS:2000') };
  const submitA1 = await scoreJd(token, port, { company: 'Alpha Robotics', role: 'Fleet Lead', ...slow });
  const submitA2 = await scoreJd(token, port, { company: 'Beta Systems', role: 'Ops Manager', ...slow });
  const submitA3 = await scoreJd(token, port, { company: 'Gamma Freight', role: 'Logistics Lead', ...slow });
  for (const [label, submission] of [['Alpha', submitA1], ['Beta', submitA2], ['Gamma', submitA3]]) {
    assertTrue(submission.res.status === 202, `${label} submission should be accepted (202)`, JSON.stringify(submission.body));
  }
  const jobsRightAfterSubmit = await jobsFor(token, port);
  const runningCount = jobsRightAfterSubmit.filter(job => job.status === 'running').length;
  const queuedCount = jobsRightAfterSubmit.filter(job => job.status === 'queued').length;
  assert.equal(runningCount, 2, 'exactly 2 jobs should be running at once (the concurrency cap)');
  assert.equal(queuedCount, 1, 'the 3rd simultaneous submission should be queued, not spawned as a 3rd child process');
  console.log('PASS - A1: 3 simultaneous submissions leave exactly 2 running and 1 queued (concurrency cap enforced)');

  await waitForJobs(token, port, jobs => (
    !jobs.find(j => j.company === 'Alpha Robotics') &&
    !jobs.find(j => j.company === 'Beta Systems') &&
    !jobs.find(j => j.company === 'Gamma Freight')
  ), 15000, 'all 3 queued jobs to finish (disappear on success)');
  for (const [company, role] of [['Alpha Robotics', 'Fleet Lead'], ['Beta Systems', 'Ops Manager'], ['Gamma Freight', 'Logistics Lead']]) {
    assert.equal(jobsRowCount(company, role), 1, `${company} should have exactly one jobs row (no duplicate created by the queue)`);
  }
  const { body: boardAfterA } = await api(token, port, '/api/board');
  for (const [company, role] of [['Alpha Robotics', 'Fleet Lead'], ['Beta Systems', 'Ops Manager'], ['Gamma Freight', 'Logistics Lead']]) {
    const row = (boardAfterA.roles || []).find(r => r.company === company && r.role === role);
    assert.equal(row?.score, 77, `${company}/${role} should have persisted the stub's real score once its queued turn came up`, JSON.stringify(row));
  }
  console.log('PASS - A2: all 3 queued jobs eventually run and persist their score, including the one that had to wait for a free slot');

  const firstDelta = await scoreJd(token, port, { company: 'Delta Analytics', role: 'Data Lead', jdText: longText('STUB_DELAY_MS:1500') });
  assert.equal(firstDelta.res.status, 202, 'the first Delta submission should be accepted', JSON.stringify(firstDelta.body));
  const dupeDelta = await scoreJd(token, port, { company: 'Delta Analytics', role: 'Data Lead', jdText: longText('a second, different paste for the same role') });
  assert.equal(dupeDelta.res.status, 409, 'resubmitting the same identity while it is already queued/running should be rejected (409), not silently queued twice', JSON.stringify(dupeDelta.body));
  assert.match(String(dupeDelta.body?.error || ''), /Already scoring/, 'the 409 should say plainly that this role is already being scored');
  await waitForJobs(token, port, jobs => !jobs.find(j => j.company === 'Delta Analytics'), 10000, 'the Delta job to finish');
  assert.equal(jobsRowCount('Delta Analytics', 'Data Lead'), 1, 'only one jobs row should exist - the duplicate submission must never have spawned a second child process');
  console.log('PASS - B: a duplicate submission for a role already queued/running is rejected with 409 and never spawns a second child process');

  const filesBeforeEpsilon = pastedJdFileCount();
  const epsilonSubmit = await scoreJd(token, port, { company: 'Epsilon Health', role: 'Clinical Ops Lead', jdText: longText('STUB_FAIL') });
  assert.equal(epsilonSubmit.res.status, 202, 'a submission that will go on to fail in the BACKGROUND should still be accepted at submit time', JSON.stringify(epsilonSubmit.body));
  const [epsilonFailed] = await waitForJobs(token, port, jobs => jobs.some(j => j.company === 'Epsilon Health' && j.status === 'error'), 10000, 'the Epsilon job to fail')
    .then(jobs => jobs.filter(j => j.company === 'Epsilon Health'));
  assert.match(epsilonFailed.error, /STUB_FAIL marker present/, 'the job record should carry the real failure reason from the child process');
  assertTrue(pastedJdFileCount() > filesBeforeEpsilon, 'the pasted JD\'s temp file must still be on disk after a failure - it is the owner\'s work and must not be discarded');
  console.log('PASS - C1: a background failure is reported on the job record (not silent) and its pasted text is kept on disk, not deleted');

  const epsilonRetry = await retryJd(token, port, epsilonFailed.identity);
  assert.equal(epsilonRetry.res.status, 202, 'retrying a failed job should be accepted', JSON.stringify(epsilonRetry.body));
  await waitForJobs(token, port, jobs => jobs.some(j => j.company === 'Epsilon Health' && j.status === 'error'), 10000, 'the retried Epsilon job to fail again (same STUB_FAIL text)');
  console.log('PASS - C2: /api/score-jd/retry re-runs the SAME on-disk pasted text (still marked STUB_FAIL, so it fails again) without the caller ever resending it');

  const filesBeforeSupersede = pastedJdFileCount();
  const epsilonFresh = await scoreJd(token, port, { company: 'Epsilon Health', role: 'Clinical Ops Lead', jdText: longText('a clean resubmission with no failure marker') });
  assert.equal(epsilonFresh.res.status, 202, 'a fresh Add JD submission over a previously-failed job should be accepted, not blocked as a duplicate', JSON.stringify(epsilonFresh.body));
  await waitForJobs(token, port, jobs => !jobs.find(j => j.company === 'Epsilon Health'), 10000, 'the fresh Epsilon submission to succeed');
  const { body: boardAfterEpsilon } = await api(token, port, '/api/board');
  const epsilonRow = (boardAfterEpsilon.roles || []).find(r => r.company === 'Epsilon Health' && r.role === 'Clinical Ops Lead');
  assert.equal(epsilonRow?.score, 77, 'the fresh submission should score normally once it supersedes the failed one', JSON.stringify(epsilonRow));
  assertTrue(pastedJdFileCount() <= filesBeforeSupersede, 'superseding a failed job with a fresh paste should clean up the old temp file, not accumulate one per attempt', `before=${filesBeforeSupersede} after=${pastedJdFileCount()}`);
  console.log('PASS - C3: a fresh Add JD submission supersedes a previously-failed job and cleans up its now-unneeded temp file');

  const zetaSubmit = await scoreJd(token, port, { company: 'Zeta Networks', role: 'Field Engineer', jdText: longText('STUB_DELAY_MS:6000') });
  assert.equal(zetaSubmit.res.status, 202, 'the Zeta submission should be accepted', JSON.stringify(zetaSubmit.body));
  await waitForJobs(token, port, jobs => jobs.some(j => j.company === 'Zeta Networks' && j.status === 'running'), 5000, 'the Zeta job to start running');
  console.log('PASS - D1: the Zeta job is genuinely running (a real, if stubbed, child process) when the server is about to be killed');

  await stopServer(first.server);
  assertTrue(jobsRowCount('Zeta Networks', 'Field Engineer') === 1, 'the Zeta jobs row should still exist exactly once after the restart, unmodified');
  const rawDb = new DatabaseSync(jobDbPath, { readOnly: true });
  let zetaRawScore;
  try {
    zetaRawScore = rawDb.prepare('SELECT score, typeof(score) AS score_type FROM jobs WHERE normalized_company = ? AND normalized_role = ?')
      .get(identityKey('Zeta Networks'), identityKey('Field Engineer'));
  } finally {
    rawDb.close();
  }
  assert.equal(zetaRawScore?.score_type, 'null', 'the killed-mid-scoring role must still read as NULL (unscored), never a partial or corrupted value');

  const secondPort = port + 1;
  const second = spawnServer(secondPort);
  try {
    const secondToken = await waitForSuitorServer({ port: secondPort, tokenPath, child: second.server, getOutput: second.getOutput });
    const jobsOnFreshServer = await jobsFor(secondToken, secondPort);
    assertTrue(!jobsOnFreshServer.some(j => j.company === 'Zeta Networks'), 'a job that was running when the OLD server process died must not reappear on a NEW server instance - this is the deliberate in-memory-only design, not a bug', JSON.stringify(jobsOnFreshServer));
    console.log('PASS - D2: the in-flight job from the killed server does not appear on a freshly-started server (state is deliberately in-memory, not persisted)');

    const { body: boardOnFreshServer } = await api(secondToken, secondPort, '/api/board');
    const zetaOnFreshServer = (boardOnFreshServer.roles || []).find(r => r.company === 'Zeta Networks' && r.role === 'Field Engineer');
    assertTrue(Boolean(zetaOnFreshServer) && zetaOnFreshServer.score == null, 'the role must still read as a plain, unscored "needs JD" card on the new server - not stuck, not corrupted', JSON.stringify(zetaOnFreshServer));

    const zetaResubmit = await scoreJd(secondToken, secondPort, { company: 'Zeta Networks', role: 'Field Engineer', jdText: longText('a clean resubmission after the restart') });
    assert.equal(zetaResubmit.res.status, 202, 'resubmitting the same role on the new server must succeed normally - a restart must never leave a card permanently unable to be scored', JSON.stringify(zetaResubmit.body));
    await waitForJobs(secondToken, secondPort, jobs => !jobs.find(j => j.company === 'Zeta Networks'), 10000, 'the post-restart Zeta resubmission to finish');
    const { body: boardFinal } = await api(secondToken, secondPort, '/api/board');
    const zetaFinal = (boardFinal.roles || []).find(r => r.company === 'Zeta Networks' && r.role === 'Field Engineer');
    assert.equal(zetaFinal?.score, 77, 'the resubmitted role should score normally, proving the card was never permanently stuck', JSON.stringify(zetaFinal));
    console.log('PASS - D3: the role is a plain, resubmittable needs-JD card after the restart - never permanently stuck - and scores normally once resubmitted');
  } finally {
    await stopServer(second.server);
  }

  console.log('regression_background_jd_scoring passed');
} catch (err) {
  failed = true;
  console.error('FAIL - regression_background_jd_scoring');
  console.error(err.stack || err.message);
  if (first) {
    if (first.getStdout().trim()) console.error(`\nfirst server stdout:\n${first.getStdout()}`);
    if (first.getStderr().trim()) console.error(`\nfirst server stderr:\n${first.getStderr()}`);
  }
} finally {
  if (first) await stopServer(first.server);
  rmSync(profileRoot, { recursive: true, force: true });
}

if (failed) process.exitCode = 1;
