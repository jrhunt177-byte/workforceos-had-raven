import pg from 'pg'

const { Pool } = pg

if (!process.env.DATABASE_URL) {
  console.warn('DATABASE_URL is not set — database connections will fail until it is configured.')
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

// Accepts either named (@key) placeholders with a single params object, or
// positional (?) placeholders with plain arguments — matches how the rest of
// this codebase already calls into the database, just translated to the
// numbered ($1, $2, ...) placeholders node-postgres requires.
function toPositional(sql, args) {
  if (args.length === 1 && args[0] !== null && typeof args[0] === 'object' && !Array.isArray(args[0])) {
    const paramsObj = args[0]
    const values = []
    const text = sql.replace(/@(\w+)/g, (_, name) => {
      values.push(paramsObj[name])
      return `$${values.length}`
    })
    return { text, values }
  }
  let i = 0
  const text = sql.replace(/\?/g, () => `$${++i}`)
  return { text, values: args }
}

export async function run(sql, ...args) {
  const { text, values } = toPositional(sql, args)
  const result = await pool.query(text, values)
  return { changes: result.rowCount }
}

export async function get(sql, ...args) {
  const { text, values } = toPositional(sql, args)
  const result = await pool.query(text, values)
  return result.rows[0]
}

export async function all(sql, ...args) {
  const { text, values } = toPositional(sql, args)
  const result = await pool.query(text, values)
  return result.rows
}

function randomId() {
  return 'seed-' + Math.random().toString(36).slice(2, 10)
}

// The Architect bridge (Issue #2) supersedes the old status vocabulary with a full
// production pipeline. Remap any existing rows so nothing is stuck on a retired value.
const STATUS_MIGRATION = {
  'Idea': 'DISCOVERED',
  'Researching': 'RESEARCH',
  'Verified': 'FACT VERIFIED',
  'Story Studio': 'STORY STUDIO',
  'Story Approved': 'STORY COMPLETE',
  'Artwork': 'BOOK PRODUCTION',
  'Layout': 'BOOK PRODUCTION',
  'QA': 'QA',
  'KDP Ready': 'APPROVED TO PUBLISH',
  'Published': 'PUBLISHED',
}

// Schema creation + additive migrations + status remap only — no seeding. Split out
// so the one-time SQLite→Postgres data migration can create the schema on an empty
// database without initDb()'s seed step racing it and inserting placeholder rows
// first (see scripts/migrate-sqlite-to-postgres.mjs).
export async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS book_cases (
      id TEXT PRIMARY KEY,
      number INTEGER,
      working_title TEXT NOT NULL DEFAULT '',
      region TEXT NOT NULL DEFAULT '',
      location TEXT NOT NULL DEFAULT '',
      date_period TEXT NOT NULL DEFAULT '',
      case_name TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'DISCOVERED',
      research_status TEXT NOT NULL DEFAULT 'Not Started',
      research_complete BOOLEAN NOT NULL DEFAULT FALSE,
      classification TEXT NOT NULL DEFAULT '',
      verification_status TEXT NOT NULL DEFAULT '',
      verification_date TEXT NOT NULL DEFAULT '',
      source_notes TEXT NOT NULL DEFAULT '',
      story_brief TEXT NOT NULL DEFAULT '',
      story_studio_url TEXT NOT NULL DEFAULT '',
      story_studio_project_id TEXT NOT NULL DEFAULT '',
      story_studio_sent BOOLEAN NOT NULL DEFAULT FALSE,
      story_studio_approved BOOLEAN NOT NULL DEFAULT FALSE,
      drive_folder_url TEXT NOT NULL DEFAULT '',
      chairman_decision TEXT NOT NULL DEFAULT '',
      chairman_notes TEXT NOT NULL DEFAULT '',
      chairman_locked_at TEXT NOT NULL DEFAULT '',
      chairman_approved_by TEXT NOT NULL DEFAULT '',
      qa_factual_status TEXT NOT NULL DEFAULT 'Not Started',
      qa_factual_notes TEXT NOT NULL DEFAULT '',
      qa_visual_status TEXT NOT NULL DEFAULT 'Not Started',
      qa_visual_notes TEXT NOT NULL DEFAULT '',
      john_review_decision TEXT NOT NULL DEFAULT '',
      john_review_notes TEXT NOT NULL DEFAULT '',
      next_action TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS threads (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT 'New Chat',
      tag TEXT NOT NULL DEFAULT 'General Raven Ops',
      book_case_id TEXT REFERENCES book_cases(id) ON DELETE SET NULL,
      archived_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('user', 'raven')),
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_threads_updated ON threads(updated_at);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS handoff_log (
      id TEXT PRIMARY KEY,
      book_case_id TEXT NOT NULL REFERENCES book_cases(id) ON DELETE CASCADE,
      milestone TEXT NOT NULL,
      detail TEXT NOT NULL DEFAULT '',
      drive_synced BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_handoff_log_case ON handoff_log(book_case_id, created_at);
  `)

  // Migrate book_cases created before later fields existed — additive only.
  const NEW_BOOK_CASE_COLUMNS = [
    ['location', "TEXT NOT NULL DEFAULT ''"],
    ['date_period', "TEXT NOT NULL DEFAULT ''"],
    ['research_status', "TEXT NOT NULL DEFAULT 'Not Started'"],
    ['classification', "TEXT NOT NULL DEFAULT ''"],
    ['source_notes', "TEXT NOT NULL DEFAULT ''"],
    ['story_brief', "TEXT NOT NULL DEFAULT ''"],
    ['chairman_decision', "TEXT NOT NULL DEFAULT ''"],
    ['chairman_notes', "TEXT NOT NULL DEFAULT ''"],
    ['chairman_locked_at', "TEXT NOT NULL DEFAULT ''"],
    ['chairman_approved_by', "TEXT NOT NULL DEFAULT ''"],
    ['qa_factual_status', "TEXT NOT NULL DEFAULT 'Not Started'"],
    ['qa_factual_notes', "TEXT NOT NULL DEFAULT ''"],
    ['qa_visual_status', "TEXT NOT NULL DEFAULT 'Not Started'"],
    ['qa_visual_notes', "TEXT NOT NULL DEFAULT ''"],
    ['john_review_decision', "TEXT NOT NULL DEFAULT ''"],
    ['john_review_notes', "TEXT NOT NULL DEFAULT ''"],
  ]
  for (const [name, definition] of NEW_BOOK_CASE_COLUMNS) {
    await pool.query(`ALTER TABLE book_cases ADD COLUMN IF NOT EXISTS ${name} ${definition}`)
  }

  for (const [oldStatus, newStatus] of Object.entries(STATUS_MIGRATION)) {
    await pool.query('UPDATE book_cases SET status = $1 WHERE status = $2', [newStatus, oldStatus])
  }
}

export async function initDb() {
  await ensureSchema()

  // Seed defaults once, on first boot only.
  const seedTs = new Date().toISOString()

  const { rows: settingsRows } = await pool.query('SELECT COUNT(*)::int AS n FROM settings')
  if (settingsRows[0].n === 0) {
    await pool.query('INSERT INTO settings (key, value) VALUES ($1, $2)', ['storyStudioUrl', 'https://prompt-content-engine--jrhunt177.replit.app'])
    await pool.query('INSERT INTO settings (key, value) VALUES ($1, $2)', ['driveWorkspaceUrl', ''])
  }

  const { rows: bookCaseRows } = await pool.query('SELECT COUNT(*)::int AS n FROM book_cases')
  if (bookCaseRows[0].n === 0) {
    await pool.query(`
      INSERT INTO book_cases (
        id, number, working_title, region, case_name, status, research_complete,
        verification_status, verification_date, story_studio_url, story_studio_project_id,
        story_studio_sent, story_studio_approved, drive_folder_url, next_action, notes,
        created_at, updated_at
      ) VALUES ($1, 1, 'Book 01 - Midwest Mystery Pilot', '', '', 'DISCOVERED', FALSE,
        '', '', '', '',
        FALSE, FALSE, '', 'Placeholder/test record — begin research when ready.',
        'Placeholder/test record only. Not populated with real research.', $2, $3)
    `, [randomId(), seedTs, seedTs])
  }

  // The pilot is fixed at 12 books. Fill in any missing slot numbers 1-12 as empty,
  // unresearched placeholders — never inventing case content.
  const { rows: numberRows } = await pool.query('SELECT number FROM book_cases WHERE number IS NOT NULL')
  const takenNumbers = new Set(numberRows.map((r) => r.number))
  for (let n = 1; n <= 12; n++) {
    if (!takenNumbers.has(n)) {
      const ts = new Date().toISOString()
      await pool.query(`
        INSERT INTO book_cases (
          id, number, working_title, region, case_name, status, research_complete,
          verification_status, verification_date, story_studio_url, story_studio_project_id,
          story_studio_sent, story_studio_approved, drive_folder_url, next_action, notes,
          created_at, updated_at
        ) VALUES ($1, $2, '', '', '', 'DISCOVERED', FALSE, '', '', '', '', FALSE, FALSE, '', '', '', $3, $4)
      `, [randomId(), n, ts, ts])
    }
  }
}

// Durable, automatic milestone trail per case — the interim shared-state layer until
// real Google Drive API writes are wired up (needs OAuth credentials only John can
// create). drive_synced stays false until a real Drive write lands; nothing here
// depends on John copying anything manually.
export async function logHandoff(bookCaseId, milestone, detail = '') {
  await run(
    'INSERT INTO handoff_log (id, book_case_id, milestone, detail, drive_synced, created_at) VALUES (@id, @bookCaseId, @milestone, @detail, FALSE, @createdAt)',
    { id: 'log-' + Math.random().toString(36).slice(2, 10), bookCaseId, milestone, detail, createdAt: new Date().toISOString() }
  )
}

export async function getHandoffLog(bookCaseId) {
  return all('SELECT * FROM handoff_log WHERE book_case_id = ? ORDER BY created_at ASC', bookCaseId)
}

export default { get, all, run }
