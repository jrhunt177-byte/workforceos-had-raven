const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'
const DEFAULT_MODEL = 'claude-sonnet-5'
const DEFAULT_MAX_TOKENS = 2048
const WEB_SEARCH_MAX_USES = 5

const CHARTER = `You are Raven (HAD-001), Media Manager & Distribution Director for PublishingOS / Hunt After DarkOS, reporting to Chairwoman Pia Hunt.

Your active assignment: Research and develop 12 Midwest unsolved mysteries for the Hunt After Dark / PublishingOS pilot. For each candidate, establish the material facts, maintain sources and a verification date, and prepare a concise Story Studio-ready synopsis. Core factual accuracy matters; do not waste production time resolving immaterial discrepancies that do not change the story. For historical-era cases, judge the available evidence reasonably for its period rather than nitpicking immaterial discrepancies.

You have live web search. Use it to verify facts, find primary sources (news archives, court/police records, local historical societies), and confirm details rather than relying on recall alone — recall is a starting point, not a source. When you use search results, say what you found and where it came from so it can be recorded as a source.

Story Studio (a separate app at https://prompt-content-engine--jrhunt177.replit.app) is the canonical story-building engine once a case is ready for it — you do not rebuild it, you hand cases to it and track status.

When you discuss facts about a case, mark each material claim with one of four labels so theories never get mistaken for facts downstream:
- Confirmed — established by a reliable primary source
- Reported — stated by a source (news report, local account) but not independently confirmed
- Disputed — sources conflict
- Theory — a plausible inference or local legend, not established fact

You do not manage subcontractors, employees, or other agents. You may prepare promotional content, but Pia posts Hunt After Dark content herself — you never take over posting.

Be concise, direct, and grounded in the case data given below. If something isn't in the data, say it isn't tracked yet rather than guessing — or search for it.`

const LOCK_APPROVAL_CAPABILITY_NOTE = `

### Chairman/Chairwoman approval, in this conversation
You do not silently rewrite the Book/Case record from ordinary conversation, and you never decide approval yourself — only the Chairman or Chairwoman (John or Pia) approves, rejects, or asks for revisions on a candidate. But when one of them gives you an explicit, unambiguous instruction to lock a decision — for example "Approved, lock it in," "Lock this as Rejected," or "That's approved, go ahead and lock it" — you have a lock_case_approval tool and should use it yourself, tied to this conversation's linked book/case. Do not tell them someone else has to enter it manually; that capability now exists and you should use it.

Locking Approved automatically fills in this case's blank Book/Case fields from what's established in this conversation and advances the pipeline — you don't do that part by hand.

Only call the tool on an explicit lock instruction — never on your own initiative, and never from a merely positive or encouraging remark like "looks good" or "I like this" without an actual instruction to lock it. If you don't know who is giving the instruction, ask for their name first — the record keeps whoever approved it.`

function formatCaseContext(bookCase) {
  if (!bookCase) return '\n\nThis conversation is not linked to a specific book/case record.'
  return [
    '\n\n### Linked book/case record',
    `Book/Case #${bookCase.number ?? '—'}: ${bookCase.working_title || '(untitled)'}`,
    `Location: ${bookCase.location || 'not recorded'} · Date/period: ${bookCase.date_period || 'not recorded'}`,
    `Region: ${bookCase.region || 'not recorded'} · Case name: ${bookCase.case_name || 'not recorded'}`,
    `Status: ${bookCase.status} · Research status: ${bookCase.research_status || 'Not Started'}`,
    `Overall classification: ${bookCase.classification || 'not yet classified'}`,
    `Verification: ${bookCase.verification_status || 'not recorded'}${bookCase.verification_date ? ` (${bookCase.verification_date})` : ''}`,
    bookCase.source_notes ? `Sources: ${bookCase.source_notes}` : null,
    bookCase.story_brief ? `Story Studio brief: ${bookCase.story_brief}` : null,
    `Story Studio: ${bookCase.story_studio_url || 'not linked yet'}${bookCase.story_studio_sent ? ' — sent' : ''}${bookCase.story_studio_approved ? ' — approved' : ''}`,
    `Drive folder: ${bookCase.drive_folder_url || 'not linked yet'}`,
    bookCase.chairman_decision ? `Chairman/Chairwoman decision: ${bookCase.chairman_decision}${bookCase.chairman_notes ? ` (${bookCase.chairman_notes})` : ''}` : null,
    (bookCase.qa_factual_status && bookCase.qa_factual_status !== 'Not Started') ? `Factual QA: ${bookCase.qa_factual_status}${bookCase.qa_factual_notes ? ` (${bookCase.qa_factual_notes})` : ''}` : null,
    (bookCase.qa_visual_status && bookCase.qa_visual_status !== 'Not Started') ? `Visual/production QA: ${bookCase.qa_visual_status}${bookCase.qa_visual_notes ? ` (${bookCase.qa_visual_notes})` : ''}` : null,
    bookCase.john_review_decision ? `John's final review: ${bookCase.john_review_decision}${bookCase.john_review_notes ? ` (${bookCase.john_review_notes})` : ''}` : null,
    `Next action: ${bookCase.next_action || 'not recorded'}`,
    bookCase.notes ? `Notes: ${bookCase.notes}` : null,
  ].filter(Boolean).join('\n')
}

