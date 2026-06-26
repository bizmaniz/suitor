#!/usr/bin/env node

import assert from 'assert/strict';
import { spawn } from 'child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join, relative, resolve } from 'path';
import { fileURLToPath } from 'url';

const APP_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

function isUnder(child, parent) {
  const rel = relative(parent, child);
  return child === parent || (Boolean(rel) && !rel.startsWith('..') && !rel.includes(':'));
}

function delay(ms) {
  return new Promise(resolveDelay => setTimeout(resolveDelay, ms));
}

async function waitForServer({ port, tokenPath, child }) {
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
}

async function assertUploadPathSafety() {
  const profileRoot = mkdtempSync(join(tmpdir(), 'suitor-security-profile-'));
  const configDir = mkdtempSync(join(tmpdir(), 'suitor-security-config-'));
  const port = 21000 + Math.floor(Math.random() * 2000);
  const runtimeRoot = resolve(profileRoot, '.suitor-runtime');
  const tokenPath = resolve(runtimeRoot, 'security.app-token');
  const outsideMarker = resolve(dirname(profileRoot), 'suitor-python-injection-marker.txt');
  const child = spawn(process.execPath, ['web/server.mjs'], {
    cwd: APP_ROOT,
    env: {
      ...process.env,
      SUITOR_CONFIG_DIR: configDir,
      SUITOR_PERSON_KEY: 'security',
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
    const token = await waitForServer({ port, tokenPath, child });
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
