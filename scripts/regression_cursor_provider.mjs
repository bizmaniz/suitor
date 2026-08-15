#!/usr/bin/env node
// Behavior tests for the Cursor provider: key lifecycle, inlined profile/JD
// context, provider isolation, scoring routing, and model validation.
// Never calls the real Cursor API. Chat uses SUITOR_CURSOR_STUB.

import assert from 'assert/strict';
import { spawn } from 'child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { waitForSuitorServer } from './regression_server_wait.mjs';
import { childEnvForCli, childEnvForCursorScan, privateFileIsRestricted } from '../web/provider_secrets.mjs';
import { validateCursorModel } from '../web/cursor_agent.mjs';
import { runSelectedScoring } from '../web/llm_routing.mjs';

const APP_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

validateCursorModel('composer-2.5');
assert.throws(() => validateCursorModel('not a model!!!!'), /Invalid Cursor model/);

const cliEnv = childEnvForCli({ PATH: '/usr/bin', CURSOR_API_KEY: 'should-not-leak', HOME: '/tmp' }, { provider: 'openai' });
assert.equal(cliEnv.CURSOR_API_KEY, undefined, 'CLI children must not receive CURSOR_API_KEY');
assert.equal(cliEnv.SUITOR_LLM_PROVIDER, 'openai');

const scanEnv = childEnvForCursorScan({ PATH: '/usr/bin' }, { cursorKey: 'cursor-scan-key', provider: 'cursor' });
assert.equal(scanEnv.CURSOR_API_KEY, 'cursor-scan-key', 'Cursor scoring child should receive the key');
const openaiScan = childEnvForCursorScan({ PATH: '/usr/bin', CURSOR_API_KEY: 'nope' }, { cursorKey: 'cursor-scan-key', provider: 'openai' });
assert.equal(openaiScan.CURSOR_API_KEY, undefined, 'non-Cursor scoring must not receive the key');

let cursorCalls = 0;
let codexCalls = 0;
const cursorJson = JSON.stringify({ rows: [{ title: 'Role', company: 'Acme', url: 'https://example.com', score: 80 }], notes: 'cursor' });
const cursorOk = await runSelectedScoring({
  provider: 'cursor',
  fetched: [{ title: 'Role' }],
  runCursor: async () => { cursorCalls += 1; return JSON.parse(cursorJson); },
  runCodex: async () => { codexCalls += 1; throw new Error('Codex should not run'); },
  fallback: (fetched, reason) => ({ rows: [], notes: reason }),
});
assert.equal(cursorCalls, 1);
assert.equal(codexCalls, 0);
assert.equal(cursorOk.notes, 'cursor');

cursorCalls = 0;
codexCalls = 0;
const anthropic = await runSelectedScoring({
  provider: 'anthropic',
  fetched: [{ title: 'Role' }],
  runCursor: async () => { cursorCalls += 1; return {}; },
  runCodex: async () => { codexCalls += 1; throw new Error('Codex should not run'); },
  fallback: (fetched, reason) => ({ rows: fetched.map(() => ({ score: null })), notes: reason }),
});
assert.equal(cursorCalls, 0);
assert.equal(codexCalls, 0);
assert.match(anthropic.notes, /Claude|not available|fallback/i);

cursorCalls = 0;
codexCalls = 0;
const cursorFail = await runSelectedScoring({
  provider: 'cursor',
  fetched: [{ title: 'Role' }],
  runCursor: async () => { cursorCalls += 1; throw new Error('stub scoring exploded'); },
  runCodex: async () => { codexCalls += 1; throw new Error('Codex should not run'); },
  fallback: (fetched, reason) => ({ rows: fetched.map(() => ({ score: null })), notes: reason }),
});
assert.equal(cursorCalls, 1);
assert.equal(codexCalls, 0);
assert.match(cursorFail.notes, /Cursor scoring failed/);
assert.match(cursorFail.notes, /not taken from Claude or Codex/);

const profileRoot = mkdtempSync(join(tmpdir(), 'Suitor-cursor-'));
const configDir = resolve(profileRoot, 'config');
const runtimeRoot = resolve(profileRoot, '.suitor-runtime');
const assessmentsRoot = resolve(profileRoot, 'Assessments');
const personKey = 'Cursor Provider Test';
const port = 23000 + Math.floor(Math.random() * 2000);
const tokenPath = resolve(runtimeRoot, `${personKey.toLowerCase()}.app-token`);
const capturePrompt = resolve(profileRoot, 'captured-cursor-prompt.txt');
const jdExtract = resolve(profileRoot, 'jd-extract.txt');

