const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'
const DEFAULT_MODEL = 'claude-sonnet-5'
const DEFAULT_MAX_TOKENS = 1536

const CHARTER = `You are Raven, the Phase-1 operator for PublishingOS.

Your assignment: the Hunt After Dark Midwest 12-Book Pilot. Your job is to identify and research real Midwest mysteries/cases, prepare factual source material, create Story Studio-ready briefs, turn each approved story package into a book-production handoff, and preserve the corresponding Hunt After Dark short-form content package. Story Studio (a separate app) is the canonical story-building engine once a case is ready for it — you do not rebuild it, you hand cases to it and track status.

You do not manage subcontractors, employees, or other agents. You may prepare promotional content, but Pia posts Hunt After Dark content herself — you never take over posting.

Be concise, direct, and grounded in the case data given below. If something isn't in the data, say it isn't tracked yet rather than guessing.`

function formatCaseContext(bookCase) {
  if (!bookCase) return '\n\nThis conversation is not linked to a specific book/case record.'
  return [
    '\n\n### Linked book/case record',
    `Book/Case #${bookCase.number ?? '—'}: ${bookCase.working_title || '(untitled)'}`,
    `Region: ${bookCase.region || 'not recorded'} · Case name: ${bookCase.case_name || 'not recorded'}`,
    `Status: ${bookCase.status}`,
    `Research complete: ${bookCase.research_complete ? 'Yes' : 'No'} · Verification: ${bookCase.verification_status || 'not recorded'}${bookCase.verification_date ? ` (${bookCase.verification_date})` : ''}`,
    `Story Studio: ${bookCase.story_studio_url || 'not linked yet'}${bookCase.story_studio_sent ? ' — sent' : ''}${bookCase.story_studio_approved ? ' — approved' : ''}`,
    `Drive folder: ${bookCase.drive_folder_url || 'not linked yet'}`,
    `Next action: ${bookCase.next_action || 'not recorded'}`,
    bookCase.notes ? `Notes: ${bookCase.notes}` : null,
  ].filter(Boolean).join('\n')
}

export function buildRavenSystemPrompt({ bookCase = null } = {}) {
  return `${CHARTER}${formatCaseContext(bookCase)}`
}

function toAnthropicMessages(history = []) {
  return history.map((m) => ({
    role: m.role === 'raven' ? 'assistant' : 'user',
    content: m.content,
  }))
}

/**
 * Calls the Anthropic Messages API directly over HTTPS, matching the same provider-integration
 * convention used elsewhere in this product family. Fails closed when no key is configured
 * rather than returning a fabricated reply.
 */
export async function generateRavenReply({
  apiKey,
  model = DEFAULT_MODEL,
  maxTokens = DEFAULT_MAX_TOKENS,
  bookCase = null,
  history = [],
  fetchImpl = fetch,
} = {}) {
  if (!apiKey) {
    const error = new Error('Raven chat is not configured — no Anthropic API key is set')
    error.statusCode = 503
    throw error
  }
  const system = buildRavenSystemPrompt({ bookCase })
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
      system,
      messages: toAnthropicMessages(history),
    }),
  })
  if (!response.ok) {
    const bodyText = await response.text().catch(() => '')
    const error = new Error(`Raven chat upstream error (${response.status})`)
    error.statusCode = response.status === 429 ? 429 : 502
    error.upstreamBody = bodyText.slice(0, 500)
    throw error
  }
  const body = await response.json()
  const text = (body.content || []).filter((block) => block.type === 'text').map((block) => block.text).join('\n').trim()
  if (!text) {
    const error = new Error('Raven chat returned an empty reply')
    error.statusCode = 502
    throw error
  }
  return text
}
