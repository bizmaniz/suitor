// Shared job database access.
//
// Both the web server and the separately-spawned scan scripts need the same
// schema and the same notion of "already scored", so this lives in one place
// rather than being duplicated across processes. WAL is on, which permits the
// scan process to write while the server reads.

import { mkdirSync } from 'fs';
import { dirname } from 'path';
import { DatabaseSync } from 'node:sqlite';

export const JOB_DB_SCHEMA_VERSION = 5;

function recordedSchemaVersion(db) {
  let value;
  try {
    value = db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get()?.value;
  } catch {
    return 0;
  }
  if (value === null || value === undefined || value === '') return 0;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

export function ensureJobDbSchema(db) {
  // Every statement below takes a write lock. openJobDb() runs this on every
  // open, so a semantically read-only caller like scan.mjs's loadSeenUrls()
  // was writing too, and could fail with SQLITE_BUSY while the server held a
  // write transaction. A database already at this version (or newer) needs
  // none of it.
  if (recordedSchemaVersion(db) >= JOB_DB_SCHEMA_VERSION) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL DEFAULT '',
      url TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT '',
      location TEXT NOT NULL DEFAULT '',
      compensation TEXT NOT NULL DEFAULT '',
      score REAL,
      score_breakdown TEXT NOT NULL DEFAULT '',
      jd_text TEXT NOT NULL DEFAULT '',
      first_seen_at TEXT NOT NULL DEFAULT '',
      last_seen_at TEXT NOT NULL DEFAULT '',
      normalized_company TEXT NOT NULL DEFAULT '',
      normalized_role TEXT NOT NULL DEFAULT '',
      normalized_url TEXT NOT NULL DEFAULT '',
      UNIQUE(normalized_company, normalized_role, normalized_url)
    );

    CREATE TABLE IF NOT EXISTS applications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER,
      company TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT '',
      section TEXT NOT NULL DEFAULT '',
      date_found TEXT NOT NULL DEFAULT '',
      date_submitted TEXT NOT NULL DEFAULT '',
      date_rejected TEXT NOT NULL DEFAULT '',
      follow_up_date TEXT NOT NULL DEFAULT '',
      score REAL,
      score_text TEXT NOT NULL DEFAULT '',
      compensation TEXT NOT NULL DEFAULT '',
      location TEXT NOT NULL DEFAULT '',
      materials_path TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      next_action TEXT NOT NULL DEFAULT '',
      score_breakdown TEXT NOT NULL DEFAULT '',
      score_date TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT '',
      normalized_company TEXT NOT NULL DEFAULT '',
      normalized_role TEXT NOT NULL DEFAULT '',
      UNIQUE(normalized_company, normalized_role)
    );

    CREATE TABLE IF NOT EXISTS scan_decisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,
      aliases_json TEXT NOT NULL DEFAULT '[]',
      decision TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL DEFAULT '',
      company TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL DEFAULT '',
      url TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT '',
      report_file TEXT NOT NULL DEFAULT '',
      reason TEXT NOT NULL DEFAULT '',
      score REAL,
      comp TEXT NOT NULL DEFAULT '',
      location TEXT NOT NULL DEFAULT '',
      decided_at TEXT NOT NULL DEFAULT '',
      decided_by TEXT NOT NULL DEFAULT '',
      synthetic INTEGER NOT NULL DEFAULT 0,
      normalized_company TEXT NOT NULL DEFAULT '',
      normalized_role TEXT NOT NULL DEFAULT '',
      normalized_url TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS application_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      application_id INTEGER,
      event_type TEXT NOT NULL DEFAULT '',
      event_at TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      payload_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS interviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      application_id INTEGER,
      company TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL DEFAULT '',
      round_type TEXT NOT NULL DEFAULT '',
      interview_at TEXT NOT NULL DEFAULT '',
      interviewers TEXT NOT NULL DEFAULT '',
      prep_notes TEXT NOT NULL DEFAULT '',
      outcome TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      application_id INTEGER,
      name TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL DEFAULT '',
      company TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      linkedin_url TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS captures (
      id TEXT PRIMARY KEY,
      company TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL DEFAULT '',
      url TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT '',
      jd_text TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      normalized_company TEXT NOT NULL DEFAULT '',
      normalized_role TEXT NOT NULL DEFAULT '',
      normalized_url TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT '',
      deleted_at TEXT NOT NULL DEFAULT ''
    );

    CREATE INDEX IF NOT EXISTS idx_jobs_identity ON jobs(normalized_company, normalized_role, normalized_url);
    CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);
    CREATE INDEX IF NOT EXISTS idx_applications_identity ON applications(normalized_company, normalized_role);
    CREATE INDEX IF NOT EXISTS idx_scan_decisions_decision ON scan_decisions(decision);
    CREATE INDEX IF NOT EXISTS idx_scan_decisions_identity ON scan_decisions(normalized_company, normalized_role, normalized_url);
    CREATE INDEX IF NOT EXISTS idx_application_events_application ON application_events(application_id, event_at);
    CREATE INDEX IF NOT EXISTS idx_interviews_application ON interviews(application_id, interview_at);
    CREATE INDEX IF NOT EXISTS idx_contacts_application ON contacts(application_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_captures_identity ON captures(normalized_company, normalized_role, normalized_url);
    CREATE INDEX IF NOT EXISTS idx_captures_active ON captures(deleted_at, updated_at);

    CREATE TABLE IF NOT EXISTS jd_jobs (
      identity TEXT PRIMARY KEY,
      company TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL DEFAULT '',
      url TEXT NOT NULL DEFAULT '',
      jd_path TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT '',
      error TEXT NOT NULL DEFAULT '',
      pid INTEGER NOT NULL DEFAULT 0,
      queued_at TEXT NOT NULL DEFAULT '',
      started_at TEXT NOT NULL DEFAULT '',
      finished_at TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_jd_jobs_status ON jd_jobs(status, queued_at);
  `);
  try { db.prepare('ALTER TABLE interviews ADD COLUMN company TEXT NOT NULL DEFAULT ""').run(); } catch {}
  try { db.prepare('ALTER TABLE interviews ADD COLUMN role TEXT NOT NULL DEFAULT ""').run(); } catch {}
  for (const column of ['report_file', 'recommended_action', 'apply_type', 'verification', 'scored_at']) {
    try { db.prepare(`ALTER TABLE jobs ADD COLUMN ${column} TEXT NOT NULL DEFAULT ""`).run(); } catch {}
  }
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_jobs_scored ON jobs(score, scored_at)'); } catch {}
  db.prepare('INSERT INTO meta(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run('schema_version', String(JOB_DB_SCHEMA_VERSION));
}

export function openJobDb(dbPath) {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  // busy_timeout FIRST. Listed last, a concurrent second writer can get
  // SQLITE_BUSY on journal_mode / synchronous / foreign_keys before its own
  // busy handler is installed.
  db.exec('PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON;');
  ensureJobDbSchema(db);
  return db;
}

function text(value) {
  return String(value ?? '').trim();
}

// These MUST stay identical to normalizeScanKey/dbIdentity/dbUrlIdentity in
// server.mjs. The UNIQUE(normalized_company, normalized_role, normalized_url)
// constraint is the dedupe, so any divergence between the two processes writes
// duplicate rows that never match each other. Covered by
// scripts/regression_job_db_identity.mjs.
export function identityKey(value) {
  // `=== undefined`, not `?? ''`: server.mjs gets its empty string from a
  // `value = ''` parameter default, which does NOT fire for null. There
  // dbIdentity(null) is the string "null", so this must produce "null" too.
  return String(value === undefined ? '' : value)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function urlIdentityKey(value) {
  // `|| ''`, not `?? ''`: server.mjs's dbUrlIdentity discards every falsy input,
  // so 0 and false key as '' there and must key as '' here.
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    parsed.hash = '';
    parsed.searchParams.sort?.();
    return parsed.toString().toLowerCase();
  } catch {
    return identityKey(raw);
  }
}

export function identityKeyFor(company, role) {
  return `${identityKey(company)}::${identityKey(role)}`;
}

export function upsertScoredRole(db, row = {}) {
  const company = text(row.company);
  const role = text(row.role);
  const title = text(row.title) || [role, company].filter(Boolean).join(' - ');
  const url = text(row.url);
  const normalizedCompany = identityKey(company);
  const normalizedRole = identityKey(role);
  const normalizedUrl = urlIdentityKey(url);
  if (!normalizedCompany && !normalizedRole && !normalizedUrl) return false;
  const score = row.score === null || row.score === undefined || row.score === ''
    ? null
    : (Number.isFinite(Number(row.score)) ? Number(row.score) : null);
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO jobs (
      company, role, title, url, source, location, compensation, score, score_breakdown,
      jd_text, first_seen_at, last_seen_at, normalized_company, normalized_role, normalized_url,
      report_file, recommended_action, apply_type, verification, scored_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(normalized_company, normalized_role, normalized_url) DO UPDATE SET
      company = excluded.company,
      role = excluded.role,
      title = excluded.title,
      url = CASE WHEN excluded.url != '' THEN excluded.url ELSE jobs.url END,
      source = CASE WHEN excluded.source != '' THEN excluded.source ELSE jobs.source END,
      location = CASE WHEN excluded.location != '' THEN excluded.location ELSE jobs.location END,
      compensation = CASE WHEN excluded.compensation != '' THEN excluded.compensation ELSE jobs.compensation END,
      score = CASE
        WHEN excluded.score IS NULL THEN jobs.score
        WHEN jobs.score IS NULL THEN excluded.score
        WHEN excluded.score >= jobs.score THEN excluded.score
        ELSE jobs.score END,
      score_breakdown = CASE
        WHEN excluded.score IS NOT NULL AND (jobs.score IS NULL OR excluded.score >= jobs.score)
          THEN excluded.score_breakdown ELSE jobs.score_breakdown END,
      jd_text = CASE WHEN excluded.jd_text != '' THEN excluded.jd_text ELSE jobs.jd_text END,
      last_seen_at = excluded.last_seen_at,
      recommended_action = CASE
        WHEN excluded.score IS NOT NULL AND (jobs.score IS NULL OR excluded.score >= jobs.score)
          THEN excluded.recommended_action ELSE jobs.recommended_action END,
      report_file = CASE
        WHEN excluded.score IS NOT NULL AND (jobs.score IS NULL OR excluded.score >= jobs.score)
          THEN excluded.report_file ELSE jobs.report_file END,
      verification = CASE
        WHEN excluded.score IS NOT NULL AND (jobs.score IS NULL OR excluded.score >= jobs.score)
          THEN excluded.verification ELSE jobs.verification END,
      scored_at = CASE
        WHEN excluded.score IS NOT NULL AND (jobs.score IS NULL OR excluded.score >= jobs.score)
          THEN excluded.scored_at ELSE jobs.scored_at END,
      apply_type = CASE WHEN excluded.apply_type != '' THEN excluded.apply_type ELSE jobs.apply_type END
  `).run(
    company, role, title, url, text(row.source), text(row.location), text(row.comp),
    score, text(row.scoreText), text(row.jdText).slice(0, 200000),
    text(row.firstSeenAt) || now, now,
    normalizedCompany, normalizedRole, normalizedUrl,
    text(row.reportFile), text(row.action), text(row.applyType), text(row.verification),
    score == null ? '' : (text(row.scoredAt) || now),
  );
  return true;
}

