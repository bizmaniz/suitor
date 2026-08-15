// Owner-authored notes keyed on company+role, never applications.id.
// importTrackerIntoDb() DELETEs applications and AUTOINCREMENT renumbers ids.

export function identityKey(value) {
  return String(value === undefined ? '' : value)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function identityKeyFor(company, role) {
  return `${identityKey(company)}::${identityKey(role)}`;
}

export function ensureApplicationNotesSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS application_notes (
      identity_key TEXT PRIMARY KEY,
      company TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL DEFAULT '',
      salary_asked TEXT NOT NULL DEFAULT '',
      contact TEXT NOT NULL DEFAULT '',
      applied_via TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS application_timeline (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      identity_key TEXT NOT NULL DEFAULT '',
      entry_at TEXT NOT NULL DEFAULT '',
      kind TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT ''
    );

    CREATE INDEX IF NOT EXISTS idx_application_timeline_identity ON application_timeline(identity_key, entry_at);
  `);
}

function text(value) {
  return String(value ?? '').trim();
}

export function readApplicationNotes(db, key) {
  const row = db.prepare('SELECT * FROM application_notes WHERE identity_key = ?').get(key) || null;
  const timeline = db.prepare(
    'SELECT id, entry_at, kind, note FROM application_timeline WHERE identity_key = ? ORDER BY entry_at DESC, id DESC'
  ).all(key);
  return { notes: row, timeline };
}

export function upsertApplicationNotes(db, key, fields = {}) {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO application_notes (
      identity_key, company, role, salary_asked, contact, applied_via, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(identity_key) DO UPDATE SET
      company = excluded.company,
      role = excluded.role,
      salary_asked = excluded.salary_asked,
      contact = excluded.contact,
      applied_via = excluded.applied_via,
      notes = excluded.notes,
      updated_at = excluded.updated_at
  `).run(
    key, text(fields.company), text(fields.role), text(fields.salaryAsked).slice(0, 120),
    text(fields.contact).slice(0, 200), text(fields.appliedVia).slice(0, 120),
    text(fields.notes).slice(0, 20000), now, now,
  );
  return true;
}

export function addTimelineEntry(db, key, entry = {}) {
  const now = new Date().toISOString();
  const at = text(entry.entryAt) || now.slice(0, 10);
  db.prepare(
    'INSERT INTO application_timeline (identity_key, entry_at, kind, note, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(key, at, text(entry.kind).slice(0, 60), text(entry.note).slice(0, 4000), now);
  return true;
}

export function deleteTimelineEntry(db, key, id) {
  db.prepare('DELETE FROM application_timeline WHERE id = ? AND identity_key = ?').run(Number(id), key);
  return true;
}

export function applicationNoteCounts(db) {
  const counts = new Map();
  for (const row of db.prepare(`
    SELECT identity_key,
           CASE WHEN TRIM(notes) = '' THEN 0 ELSE 1 END AS has_notes
    FROM application_notes
  `).all()) {
    counts.set(row.identity_key, { notes: row.has_notes, timeline: 0 });
  }
  for (const row of db.prepare('SELECT identity_key, COUNT(*) AS n FROM application_timeline GROUP BY identity_key').all()) {
    const existing = counts.get(row.identity_key) || { notes: 0, timeline: 0 };
    existing.timeline = row.n;
    counts.set(row.identity_key, existing);
  }
  return counts;
}
