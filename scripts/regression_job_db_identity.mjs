#!/usr/bin/env node
// The dedupe key must be computed identically in web/job_db.mjs (used by the
// scan process) and web/server.mjs (used by the web process). If they drift,
// the UNIQUE(normalized_*) constraint stops matching and the same role lands
// in the jobs table twice.
//
// server.mjs cannot be imported without a full profile environment, so its
// implementations are read out of the source and evaluated in isolation.

import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { identityKey, urlIdentityKey } from '../web/job_db.mjs';

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(resolve(APP_ROOT, 'web', 'server.mjs'), 'utf-8');

function extract(name) {
  const start = source.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`regression_job_db_identity: ${name}() not found in server.mjs`);
  const terminator = source.indexOf('\n}\n', start);
  if (terminator === -1) throw new Error(`regression_job_db_identity: no column-0 closing brace after ${name}() in server.mjs`);
  const body = source.slice(start, terminator + 3);
  try {
    new Function(`${body}\nreturn ${name};`);
  } catch (err) {
    throw new Error(`regression_job_db_identity: extracted ${name}() does not parse, so the '\\n}\\n' slice grabbed the wrong body: ${err.message}`);
  }
  return body;
}

const serverImpl = new Function(`
  ${extract('normalizeScanKey')}
  ${extract('normalizeTrackerMatch')}
  ${extract('dbIdentity')}
  ${extract('dbUrlIdentity')}
  return { dbIdentity, dbUrlIdentity };
`)();

const IDENTITY_CASES = [
  'Scale AI', 'Johnson & Johnson', '  Head  of   AI  ', 'Lovable', '',
  'AT&T Inc.', 'Ramp/Payments', 'Café Møller', 'VP, Customer Operations',
  null, undefined, 0, false,
];

const URL_CASES = [
  'https://job-boards.greenhouse.io/scaleai',
  'https://www.linkedin.com/jobs/view/4452154074/#comments',
  'https://example.com/jobs?b=2&a=1',
  'https://example.com/jobs?a=1&b=2',
  'HTTPS://Example.COM/Jobs',
  'https://example.com/jobs',
  'https://example.com/jobs/',
  'https://example.com:443/jobs',
  'https://example.com/jobs?utm=x&a=1',
  'https://example.com/jobs?a=1&utm=x',
  'not a url at all',
  '',
  null, undefined, 0, false,
];

let failures = 0;

for (const value of IDENTITY_CASES) {
  const mine = identityKey(value);
  const theirs = serverImpl.dbIdentity(value);
  if (mine !== theirs) {
    failures += 1;
    console.error(`identityKey mismatch for ${JSON.stringify(value)}: job_db=${JSON.stringify(mine)} server=${JSON.stringify(theirs)}`);
  }
}

for (const value of URL_CASES) {
  const mine = urlIdentityKey(value);
  const theirs = serverImpl.dbUrlIdentity(value);
  if (mine !== theirs) {
    failures += 1;
    console.error(`urlIdentityKey mismatch for ${JSON.stringify(value)}: job_db=${JSON.stringify(mine)} server=${JSON.stringify(theirs)}`);
  }
}

if (failures) {
  console.error(`\nregression_job_db_identity FAILED with ${failures} mismatch(es).`);
  process.exit(1);
}

console.log(`regression_job_db_identity passed (${IDENTITY_CASES.length + URL_CASES.length} cases)`);
