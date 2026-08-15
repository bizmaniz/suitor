#!/usr/bin/env node
// Guards the properties the SQLite-backed Job Board depends on.
//
// Number(null) === 0 has stored a fabricated score of 0 for withheld roles,
// which both auto-dismisses them and marks them scored so dedupe strands them.
// Runs entirely against a throwaway database in the OS temp dir.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { resolve } from 'path';
import { JOB_DB_SCHEMA_VERSION, openJobDb, upsertScoredRole, scoredUrlKeys } from '../web/job_db.mjs';

const dir = mkdtempSync(resolve(tmpdir(), 'suitor-jobdb-'));
const db = openJobDb(resolve(dir, 'test.sqlite'));
let failures = 0;

function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    failures += 1;
    console.error(`FAIL ${label}\n  expected ${JSON.stringify(expected)}\n  actual   ${JSON.stringify(actual)}`);
  }
  return ok;
}

const row = url => db.prepare('SELECT * FROM jobs WHERE url = ?').get(url);

for (const [label, value] of [['null', null], ['undefined', undefined], ['empty string', '']]) {
  const url = `https://example.com/nullscore-${label.replace(/\s/g, '-')}`;
  upsertScoredRole(db, { company: 'Acme', role: `Needs JD ${label}`, url, score: value });
  check(`score ${label} stays null`, row(url).score, null);
  check(`score ${label} is not in scoredUrlKeys`, scoredUrlKeys(db).has(url), false);
}

upsertScoredRole(db, { company: 'Acme', role: 'Genuine zero', url: 'https://example.com/zero', score: 0 });
check('a real 0 is stored as 0', row('https://example.com/zero').score, 0);
check('a real 0 counts as scored', scoredUrlKeys(db).has('https://example.com/zero'), true);

const keep = 'https://example.com/keep';
upsertScoredRole(db, { company: 'Acme', role: 'Keeps score', url: keep, score: 82, scoreText: '82/100 (good)', action: 'Package Role', reportFile: 'first.md' });
upsertScoredRole(db, { company: 'Acme', role: 'Keeps score', url: keep, score: null, action: 'Needs Decision', reportFile: 'second.md' });
check('null does not erase a score', row(keep).score, 82);
check('null does not steal the action', row(keep).recommended_action, 'Package Role');

const best = 'https://example.com/best';
upsertScoredRole(db, { company: 'Acme', role: 'Best wins', url: best, score: 88, scoreText: '88/100', action: 'Package Role', reportFile: 'high.md', scoredAt: '2026-01-01' });
upsertScoredRole(db, { company: 'Acme', role: 'Best wins', url: best, score: 40, scoreText: '40/100', action: 'Pass', reportFile: 'low.md', scoredAt: '2026-02-02' });
const bestRow = row(best);
check('higher score kept', bestRow.score, 88);
check('breakdown matches the kept score', bestRow.score_breakdown, '88/100');
check('action matches the kept score', bestRow.recommended_action, 'Package Role');
check('report_file matches the kept score', bestRow.report_file, 'high.md');
check('scored_at matches the kept score', bestRow.scored_at, '2026-01-01');

const upgrade = 'https://example.com/upgrade';
upsertScoredRole(db, { company: 'Acme', role: 'Upgrades', url: upgrade, score: null });
check('starts unscored', scoredUrlKeys(db).has(upgrade), false);
upsertScoredRole(db, { company: 'Acme', role: 'Upgrades', url: upgrade, score: 71, scoreText: '71/100' });
check('upgrades to scored', row(upgrade).score, 71);
check('now counts as scored', scoredUrlKeys(db).has(upgrade), true);