mkdirSync(configDir, { recursive: true });
mkdirSync(runtimeRoot, { recursive: true });
mkdirSync(assessmentsRoot, { recursive: true });
writeFileSync(resolve(profileRoot, 'Candidate Search Profile.md'), '# Candidate Search Profile\nPROFILE-TOKEN-ORANGE-KITE\n', 'utf8');
writeFileSync(resolve(profileRoot, 'Candidate Search Profile.json'), JSON.stringify({
  targetRoleDirection: { summary: 'Program leadership' },
}, null, 2), 'utf8');
writeFileSync(resolve(profileRoot, 'Job Scan Prompt.md'), '# Job Scan Prompt\n', 'utf8');
writeFileSync(resolve(profileRoot, 'Applications Tracker.md'), '# Applications Tracker\nTRACKER-TOKEN-BLUE-LANTERN\n', 'utf8');
writeFileSync(jdExtract, 'Visible JD text JD-TOKEN-GREEN-FERRY for analysis only.\n', 'utf8');
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
    SUITOR_CURSOR_CAPTURE_PROMPT: capturePrompt,
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
  assert.equal(privateFileIsRestricted(secretsPath), true, 'secrets file must be owner-restricted on this platform');

  const envAfter = await (await fetch(`http://127.0.0.1:${port}/api/env-check`, { headers: headers(token) })).json();
  assert.equal(envAfter.cursor?.configured, true, 'env-check reflects the stored Cursor key');
  assert.doesNotMatch(JSON.stringify(envAfter), /cursor-test-key/, 'env-check must not leak the key');
  assert.match(String(envAfter.cursor?.hint || ''), /curs/);

  const replaced = await fetch(`http://127.0.0.1:${port}/api/cursor`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({ apiKey: 'cursor-replacement-key' }),
  });
  const replacedBody = await replaced.json();
  assert.equal(replaced.status, 200, JSON.stringify(replacedBody));
  const afterReplace = JSON.parse(readFileSync(secretsPath, 'utf8'));
  assert.equal(afterReplace.cursor?.apiKey, 'cursor-replacement-key');
  assert.notEqual(afterReplace.cursor?.apiKey, 'cursor-test-key');
  assert.doesNotMatch(JSON.stringify(replacedBody), /cursor-replacement-key/);

  const emptyKeep = await fetch(`http://127.0.0.1:${port}/api/cursor`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({ apiKey: '' }),
  });
  assert.equal(emptyKeep.status, 200);
  const afterEmpty = JSON.parse(readFileSync(secretsPath, 'utf8'));
  assert.equal(afterEmpty.cursor?.apiKey, 'cursor-replacement-key', 'empty apiKey without clear must not wipe');

  const cleared = await fetch(`http://127.0.0.1:${port}/api/cursor`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({ clear: true }),
  });
  const clearedBody = await cleared.json();
  assert.equal(cleared.status, 200, JSON.stringify(clearedBody));
  assert.equal(clearedBody.configured, false);
  const afterClear = JSON.parse(readFileSync(secretsPath, 'utf8'));
  assert.equal(afterClear.cursor?.apiKey, undefined);

  const chat = await fetch(`http://127.0.0.1:${port}/api/chat`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({
      message: 'What provider is backing you? Review the attached JD.',
      attachments: [{
        name: 'sample-jd.txt',
        path: jdExtract,
        textPath: jdExtract,
      }],
    }),
  });
  assert.equal(chat.status, 200);
  const chatText = await chat.text();
  assert.match(chatText, /CURSOR-STUB-REPLY/, 'cursor provider chat should use the stub, not Claude or Codex');
  assert.doesNotMatch(chatText, /\[stream error\]|The assistant stream stopped/, 'response should not look like a Claude/Codex hang');

  const captured = readFileSync(capturePrompt, 'utf8');
  assert.match(captured, /PROFILE-TOKEN-ORANGE-KITE/, 'Cursor prompt must include the live profile text');
  assert.match(captured, /TRACKER-TOKEN-BLUE-LANTERN/, 'Cursor prompt must include the live tracker text');
  assert.match(captured, /JD-TOKEN-GREEN-FERRY/, 'Cursor prompt must include the attached JD text, not only a path');
} finally {
  server.kill('SIGTERM');
  try { rmSync(profileRoot, { recursive: true, force: true }); } catch {}
}

console.log('regression_cursor_provider passed');
