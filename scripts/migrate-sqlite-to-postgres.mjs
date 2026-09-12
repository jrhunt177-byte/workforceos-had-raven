#!/usr/bin/env node
// One-time data migration: copies every row out of the old SQLite database into the
// new Postgres database, preserving IDs so foreign keys (threads.book_case_id,
// messages.thread_id, handoff_log.book_case_id) stay valid across the move.
//
// This script is intentionally NOT part of the app's regular dependencies — it needs
// better-sqlite3 only to read the old file, once. Run it like this:
//
//   npm install --no-save better-sqlite3
//   DATABASE_URL=... SQLITE_PATH=./data/raven.db node scripts/migrate-sqlite-to-postgres.mjs
//   npm uninstall better-sqlite3
//
// Safe to re-run: every insert uses ON CONFLICT DO NOTHING, so already-migrated rows
// are simply skipped rather than duplicated or overwritten.

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { ensureSchema, run, all } from '../server/db.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const sqlitePath = process.env.SQLITE_PATH || path.join(__dirname, '..', 'data', 'raven.db')

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required — point it at the target Postgres database.')
  process.exit(1)
}

console.log(`Reading SQLite database: ${sqlitePath}`)
const sqlite = new Database(sqlitePath, { readonly: true, fileMustExist: true })

function boolFrom(sqliteValue) {
  return !!sqliteValue
}

async function migrateTable({ name, sourceRows, conflictColumn, insertSql, toParams }) {
  console.log(`\n${name}: ${sourceRows.length} row(s) in SQLite`)
  let inserted = 0
  for (const row of sourceRows) {
    const result = await run(insertSql, toParams(row))
    if (result.changes > 0) inserted++
  }
  const rows = await all(`SELECT COUNT(*)::int AS n FROM ${name}`)
  console.log(`${name}: ${inserted} newly inserted, ${rows[0].n} total now in Postgres`)
  return { sourceCount: sourceRows.length, postgresCount: rows[0].n }
}

