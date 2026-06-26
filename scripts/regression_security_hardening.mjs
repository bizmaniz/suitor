#!/usr/bin/env node

import assert from 'assert/strict';
import { spawn } from 'child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join, relative, resolve } from 'path';
import { fileURLToPath } from 'url';
import { delay, waitForSuitorServer } from './regression_server_wait.mjs';

const APP_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

function isUnder(child, parent) {
  const rel = relative(parent, child);
  return child === parent || (Boolean(rel) && !rel.startsWith('..') && !rel.includes(':'));
}

async function postJson({ port, token, path, value }) {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Suitor-App-Token': token },
    body: JSON.stringify(value),
  });
  const body = await res.json().catch(async () => ({ raw: await res.text().catch(() => '') }));
  return { res, body };
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
    assert.equal(pdfUpload.res.status, 200, JSON.stringify(pdfUpload.body));
    assert.ok(isUnder(resolve(pdfUpload.body.path), resolve(runtimeRoot, 'uploads')), `pdf upload escaped root: ${pdfUpload.body.path}`);
    assert.ok(!existsSync(outsideMarker), 'malicious pdf filename executed injected Python');
    assert.doesNotMatch(pdfUpload.body.name, /'/, 'stored upload name should be sanitized');

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

try {
  assertAgentSandboxSource();
  await assertUploadPathSafety();
  console.log('security hardening regression passed');
} catch (err) {
  console.error('security hardening regression failed');
  console.error(err.stack || err.message);
  process.exitCode = 1;
}
