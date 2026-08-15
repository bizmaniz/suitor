#!/usr/bin/env node
// Cursor is a first-class LLM provider, same jobs as Claude Code: chat and
// scoring. The key lives in the 0600 secrets file (or CURSOR_API_KEY), never
// suitor.config.json.
//
// Never calls the real Cursor API: chat uses SUITOR_CURSOR_STUB. Source-level
// checks cover scoring/tailor routing.

import assert from 'assert/strict';
import { spawn } from 'child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { waitForSuitorServer } from './regression_server_wait.mjs';

const APP_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const serverSource = readFileSync(resolve(APP_ROOT, 'web', 'server.mjs'), 'utf8');
const scanSource = readFileSync(resolve(APP_ROOT, 'scripts', 'verified_scan.mjs'), 'utf8');
const appSource = readFileSync(resolve(APP_ROOT, 'web', 'static', 'app.js'), 'utf8');

assert.match(appSource, /name="provider" value="cursor"/, 'Onboarding wizard should offer Cursor');
assert.match(serverSource, /function streamCursor\(/, 'chat should stream through streamCursor when provider is cursor');
assert.match(
  serverSource,
  /config\.llm\?\.provider === 'cursor'[\s\S]*streamCursor/,
  '/api/chat should route cursor to streamCursor',
);
assert.match(serverSource, /tailorWithCursor|provider === 'cursor'[\s\S]*tailor/, 'Tailor for This JD should notice when Cursor is selected');
assert.match(scanSource, /function runCursorScoring\(/, 'verified scan should score with Cursor when that provider is selected');
assert.match(scanSource, /SUITOR_LLM_PROVIDER/, 'scan process should honor SUITOR_LLM_PROVIDER');

const scanMain = scanSource.slice(scanSource.indexOf('async function main()'));
assert.match(
  scanMain,
  /SUITOR_LLM_PROVIDER[\s\S]*cursor[\s\S]*runCursorScoring/,
  'main() should call runCursorScoring when the selected provider is cursor',
);
assert.doesNotMatch(
  scanMain,
  /try \{\s*result = runClaudeScoring\(fetched\);/,
  'selected-provider scoring must not always try Claude first',
);

const profileRoot = mkdtempSync(join(tmpdir(), 'Suitor-cursor-'));
const configDir = resolve(profileRoot, 'config');
const runtimeRoot = resolve(profileRoot, '.suitor-runtime');
const assessmentsRoot = resolve(profileRoot, 'Assessments');
const personKey = 'Cursor Provider Test';
const port = 23000 + Math.floor(Math.random() * 2000);
const tokenPath = resolve(runtimeRoot, `${personKey.toLowerCase()}.app-token`);

mkdirSync(configDir, { recursive: true });
mkdirSync(runtimeRoot, { recursive: true });
mkdirSync(assessmentsRoot, { recursive: true });
writeFileSync(resolve(profileRoot, 'Candidate Search Profile.md'), '# Candidate Search Profile\n', 'utf8');
writeFileSync(resolve(profileRoot, 'Candidate Search Profile.json'), JSON.stringify({
  targetRoleDirection: { summary: 'Program leadership' },
}, null, 2), 'utf8');
writeFileSync(resolve(profileRoot, 'Job Scan Prompt.md'), '# Job Scan Prompt\n', 'utf8');
writeFileSync(resolve(profileRoot, 'Applications Tracker.md'), '# Applications Tracker\n', 'utf8');
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
  llm: { provider: 'cursor', permissionMode: 'default' },
  intake: {
    tier1: { basics: 'Ready', targetRole: 'Program leadership', logistics: 'Remote', compensation: 'Market' },
    tier2: { experience: 'Verified examples', strengths: 'Execution', voice: 'Direct' },
    tier3: {},
    interview: { responses: {}, classifications: {} },
  },
  connections: { providers: {}, rssFeeds: [], targetCompanies: [] },
}, null, 2), 'utf8');

const stub = resolve(profileRoot, 'cursor-stub.txt');
writeFileSync(stub, 'CURSOR-STUB-REPLY: the selected provider is Cursor.\n', 'utf8');

const server = spawn(process.execPath, ['web/server.mjs'], {
  cwd: APP_ROOT,
  env: {
    ...process.env,
    SUITOR_CONFIG_DIR: configDir,
    SUITOR_PROFILE_ROOT: profileRoot,
    SUITOR_PORT: String(port),
    SUITOR_CURSOR_STUB: stub,
    CURSOR_API_KEY: '',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let stdout = '';
let stderr = '';
server.stdout.on('data', chunk => { stdout += chunk.toString(); });
server.stderr.on('data', chunk => { stderr += chunk.toString(); });

function headers(token) {
  return { 'X-Suitor-App-Token': token, 'Content-Type': 'application/json' };
}

try {
  const token = await waitForSuitorServer({
    port,
    tokenPath,
    child: server,
    getOutput: () => `${stdout}\n${stderr}`,
  });

  const envCheck = await fetch(`http://127.0.0.1:${port}/api/env-check`, { headers: headers(token) });
  const envBody = await envCheck.json();
  assert.equal(envCheck.status, 200);
  assert.equal(envBody.cursor?.configured, false, 'cursor is not configured until a key is stored');

  const saved = await fetch(`http://127.0.0.1:${port}/api/cursor`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({ apiKey: 'cursor-test-key' }),
  });
  const savedBody = await saved.json();
  assert.equal(saved.status, 200, JSON.stringify(savedBody));
  assert.equal(savedBody.configured, true);
  assert.doesNotMatch(JSON.stringify(savedBody), /cursor-test-key/, 'API must not echo the Cursor key');

  const configJson = readFileSync(resolve(configDir, 'suitor.config.json'), 'utf8');
  assert.doesNotMatch(configJson, /cursor-test-key/, 'Cursor key must not be written to suitor.config.json');

  const secretsPath = resolve(runtimeRoot, 'provider-secrets.json');
  const secrets = JSON.parse(readFileSync(secretsPath, 'utf8'));
  assert.equal(secrets.cursor?.apiKey, 'cursor-test-key');
  assert.equal((await import('fs')).statSync(secretsPath).mode & 0o777, 0o600);

  const envAfter = await (await fetch(`http://127.0.0.1:${port}/api/env-check`, { headers: headers(token) })).json();
  assert.equal(envAfter.cursor?.configured, true, 'env-check reflects the stored Cursor key');
  assert.doesNotMatch(JSON.stringify(envAfter), /cursor-test-key/, 'env-check must not leak the key');

  const chat = await fetch(`http://127.0.0.1:${port}/api/chat`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({ message: 'What provider is backing you?' }),
  });
  assert.equal(chat.status, 200);
  const chatText = await chat.text();
  assert.match(chatText, /CURSOR-STUB-REPLY/, 'cursor provider chat should use the stub, not Claude or Codex');
} finally {
  server.kill('SIGTERM');
  try { rmSync(profileRoot, { recursive: true, force: true }); } catch {}
}

console.log('regression_cursor_provider passed');
