import express from 'express'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { get, all, run, logHandoff, getHandoffLog, initDb } from './db.mjs'
import { generateRavenReply, extractCaseFields } from './raven-chat.mjs'

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

function asyncHandler(fn) {
  return (req, res) => fn(req, res).catch((err) => {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  })
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
    chairmanLockedAt: row.chairman_locked_at || '',
    chairmanApprovedBy: row.chairman_approved_by || '',
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
  return get('SELECT * FROM book_cases WHERE id = ?', id)
}

app.get('/api/book-cases', asyncHandler(async (req, res) => {
  const rows = await all('SELECT * FROM book_cases ORDER BY number ASC, created_at ASC')
  res.json(rows.map(serializeBookCase))
}))

app.post('/api/book-cases', asyncHandler(async (req, res) => {
  const b = req.body || {}
  const id = randomUUID()
  const ts = now()
  await run(`
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
  `, {
    id,
    number: b.number ?? null,
    workingTitle: b.workingTitle || '',
    region: b.region || '',
    location: b.location || '',
    datePeriod: b.datePeriod || '',
    caseName: b.caseName || '',
    status: STATUSES.includes(b.status) ? b.status : 'DISCOVERED',
    researchStatus: RESEARCH_STATUSES.includes(b.researchStatus) ? b.researchStatus : 'Not Started',
    researchComplete: !!b.researchComplete,
    classification: CLASSIFICATIONS.includes(b.classification) ? b.classification : '',
    verificationStatus: b.verificationStatus || '',
    verificationDate: b.verificationDate || '',
    sourceNotes: b.sourceNotes || '',
    storyBrief: b.storyBrief || '',
    storyStudioUrl: b.storyStudioUrl || '',
    storyStudioProjectId: b.storyStudioProjectId || '',
    storyStudioSent: !!b.storyStudioSent,
    storyStudioApproved: !!b.storyStudioApproved,
    driveFolderUrl: b.driveFolderUrl || '',
    nextAction: b.nextAction || '',
    notes: b.notes || '',
    createdAt: ts,
    updatedAt: ts,
  })
  await logHandoff(id, 'Case created', `Book/case #${b.number ?? '—'} discovered.`)
  res.status(201).json(serializeBookCase(await getBookCase(id)))
}))

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
async function logMilestoneChanges(bookCaseId, existing, b) {
  if ('status' in b && b.status !== existing.status) {
    await logHandoff(bookCaseId, 'Status changed', `${existing.status} → ${b.status}`)
  }
  if ('chairmanDecision' in b && b.chairmanDecision && b.chairmanDecision !== existing.chairman_decision) {
    await logHandoff(bookCaseId, 'Chairman/Chairwoman decision', b.chairmanDecision + (b.chairmanNotes ? `: ${b.chairmanNotes}` : ''))
  }
  if ('storyStudioSent' in b && b.storyStudioSent && !existing.story_studio_sent) {
    await logHandoff(bookCaseId, 'Dispatched to Story Studio', b.storyStudioUrl || existing.story_studio_url || '')
  }
  if ('storyStudioApproved' in b && b.storyStudioApproved && !existing.story_studio_approved) {
    await logHandoff(bookCaseId, 'Story Studio package received', b.storyStudioProjectId || existing.story_studio_project_id || '')
  }
  if ('qaFactualStatus' in b && b.qaFactualStatus && b.qaFactualStatus !== existing.qa_factual_status) {
    await logHandoff(bookCaseId, 'Factual QA', b.qaFactualStatus + (b.qaFactualNotes ? `: ${b.qaFactualNotes}` : ''))
  }
  if ('qaVisualStatus' in b && b.qaVisualStatus && b.qaVisualStatus !== existing.qa_visual_status) {
    await logHandoff(bookCaseId, 'Visual/production QA', b.qaVisualStatus + (b.qaVisualNotes ? `: ${b.qaVisualNotes}` : ''))
  }
  if ('johnReviewDecision' in b && b.johnReviewDecision && b.johnReviewDecision !== existing.john_review_decision) {
    await logHandoff(bookCaseId, "John's final review", b.johnReviewDecision + (b.johnReviewNotes ? `: ${b.johnReviewNotes}` : ''))
  }
}

