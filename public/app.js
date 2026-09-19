const state = {
  identity: null,
  pilot: null,
  statuses: [],
  tags: [],
  researchStatuses: [],
  classifications: [],
  chairmanDecisions: [],
  qaStatuses: [],
  johnReviewDecisions: [],
  bookCases: [],
  threads: [],
  settings: {},
  chatConfigured: true,
  messagesByThread: {},
}

const $main = document.getElementById('main')
const $threadList = document.getElementById('threadList')
const $sidebar = document.getElementById('sidebar')
const $scrim = document.getElementById('sidebarScrim')

// ---------------- API helpers ----------------

async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { 'content-type': 'application/json' },
    ...opts,
  })
  if (res.status === 204) return null
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    const err = new Error((body && body.error) || `Request failed (${res.status})`)
    err.body = body
    throw err
  }
  return body
}

const api_ = {
  bootstrap: () => api('/api/bootstrap'),
  createThread: (data) => api('/api/threads', { method: 'POST', body: JSON.stringify(data) }),
  patchThread: (id, data) => api(`/api/threads/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteThread: (id) => api(`/api/threads/${id}`, { method: 'DELETE' }),
  messages: (id) => api(`/api/threads/${id}/messages`),
  sendMessage: (id, content) => api(`/api/threads/${id}/messages`, { method: 'POST', body: JSON.stringify({ content }) }),
  createBookCase: (data) => api('/api/book-cases', { method: 'POST', body: JSON.stringify(data) }),
  patchBookCase: (id, data) => api(`/api/book-cases/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  lockApproval: (id, data) => api(`/api/book-cases/${id}/lock-approval`, { method: 'POST', body: JSON.stringify(data) }),
  deleteBookCase: (id) => api(`/api/book-cases/${id}`, { method: 'DELETE' }),
  handoffLog: (id) => api(`/api/book-cases/${id}/handoff-log`),
  storyPackages: (id) => api(`/api/book-cases/${id}/story-packages`),
  generateStoryPackage: (id) => api(`/api/book-cases/${id}/story-studio/generate`, { method: 'POST' }),
  patchSettings: (data) => api('/api/settings', { method: 'PATCH', body: JSON.stringify(data) }),
}

function esc(s) {
  return (s ?? '').toString().replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

function bookCaseById(id) {
  return state.bookCases.find((b) => b.id === id) || null
}

// ---------------- sidebar ----------------

function renderSidebar() {
  const active = state.threads.filter((t) => !t.archived)
  const archived = state.threads.filter((t) => t.archived)
  const rows = [...active, ...archived]
  if (!rows.length) {
    $threadList.innerHTML = '<div class="muted" style="padding:8px;font-size:0.85rem;">No chats yet. Start one above.</div>'
    return
  }
  const currentId = currentRoute().id
  $threadList.innerHTML = rows.map((t) => {
    const bc = t.bookCaseId ? bookCaseById(t.bookCaseId) : null
    const metaBits = [t.tag]
    if (bc) metaBits.push(`Book ${bc.number ?? '—'}`)
    return `
      <div class="thread-item ${t.id === currentId ? 'active' : ''} ${t.archived ? 'archived' : ''}" data-thread="${t.id}">
        <div class="t-title">${esc(t.title)}</div>
        <div class="t-meta">${esc(metaBits.join(' · '))}</div>
      </div>
    `
  }).join('')
  $threadList.querySelectorAll('[data-thread]').forEach((el) => {
    el.addEventListener('click', () => {
      navigate(`/chat/${el.dataset.thread}`)
      closeSidebar()
    })
  })
}

function openSidebar() { $sidebar.classList.add('open'); $scrim.classList.add('show') }
function closeSidebar() { $sidebar.classList.remove('open'); $scrim.classList.remove('show') }

// ---------------- routing ----------------

function currentRoute() {
  const hash = location.hash.replace(/^#\/?/, '')
  const parts = hash.split('/').filter(Boolean)
  if (parts[0] === 'chat' && parts[1]) return { view: 'chat', id: parts[1] }
  if (parts[0] === 'books' && parts[1]) return { view: 'book', id: parts[1] }
  if (parts[0] === 'books') return { view: 'books' }
  return { view: 'home' }
}

function navigate(path) {
  location.hash = path
}

window.addEventListener('hashchange', render)

document.querySelectorAll('[data-nav]').forEach((el) => {
  el.addEventListener('click', () => navigate(`/${el.dataset.nav}`))
})

document.getElementById('menuToggle').addEventListener('click', openSidebar)
document.getElementById('mobileMenuToggle').addEventListener('click', openSidebar)
$scrim.addEventListener('click', closeSidebar)

document.getElementById('newChatBtn').addEventListener('click', async () => {
  const thread = await api_.createThread({})
  state.threads.unshift(thread)
  renderSidebar()
  navigate(`/chat/${thread.id}`)
  closeSidebar()
})

document.getElementById('newBookBtn').addEventListener('click', async () => {
  const nextNumber = state.bookCases.reduce((max, b) => Math.max(max, b.number || 0), 0) + 1
  const bookCase = await api_.createBookCase({ number: nextNumber })
  state.bookCases.push(bookCase)
  navigate(`/books/${bookCase.id}`)
  closeSidebar()
})

// ---------------- home view ----------------

function renderHome() {
  const { identity, pilot, bookCases, settings } = state
  const pct = pilot.total ? Math.round((pilot.completed / pilot.total) * 100) : 0
  const activeThreads = state.threads.filter((t) => !t.archived).slice(0, 6)
  const nextActions = bookCases
    .filter((b) => b.status !== 'PUBLISHED' && b.nextAction)
    .slice(0, 6)

  $main.innerHTML = `
    <div class="card identity-card">
      <div class="identity-header">
        <img class="identity-logo" src="brand/logo.png" alt="" onerror="this.style.display='none'" />
        <div>
          <div class="identity-name">${esc(identity.name)}</div>
          <div class="identity-role">${esc(identity.role)}</div>
          ${identity.org ? `<div class="identity-org">${esc(identity.org)}${identity.reportsTo ? ' · Reports to ' + esc(identity.reportsTo) : ''}</div>` : ''}
        </div>
      </div>
      <div style="margin-top:14px;">
        <div class="spread">
          <span>${esc(pilot.name)}</span>
          <span class="badge">${pilot.completed} / ${pilot.total} published</span>
        </div>
        <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
      </div>
      <div class="quick-actions">
        <button class="btn btn-gold" id="homeNewChat">+ New Chat</button>
        <button class="btn btn-outline" id="homeNewBook">+ New Book/Case</button>
        <a class="btn" href="${settings.storyStudioUrl ? esc(settings.storyStudioUrl) : '#'}" target="_blank" rel="noopener">Open Story Studio ↗</a>
        <a class="btn" href="${settings.driveWorkspaceUrl ? esc(settings.driveWorkspaceUrl) : '#'}" target="_blank" rel="noopener" ${settings.driveWorkspaceUrl ? '' : 'aria-disabled="true" style="opacity:.5;pointer-events:none;"'}>Open Drive Folder ↗</a>
      </div>
    </div>

    <div class="card">
      <div class="section-title">Current Assignment</div>
      <div>${esc(identity.assignment)}</div>
    </div>

    ${!state.chatConfigured ? `
    <div class="card" style="border-color:var(--danger);">
      <strong style="color:var(--danger);">Chat not configured.</strong>
      <div class="muted" style="margin-top:4px;">Set the ANTHROPIC_API_KEY secret on this deployment so Raven can reply.</div>
    </div>` : ''}

    <div class="card">
      <div class="spread">
        <div class="section-title" style="margin-bottom:0;">Quick Links</div>
      </div>
      <div class="grid grid-2" style="margin-top:10px;">
        <div class="field">
          <label>Story Studio URL</label>
          <input id="storyStudioUrlInput" value="${esc(settings.storyStudioUrl)}" placeholder="https://..." />
        </div>
        <div class="field">
          <label>Drive Workspace Folder URL</label>
          <input id="driveWorkspaceUrlInput" value="${esc(settings.driveWorkspaceUrl)}" placeholder="https://drive.google.com/..." />
        </div>
      </div>
      <button class="btn btn-sm" id="saveSettingsBtn">Save Links</button>
    </div>

    <div class="card">
      <div class="section-title">Next Actions</div>
      ${nextActions.length ? nextActions.map((b) => `
        <div class="spread" style="padding:6px 0;border-bottom:1px solid var(--border);">
          <span>Book ${b.number ?? '—'} — ${esc(b.workingTitle || '(untitled)')}</span>
          <span class="muted">${esc(b.nextAction)}</span>
        </div>
      `).join('') : '<div class="muted">Nothing outstanding right now.</div>'}
    </div>

    <div class="card">
      <div class="section-title">Recent Chats</div>
      ${activeThreads.length ? activeThreads.map((t) => `
        <div class="spread" style="padding:6px 0;border-bottom:1px solid var(--border);cursor:pointer;" data-open-thread="${t.id}">
          <span>${esc(t.title)}</span>
          <span class="badge badge-muted">${esc(t.tag)}</span>
        </div>
      `).join('') : '<div class="muted">No chats yet.</div>'}
    </div>
  `

  $main.querySelector('#homeNewChat').addEventListener('click', () => document.getElementById('newChatBtn').click())
  $main.querySelector('#homeNewBook').addEventListener('click', () => document.getElementById('newBookBtn').click())
  $main.querySelector('#saveSettingsBtn').addEventListener('click', async () => {
    const updated = await api_.patchSettings({
      storyStudioUrl: $main.querySelector('#storyStudioUrlInput').value.trim(),
      driveWorkspaceUrl: $main.querySelector('#driveWorkspaceUrlInput').value.trim(),
    })
    state.settings = updated
    renderHome()
  })
  $main.querySelectorAll('[data-open-thread]').forEach((el) => {
    el.addEventListener('click', () => navigate(`/chat/${el.dataset.openThread}`))
  })
}

// ---------------- books list view ----------------

function classificationBadgeClass(classification) {
  if (classification === 'Confirmed') return 'badge'
  if (classification === 'Theory') return 'badge badge-muted'
  return 'badge badge-outline'
}

function renderBooks() {
  const sorted = [...state.bookCases].sort((a, b) => (a.number || 0) - (b.number || 0))
  $main.innerHTML = `
    <div class="spread" style="margin-bottom:12px;">
      <div class="section-title" style="margin-bottom:0;">${esc(state.pilot.name)}</div>
      <button class="btn btn-gold btn-sm" id="booksNewBtn">+ New Book/Case</button>
    </div>
    <div class="book-list">
      ${sorted.map((b) => {
        const isEmpty = !b.workingTitle && !b.caseName
        return `
        <div class="book-card ${isEmpty ? 'book-card-empty' : ''}" data-book="${b.id}">
          <div class="spread">
            <span class="b-title">Book ${String(b.number ?? '—').padStart(2, '0')}${isEmpty ? ' — Empty Slot' : ' — ' + esc(b.workingTitle || b.caseName)}</span>
            <span class="badge">${esc(b.status)}</span>
          </div>
          ${!isEmpty ? `<div class="b-meta">${esc(b.caseName || 'Case not named yet')}${b.location ? ' · ' + esc(b.location) : (b.region ? ' · ' + esc(b.region) : '')}</div>` : '<div class="b-meta">Not yet researched.</div>'}
          <div class="row" style="margin-top:6px;gap:6px;">
            <span class="badge badge-muted">Research: ${esc(b.researchStatus || 'Not Started')}</span>
            ${b.classification ? `<span class="${classificationBadgeClass(b.classification)}">${esc(b.classification)}</span>` : ''}
          </div>
          ${b.nextAction ? `<div class="b-meta">Next: ${esc(b.nextAction)}</div>` : ''}
        </div>
      `}).join('') || '<div class="muted">No book/case records yet.</div>'}
    </div>
  `
  $main.querySelector('#booksNewBtn').addEventListener('click', () => document.getElementById('newBookBtn').click())
  $main.querySelectorAll('[data-book]').forEach((el) => {
    el.addEventListener('click', () => navigate(`/books/${el.dataset.book}`))
  })
}

// ---------------- book detail view ----------------

async function renderBookDetail(id) {
  const b = bookCaseById(id)
  if (!b) { navigate('/books'); return }
  const linkedThreads = state.threads.filter((t) => t.bookCaseId === b.id)
  const isPilotSlot = b.number >= 1 && b.number <= 12
  const handoffLog = await api_.handoffLog(id)
  const storyPackages = await api_.storyPackages(id)
  const latestPackage = storyPackages[0] || null

  $main.innerHTML = `
    <div class="spread" style="margin-bottom:12px;">
      <div class="section-title" style="margin-bottom:0;">Book ${String(b.number ?? '—').padStart(2, '0')} — ${esc(b.workingTitle || b.caseName || '(unresearched)')}</div>
      <div class="row">
        <button class="btn btn-sm" id="bookChatBtn">Start Chat for this Book</button>
        <button class="btn btn-danger btn-sm" id="bookDeleteBtn">${isPilotSlot ? 'Clear Slot' : 'Delete'}</button>
      </div>
    </div>

    <div class="card">
      <div class="grid grid-2">
        <div class="field"><label>Working Title</label><input id="f-workingTitle" value="${esc(b.workingTitle)}" /></div>
        <div class="field"><label>Book/Case Number</label><input id="f-number" type="number" value="${b.number ?? ''}" /></div>
        <div class="field"><label>Case Name</label><input id="f-caseName" value="${esc(b.caseName)}" /></div>
        <div class="field"><label>Location</label><input id="f-location" value="${esc(b.location)}" placeholder="Town, county, state" /></div>
        <div class="field"><label>Date / Time Period</label><input id="f-datePeriod" value="${esc(b.datePeriod)}" placeholder="e.g. 1978, or 1920s-1930s" /></div>
        <div class="field"><label>Region</label><input id="f-region" value="${esc(b.region)}" /></div>
        <div class="field">
          <label>Current Status</label>
          <select id="f-status">${state.statuses.map((s) => `<option value="${esc(s)}" ${s === b.status ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>
        </div>
        <div class="field">
          <label>Research Status</label>
          <select id="f-researchStatus">${state.researchStatuses.map((s) => `<option value="${esc(s)}" ${s === b.researchStatus ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>
        </div>
        <div class="field">
          <label>Fact Classification</label>
          <select id="f-classification">
            <option value="" ${!b.classification ? 'selected' : ''}>Not yet classified</option>
            ${state.classifications.map((c) => `<option value="${esc(c)}" ${c === b.classification ? 'selected' : ''}>${esc(c)}</option>`).join('')}
          </select>
        </div>
        <div class="field"><label>Verification Status</label><input id="f-verificationStatus" value="${esc(b.verificationStatus)}" /></div>
        <div class="field"><label>Verification Date</label><input id="f-verificationDate" type="date" value="${esc(b.verificationDate)}" /></div>
      </div>
      <div class="field"><label>Source Links / Notes</label><textarea id="f-sourceNotes" placeholder="News articles, local archives, interviews — tag claims Confirmed/Reported/Disputed/Theory as needed">${esc(b.sourceNotes)}</textarea></div>
      <div class="field"><label>Next Action</label><input id="f-nextAction" value="${esc(b.nextAction)}" /></div>
      <div class="field"><label>Notes</label><textarea id="f-notes">${esc(b.notes)}</textarea></div>
    </div>

    <div class="card">
      <div class="section-title">Story Studio</div>
      <div class="field">
        <label>One-Paragraph Story Studio Brief</label>
        <textarea id="f-storyBrief" placeholder="Concise synopsis ready to paste into Story Studio">${esc(b.storyBrief)}</textarea>
      </div>
      <button class="btn btn-sm" id="copyBriefBtn" type="button">Copy Brief</button>
      <div class="grid grid-2" style="margin-top:10px;">
        <div class="field"><label>Project URL</label><input id="f-storyStudioUrl" value="${esc(b.storyStudioUrl)}" /></div>
        <div class="field"><label>Project ID</label><input id="f-storyStudioProjectId" value="${esc(b.storyStudioProjectId)}" /></div>
      </div>
      <div class="checkbox-field"><input type="checkbox" id="f-storyStudioSent" ${b.storyStudioSent ? 'checked' : ''} /><label for="f-storyStudioSent">Sent to Story Studio</label></div>
      <div class="checkbox-field"><input type="checkbox" id="f-storyStudioApproved" ${b.storyStudioApproved ? 'checked' : ''} /><label for="f-storyStudioApproved">Story Studio Output Approved</label></div>
      <a class="btn btn-sm" href="${b.storyStudioUrl ? esc(b.storyStudioUrl) : esc(state.settings.storyStudioUrl || '#')}" target="_blank" rel="noopener">Open Story Studio ↗</a>
    </div>

    <div class="card">
      <div class="spread">
        <div class="section-title" style="margin-bottom:0;">Story Package (Story Studio)</div>
        <button class="btn btn-sm" id="generatePackageBtn" type="button">${latestPackage ? 'Regenerate' : 'Generate'} Story Package</button>
      </div>
      <div class="muted" style="margin:6px 0;font-size:0.8rem;">Raven calls Story Studio directly and stores the full canonical package here — no manual copy/paste. Auto-runs once when this case's status is set to STORY STUDIO.</div>
      ${latestPackage ? `
        <div class="field"><label>Title</label><div>${esc(latestPackage.title || '(untitled)')}</div></div>
        ${latestPackage.hook ? `<div class="field"><label>Hook</label><div>${esc(latestPackage.hook)}</div></div>` : ''}
        ${latestPackage.summary ? `<div class="field"><label>Summary</label><div>${esc(latestPackage.summary)}</div></div>` : ''}
        <div class="muted" style="font-size:0.75rem;">Generated ${esc(new Date(latestPackage.createdAt).toLocaleString())} · Facts, scenes, characters, short-form + publishing derivatives stored with this package.</div>
      ` : '<div class="muted">No package generated yet.</div>'}
    </div>

    <div class="card">
      <div class="section-title">Drive</div>
      <div class="field"><label>Drive Folder URL</label><input id="f-driveFolderUrl" value="${esc(b.driveFolderUrl)}" /></div>
      ${b.driveFolderUrl ? `<a class="btn btn-sm" href="${esc(b.driveFolderUrl)}" target="_blank" rel="noopener">Open Drive Folder ↗</a>` : ''}
    </div>

    <div class="card">
      <div class="section-title">Production Pipeline Gates</div>
      <div class="field">
        <label>Chairman/Chairwoman Decision</label>
        <select id="f-chairmanDecision">
          <option value="" ${!b.chairmanDecision ? 'selected' : ''}>Awaiting decision</option>
          ${state.chairmanDecisions.map((d) => `<option value="${esc(d)}" ${d === b.chairmanDecision ? 'selected' : ''}>${esc(d)}</option>`).join('')}
        </select>
      </div>
      <div class="field"><label>Chairman/Chairwoman Notes</label><textarea id="f-chairmanNotes">${esc(b.chairmanNotes)}</textarea></div>
      ${b.chairmanLockedAt ? `
        <div class="muted" style="margin-bottom:10px;">🔒 Locked: <strong>${esc(b.chairmanDecision)}</strong> by ${esc(b.chairmanApprovedBy)} on ${esc(new Date(b.chairmanLockedAt).toLocaleString())}</div>
      ` : `
        <div class="muted" style="margin-bottom:10px;">Not locked yet — the decision above is a draft until locked. Locking an Approved decision automatically advances the pipeline and pulls in whatever Raven has already researched.</div>
      `}
      <div class="grid grid-2">
        <div class="field"><label>Your Name (required to lock)</label><input id="f-approverName" placeholder="e.g. John Hunt" /></div>
        <div class="field" style="display:flex;align-items:flex-end;">
          <button class="btn btn-gold btn-sm" id="lockApprovalBtn" type="button">Lock Approval</button>
        </div>
      </div>
      <div class="grid grid-2">
        <div class="field">
          <label>Factual QA</label>
          <select id="f-qaFactualStatus">${state.qaStatuses.map((s) => `<option value="${esc(s)}" ${s === b.qaFactualStatus ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>
        </div>
        <div class="field">
          <label>Visual/Production QA</label>
          <select id="f-qaVisualStatus">${state.qaStatuses.map((s) => `<option value="${esc(s)}" ${s === b.qaVisualStatus ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>
        </div>
      </div>
      <div class="field"><label>Factual QA Notes</label><textarea id="f-qaFactualNotes" placeholder="Errors, contradictions...">${esc(b.qaFactualNotes)}</textarea></div>
      <div class="field"><label>Visual/Production QA Notes</label><textarea id="f-qaVisualNotes" placeholder="Bad AI images, layout/pagination/bleed issues...">${esc(b.qaVisualNotes)}</textarea></div>
      <div class="field">
        <label>John's Final Review</label>
        <select id="f-johnReviewDecision">
          <option value="" ${!b.johnReviewDecision ? 'selected' : ''}>Awaiting review</option>
          ${state.johnReviewDecisions.map((d) => `<option value="${esc(d)}" ${d === b.johnReviewDecision ? 'selected' : ''}>${esc(d)}</option>`).join('')}
        </select>
      </div>
      <div class="field"><label>John's Review Notes</label><textarea id="f-johnReviewNotes">${esc(b.johnReviewNotes)}</textarea></div>
    </div>

    <div class="card">
      <div class="section-title">Handoff Log</div>
      <div class="muted" style="margin-bottom:8px;font-size:0.8rem;">Automatic milestone trail — no manual copying required.</div>
      ${handoffLog.length ? handoffLog.slice().reverse().map((h) => `
        <div style="padding:6px 0;border-bottom:1px solid var(--border);">
          <div class="spread"><strong>${esc(h.milestone)}</strong><span class="muted" style="font-size:0.75rem;">${esc(new Date(h.createdAt).toLocaleString())}</span></div>
          ${h.detail ? `<div class="muted" style="font-size:0.85rem;">${esc(h.detail)}</div>` : ''}
        </div>
      `).join('') : '<div class="muted">No milestones logged yet.</div>'}
    </div>

    <div class="card">
      <div class="section-title">Linked Chats</div>
      ${linkedThreads.length ? linkedThreads.map((t) => `
        <div class="spread" style="padding:6px 0;border-bottom:1px solid var(--border);cursor:pointer;" data-open-thread="${t.id}">
          <span>${esc(t.title)}</span><span class="badge badge-muted">${esc(t.tag)}</span>
        </div>
      `).join('') : '<div class="muted">No chats linked yet.</div>'}
    </div>

    <button class="btn btn-gold" id="bookSaveBtn">Save Changes</button>
  `

  function collectFormData() {
    return {
      workingTitle: $main.querySelector('#f-workingTitle').value,
      number: Number($main.querySelector('#f-number').value) || null,
      caseName: $main.querySelector('#f-caseName').value,
      location: $main.querySelector('#f-location').value,
      datePeriod: $main.querySelector('#f-datePeriod').value,
      region: $main.querySelector('#f-region').value,
      status: $main.querySelector('#f-status').value,
      researchStatus: $main.querySelector('#f-researchStatus').value,
      classification: $main.querySelector('#f-classification').value,
      verificationStatus: $main.querySelector('#f-verificationStatus').value,
      verificationDate: $main.querySelector('#f-verificationDate').value,
      sourceNotes: $main.querySelector('#f-sourceNotes').value,
      nextAction: $main.querySelector('#f-nextAction').value,
      notes: $main.querySelector('#f-notes').value,
      storyBrief: $main.querySelector('#f-storyBrief').value,
      storyStudioUrl: $main.querySelector('#f-storyStudioUrl').value,
      storyStudioProjectId: $main.querySelector('#f-storyStudioProjectId').value,
      storyStudioSent: $main.querySelector('#f-storyStudioSent').checked,
      storyStudioApproved: $main.querySelector('#f-storyStudioApproved').checked,
      driveFolderUrl: $main.querySelector('#f-driveFolderUrl').value,
      chairmanDecision: $main.querySelector('#f-chairmanDecision').value,
      chairmanNotes: $main.querySelector('#f-chairmanNotes').value,
      qaFactualStatus: $main.querySelector('#f-qaFactualStatus').value,
      qaFactualNotes: $main.querySelector('#f-qaFactualNotes').value,
      qaVisualStatus: $main.querySelector('#f-qaVisualStatus').value,
      qaVisualNotes: $main.querySelector('#f-qaVisualNotes').value,
      johnReviewDecision: $main.querySelector('#f-johnReviewDecision').value,
      johnReviewNotes: $main.querySelector('#f-johnReviewNotes').value,
    }
  }

  $main.querySelector('#bookSaveBtn').addEventListener('click', async () => {
    const updated = await api_.patchBookCase(b.id, collectFormData())
    const idx = state.bookCases.findIndex((x) => x.id === b.id)
    state.bookCases[idx] = updated
    renderBookDetail(b.id)
  })

  $main.querySelector('#generatePackageBtn').addEventListener('click', async () => {
    const btn = $main.querySelector('#generatePackageBtn')
    if (!confirm(latestPackage ? 'Regenerate the story package? This calls Story Studio again and adds a new version — the old one stays in history.' : 'Generate the story package now via Story Studio?')) return
    btn.disabled = true
    btn.textContent = 'Generating…'
    try {
      await api_.generateStoryPackage(b.id)
    } finally {
      renderBookDetail(b.id)
    }
  })

  $main.querySelector('#lockApprovalBtn').addEventListener('click', async () => {
    const decision = $main.querySelector('#f-chairmanDecision').value
    const notes = $main.querySelector('#f-chairmanNotes').value
    const approverName = $main.querySelector('#f-approverName').value.trim()
    if (!decision) { alert('Choose a decision (Approved / Rejected / Revise) before locking.'); return }
    if (!approverName) { alert('Enter your name to lock this decision.'); return }
    if (!confirm(`Lock this case as "${decision}" under the name "${approverName}"? ${decision === 'Approved' ? 'This will move the pipeline forward and auto-fill any blank fields from the research chat.' : ''}`)) return
    const updated = await api_.patchBookCase(b.id, collectFormData())
    const locked = await api_.lockApproval(b.id, { decision, notes, approverName })
    const idx = state.bookCases.findIndex((x) => x.id === b.id)
    state.bookCases[idx] = locked
    renderBookDetail(b.id)
  })

  $main.querySelector('#copyBriefBtn').addEventListener('click', () => {
    const text = $main.querySelector('#f-storyBrief').value.trim()
    if (!text) return
    navigator.clipboard.writeText(text).then(() => {
      const btn = $main.querySelector('#copyBriefBtn')
      btn.textContent = 'Copied'
      setTimeout(() => { btn.textContent = 'Copy Brief' }, 1200)
    })
  })

  $main.querySelector('#bookChatBtn').addEventListener('click', async () => {
    const thread = await api_.createThread({
      title: `${b.workingTitle || b.caseName || 'Book ' + String(b.number).padStart(2, '0')} chat`,
      tag: 'Book / Case Research',
      bookCaseId: b.id,
    })
    state.threads.unshift(thread)
    renderSidebar()
    navigate(`/chat/${thread.id}`)
  })

  $main.querySelector('#bookDeleteBtn').addEventListener('click', async () => {
    if (isPilotSlot) {
      if (!confirm(`Clear Book ${String(b.number).padStart(2, '0')}? This resets it to an empty, unresearched slot — the slot itself stays part of the 12-book pilot.`)) return
      const cleared = await api_.patchBookCase(b.id, {
        workingTitle: '', caseName: '', location: '', datePeriod: '', region: '',
        status: 'DISCOVERED', researchStatus: 'Not Started', classification: '',
        verificationStatus: '', verificationDate: '', sourceNotes: '', storyBrief: '',
        storyStudioUrl: '', storyStudioProjectId: '', storyStudioSent: false, storyStudioApproved: false,
        driveFolderUrl: '', chairmanDecision: '', chairmanNotes: '',
        qaFactualStatus: 'Not Started', qaFactualNotes: '', qaVisualStatus: 'Not Started', qaVisualNotes: '',
        johnReviewDecision: '', johnReviewNotes: '', nextAction: '', notes: '',
      })
      const idx = state.bookCases.findIndex((x) => x.id === b.id)
      state.bookCases[idx] = cleared
      navigate('/books')
      return
    }
    if (!confirm(`Delete Book ${b.number ?? ''} — ${b.workingTitle || '(untitled)'}? This cannot be undone.`)) return
    await api_.deleteBookCase(b.id)
    state.bookCases = state.bookCases.filter((x) => x.id !== b.id)
    navigate('/books')
  })

  $main.querySelectorAll('[data-open-thread]').forEach((el) => {
    el.addEventListener('click', () => navigate(`/chat/${el.dataset.openThread}`))
  })
}

// ---------------- chat view ----------------

async function renderChat(id) {
  const thread = state.threads.find((t) => t.id === id)
  if (!thread) { navigate('/home'); return }

  $main.innerHTML = `
    <div class="chat-view">
      <div class="chat-header">
        <input class="chat-title-input" id="chatTitleInput" value="${esc(thread.title)}" />
        <div class="row" style="margin-top:8px;">
          <select id="chatTagSelect">${state.tags.map((t) => `<option value="${esc(t)}" ${t === thread.tag ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>
          <select id="chatBookSelect">
            <option value="">No linked book/case</option>
            ${[...state.bookCases].sort((a, c) => (a.number || 0) - (c.number || 0)).map((b) => `<option value="${b.id}" ${b.id === thread.bookCaseId ? 'selected' : ''}>Book ${String(b.number ?? '—').padStart(2, '0')} — ${esc(b.workingTitle || b.caseName || 'Empty Slot')}</option>`).join('')}
          </select>
          <button class="btn btn-sm" id="chatArchiveBtn">${thread.archived ? 'Unarchive' : 'Archive'}</button>
          <button class="btn btn-danger btn-sm" id="chatDeleteBtn">Delete</button>
        </div>
      </div>
      <div class="chat-messages" id="chatMessages"><div class="empty-state">Loading…</div></div>
      <div class="chat-input-row">
        <textarea id="chatInput" placeholder="Message Raven…" rows="1"></textarea>
        <button class="btn btn-gold" id="chatSendBtn">Send</button>
      </div>
    </div>
  `

  $main.querySelector('#chatTitleInput').addEventListener('change', async (e) => {
    const updated = await api_.patchThread(thread.id, { title: e.target.value })
    Object.assign(thread, updated)
    renderSidebar()
  })
  $main.querySelector('#chatTagSelect').addEventListener('change', async (e) => {
    const updated = await api_.patchThread(thread.id, { tag: e.target.value })
    Object.assign(thread, updated)
    renderSidebar()
  })
  $main.querySelector('#chatBookSelect').addEventListener('change', async (e) => {
    const updated = await api_.patchThread(thread.id, { bookCaseId: e.target.value || null })
    Object.assign(thread, updated)
    renderSidebar()
  })
  $main.querySelector('#chatArchiveBtn').addEventListener('click', async () => {
    const archiving = !thread.archived
    if (archiving && !confirm('Archive this chat? You can still reopen it later.')) return
    const updated = await api_.patchThread(thread.id, { archived: archiving })
    Object.assign(thread, updated)
    renderSidebar()
    renderChat(thread.id)
  })
  $main.querySelector('#chatDeleteBtn').addEventListener('click', async () => {
    if (!confirm('Delete this chat permanently? This cannot be undone.')) return
    await api_.deleteThread(thread.id)
    state.threads = state.threads.filter((t) => t.id !== thread.id)
    renderSidebar()
    navigate('/home')
  })

  const $messages = $main.querySelector('#chatMessages')
  const $input = $main.querySelector('#chatInput')
  const $sendBtn = $main.querySelector('#chatSendBtn')

  function renderMessages() {
    const msgs = state.messagesByThread[thread.id] || []
    if (!msgs.length) {
      $messages.innerHTML = '<div class="empty-state">No messages yet. Say hello.</div>'
      return
    }
    $messages.innerHTML = msgs.map((m) => `
      <div class="msg msg-${m.role}">${esc(m.content)}</div>
      ${m.role === 'raven' ? `<button class="msg-copy" data-copy="${m.id}">Copy</button>` : ''}
    `).join('')
    $messages.querySelectorAll('[data-copy]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const msg = msgs.find((m) => m.id === btn.dataset.copy)
        navigator.clipboard.writeText(msg.content).then(() => {
          btn.textContent = 'Copied'
          setTimeout(() => { btn.textContent = 'Copy' }, 1200)
        })
      })
    })
    $messages.scrollTop = $messages.scrollHeight
  }

  if (!state.messagesByThread[thread.id]) {
    const msgs = await api_.messages(thread.id)
    state.messagesByThread[thread.id] = msgs
  }
  renderMessages()

  async function send() {
    const content = $input.value.trim()
    if (!content) return
    $input.value = ''
    $input.style.height = 'auto'
    $sendBtn.disabled = true
    const optimistic = { id: 'pending-' + Date.now(), role: 'user', content, threadId: thread.id, createdAt: new Date().toISOString() }
    state.messagesByThread[thread.id].push(optimistic)
    renderMessages()
    try {
      const result = await api_.sendMessage(thread.id, content)
      const list = state.messagesByThread[thread.id]
      const idx = list.findIndex((m) => m.id === optimistic.id)
      if (idx !== -1) list[idx] = result.userMessage
      if (result.ravenMessage) list.push(result.ravenMessage)
      else list.push({ id: 'error-' + Date.now(), role: 'raven', content: `⚠ ${result.error || 'Raven could not reply.'}`, createdAt: new Date().toISOString() })
      thread.updatedAt = new Date().toISOString()
      state.threads.sort((a, c) => new Date(c.updatedAt) - new Date(a.updatedAt))
      renderSidebar()
    } catch (err) {
      const list = state.messagesByThread[thread.id]
      list.push({ id: 'error-' + Date.now(), role: 'raven', content: `⚠ ${err.message}`, createdAt: new Date().toISOString() })
    }
    renderMessages()
    $sendBtn.disabled = false
  }

  $sendBtn.addEventListener('click', send)
  $input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  })
  $input.addEventListener('input', () => {
    $input.style.height = 'auto'
    $input.style.height = Math.min($input.scrollHeight, 140) + 'px'
  })
}

// ---------------- master render ----------------

function render() {
  const route = currentRoute()
  document.querySelectorAll('[data-nav]').forEach((el) => {
    el.classList.toggle('active', el.dataset.nav === route.view || (el.dataset.nav === 'home' && route.view === 'chat'))
  })
  renderSidebar()
  if (route.view === 'home') renderHome()
  else if (route.view === 'books') renderBooks()
  else if (route.view === 'book') renderBookDetail(route.id)
  else if (route.view === 'chat') renderChat(route.id)
}

async function init() {
  const data = await api_.bootstrap()
  Object.assign(state, data)
  if (!location.hash) location.hash = '#/home'
  render()
}

init()