export function buildRavenSystemPrompt({ bookCase = null, canLockApproval = false } = {}) {
  const capabilityNote = (bookCase && canLockApproval) ? LOCK_APPROVAL_CAPABILITY_NOTE : ''
  return `${CHARTER}${formatCaseContext(bookCase)}${capabilityNote}`
}

const LOCK_APPROVAL_TOOL = {
  name: 'lock_case_approval',
  description: "Lock the Chairman/Chairwoman's decision on the book/case linked to this conversation. Only call this when the human gives an unambiguous, explicit instruction to approve/reject/revise AND lock/confirm it. Never call this on your own initiative, and never infer approval from a merely positive or encouraging remark.",
  input_schema: {
    type: 'object',
    properties: {
      decision: { type: 'string', enum: ['Approved', 'Rejected', 'Revise'], description: 'The Chairman/Chairwoman decision being locked.' },
      approverName: { type: 'string', description: "The human's name. If it hasn't come up in this conversation and isn't otherwise clear, ask them for their name before calling this tool rather than guessing." },
      notes: { type: 'string', description: 'Optional short note capturing the reasoning behind the decision.' },
    },
    required: ['decision', 'approverName'],
  },
}

function toAnthropicMessages(history = []) {
  return history.map((m) => ({
    role: m.role === 'raven' ? 'assistant' : 'user',
    content: m.content,
  }))
}

async function callAnthropic({ apiKey, model, maxTokens, system, messages, tools, fetchImpl }) {
  const response = await fetchImpl(ANTHROPIC_MESSAGES_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify({ model, max_tokens: maxTokens, system, messages, tools }),
  })
  if (!response.ok) {
    const bodyText = await response.text().catch(() => '')
    const error = new Error(`Raven chat upstream error (${response.status})`)
    error.statusCode = response.status === 429 ? 429 : 502
    error.upstreamBody = bodyText.slice(0, 500)
    throw error
  }
  return response.json()
}

const MAX_TOOL_ROUNDS = 4

/**
 * Calls the Anthropic Messages API directly over HTTPS, matching the same provider-integration
 * convention used elsewhere in this product family. Fails closed when no key is configured
 * rather than returning a fabricated reply.
 *
 * When a linked book/case and an onLockApproval callback are both given, Raven is offered a
 * lock_case_approval tool and can execute an explicit, unambiguous lock instruction herself
 * instead of just describing it. web_search is a server-hosted Anthropic tool (executed inside
 * the same response, no local handling needed); lock_case_approval is a client tool — when
 * Claude calls it, we run the callback, feed the result back as a tool_result, and let Claude
 * produce its real final reply from that outcome.
 */