async function main() {
  await ensureSchema()

  const results = {}

  results.settings = await migrateTable({
    name: 'settings',
    sourceRows: sqlite.prepare('SELECT * FROM settings').all(),
    insertSql: 'INSERT INTO settings (key, value) VALUES (@key, @value) ON CONFLICT (key) DO NOTHING',
    toParams: (r) => ({ key: r.key, value: r.value }),
  })

  results.book_cases = await migrateTable({
    name: 'book_cases',
    sourceRows: sqlite.prepare('SELECT * FROM book_cases').all(),
    insertSql: `
      INSERT INTO book_cases (
        id, number, working_title, region, location, date_period, case_name, status,
        research_status, research_complete, classification, verification_status, verification_date,
        source_notes, story_brief, story_studio_url, story_studio_project_id,
        story_studio_sent, story_studio_approved, drive_folder_url,
        chairman_decision, chairman_notes, qa_factual_status, qa_factual_notes,
        qa_visual_status, qa_visual_notes, john_review_decision, john_review_notes,
        next_action, notes, created_at, updated_at
      ) VALUES (
        @id, @number, @workingTitle, @region, @location, @datePeriod, @caseName, @status,
        @researchStatus, @researchComplete, @classification, @verificationStatus, @verificationDate,
        @sourceNotes, @storyBrief, @storyStudioUrl, @storyStudioProjectId,
        @storyStudioSent, @storyStudioApproved, @driveFolderUrl,
        @chairmanDecision, @chairmanNotes, @qaFactualStatus, @qaFactualNotes,
        @qaVisualStatus, @qaVisualNotes, @johnReviewDecision, @johnReviewNotes,
        @nextAction, @notes, @createdAt, @updatedAt
      ) ON CONFLICT (id) DO NOTHING
    `,
    toParams: (r) => ({
      id: r.id,
      number: r.number,
      workingTitle: r.working_title,
      region: r.region,
      location: r.location ?? '',
      datePeriod: r.date_period ?? '',
      caseName: r.case_name,
      status: r.status,
      researchStatus: r.research_status ?? 'Not Started',
      researchComplete: boolFrom(r.research_complete),
      classification: r.classification ?? '',
      verificationStatus: r.verification_status,
      verificationDate: r.verification_date,
      sourceNotes: r.source_notes ?? '',
      storyBrief: r.story_brief ?? '',
      storyStudioUrl: r.story_studio_url,
      storyStudioProjectId: r.story_studio_project_id,
      storyStudioSent: boolFrom(r.story_studio_sent),
      storyStudioApproved: boolFrom(r.story_studio_approved),
      driveFolderUrl: r.drive_folder_url,
      chairmanDecision: r.chairman_decision ?? '',
      chairmanNotes: r.chairman_notes ?? '',
      qaFactualStatus: r.qa_factual_status ?? 'Not Started',
      qaFactualNotes: r.qa_factual_notes ?? '',
      qaVisualStatus: r.qa_visual_status ?? 'Not Started',
      qaVisualNotes: r.qa_visual_notes ?? '',
      johnReviewDecision: r.john_review_decision ?? '',
      johnReviewNotes: r.john_review_notes ?? '',
      nextAction: r.next_action,
      notes: r.notes,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }),
  })

  results.threads = await migrateTable({
    name: 'threads',
    sourceRows: sqlite.prepare('SELECT * FROM threads').all(),
    insertSql: `
      INSERT INTO threads (id, title, tag, book_case_id, archived_at, created_at, updated_at)
      VALUES (@id, @title, @tag, @bookCaseId, @archivedAt, @createdAt, @updatedAt)
      ON CONFLICT (id) DO NOTHING
    `,
    toParams: (r) => ({
      id: r.id,
      title: r.title,
      tag: r.tag,
      bookCaseId: r.book_case_id,
      archivedAt: r.archived_at,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }),
  })

  results.messages = await migrateTable({
    name: 'messages',
    sourceRows: sqlite.prepare('SELECT * FROM messages').all(),
    insertSql: `
      INSERT INTO messages (id, thread_id, role, content, created_at)
      VALUES (@id, @threadId, @role, @content, @createdAt)
      ON CONFLICT (id) DO NOTHING
    `,
    toParams: (r) => ({
      id: r.id,
      threadId: r.thread_id,
      role: r.role,
      content: r.content,
      createdAt: r.created_at,
    }),
  })

  let handoffLogRows = []
  try {
    handoffLogRows = sqlite.prepare('SELECT * FROM handoff_log').all()
  } catch {
    console.log('\nhandoff_log: table not present in source SQLite (older export) — skipping')
  }
  if (handoffLogRows.length || sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='handoff_log'").get()) {
    results.handoff_log = await migrateTable({
      name: 'handoff_log',
      sourceRows: handoffLogRows,
      insertSql: `
        INSERT INTO handoff_log (id, book_case_id, milestone, detail, drive_synced, created_at)
        VALUES (@id, @bookCaseId, @milestone, @detail, @driveSynced, @createdAt)
        ON CONFLICT (id) DO NOTHING
      `,
      toParams: (r) => ({
        id: r.id,
        bookCaseId: r.book_case_id,
        milestone: r.milestone,
        detail: r.detail,
        driveSynced: boolFrom(r.drive_synced),
        createdAt: r.created_at,
      }),
    })
  }

  sqlite.close()

  console.log('\n=== Migration summary ===')
  for (const [table, counts] of Object.entries(results)) {
    const match = counts.sourceCount <= counts.postgresCount ? 'OK' : 'MISMATCH'
    console.log(`${table}: SQLite had ${counts.sourceCount}, Postgres now has ${counts.postgresCount} — ${match}`)
  }
  console.log('\nDone. Verify the counts above before republishing.')
  process.exit(0)
}

main().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})
