import express from 'express'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import db, { logHandoff, getHandoffLog } from './db.mjs'
import { generateRavenReply } from './raven-chat.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = process.env.PORT || 5000
const PILOT_NAME = 'Midwest 12-Book Pilot'
const PILOT_TOTAL = 12

// Production pipeline (Architect ↔ Builder bridge, Issue #2) — supersedes the earlier
// simpler status list. One case/job record moves through these in order.
const STATUSES = [
  'DISCOVERED', 'AWAITING APPROVAL', 'APPROVED', 'RESEARCH', 'FACT VERIFIED',
  'STORY STUDIO', 'STORY COMPLETE', 'BOOK PRODUCTION', 'QA', 'JOHN REVIEW',
  'APPROVED TO PUBLISH', 'PUBLISHED',
]
const TAGS = [
  'Book / Case Research', 'Story Studio Prep', 'Publishing Package',
  'HAD Content', 'General Raven Ops',
]
const RESEARCH_STATUSES = ['Not Started', 'Researching', 'Complete']
const CLASSIFICATIONS = ['Confirmed', 'Reported', 'Disputed', 'Theory']
const CHAIRMAN_DECISIONS = ['Approved', 'Rejected', 'Revise']
const QA_STATUSES = ['Not Started', 'Pass', 'Fail']
const JOHN_REVIEW_DECISIONS = ['Approved for Publication', 'Return with Note', 'Rejected']
const ASSIGNMENT = 'Research and develop 12 Midwest unsolved mysteries for the Hunt After Dark / PublishingOS pilot. For each candidate, establish the material facts, maintain sources and a verification date, and prepare a concise Story Studio-ready synopsis. Core factual accuracy matters; do not waste production time resolving immaterial discrepancies that do not change the story.'

const app = express()
app.use(express.json({ limit: '1mb' }))

function now() {
  return new Date().toISOString()
}

// ---- book cases ----

