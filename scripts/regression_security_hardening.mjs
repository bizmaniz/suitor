#!/usr/bin/env node

import assert from 'assert/strict';
import { spawn } from 'child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import { request as httpRequest } from 'http';
import { tmpdir } from 'os';
import { dirname, join, relative, resolve } from 'path';
import { fileURLToPath } from 'url';
import { delay, waitForSuitorServer } from './regression_server_wait.mjs';

const APP_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

function isUnder(child, parent) {
  const rel = relative(parent, child);
  return child === parent || (Boolean(rel) && !rel.startsWith('..') && !rel.includes(':'));
}

async function postJson({ port, token, path, value, headers = {} }) {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Suitor-App-Token': token, ...headers },
    body: JSON.stringify(value),
  });
  const body = await res.json().catch(async () => ({ raw: await res.text().catch(() => '') }));
  return { res, body };
}

async function getJson({ port, token, path }) {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    headers: { 'X-Suitor-App-Token': token },
  });
  const body = await res.json().catch(async () => ({ raw: await res.text().catch(() => '') }));
  return { res, body };
}

async function rawJsonRequest({ port, path, value, headers = {} }) {
  const body = JSON.stringify(value);
  return await new Promise((resolvePromise, reject) => {
    const req = httpRequest({
      hostname: '127.0.0.1',
      port,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        ...headers,
      },
    }, res => {
      let text = '';
      res.setEncoding('utf-8');
      res.on('data', chunk => { text += chunk; });
      res.on('end', () => {
        let parsed = {};
        try { parsed = JSON.parse(text || '{}'); } catch { parsed = { raw: text }; }
        resolvePromise({ res, body: parsed });
      });
    });
    req.on('error', reject);
    req.end(body);
  });
}