const busyPath = resolve(dir, 'busy.sqlite');
openJobDb(busyPath).close();
const writer = openJobDb(busyPath);
writer.exec('BEGIN IMMEDIATE');
writer.prepare("INSERT INTO meta(key, value) VALUES ('lock-probe', '1') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
let readerOpened = false;
let readerError = '';
try {
  const reader = openJobDb(busyPath);
  readerOpened = true;
  scoredUrlKeys(reader);
  reader.close();
} catch (err) {
  readerError = String(err.message || err);
}
writer.exec('ROLLBACK');
writer.close();
check(`a read-only open succeeds while another connection holds a write lock (${readerError || 'no error'})`, readerOpened, true);

const futureVersion = String(JOB_DB_SCHEMA_VERSION + 1);
const futurePath = resolve(dir, 'future.sqlite');
const future = openJobDb(futurePath);
future.prepare('UPDATE meta SET value = ? WHERE key = ?').run(futureVersion, 'schema_version');
future.close();
const reopened = openJobDb(futurePath);
check(`a v${futureVersion} database is not downgraded to v${JOB_DB_SCHEMA_VERSION}`, reopened.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get().value, futureVersion);
reopened.close();

const profileRoot = resolve(dir, 'profile');
const scanRuntime = resolve(profileRoot, '.suitor-runtime');
mkdirSync(scanRuntime, { recursive: true });
process.env.SUITOR_PROFILE_ROOT = profileRoot;
process.env.SUITOR_RUNTIME_ROOT = scanRuntime;
process.env.SUITOR_PERSON_KEY = 'regression';
const { persistScoredRoles } = await import('./verified_scan.mjs');
const { loadSeenUrlKeys } = await import('../scan.mjs');

const fetchedCandidates = [
  { url: 'https://boards.example.com/jobs/1?b=2&a=1', company: 'Acme', title: 'Staff Engineer', source: 'greenhouse', applyType: 'External', text: 'The real job description body.' },
  { url: 'https://boards.example.com/jobs/2', source: 'lever', applyType: 'External', text: 'Another real body.' },
  { url: 'https://boards.example.com/jobs/3', source: 'ashby', applyType: 'External', text: 'Unrelated third body, never scored in this run.' },
];

const logged = [];
const realLog = console.log;
console.log = (...args) => { logged.push(args.map(String).join(' ')); };
try {
  persistScoredRoles({
    rows: [
      { company: 'Acme', title: 'Staff Engineer', url: 'https://BOARDS.example.com/jobs/1?a=1&b=2#apply', score: 77 },
      { company: 'Globex', title: 'Head of Ops', url: 'https://boards.example.com/jo', score: 81 },
    ],
  }, fetchedCandidates, '/somewhere/Scan Results - Test - 2026-08-01.md');
} finally {
  console.log = realLog;
}

const scanDb = openJobDb(resolve(scanRuntime, 'suitor.sqlite'));
const scanRow = title => scanDb.prepare('SELECT * FROM jobs WHERE role = ?').get(title);
const matched = scanRow('Staff Engineer');
check('the fetched URL wins over the model echo', matched.url, 'https://boards.example.com/jobs/1?b=2&a=1');
check('the matched row keeps its fetched JD text', matched.jd_text, 'The real job description body.');
check('the matched row keeps its fetched source', matched.source, 'greenhouse');
check('a matched row is not reported as unmatched', logged.some(line => line.includes('Staff Engineer')), false);

const unmatched = scanRow('Head of Ops');
check('an unmatched row still stores the model URL', unmatched.url, 'https://boards.example.com/jo');
check('an unmatched row is reported, not silently stored', logged.some(line => line.includes('matched no fetched candidate') && line.includes('Head of Ops')), true);
scanDb.close();

const emptyDir = resolve(dir, 'empty-fallback');
mkdirSync(emptyDir, { recursive: true });
const emptyDbPath = resolve(emptyDir, 'suitor.sqlite');
const historyPath = resolve(emptyDir, 'scan-history.tsv');
writeFileSync(historyPath, 'url\tcompany\nhttps://example.com/stranded\tAcme\n');
openJobDb(emptyDbPath).close();
const emptyKeys = loadSeenUrlKeys(emptyDbPath, historyPath);
check('empty db falls back to scan-history.tsv', emptyKeys.has('https://example.com/stranded'), true);

const scoredDb = openJobDb(emptyDbPath);
upsertScoredRole(scoredDb, { company: 'Acme', role: 'Engineer', url: 'https://example.com/scored', score: 80 });
scoredDb.close();
const scoredKeys = loadSeenUrlKeys(emptyDbPath, historyPath);
check('a scored db uses scored URLs, not history-only URLs', scoredKeys.has('https://example.com/scored'), true);
check('a scored db does not treat a history-only URL as seen', scoredKeys.has('https://example.com/stranded'), false);

db.close();
rmSync(dir, { recursive: true, force: true });

if (failures) {
  console.error(`\nregression_scored_role_persistence FAILED with ${failures} failure(s).`);
  process.exit(1);
}
console.log('regression_scored_role_persistence passed');
