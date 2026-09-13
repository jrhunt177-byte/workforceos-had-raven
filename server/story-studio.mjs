// Server-to-server integration with Story Studio's story-generation API, found by
// inspecting its codebase directly (Architect bridge, Issue #2) rather than guessing.
// Story Studio itself keeps no server-side project record — the browser UI is the only
// thing that ever persisted a result, in localStorage — so Raven is what makes this
// durable: it calls the endpoint, then stores the full returned package in Postgres.
// No new credential is required; the endpoint has no auth of its own.

const GENERATE_PATH = '/api/ai/generate-story-project'

/**
 * Calls Story Studio's generate-story-project endpoint and returns its full project
 * object. Requests both the short-form and publishing derivative packages so one call
 * produces the canonical multi-format package the Architect asked for, instead of a
 * bare synopsis.
 */
export async function generateStoryPackage({ baseUrl, brief, fetchImpl = fetch } = {}) {
  if (!baseUrl) {
    const error = new Error('Story Studio URL is not configured')
    error.skipped = true
    throw error
  }
  if (!brief || !brief.trim()) {
    const error = new Error('No brief/case content available yet to send to Story Studio')
    error.skipped = true
    throw error
  }

  const url = baseUrl.replace(/\/$/, '') + GENERATE_PATH
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      mode: 'guided',
      brief: brief.trim(),
      preferences: {
        shortFormPackage: true,
        publishingPackage: true,
        shortFormBrand: 'Hunt After Dark',
      },
    }),
  })
  if (!response.ok) {
    const bodyText = await response.text().catch(() => '')
    const error = new Error(`Story Studio upstream error (${response.status})`)
    error.upstreamBody = bodyText.slice(0, 500)
    throw error
  }
  const body = await response.json()
  if (!body || !body.project) {
    const error = new Error('Story Studio returned an unexpected response shape')
    throw error
  }
  return body.project
}