app.patch('/api/book-cases/:id', asyncHandler(async (req, res) => {
  const existing = await getBookCase(req.params.id)
  if (!existing) return res.status(404).json({ error: 'Book/case not found' })
  const b = req.body || {}
  const sets = []
  const params = { id: req.params.id, updatedAt: now() }
  for (const [key, column] of Object.entries(BOOK_CASE_FIELD_MAP)) {
    if (key in b) {
      sets.push(`${column} = @${key}`)
      params[key] = BOOLEAN_BOOK_CASE_FIELDS.has(key) ? !!b[key] : b[key]
    }
  }
  if (sets.length) {
    await run(`UPDATE book_cases SET ${sets.join(', ')}, updated_at = @updatedAt WHERE id = @id`, params)
  }
  await logMilestoneChanges(req.params.id, existing, b)
  res.json(serializeBookCase(await getBookCase(req.params.id)))
}))

// Chairman/Chairwoman approval is intentionally a separate, explicit action from the
// draft dropdown on the regular PATCH route — chairman_locked_at/chairman_approved_by
// are excluded from BOOK_CASE_FIELD_MAP so a lock can only happen here, never as a side
// effect of an ordinary form save. Locking APPROVED is what triggers the downstream
// automation the Architect specified (Issue #2): auto-populate blank fields from the
// case's linked research chat, and advance status into the pipeline.
app.post('/api/book-cases/:id/lock-approval', asyncHandler(async (req, res) => {
  const existing = await getBookCase(req.params.id)
  if (!existing) return res.status(404).json({ error: 'Book/case not found' })
  const b = req.body || {}
  const decision = b.decision
  const approverName = (b.approverName || '').trim()
  if (!CHAIRMAN_DECISIONS.includes(decision)) {
    return res.status(400).json({ error: `decision must be one of: ${CHAIRMAN_DECISIONS.join(', ')}` })
  }
  if (!approverName) {
    return res.status(400).json({ error: 'approverName is required to lock a decision' })
  }

  const lockedAt = now()
  await run(
    'UPDATE book_cases SET chairman_decision = @decision, chairman_notes = @notes, chairman_locked_at = @lockedAt, chairman_approved_by = @approverName, updated_at = @lockedAt WHERE id = @id',
    { id: req.params.id, decision, notes: b.notes ?? existing.chairman_notes, lockedAt, approverName }
  )
  await logHandoff(req.params.id, 'Chairman/Chairwoman decision LOCKED', `${decision} by ${approverName}${b.notes ? `: ${b.notes}` : ''}`)

  if (decision === 'Approved') {
    const currentIdx = STATUSES.indexOf(existing.status)
    const approvedIdx = STATUSES.indexOf('APPROVED')
    if (currentIdx < approvedIdx) {
      await run('UPDATE book_cases SET status = @status, updated_at = @updatedAt WHERE id = @id', { id: req.params.id, status: 'APPROVED', updatedAt: now() })
      await logHandoff(req.params.id, 'Status changed', `${existing.status} → APPROVED (auto-advanced on locked approval)`)
    }
    await autoPopulateFromResearch(req.params.id)
  }

  res.json(serializeBookCase(await getBookCase(req.params.id)))
}))