export function scoredUrlKeys(db) {
  const keys = new Set();
  for (const row of db.prepare("SELECT url, normalized_url FROM jobs WHERE score IS NOT NULL").all()) {
    if (row.url) keys.add(String(row.url));
    if (row.normalized_url) keys.add(String(row.normalized_url));
  }
  return keys;
}

export function jobIdentityForUrl(db, url) {
  const normalizedUrl = urlIdentityKey(url);
  if (!normalizedUrl) return null;
  return db.prepare(
    'SELECT company, role, title FROM jobs WHERE normalized_url = ? ORDER BY id ASC LIMIT 1'
  ).get(normalizedUrl) || null;
}

export function persistJdJob(db, job = {}) {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO jd_jobs (
      identity, company, role, url, jd_path, status, error, pid,
      queued_at, started_at, finished_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(identity) DO UPDATE SET
      company = excluded.company,
      role = excluded.role,
      url = excluded.url,
      jd_path = excluded.jd_path,
      status = excluded.status,
      error = excluded.error,
      pid = excluded.pid,
      queued_at = excluded.queued_at,
      started_at = excluded.started_at,
      finished_at = excluded.finished_at,
      updated_at = excluded.updated_at
  `).run(
    text(job.identity), text(job.company), text(job.role), text(job.url),
    text(job.jdPath || job.jd_path), text(job.status), text(job.error),
    Number(job.pid) || 0,
    text(job.queuedAt || job.queued_at) || now,
    text(job.startedAt || job.started_at),
    text(job.finishedAt || job.finished_at),
    now,
  );
}

export function deleteJdJob(db, identity) {
  db.prepare('DELETE FROM jd_jobs WHERE identity = ?').run(text(identity));
}

export function listJdJobs(db) {
  return db.prepare('SELECT * FROM jd_jobs ORDER BY queued_at ASC, identity ASC').all();
}
