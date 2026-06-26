#!/usr/bin/env node

import assert from 'assert/strict';
import { spawnSync } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

const profileRoot = mkdtempSync(join(tmpdir(), 'Suitor-profile-guard-'));
const outsideRoot = mkdtempSync(join(tmpdir(), 'Suitor-outside-'));

function runNode(args, extraEnv = {}) {
  return spawnSync(process.execPath, args, {
    cwd: resolve('.'),
    env: {
      ...process.env,
      SUITOR_PERSON_KEY: 'Test Candidate',
      SUITOR_PROFILE_ROOT: profileRoot,
      SUITOR_PORT: '19999',
      SUITOR_CANDIDATE_NAME: 'Sample Candidate',
      SUITOR_CANDIDATE_FIRST: 'Test Candidate',
      SUITOR_ASSISTANT_NAME: 'Assistant',
      ...extraEnv,
    },
    encoding: 'utf-8',
    timeout: 10000,
  });
}

function assertIsolationFailure(result, label) {
  const output = `${result.stdout || ''}\n${result.stderr || ''}`;
  assert.notEqual(result.status, 0, `${label} should fail when a profile-local path points outside the profile root`);
  assert.match(output, /must stay under SUITOR_PROFILE_ROOT/, `${label} should explain the profile isolation failure\n${output}`);
}

try {
  assertIsolationFailure(runNode(['web/server.mjs'], {
    SUITOR_RUNTIME_ROOT: resolve(outsideRoot, 'runtime'),
  }), 'server runtime root guard');

  assertIsolationFailure(runNode(['web/server.mjs'], {
    SUITOR_ASSESSMENTS_ROOT: resolve(outsideRoot, 'Assessments'),
  }), 'server assessments root guard');

  assertIsolationFailure(runNode(['web/server.mjs'], {
    SUITOR_TRACKER_PATH: resolve(outsideRoot, 'Applications Tracker.md'),
  }), 'server tracker path guard');

  assertIsolationFailure(runNode(['scripts/browser_adapter.mjs', 'cancel'], {
    SUITOR_RUNTIME_ROOT: resolve(outsideRoot, 'browser-runtime'),
  }), 'browser adapter runtime root guard');

  assertIsolationFailure(runNode(['scripts/verified_scan.mjs'], {
    SUITOR_RUNTIME_ROOT: resolve(outsideRoot, 'verified-runtime'),
  }), 'verified scan runtime root guard');

  assertIsolationFailure(runNode(['scripts/verified_scan.mjs'], {
    SUITOR_ASSESSMENTS_ROOT: resolve(outsideRoot, 'Assessments'),
  }), 'verified scan assessments root guard');

  console.log('profile guardrail regression passed');
} finally {
  rmSync(profileRoot, { recursive: true, force: true });
  rmSync(outsideRoot, { recursive: true, force: true });
}