// Best-effort: fills only fields still blank, from whatever's been discussed in threads
// already linked to this case. Never overwrites data John or Raven already entered, and
// never invents facts — extractCaseFields leaves anything not clearly established blank.
async function autoPopulateFromResearch(bookCaseId) {
  const bookCase = await getBookCase(bookCaseId)
  const threads = await all('SELECT id FROM threads WHERE book_case_id = ? ORDER BY updated_at ASC', bookCaseId)
  if (!threads.length) {
    await logHandoff(bookCaseId, 'Auto-populate skipped', 'no chat thread is linked to this case yet')
    return
  }
  const messages = []
  for (const t of threads) {
    const rows = await all('SELECT role, content, created_at FROM messages WHERE thread_id = ? ORDER BY created_at ASC', t.id)
    messages.push(...rows)
  }
  messages.sort((a, c) => new Date(a.created_at) - new Date(c.created_at))

  const { fields, skipped } = await extractCaseFields({
    apiKey: process.env.ANTHROPIC_API_KEY,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  })
  if (skipped) {
    await logHandoff(bookCaseId, 'Auto-populate skipped', skipped)
    return
  }

  const sets = []
  const params = { id: bookCaseId, updatedAt: now() }
  const filled = []
  for (const [key, column] of Object.entries(BOOK_CASE_FIELD_MAP)) {
    if (!(key in fields)) continue
    const currentValue = bookCase[column]
    if (currentValue && String(currentValue).trim()) continue // never overwrite existing data
    sets.push(`${column} = @${key}`)
    params[key] = fields[key]
    filled.push(key)
  }
  if (sets.length) {
    await run(`UPDATE book_cases SET ${sets.join(', ')}, updated_at = @updatedAt WHERE id = @id`, params)
  }
  await logHandoff(
    bookCaseId,
    'Auto-populated from research chat',
    filled.length ? `Filled: ${filled.join(', ')}` : 'Nothing new to fill — existing fields already populated'
  )
}

app.get('/api/book-cases/:id/handoff-log', asyncHandler(async (req, res) => {
  const existing = await getBookCase(req.params.id)
  if (!existing) return res.status(404).json({ error: 'Book/case not found' })
  const rows = await getHandoffLog(req.params.id)
  res.json(rows.map((r) => ({
    id: r.id,
    milestone: r.milestone,
    detail: r.detail,
    driveSynced: !!r.drive_synced,
    createdAt: r.created_at,
  })))
}))

app.delete('/api/book-cases/:id', asyncHandler(async (req, res) => {
  const existing = await getBookCase(req.params.id)
  if (!existing) return res.status(404).json({ error: 'Book/case not found' })
  await run('UPDATE threads SET book_case_id = NULL WHERE book_case_id = ?', req.params.id)
  await run('DELETE FROM book_cases WHERE id = ?', req.params.id)
  res.status(204).end()
}))

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
  return get('SELECT * FROM threads WHERE id = ?', id)
}

app.get('/api/threads', asyncHandler(async (req, res) => {
  const rows = await all('SELECT * FROM threads ORDER BY archived_at IS NOT NULL ASC, updated_at DESC')
  res.json(rows.map(serializeThread))
}))

app.post('/api/threads', asyncHandler(async (req, res) => {
  const b = req.body || {}
  const id = randomUUID()
  const ts = now()
  await run(`
    INSERT INTO threads (id, title, tag, book_case_id, created_at, updated_at)
    VALUES (@id, @title, @tag, @bookCaseId, @createdAt, @updatedAt)
  `, {
    id,
    title: b.title || 'New Chat',
    tag: TAGS.includes(b.tag) ? b.tag : 'General Raven Ops',
    bookCaseId: b.bookCaseId || null,
    createdAt: ts,
    updatedAt: ts,
  })
  res.status(201).json(serializeThread(await getThread(id)))
}))

app.patch('/api/threads/:id', asyncHandler(async (req, res) => {
  const existing = await getThread(req.params.id)
  if (!existing) return res.status(404).json({ error: 'Chat not found' })
  const b = req.body || {}
  const sets = []
  const params = { id: req.params.id, updatedAt: now() }
  if ('title' in b) { sets.push('title = @title'); params.title = b.title }
  if ('tag' in b) { sets.push('tag = @tag'); params.tag = TAGS.includes(b.tag) ? b.tag : existing.tag }
  if ('bookCaseId' in b) { sets.push('book_case_id = @bookCaseId'); params.bookCaseId = b.bookCaseId || null }
  if ('archived' in b) { sets.push('archived_at = @archivedAt'); params.archivedAt = b.archived ? now() : null }
  if (sets.length) {
    await run(`UPDATE threads SET ${sets.join(', ')}, updated_at = @updatedAt WHERE id = @id`, params)
  }
  res.json(serializeThread(await getThread(req.params.id)))
}))