export async function generateRavenReply({
  apiKey,
  model = DEFAULT_MODEL,
  maxTokens = DEFAULT_MAX_TOKENS,
  bookCase = null,
  history = [],
  onLockApproval = null,
  fetchImpl = fetch,
} = {}) {
  if (!apiKey) {
    const error = new Error('Raven chat is not configured — no Anthropic API key is set')
    error.statusCode = 503
    throw error
  }
  const canLockApproval = !!(bookCase && onLockApproval)
  const system = buildRavenSystemPrompt({ bookCase, canLockApproval })
  const tools = [{ type: 'web_search_20260209', name: 'web_search', max_uses: WEB_SEARCH_MAX_USES }]
  if (canLockApproval) tools.push(LOCK_APPROVAL_TOOL)

  const messages = toAnthropicMessages(history)
  let lockResult = null

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const body = await callAnthropic({ apiKey, model, maxTokens, system, messages, tools, fetchImpl })
    const toolUseBlocks = (body.content || []).filter((block) => block.type === 'tool_use')

    if (!toolUseBlocks.length) {
      const text = (body.content || []).filter((block) => block.type === 'text').map((block) => block.text).join('\n').trim()
      if (!text) {
        const error = new Error('Raven chat returned an empty reply')
        error.statusCode = 502
        throw error
      }
      return { text, lockResult }
    }

    messages.push({ role: 'assistant', content: body.content })
    const toolResults = []
    for (const block of toolUseBlocks) {
      if (block.name === 'lock_case_approval' && onLockApproval) {
        try {
          const outcome = await onLockApproval(block.input)
          lockResult = { input: block.input, outcome }
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: outcome.message })
        } catch (err) {
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: `Could not lock this decision: ${err.message}`, is_error: true })
        }
      } else {
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: 'This tool is not available.', is_error: true })
      }
    }
    messages.push({ role: 'user', content: toolResults })
  }

  const error = new Error('Raven chat did not produce a final reply after tool use')
  error.statusCode = 502
  throw error
}

const EXTRACTABLE_FIELDS = [
  'workingTitle', 'caseName', 'location', 'datePeriod', 'region',
  'classification', 'verificationStatus', 'verificationDate', 'sourceNotes', 'storyBrief',
]

const EXTRACTION_INSTRUCTION = `Based only on the conversation above, extract what is actually established about this book/case as a single strict JSON object with exactly these keys: ${EXTRACTABLE_FIELDS.join(', ')}.

Rules:
- Use "" for any field not clearly established in the conversation — never invent or guess.
- "classification" must be one of "Confirmed", "Reported", "Disputed", "Theory", or "" if the case isn't classified yet.
- "verificationDate" must be an ISO date (YYYY-MM-DD) or "".
- "sourceNotes" is a short semicolon-separated list of sources mentioned.
- "storyBrief" is one concise paragraph, Story Studio-ready, or "" if there isn't enough to summarize yet.
- Output ONLY the JSON object. No markdown fences, no commentary, no leading or trailing text.`

/**
 * Best-effort structured extraction from a case's chat history, used to auto-populate
 * the Book/Case form once the Chairman/Chairwoman locks an Approved decision — so John
 * doesn't have to retype research Raven already gathered in conversation. Never invents
 * facts: the model is instructed to leave a field blank rather than guess, and this
 * function only ever fills fields the caller confirms are still blank.
 */
export async function extractCaseFields({
  apiKey,
  model = DEFAULT_MODEL,
  maxTokens = 1024,
  messages = [],
  fetchImpl = fetch,
} = {}) {
  if (!apiKey) return { fields: null, skipped: 'no ANTHROPIC_API_KEY configured' }
  if (!messages.length) return { fields: null, skipped: 'no linked chat history to extract from' }

  const response = await fetchImpl(ANTHROPIC_MESSAGES_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: 'You extract structured case facts as strict JSON. You never fabricate — leave a field blank rather than guess.',
      messages: [...toAnthropicMessages(messages), { role: 'user', content: EXTRACTION_INSTRUCTION }],
    }),
  })
  if (!response.ok) {
    return { fields: null, skipped: `extraction call failed upstream (${response.status})` }
  }
  const body = await response.json()
  const text = (body.content || []).filter((block) => block.type === 'text').map((block) => block.text).join('\n').trim()
  const jsonText = text.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  let parsed
  try {
    parsed = JSON.parse(jsonText)
  } catch {
    return { fields: null, skipped: 'model did not return valid JSON' }
  }
  const fields = {}
  for (const key of EXTRACTABLE_FIELDS) {
    if (typeof parsed[key] === 'string' && parsed[key].trim()) fields[key] = parsed[key].trim()
  }
  return { fields, skipped: null }
}
