#!/usr/bin/env node

import { spawnSync } from 'child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, readdirSync, statSync, renameSync } from 'fs';
import { dirname, join, relative, resolve } from 'path';
import { fileURLToPath } from 'url';
import { htmlToPlainText } from '../providers/_html_text.mjs';
import { assertSafeFetchUrl, strictUrlFetchEnabled } from '../providers/_url_safety.mjs';
import { completeCursorPrompt } from '../web/cursor_agent.mjs';
import { runSelectedScoring } from '../web/llm_routing.mjs';

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
function envValue(name, legacyName, fallback = '') {
  return process.env[name] || (legacyName ? process.env[legacyName] : '') || fallback;
}

function requiredEnvValue(name, legacyName = '') {
  const value = envValue(name, legacyName, '');
  if (!value) throw new Error(`Missing required Suitor environment variable: ${name}${legacyName ? ` or legacy ${legacyName}` : ''}. Use the profile launcher.`);
  return value;
}

const PROFILE_ROOT = resolve(requiredEnvValue('SUITOR_PROFILE_ROOT', 'SUITOR_PROFILE_ROOT'));

function pathIsSameOrUnder(child, parent) {
  const rel = relative(parent, child);
  return child === parent || (rel && !rel.startsWith('..') && !rel.includes(':'));
}

function profileLocalPath(pathValue, label) {
  const full = resolve(pathValue);
  if (!pathIsSameOrUnder(full, PROFILE_ROOT)) {
    throw new Error(`${label} must stay under SUITOR_PROFILE_ROOT for profile isolation: ${full}`);
  }
  return full;
}

const RUNTIME_ROOT = process.env.SUITOR_RUNTIME_ROOT || process.env.SUITOR_RUNTIME_ROOT
  ? profileLocalPath(envValue('SUITOR_RUNTIME_ROOT', 'SUITOR_RUNTIME_ROOT'), 'SUITOR_RUNTIME_ROOT')
  : resolve(PROFILE_ROOT, '.suitor-runtime');
const LEGACY_RUNTIME_ROOT = resolve(PROFILE_ROOT, '.suitor-runtime');
const ASSESSMENTS_ROOT = profileLocalPath(envValue('SUITOR_ASSESSMENTS_ROOT', 'SUITOR_ASSESSMENTS_ROOT', resolve(PROFILE_ROOT, 'Assessments')), 'SUITOR_ASSESSMENTS_ROOT');
const BROWSER_RESULTS_PATH = resolve(RUNTIME_ROOT, 'browser', 'linkedin-results.json');
const BROWSER_STATUS_PATH = resolve(RUNTIME_ROOT, 'browser', 'status.json');
const PERSON_KEY = requiredEnvValue('SUITOR_PERSON_KEY', 'SUITOR_PERSON_KEY').toLowerCase();
const CANDIDATE_NAME = envValue('SUITOR_CANDIDATE_NAME', 'SUITOR_CANDIDATE_NAME', 'Candidate');
const CANDIDATE_FIRST = envValue('SUITOR_CANDIDATE_FIRST', 'SUITOR_CANDIDATE_FIRST', CANDIDATE_NAME.split(/\s+/)[0] || 'Candidate');
const ASSISTANT_NAME = envValue('SUITOR_ASSISTANT_NAME', 'SUITOR_ASSISTANT_NAME', 'Assistant');
const today = new Date().toISOString().slice(0, 10);
const runStamp = new Date().toISOString().replace(/[:.]/g, '-');
const VERIFIED_SCAN_LIMIT = Math.max(1, Number(envValue('SUITOR_VERIFIED_SCAN_LIMIT', 'SUITOR_VERIFIED_SCAN_LIMIT', 50)));
const SCAN_STATE_PATH = resolve(RUNTIME_ROOT, 'scan-state.json');
const SCAN_HISTORY_PATH = resolve(RUNTIME_ROOT, 'scan-history.tsv');
