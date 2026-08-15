#!/usr/bin/env node
// Owner-authored notes must survive a tracker rebuild.
//
// importTrackerIntoDb() runs DELETE FROM applications and re-inserts on every
// tracker save, and applications.id is AUTOINCREMENT, so ids climb each time.
// Notes and timeline entries key on normalized_company::normalized_role.

import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { resolve } from 'path';
import { DatabaseSync } from 'node:sqlite';
import {
  addTimelineEntry,
  applicationNoteCounts,
  deleteTimelineEntry,
  ensureApplicationNotesSchema,
  identityKeyFor,
  readApplicationNotes,
  upsertApplicationNotes,
} from '../web/application_notes.mjs';

const app = readFileSync(resolve('web', 'static', 'app.js'), 'utf-8');
if (!app.includes('keepUnsavedNoteFields()')) {
  throw new Error('timeline add/remove must keep unsaved salary/contact/applied-via/notes fields');
}

const dir = mkdtempSync(resolve(tmpdir(), 'suitor-appnotes-'));
const db = new DatabaseSync(resolve(dir, 'test.sqlite'));
db.exec(`
  CREATE TABLE applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT '',
    normalized_company TEXT NOT NULL DEFAULT '',
    normalized_role TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT ''
  );
`);
ensureApplicationNotesSchema(db);

let failures = 0;
function check(label, actual, expected) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failures += 1;
    console.error(`FAIL ${label}\n  expected ${JSON.stringify(expected)}\n  actual   ${JSON.stringify(actual)}`);
  }
}

const COMPANY = 'Example Corp';
const ROLE = 'Program Lead';
const key = identityKeyFor(COMPANY, ROLE);

function insertApplication() {
  db.prepare(`
    INSERT INTO applications (company, role, status, normalized_company, normalized_role, updated_at)
    VALUES (?, ?, 'submitted', ?, ?, '2026-08-13')
  `).run(COMPANY, ROLE, key.split('::')[0], key.split('::')[1]);
  return db.prepare('SELECT id FROM applications ORDER BY id DESC LIMIT 1').get().id;
}

const firstId = insertApplication();

upsertApplicationNotes(db, key, {
  company: COMPANY, role: ROLE,
  salaryAsked: '$140,000 base', contact: 'Alex Rivera', appliedVia: 'LinkedIn',
  notes: 'Do not go below the stated floor.',
});
addTimelineEntry(db, key, { entryAt: '2026-08-11', kind: 'applied', note: 'Applied' });
addTimelineEntry(db, key, { entryAt: '2026-08-13', note: 'Recruiter screen - went well' });

check('notes saved', readApplicationNotes(db, key).notes.salary_asked, '$140,000 base');
check('timeline saved', readApplicationNotes(db, key).timeline.length, 2);

db.prepare('DELETE FROM applications').run();
const secondId = insertApplication();
check('the rebuild really did renumber the application id', secondId > firstId, true);

const after = readApplicationNotes(db, key);
check('salary survives the rebuild', after.notes.salary_asked, '$140,000 base');
check('contact survives the rebuild', after.notes.contact, 'Alex Rivera');
check('notes survive the rebuild', after.notes.notes, 'Do not go below the stated floor.');
check('timeline survives the rebuild', after.timeline.length, 2);
check('timeline is newest first', after.timeline[0].note, 'Recruiter screen - went well');

upsertApplicationNotes(db, key, { company: COMPANY, role: ROLE, salaryAsked: '$145,000 base', notes: 'Revised.' });
const updated = readApplicationNotes(db, key);
check('upsert updates in place', updated.notes.salary_asked, '$145,000 base');
check('upsert did not duplicate the row', db.prepare('SELECT COUNT(*) AS n FROM application_notes').get().n, 1);
check('omitted field clears', updated.notes.contact, '');

check('identity is normalized', identityKeyFor('EXAMPLE CORP', 'Program  Lead'), key);

const counts = applicationNoteCounts(db);
check('count reports notes present', counts.get(key).notes, 1);
check('count reports timeline entries', counts.get(key).timeline, 2);

const otherKey = identityKeyFor('Other Co', 'Operations Manager');
addTimelineEntry(db, otherKey, { entryAt: '2026-08-11', note: 'Applied' });
deleteTimelineEntry(db, key, after.timeline[0].id);
check('delete removed one entry', readApplicationNotes(db, key).timeline.length, 1);
check('delete did not touch another position', readApplicationNotes(db, otherKey).timeline.length, 1);
const otherEntryId = readApplicationNotes(db, otherKey).timeline[0].id;
deleteTimelineEntry(db, key, otherEntryId);
check('delete is scoped to its identity', readApplicationNotes(db, otherKey).timeline.length, 1);

const metaTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='meta'").get();
check('notes helpers do not introduce a schema_version table', metaTable, undefined);

db.close();
rmSync(dir, { recursive: true, force: true });

if (failures) {
  console.error(`\nregression_application_notes FAILED with ${failures} failure(s).`);
  process.exit(1);
}
console.log('regression_application_notes passed');