function serializeBookCase(row) {
  if (!row) return null
  return {
    id: row.id,
    number: row.number,
    workingTitle: row.working_title,
    region: row.region,
    location: row.location,
    datePeriod: row.date_period,
    caseName: row.case_name,
    status: row.status,
    researchStatus: row.research_status,
    researchComplete: !!row.research_complete,
    classification: row.classification,
    verificationStatus: row.verification_status,
    verificationDate: row.verification_date,
    sourceNotes: row.source_notes,
    storyBrief: row.story_brief,
    storyStudioUrl: row.story_studio_url,
    storyStudioProjectId: row.story_studio_project_id,
    storyStudioSent: !!row.story_studio_sent,
    storyStudioApproved: !!row.story_studio_approved,
    driveFolderUrl: row.drive_folder_url,
    chairmanDecision: row.chairman_decision,
    chairmanNotes: row.chairman_notes,
    qaFactualStatus: row.qa_factual_status,
    qaFactualNotes: row.qa_factual_notes,
    qaVisualStatus: row.qa_visual_status,
    qaVisualNotes: row.qa_visual_notes,
    johnReviewDecision: row.john_review_decision,
    johnReviewNotes: row.john_review_notes,
    nextAction: row.next_action,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function getBookCase(id) {
  return db.prepare('SELECT * FROM book_cases WHERE id = ?').get(id)
}

app.get('/api/book-cases', (req, res) => {
  const rows = db.prepare('SELECT * FROM book_cases ORDER BY number ASC, created_at ASC').all()
  res.json(rows.map(serializeBookCase))
})

app.post('/api/book-cases', (req, res) => {
  const b = req.body || {}
  const id = randomUUID()
  const ts = now()
  db.prepare(`
    INSERT INTO book_cases (
      id, number, working_title, region, location, date_period, case_name, status,
      research_status, research_complete, classification, verification_status, verification_date,
      source_notes, story_brief, story_studio_url, story_studio_project_id,
      story_studio_sent, story_studio_approved, drive_folder_url, next_action, notes,
      created_at, updated_at
    ) VALUES (@id, @number, @workingTitle, @region, @location, @datePeriod, @caseName, @status,
      @researchStatus, @researchComplete, @classification, @verificationStatus, @verificationDate,
      @sourceNotes, @storyBrief, @storyStudioUrl, @storyStudioProjectId,
      @storyStudioSent, @storyStudioApproved, @driveFolderUrl, @nextAction, @notes,
      @createdAt, @updatedAt)
  `).run({
    id,
    number: b.number ?? null,
    workingTitle: b.workingTitle || '',
    region: b.region || '',
    location: b.location || '',
    datePeriod: b.datePeriod || '',
    caseName: b.caseName || '',
    status: STATUSES.includes(b.status) ? b.status : 'DISCOVERED',
    researchStatus: RESEARCH_STATUSES.includes(b.researchStatus) ? b.researchStatus : 'Not Started',
    researchComplete: b.researchComplete ? 1 : 0,
    classification: CLASSIFICATIONS.includes(b.classification) ? b.classification : '',
    verificationStatus: b.verificationStatus || '',
    verificationDate: b.verificationDate || '',
    sourceNotes: b.sourceNotes || '',
    storyBrief: b.storyBrief || '',
    storyStudioUrl: b.storyStudioUrl || '',
    storyStudioProjectId: b.storyStudioProjectId || '',
    storyStudioSent: b.storyStudioSent ? 1 : 0,
    storyStudioApproved: b.storyStudioApproved ? 1 : 0,
    driveFolderUrl: b.driveFolderUrl || '',
    nextAction: b.nextAction || '',
    notes: b.notes || '',
    createdAt: ts,
    updatedAt: ts,
  })
  logHandoff(id, 'Case created', `Book/case #${b.number ?? '—'} discovered.`)
  res.status(201).json(serializeBookCase(getBookCase(id)))
})

const BOOK_CASE_FIELD_MAP = {
  number: 'number', workingTitle: 'working_title', region: 'region', location: 'location',
  datePeriod: 'date_period', caseName: 'case_name',
  status: 'status', researchStatus: 'research_status', researchComplete: 'research_complete',
  classification: 'classification', verificationStatus: 'verification_status',
  verificationDate: 'verification_date', sourceNotes: 'source_notes', storyBrief: 'story_brief',
  storyStudioUrl: 'story_studio_url',
  storyStudioProjectId: 'story_studio_project_id', storyStudioSent: 'story_studio_sent',
  storyStudioApproved: 'story_studio_approved', driveFolderUrl: 'drive_folder_url',
  chairmanDecision: 'chairman_decision', chairmanNotes: 'chairman_notes',
  qaFactualStatus: 'qa_factual_status', qaFactualNotes: 'qa_factual_notes',
  qaVisualStatus: 'qa_visual_status', qaVisualNotes: 'qa_visual_notes',
  johnReviewDecision: 'john_review_decision', johnReviewNotes: 'john_review_notes',
  nextAction: 'next_action', notes: 'notes',
}
const BOOLEAN_BOOK_CASE_FIELDS = new Set(['researchComplete', 'storyStudioSent', 'storyStudioApproved'])

// Fields whose change is a real production milestone — logged automatically to the
// case's durable handoff trail so John never has to relay these by hand (Issue #2).
function logMilestoneChanges(bookCaseId, existing, b) {
  if ('status' in b && b.status !== existing.status) {
    logHandoff(bookCaseId, 'Status changed', `${existing.status} → ${b.status}`)
  }
  if ('chairmanDecision' in b && b.chairmanDecision && b.chairmanDecision !== existing.chairman_decision) {
    logHandoff(bookCaseId, 'Chairman/Chairwoman decision', b.chairmanDecision + (b.chairmanNotes ? `: ${b.chairmanNotes}` : ''))
  }
  if ('storyStudioSent' in b && b.storyStudioSent && !existing.story_studio_sent) {
    logHandoff(bookCaseId, 'Dispatched to Story Studio', b.storyStudioUrl || existing.story_studio_url || '')
  }
  if ('storyStudioApproved' in b && b.storyStudioApproved && !existing.story_studio_approved) {
    logHandoff(bookCaseId, 'Story Studio package received', b.storyStudioProjectId || existing.story_studio_project_id || '')
  }
  if ('qaFactualStatus' in b && b.qaFactualStatus && b.qaFactualStatus !== existing.qa_factual_status) {
    logHandoff(bookCaseId, 'Factual QA', b.qaFactualStatus + (b.qaFactualNotes ? `: ${b.qaFactualNotes}` : ''))
  }
  if ('qaVisualStatus' in b && b.qaVisualStatus && b.qaVisualStatus !== existing.qa_visual_status) {
    logHandoff(bookCaseId, 'Visual/production QA', b.qaVisualStatus + (b.qaVisualNotes ? `: ${b.qaVisualNotes}` : ''))
  }
  if ('johnReviewDecision' in b && b.johnReviewDecision && b.johnReviewDecision !== existing.john_review_decision) {
    logHandoff(bookCaseId, "John's final review", b.johnReviewDecision + (b.johnReviewNotes ? `: ${b.johnReviewNotes}` : ''))
  }
}

app.patch('/api/book-cases/:id', (req, res) => {
  const existing = getBookCase(req.params.id)
  if (!existing) return res.status(404).json({ error: 'Book/case not found' })
  const b = req.body || {}
  const sets = []
  const params = { id: req.params.id, updatedAt: now() }
  for (const [key, column] of Object.entries(BOOK_CASE_FIELD_MAP)) {
    if (key in b) {
      sets.push(`${column} = @${key}`)
      params[key] = BOOLEAN_BOOK_CASE_FIELDS.has(key) ? (b[key] ? 1 : 0) : b[key]
    }
  }
  if (sets.length) {
    db.prepare(`UPDATE book_cases SET ${sets.join(', ')}, updated_at = @updatedAt WHERE id = @id`).run(params)
  }
  logMilestoneChanges(req.params.id, existing, b)
  res.json(serializeBookCase(getBookCase(req.params.id)))
})

app.get('/api/book-cases/:id/handoff-log', (req, res) => {
  const existing = getBookCase(req.params.id)
  if (!existing) return res.status(404).json({ error: 'Book/case not found' })
  const rows = getHandoffLog(req.params.id)
  res.json(rows.map((r) => ({
    id: r.id,
    milestone: r.milestone,
    detail: r.detail,
    driveSynced: !!r.drive_synced,
    createdAt: r.created_at,
  })))
})

app.delete('/api/book-cases/:id', (req, res) => {
  const existing = getBookCase(req.params.id)
  if (!existing) return res.status(404).json({ error: 'Book/case not found' })
  db.prepare('UPDATE threads SET book_case_id = NULL WHERE book_case_id = ?').run(req.params.id)
  db.prepare('DELETE FROM book_cases WHERE id = ?').run(req.params.id)
  res.status(204).end()
})

// ---- threads ----

function serializeThread(row) {
  if (!row) return null
  return {
    id: row.id,
    title: row.title,
    tag: row.tag,
    bookCaseId: row.book_case_id,
    archived: !!row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function getThread(id) {
  return db.prepare('SELECT * FROM threads WHERE id = ?').get(id)
}

app.get('/api/threads', (req, res) => {
  const rows = db.prepare('SELECT * FROM threads ORDER BY archived_at IS NOT NULL ASC, updated_at DESC').all()
  res.json(rows.map(serializeThread))
})

app.post('/api/threads', (req, res) => {
  const b = req.body || {}
  const id = randomUUID()
  const ts = now()
  db.prepare(`
    INSERT INTO threads (id, title, tag, book_case_id, created_at, updated_at)
    VALUES (@id, @title, @tag, @bookCaseId, @createdAt, @updatedAt)
  `).run({
    id,
    title: b.title || 'New Chat',
    tag: TAGS.includes(b.tag) ? b.tag : 'General Raven Ops',
    bookCaseId: b.bookCaseId || null,
    createdAt: ts,
    updatedAt: ts,
  })
  res.status(201).json(serializeThread(getThread(id)))
})

app.patch('/api/threads/:id', (req, res) => {
  const existing = getThread(req.params.id)
  if (!existing) return res.status(404).json({ error: 'Chat not found' })
  const b = req.body || {}
  const sets = []
  const params = { id: req.params.id, updatedAt: now() }
  if ('title' in b) { sets.push('title = @title'); params.title = b.title }
  if ('tag' in b) { sets.push('tag = @tag'); params.tag = TAGS.includes(b.tag) ? b.tag : existing.tag }
  if ('bookCaseId' in b) { sets.push('book_case_id = @bookCaseId'); params.bookCaseId = b.bookCaseId || null }
  if ('archived' in b) { sets.push('archived_at = @archivedAt'); params.archivedAt = b.archived ? now() : null }
  if (sets.length) {
    db.prepare(`UPDATE threads SET ${sets.join(', ')}, updated_at = @updatedAt WHERE id = @id`).run(params)
  }
  res.json(serializeThread(getThread(req.params.id)))
})

app.delete('/api/threads/:id', (req, res) => {
  const existing = getThread(req.params.id)
  if (!existing) return res.status(404).json({ error: 'Chat not found' })
  db.prepare('DELETE FROM threads WHERE id = ?').run(req.params.id)
  res.status(204).end()
})

// ---- messages ----

function serializeMessage(row) {
  return {
    id: row.id,
    threadId: row.thread_id,
    role: row.role,
    content: row.content,
    createdAt: row.created_at,
  }
}

app.get('/api/threads/:id/messages', (req, res) => {
  const thread = getThread(req.params.id)
  if (!thread) return res.status(404).json({ error: 'Chat not found' })
  const rows = db.prepare('SELECT * FROM messages WHERE thread_id = ? ORDER BY created_at ASC').all(req.params.id)
  res.json(rows.map(serializeMessage))
})

app.post('/api/threads/:id/messages', async (req, res) => {
  const thread = getThread(req.params.id)
  if (!thread) return res.status(404).json({ error: 'Chat not found' })
  const content = (req.body || {}).content
  if (!content || !content.trim()) return res.status(400).json({ error: 'Message content is required' })

  const userMessage = {
    id: randomUUID(),
    thread_id: thread.id,
    role: 'user',
    content: content.trim(),
    created_at: now(),
  }
  db.prepare('INSERT INTO messages (id, thread_id, role, content, created_at) VALUES (@id, @thread_id, @role, @content, @created_at)').run(userMessage)

  const history = db.prepare('SELECT * FROM messages WHERE thread_id = ? ORDER BY created_at ASC').all(thread.id)
  const bookCase = thread.book_case_id ? getBookCase(thread.book_case_id) : null

  try {
    const replyText = await generateRavenReply({
      apiKey: process.env.ANTHROPIC_API_KEY,
      bookCase,
      history: history.map((m) => ({ role: m.role, content: m.content })),
    })
    const ravenMessage = {
      id: randomUUID(),
      thread_id: thread.id,
      role: 'raven',
      content: replyText,
      created_at: now(),
    }
    db.prepare('INSERT INTO messages (id, thread_id, role, content, created_at) VALUES (@id, @thread_id, @role, @content, @created_at)').run(ravenMessage)
    db.prepare('UPDATE threads SET updated_at = @updatedAt WHERE id = @id').run({ id: thread.id, updatedAt: now() })
    res.status(201).json({
      userMessage: serializeMessage(userMessage),
      ravenMessage: serializeMessage(ravenMessage),
    })
  } catch (err) {
    db.prepare('UPDATE threads SET updated_at = @updatedAt WHERE id = @id').run({ id: thread.id, updatedAt: now() })
    res.status(err.statusCode || 502).json({
      userMessage: serializeMessage(userMessage),
      error: err.message,
    })
  }
})

// ---- settings ----

function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all()
  const out = {}
  for (const r of rows) out[r.key] = r.value
  return out
}

app.get('/api/settings', (req, res) => {
  res.json(getSettings())
})

app.patch('/api/settings', (req, res) => {
  const b = req.body || {}
  const upsert = db.prepare('INSERT INTO settings (key, value) VALUES (@key, @value) ON CONFLICT(key) DO UPDATE SET value = @value')
  for (const key of ['storyStudioUrl', 'driveWorkspaceUrl']) {
    if (key in b) upsert.run({ key, value: b[key] || '' })
  }
  res.json(getSettings())
})

// ---- bootstrap / dashboard ----

app.get('/api/bootstrap', (req, res) => {
  const bookCases = db.prepare('SELECT * FROM book_cases ORDER BY number ASC, created_at ASC').all().map(serializeBookCase)
  const threads = db.prepare('SELECT * FROM threads ORDER BY archived_at IS NOT NULL ASC, updated_at DESC').all().map(serializeThread)
  const completed = bookCases.filter((c) => c.status === 'PUBLISHED').length
  res.json({
    identity: {
      name: 'Raven',
      role: 'Phase-1 Operator, PublishingOS',
      assignment: ASSIGNMENT,
    },
    pilot: {
      name: PILOT_NAME,
      total: PILOT_TOTAL,
      completed,
    },
    statuses: STATUSES,
    tags: TAGS,
    researchStatuses: RESEARCH_STATUSES,
    classifications: CLASSIFICATIONS,
    chairmanDecisions: CHAIRMAN_DECISIONS,
    qaStatuses: QA_STATUSES,
    johnReviewDecisions: JOHN_REVIEW_DECISIONS,
    bookCases,
    threads,
    settings: getSettings(),
    chatConfigured: !!process.env.ANTHROPIC_API_KEY,
  })
})

app.use(express.static(path.join(__dirname, '..', 'public')))
app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'))
})

app.listen(PORT, () => {
  console.log(`Raven workspace listening on port ${PORT}`)
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('ANTHROPIC_API_KEY is not set — chat replies will fail until it is configured.')
  }
})