function assertAgentSandboxSource() {
  const source = readFileSync(resolve(APP_ROOT, 'web', 'server.mjs'), 'utf-8');
  const claudeStart = source.indexOf('function streamClaude');
  const codexStart = source.indexOf('function streamCodex');
  const claudeBlock = source.slice(claudeStart, codexStart);
  const codexBlock = source.slice(codexStart, source.indexOf('function streamLocalAction'));
  assert.match(source, /const CLAUDE_PERMISSION_MODE = config\.llm\?\.permissionMode \|\| 'default'/);
  assert.doesNotMatch(source, /acceptEdits|accept-edits|autoAccept|auto-accept/i);
  assert.match(claudeBlock, /--permission-mode', CLAUDE_PERMISSION_MODE/);
  assert.match(claudeBlock, /spawn\(claudeBin, args, \{ cwd: PROFILE_ROOT/);
  assert.doesNotMatch(claudeBlock, /cwd: APP_ROOT/);
  assert.match(codexBlock, /'--sandbox', 'read-only'/);
  assert.match(codexBlock, /spawn\(resolveCodexBin\(\), args, \{ cwd: PROFILE_ROOT/);
  assert.match(source, /function resolvePythonBin\(\)/);
  assert.match(source, /for \(const bin of \['python3', 'python'\]\)/);
  assert.doesNotMatch(source, /spawn\('python'/);
  assert.match(source, /SUITOR_PROFILE_ROOT: PROFILE_ROOT/);
  assert.match(source, /SUITOR_RUNTIME_ROOT: DATA_ROOT/);
  assert.match(source, /SUITOR_PORTALS_PATH: resolve\(PROFILE_ROOT, 'portals\.yml'\)/);
  assert.match(source, /function streamProcess\(command, args, res\)[\s\S]*env: localClaudeEnv\(\)/);
  assert.match(source, /function safeSpawnPath\(pathValue, root, label\)/);
  assert.match(source, /spawn\(pythonBin, \['--', packageScriptPath\('generate_tailored_package\.py'\), inputPath\]/);
  assert.match(source, /spawn\(pythonBin, \['--', packageScriptPath\('generate_profile_package\.py'\), inputPath\]/);
  assert.doesNotMatch(source, /hostname\.includes\('linkedin\.com'\)|host\.includes\('lever\.co'\)|host\.endsWith\('greenhouse\.io'\)/);
  assert.doesNotMatch(source, /raw\.replaceAll\('\/', '\\\\'\)/);
}

async function assertUploadPathSafety() {
  const profileRoot = mkdtempSync(join(tmpdir(), 'suitor-security-profile-'));
  const configDir = mkdtempSync(join(tmpdir(), 'suitor-security-config-'));
  const port = 21000 + Math.floor(Math.random() * 2000);
  const runtimeRoot = resolve(profileRoot, '.suitor-runtime');
  const personKey = 'security';
  const tokenPath = resolve(runtimeRoot, `${personKey.toLowerCase()}.app-token`);
  const outsideMarker = resolve(dirname(profileRoot), 'suitor-python-injection-marker.txt');
  const child = spawn(process.execPath, ['web/server.mjs'], {
    cwd: APP_ROOT,
    env: {
      ...process.env,
      SUITOR_CONFIG_DIR: configDir,
      SUITOR_PERSON_KEY: personKey,
      SUITOR_PROFILE_ROOT: profileRoot,
      SUITOR_PORT: String(port),
      SUITOR_CANDIDATE_NAME: 'Security Candidate',
      SUITOR_CANDIDATE_FIRST: 'Security',
      SUITOR_ASSISTANT_NAME: 'Assistant',
      SUITOR_MAX_PDF_BYTES: '1024',
      SUITOR_EXTRACTION_TIMEOUT_MS: '5000',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk.toString(); });
  child.stderr.on('data', chunk => { stderr += chunk.toString(); });
  try {
    const token = await waitForSuitorServer({
      port,
      tokenPath,
      child,
      getOutput: () => `${stdout}\n${stderr}`,
    });
    const foreignOrigin = await postJson({
      port,
      token,
      path: '/api/resume-preview',
      headers: { Origin: 'https://evil.example' },
      value: { markdown: 'cross-site update should fail' },
    });
    assert.equal(foreignOrigin.res.status, 403, JSON.stringify(foreignOrigin.body));
    assert.match(foreignOrigin.body.error, /cross-site request rejected/i);

    const sameOrigin = await postJson({
      port,
      token,
      path: '/api/resume-preview',
      headers: { Origin: `http://127.0.0.1:${port}` },
      value: { markdown: 'same-origin update should pass' },
    });
    assert.equal(sameOrigin.res.status, 200, JSON.stringify(sameOrigin.body));

    const txtUpload = await postJson({
      port,
      token,
      path: '/api/upload',
      value: {
        name: '../escape.txt',
        dataUrl: `data:text/plain;base64,${Buffer.from('escape check').toString('base64')}`,
      },
    });
    assert.equal(txtUpload.res.status, 200, JSON.stringify(txtUpload.body));
    assert.ok(isUnder(resolve(txtUpload.body.path), resolve(runtimeRoot, 'uploads')), `upload escaped root: ${txtUpload.body.path}`);
    assert.ok(!existsSync(resolve(dirname(profileRoot), 'escape.txt')), 'relative upload filename escaped profile parent');

    const maliciousName = `resume''';open(r'${outsideMarker.replaceAll('\\', '\\\\')}','w').write('pwn');'''.pdf`;
    const pdfUpload = await postJson({
      port,
      token,
      path: '/api/upload',
      value: {
        name: maliciousName,
        dataUrl: `data:application/pdf;base64,${Buffer.from('%PDF-1.4\nnot a real pdf\n').toString('base64')}`,
      },
    });
    assert.equal(pdfUpload.res.status, 422, JSON.stringify(pdfUpload.body));
    assert.match(pdfUpload.body.error, /extraction failed cleanly|Python is not available|No module named/i);
    assert.ok(!existsSync(outsideMarker), 'malicious pdf filename executed injected Python');

    const oversizedUpload = await postJson({
      port,
      token,
      path: '/api/upload',
      value: {
        name: 'oversized.pdf',
        dataUrl: `data:application/pdf;base64,${Buffer.alloc(2048, 0x25).toString('base64')}`,
      },
    });
    assert.equal(oversizedUpload.res.status, 422, JSON.stringify(oversizedUpload.body));
    assert.match(oversizedUpload.body.error, /too large/i);

    const onboarding = await postJson({
      port,
      token,
      path: '/api/onboarding',
      value: {
        assistantName: 'Assistant',
        intake: {
          tier1: {
            basics: 'Security Candidate',
            targetRole: 'Security Operations',
            logistics: 'Remote',
            compensation: 'Market',
          },
          tier2: {},
          tier3: {},
        },
        connections: {
          providers: { greenhouse: true, lever: true, ashby: true, rss: true },
          rssFeeds: ['https://example.com/jobs.xml'],
          targetCompanies: ['Example Labs'],
        },
        onboarded: true,
      },
    });
    assert.equal(onboarding.res.status, 200, JSON.stringify(onboarding.body));
    assert.equal(onboarding.body.status.scanningUnlocked, true, JSON.stringify(onboarding.body.status));
    assert.equal(onboarding.body.status.tailoringUnlocked, false, JSON.stringify(onboarding.body.status));

    const richIntake = await postJson({
      port,
      token,
      path: '/api/onboarding',
      value: {
        assistantName: 'Assistant',
        intake: {
          tier1: {
            basics: 'Security Candidate',
            targetRole: 'Security operations and automation leadership',
            logistics: 'Remote US time zones',
            compensation: 'Market floor required',
          },
          tier2: {
            experience: 'Built secure workflow automation with measurable incident reduction.',
            strengths: 'Systems thinking, evidence-based triage, and calm incident leadership.',
            voice: 'Direct, factual, and specific; avoid inflated claims.',
          },
          tier3: {
            personalityWorkflow: 'Works best with clear ownership and pragmatic documentation.',
            managerCulture: 'Needs direct feedback and low-drama execution culture.',
            industryFit: 'Security, infrastructure, and developer-tool companies.',
            careerDirection: 'Grow toward security operations leadership.',
            tradeoffs: 'Manager quality beats title when scope is real.',
            dealbreakers: 'Commission-only roles; unpaid trial work.',
            excludeKeywords: 'commission-only\nunpaid trial',
            automaticRejections: 'Commission-only roles\nUnpaid trial work',
            manualReview: 'Equity-heavy compensation with low base',
          },
        },
        connections: {
          providers: { greenhouse: true, lever: true, ashby: true, rss: true },
          rssFeeds: ['https://example.com/jobs.xml'],
          targetCompanies: ['Example Labs'],
        },
        onboarded: true,
      },
    });
    assert.equal(richIntake.res.status, 200, JSON.stringify(richIntake.body));
    assert.equal(richIntake.body.status.scanningUnlocked, true, JSON.stringify(richIntake.body.status));
    assert.equal(richIntake.body.status.tailoringUnlocked, true, JSON.stringify(richIntake.body.status));

    const profileJson = JSON.parse(readFileSync(resolve(profileRoot, 'Candidate Search Profile.json'), 'utf-8'));
    assert.equal(profileJson.schemaVersion, 2, JSON.stringify(profileJson));
    assert.deepEqual(profileJson.scoring.weights, { role: 25, environment: 20, compensation: 20, lifestyle: 15, growth: 10, risk: 10 });
    assert.ok(profileJson.scoring.hardFilters.excludeKeywords.includes('commission-only'), JSON.stringify(profileJson.scoring.hardFilters));
    assert.match(readFileSync(resolve(profileRoot, 'Candidate Search Profile.md'), 'utf-8'), /## Manual Review Criteria/);
    const portals = readFileSync(resolve(profileRoot, 'portals.yml'), 'utf-8');
    assert.match(portals, /tracked_companies:/);
    assert.match(portals, /provider: greenhouse/);
    assert.match(portals, /provider: lever/);
    assert.match(portals, /provider: ashby/);
    assert.match(portals, /rss_feeds:\n\s+- name: "Custom RSS 1"\n\s+url: "https:\/\/example\.com\/jobs\.xml"/);
    assert.match(portals, /exclude_keywords:\n\s+- "commission-only"/);

    const cleared = await postJson({
      port,
      token,
      path: '/api/connections/custom/clear',
      value: {},
    });
    assert.equal(cleared.res.status, 200, JSON.stringify(cleared.body));
    const clearedPortals = readFileSync(resolve(profileRoot, 'portals.yml'), 'utf-8');
    assert.doesNotMatch(clearedPortals, /example\.com\/jobs\.xml/);
    assert.doesNotMatch(clearedPortals, /Example Labs/);
  } catch (err) {
    err.message += `\nserver stdout:\n${stdout}\nserver stderr:\n${stderr}`;
    throw err;
  } finally {
    if (child.exitCode == null) child.kill();
    await delay(250);
    rmSync(profileRoot, { recursive: true, force: true });
    rmSync(configDir, { recursive: true, force: true });
    rmSync(outsideMarker, { force: true });
  }
}

async function assertAuthRateLimit() {
  const profileRoot = mkdtempSync(join(tmpdir(), 'suitor-rate-profile-'));
  const configDir = mkdtempSync(join(tmpdir(), 'suitor-rate-config-'));
  const port = 23500 + Math.floor(Math.random() * 1000);
  const runtimeRoot = resolve(profileRoot, '.suitor-runtime');
  const tokenPath = resolve(runtimeRoot, 'rate.app-token');
  const child = spawn(process.execPath, ['web/server.mjs'], {
    cwd: APP_ROOT,
    env: {
      ...process.env,
      SUITOR_CONFIG_DIR: configDir,
      SUITOR_PERSON_KEY: 'rate',
      SUITOR_PROFILE_ROOT: profileRoot,
      SUITOR_PORT: String(port),
      SUITOR_CANDIDATE_NAME: 'Rate Candidate',
      SUITOR_CANDIDATE_FIRST: 'Rate',
      SUITOR_ASSISTANT_NAME: 'Assistant',
      SUITOR_AUTH_FAILURE_LIMIT: '2',
      SUITOR_AUTH_FAILURE_WINDOW_MS: '60000',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk.toString(); });
  child.stderr.on('data', chunk => { stderr += chunk.toString(); });
  try {
    await waitForSuitorServer({ port, tokenPath, child, getOutput: () => `${stdout}\n${stderr}` });
    const first = await rawJsonRequest({ port, path: '/api/login', value: { token: 'wrong-one' } });
    const second = await rawJsonRequest({ port, path: '/api/login', value: { token: 'wrong-two' } });
    const third = await rawJsonRequest({ port, path: '/api/login', value: { token: 'wrong-three' } });
    assert.equal(first.res.statusCode, 401, JSON.stringify(first.body));
    assert.equal(second.res.statusCode, 401, JSON.stringify(second.body));
    assert.equal(third.res.statusCode, 429, JSON.stringify(third.body));
    assert.match(third.body.error, /too many failed authentication attempts/i);
  } catch (err) {
    err.message += `\nrate server stdout:\n${stdout}\nrate server stderr:\n${stderr}`;
    throw err;
  } finally {
    if (child.exitCode == null) child.kill();
    await delay(250);
    rmSync(profileRoot, { recursive: true, force: true });
    rmSync(configDir, { recursive: true, force: true });
  }
}

async function assertLanModeUrlSafety() {
  const profileRoot = mkdtempSync(join(tmpdir(), 'suitor-lan-profile-'));
  const configDir = mkdtempSync(join(tmpdir(), 'suitor-lan-config-'));
  const port = 24500 + Math.floor(Math.random() * 1000);
  const runtimeRoot = resolve(profileRoot, '.suitor-runtime');
  const tokenPath = resolve(runtimeRoot, 'lan.app-token');
  const child = spawn(process.execPath, ['web/server.mjs'], {
    cwd: APP_ROOT,
    env: {
      ...process.env,
      SUITOR_CONFIG_DIR: configDir,
      SUITOR_PERSON_KEY: 'lan',
      SUITOR_PROFILE_ROOT: profileRoot,
      SUITOR_HOST: '0.0.0.0',
      SUITOR_ALLOW_LAN: '1',
      SUITOR_ALLOWED_HOSTS: `127.0.0.1,127.0.0.1:${port}`,
      SUITOR_PORT: String(port),
      SUITOR_CANDIDATE_NAME: 'LAN Candidate',
      SUITOR_CANDIDATE_FIRST: 'LAN',
      SUITOR_ASSISTANT_NAME: 'Assistant',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk.toString(); });
  child.stderr.on('data', chunk => { stderr += chunk.toString(); });
  try {
    const token = await waitForSuitorServer({ port, tokenPath, child, getOutput: () => `${stdout}\n${stderr}` });
    assert.match(`${stdout}\n${stderr}`, /LAN mode is active/i);

    const blockedHost = await rawJsonRequest({
      port,
      path: '/api/resume-preview',
      headers: {
        Host: `blocked.local:${port}`,
        Origin: `http://blocked.local:${port}`,
        'X-Suitor-App-Token': token,
      },
      value: { markdown: 'blocked host should fail' },
    });
    assert.equal(blockedHost.res.statusCode, 403, JSON.stringify(blockedHost.body));
    assert.match(blockedHost.body.error, /Host is not allowed/i);

    const privateUrl = await postJson({
      port,
      token,
      path: '/api/liveness',
      headers: { Origin: `http://127.0.0.1:${port}` },
      value: { urls: ['https://127.0.0.1/private'] },
    });
    assert.equal(privateUrl.res.status, 400, JSON.stringify(privateUrl.body));
    assert.match(privateUrl.body.error, /blocked private or local URL/i);
  } catch (err) {
    err.message += `\nlan server stdout:\n${stdout}\nlan server stderr:\n${stderr}`;
    throw err;
  } finally {
    if (child.exitCode == null) child.kill();
    await delay(250);
    rmSync(profileRoot, { recursive: true, force: true });
    rmSync(configDir, { recursive: true, force: true });
  }
}

async function assertLanHostAllowlistWarning() {
  const profileRoot = mkdtempSync(join(tmpdir(), 'suitor-lan-warning-profile-'));
  const configDir = mkdtempSync(join(tmpdir(), 'suitor-lan-warning-config-'));
  const port = 25500 + Math.floor(Math.random() * 1000);
  const runtimeRoot = resolve(profileRoot, '.suitor-runtime');
  const tokenPath = resolve(runtimeRoot, 'lanwarn.app-token');
  const child = spawn(process.execPath, ['web/server.mjs'], {
    cwd: APP_ROOT,
    env: {
      ...process.env,
      SUITOR_CONFIG_DIR: configDir,
      SUITOR_PERSON_KEY: 'lanwarn',
      SUITOR_PROFILE_ROOT: profileRoot,
      SUITOR_HOST: '0.0.0.0',
      SUITOR_ALLOW_LAN: '1',
      SUITOR_ALLOWED_HOSTS: '',
      SUITOR_PORT: String(port),
      SUITOR_CANDIDATE_NAME: 'LAN Warning Candidate',
      SUITOR_CANDIDATE_FIRST: 'LAN',
      SUITOR_ASSISTANT_NAME: 'Assistant',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk.toString(); });
  child.stderr.on('data', chunk => { stderr += chunk.toString(); });
  try {
    await waitForSuitorServer({ port, tokenPath, child, getOutput: () => `${stdout}\n${stderr}` });
    const output = `${stdout}\n${stderr}`;
    assert.match(output, /SUITOR_ALLOWED_HOSTS is empty in LAN mode/i, output);
    assert.match(output, /DNS-rebinding protection/i, output);
  } catch (err) {
    err.message += `\nlan warning server stdout:\n${stdout}\nlan warning server stderr:\n${stderr}`;
    throw err;
  } finally {
    if (child.exitCode == null) child.kill();
    await delay(250);
    rmSync(profileRoot, { recursive: true, force: true });
    rmSync(configDir, { recursive: true, force: true });
  }
}

async function assertLinkedInConnectionExtrasSurvive() {
  const profileRoot = mkdtempSync(join(tmpdir(), 'suitor-linkedin-extras-profile-'));
  const configDir = mkdtempSync(join(tmpdir(), 'suitor-linkedin-extras-config-'));
  const port = 26500 + Math.floor(Math.random() * 1000);
  const runtimeRoot = resolve(profileRoot, '.suitor-runtime');
  const tokenPath = resolve(runtimeRoot, 'linkedinextras.app-token');
  const child = spawn(process.execPath, ['web/server.mjs'], {
    cwd: APP_ROOT,
    env: {
      ...process.env,
      SUITOR_CONFIG_DIR: configDir,
      SUITOR_PERSON_KEY: 'linkedinextras',
      SUITOR_PROFILE_ROOT: profileRoot,
      SUITOR_PORT: String(port),
      SUITOR_CANDIDATE_NAME: 'LinkedIn Extras Candidate',
      SUITOR_CANDIDATE_FIRST: 'LinkedIn',
      SUITOR_ASSISTANT_NAME: 'Assistant',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk.toString(); });
  child.stderr.on('data', chunk => { stderr += chunk.toString(); });
  const extras = {
    searchQuery: '"director" OR "program manager"',
    status: 'ready',
    dataStored: 'keep-me',
  };
  try {
    const token = await waitForSuitorServer({
      port,
      tokenPath,
      child,
      getOutput: () => `${stdout}\n${stderr}`,
    });

    const seed = await postJson({
      port,
      token,
      path: '/api/onboarding',
      value: {
        assistantName: 'Assistant',
        connections: {
          linkedin: { enabled: false, ...extras },
          providers: { greenhouse: true, websearch: false },
        },
        onboarded: true,
      },
    });
    assert.equal(seed.res.status, 200, JSON.stringify(seed.body));
    assert.equal(seed.body.config.connections.linkedin.searchQuery, extras.searchQuery);

    const toggle = await postJson({
      port,
      token,
      path: '/api/onboarding',
      value: {
        assistantName: 'Assistant',
        connections: { linkedin: { enabled: true } },
      },
    });
    assert.equal(toggle.res.status, 200, JSON.stringify(toggle.body));
    const afterToggle = toggle.body.config.connections.linkedin;
    assert.equal(afterToggle.enabled, true, JSON.stringify(afterToggle));
    assert.equal(afterToggle.searchQuery, extras.searchQuery, `onboarding POST wiped linkedin extras: ${JSON.stringify(afterToggle)}`);
    assert.equal(afterToggle.status, extras.status, JSON.stringify(afterToggle));
    assert.equal(afterToggle.dataStored, extras.dataStored, JSON.stringify(afterToggle));

    const disconnect = await postJson({
      port,
      token,
      path: '/api/connections/linkedin/disconnect',
      value: {},
    });
    assert.equal(disconnect.res.status, 200, JSON.stringify(disconnect.body));

    const afterDisconnect = await getJson({ port, token, path: '/api/onboarding' });
    assert.equal(afterDisconnect.res.status, 200, JSON.stringify(afterDisconnect.body));
    const afterOff = afterDisconnect.body.config.connections.linkedin;
    assert.equal(afterOff.enabled, false, JSON.stringify(afterOff));
    assert.equal(afterOff.searchQuery, extras.searchQuery, `disconnect wiped linkedin extras: ${JSON.stringify(afterOff)}`);
    assert.equal(afterOff.status, extras.status, JSON.stringify(afterOff));
    assert.equal(afterOff.dataStored, extras.dataStored, JSON.stringify(afterOff));

    const saved = JSON.parse(readFileSync(resolve(configDir, 'suitor.config.json'), 'utf-8'));
    assert.equal(saved.connections.linkedin.searchQuery, extras.searchQuery);
    assert.equal(saved.connections.linkedin.enabled, false);
  } catch (err) {
    err.message += `\nlinkedin extras server stdout:\n${stdout}\nlinkedin extras server stderr:\n${stderr}`;
    throw err;
  } finally {
    if (child.exitCode == null) child.kill();
    await delay(250);
    rmSync(profileRoot, { recursive: true, force: true });
    rmSync(configDir, { recursive: true, force: true });
  }

  const appJs = readFileSync(resolve(APP_ROOT, 'web', 'static', 'app.js'), 'utf-8');
  assert.match(
    appJs,
    /\.\.\.\(cfg\.connections\?\.linkedin \|\| \{\}\)/,
    'onboarding/settings submit must spread the existing LinkedIn block before overriding enabled',
  );
  assert.match(appJs, /wholesale replace wipes extra keys/i);
}

try {
  assertAgentSandboxSource();
  await assertUploadPathSafety();
  await assertAuthRateLimit();
  await assertLanModeUrlSafety();
  await assertLanHostAllowlistWarning();
  await assertLinkedInConnectionExtrasSurvive();
  console.log('security hardening regression passed');
} catch (err) {
  console.error('security hardening regression failed');
  console.error(err.stack || err.message);
  process.exitCode = 1;
}