app.delete('/api/threads/:id', asyncHandler(async (req, res) => {
  const existing = await getThread(req.params.id)
  if (!existing) return res.status(404).json({ error: 'Chat not found' })
  await run('DELETE FROM threads WHERE id = ?', req.params.id)
  res.status(204).end()
}))

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

app.get('/api/threads/:id/messages', asyncHandler(async (req, res) => {
  const thread = await getThread(req.params.id)
  if (!thread) return res.status(404).json({ error: 'Chat not found' })
  const rows = await all('SELECT * FROM messages WHERE thread_id = ? ORDER BY created_at ASC', req.params.id)
  res.json(rows.map(serializeMessage))
}))

app.post('/api/threads/:id/messages', asyncHandler(async (req, res) => {
  const thread = await getThread(req.params.id)
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
  await run('INSERT INTO messages (id, thread_id, role, content, created_at) VALUES (@id, @thread_id, @role, @content, @created_at)', userMessage)

  const history = await all('SELECT * FROM messages WHERE thread_id = ? ORDER BY created_at ASC', thread.id)
  const bookCase = thread.book_case_id ? await getBookCase(thread.book_case_id) : null

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
    await run('INSERT INTO messages (id, thread_id, role, content, created_at) VALUES (@id, @thread_id, @role, @content, @created_at)', ravenMessage)
    await run('UPDATE threads SET updated_at = @updatedAt WHERE id = @id', { id: thread.id, updatedAt: now() })
    res.status(201).json({
      userMessage: serializeMessage(userMessage),
      ravenMessage: serializeMessage(ravenMessage),
    })
  } catch (err) {
    await run('UPDATE threads SET updated_at = @updatedAt WHERE id = @id', { id: thread.id, updatedAt: now() })
    res.status(err.statusCode || 502).json({
      userMessage: serializeMessage(userMessage),
      error: err.message,
    })
  }
}))

// ---- settings ----

async function getSettings() {
  const rows = await all('SELECT key, value FROM settings')
  const out = {}
  for (const r of rows) out[r.key] = r.value
  return out
}

app.get('/api/settings', asyncHandler(async (req, res) => {
  res.json(await getSettings())
}))

app.patch('/api/settings', asyncHandler(async (req, res) => {
  const b = req.body || {}
  for (const key of ['storyStudioUrl', 'driveWorkspaceUrl']) {
    if (key in b) {
      await run(
        'INSERT INTO settings (key, value) VALUES (@key, @value) ON CONFLICT(key) DO UPDATE SET value = @value',
        { key, value: b[key] || '' }
      )
    }
  }
  res.json(await getSettings())
}))

// ---- bootstrap / dashboard ----

app.get('/api/bootstrap', asyncHandler(async (req, res) => {
  const bookCaseRows = await all('SELECT * FROM book_cases ORDER BY number ASC, created_at ASC')
  const bookCases = bookCaseRows.map(serializeBookCase)
  const threadRows = await all('SELECT * FROM threads ORDER BY archived_at IS NOT NULL ASC, updated_at DESC')
  const threads = threadRows.map(serializeThread)
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
    settings: await getSettings(),
    chatConfigured: !!process.env.ANTHROPIC_API_KEY,
  })
}))

app.use(express.static(path.join(__dirname, '..', 'public')))
app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'))
})

async function main() {
  await initDb()
  app.listen(PORT, () => {
    console.log(`Raven workspace listening on port ${PORT}`)
    if (!process.env.ANTHROPIC_API_KEY) {
      console.warn('ANTHROPIC_API_KEY is not set — chat replies will fail until it is configured.')
    }
  })
}

main().catch((err) => {
  console.error('Failed to start Raven workspace:', err)
  process.exit(1)
})
