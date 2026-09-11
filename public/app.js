const state = {
  identity: null,
  pilot: null,
  statuses: [],
  tags: [],
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
  deleteBookCase: (id) => api(`/api/book-cases/${id}`, { method: 'DELETE' }),
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
  const bookCase = await api_.createBookCase({ number: nextNumber, workingTitle: `Book ${String(nextNumber).padStart(2, '0')}` })
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
    .filter((b) => b.status !== 'Published' && b.nextAction)
    .slice(0, 6)

  $main.innerHTML = `
    <div class="card identity-card">
      <div class="identity-name">${esc(identity.name)}</div>
      <div class="identity-role">${esc(identity.role)}</div>
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

function renderBooks() {
  const sorted = [...state.bookCases].sort((a, b) => (a.number || 0) - (b.number || 0))
  $main.innerHTML = `
    <div class="spread" style="margin-bottom:12px;">
      <div class="section-title" style="margin-bottom:0;">${esc(state.pilot.name)}</div>
      <button class="btn btn-gold btn-sm" id="booksNewBtn">+ New Book/Case</button>
    </div>
    <div class="book-list">
      ${sorted.map((b) => `
        <div class="book-card" data-book="${b.id}">
          <div class="spread">
            <span class="b-title">Book ${b.number ?? '—'} — ${esc(b.workingTitle || '(untitled)')}</span>
            <span class="badge">${esc(b.status)}</span>
          </div>
          <div class="b-meta">${esc(b.caseName || 'Case not named yet')}${b.region ? ' · ' + esc(b.region) : ''}</div>
          ${b.nextAction ? `<div class="b-meta">Next: ${esc(b.nextAction)}</div>` : ''}
        </div>
      `).join('') || '<div class="muted">No book/case records yet.</div>'}
    </div>
  `
  $main.querySelector('#booksNewBtn').addEventListener('click', () => document.getElementById('newBookBtn').click())
  $main.querySelectorAll('[data-book]').forEach((el) => {
    el.addEventListener('click', () => navigate(`/books/${el.dataset.book}`))
  })
}

// ---------------- book detail view ----------------

function renderBookDetail(id) {
  const b = bookCaseById(id)
  if (!b) { navigate('/books'); return }
  const linkedThreads = state.threads.filter((t) => t.bookCaseId === b.id)

  $main.innerHTML = `
    <div class="spread" style="margin-bottom:12px;">
      <div class="section-title" style="margin-bottom:0;">Book ${b.number ?? '—'} — ${esc(b.workingTitle || '(untitled)')}</div>
      <div class="row">
        <button class="btn btn-sm" id="bookChatBtn">Start Chat for this Book</button>
        <button class="btn btn-danger btn-sm" id="bookDeleteBtn">Delete</button>
      </div>
    </div>

    <div class="card">
      <div class="grid grid-2">
        <div class="field"><label>Working Title</label><input id="f-workingTitle" value="${esc(b.workingTitle)}" /></div>
        <div class="field"><label>Book/Case Number</label><input id="f-number" type="number" value="${b.number ?? ''}" /></div>
        <div class="field"><label>Region</label><input id="f-region" value="${esc(b.region)}" /></div>
        <div class="field"><label>Case Name</label><input id="f-caseName" value="${esc(b.caseName)}" /></div>
        <div class="field">
          <label>Status</label>
          <select id="f-status">${state.statuses.map((s) => `<option value="${esc(s)}" ${s === b.status ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>
        </div>
        <div class="field"><label>Verification Status</label><input id="f-verificationStatus" value="${esc(b.verificationStatus)}" /></div>
        <div class="field"><label>Verification Date</label><input id="f-verificationDate" type="date" value="${esc(b.verificationDate)}" /></div>
      </div>
      <div class="checkbox-field">
        <input type="checkbox" id="f-researchComplete" ${b.researchComplete ? 'checked' : ''} />
        <label for="f-researchComplete">Research Complete</label>
      </div>
      <div class="field"><label>Next Action</label><input id="f-nextAction" value="${esc(b.nextAction)}" /></div>
      <div class="field"><label>Notes</label><textarea id="f-notes">${esc(b.notes)}</textarea></div>
    </div>

    <div class="card">
      <div class="section-title">Story Studio</div>
      <div class="grid grid-2">
        <div class="field"><label>Project URL</label><input id="f-storyStudioUrl" value="${esc(b.storyStudioUrl)}" /></div>
        <div class="field"><label>Project ID</label><input id="f-storyStudioProjectId" value="${esc(b.storyStudioProjectId)}" /></div>
      </div>
      <div class="checkbox-field"><input type="checkbox" id="f-storyStudioSent" ${b.storyStudioSent ? 'checked' : ''} /><label for="f-storyStudioSent">Sent to Story Studio</label></div>
      <div class="checkbox-field"><input type="checkbox" id="f-storyStudioApproved" ${b.storyStudioApproved ? 'checked' : ''} /><label for="f-storyStudioApproved">Story Studio Output Approved</label></div>
      ${b.storyStudioUrl ? `<a class="btn btn-sm" href="${esc(b.storyStudioUrl)}" target="_blank" rel="noopener">Open Story Studio ↗</a>` : ''}
    </div>

    <div class="card">
      <div class="section-title">Drive</div>
      <div class="field"><label>Drive Folder URL</label><input id="f-driveFolderUrl" value="${esc(b.driveFolderUrl)}" /></div>
      ${b.driveFolderUrl ? `<a class="btn btn-sm" href="${esc(b.driveFolderUrl)}" target="_blank" rel="noopener">Open Drive Folder ↗</a>` : ''}
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

  $main.querySelector('#bookSaveBtn').addEventListener('click', async () => {
    const data = {
      workingTitle: $main.querySelector('#f-workingTitle').value,
      number: Number($main.querySelector('#f-number').value) || null,
      region: $main.querySelector('#f-region').value,
      caseName: $main.querySelector('#f-caseName').value,
      status: $main.querySelector('#f-status').value,
      verificationStatus: $main.querySelector('#f-verificationStatus').value,
      verificationDate: $main.querySelector('#f-verificationDate').value,
      researchComplete: $main.querySelector('#f-researchComplete').checked,
      nextAction: $main.querySelector('#f-nextAction').value,
      notes: $main.querySelector('#f-notes').value,
      storyStudioUrl: $main.querySelector('#f-storyStudioUrl').value,
      storyStudioProjectId: $main.querySelector('#f-storyStudioProjectId').value,
      storyStudioSent: $main.querySelector('#f-storyStudioSent').checked,
      storyStudioApproved: $main.querySelector('#f-storyStudioApproved').checked,
      driveFolderUrl: $main.querySelector('#f-driveFolderUrl').value,
    }
    const updated = await api_.patchBookCase(b.id, data)
    const idx = state.bookCases.findIndex((x) => x.id === b.id)
    state.bookCases[idx] = updated
    renderBookDetail(b.id)
  })

  $main.querySelector('#bookChatBtn').addEventListener('click', async () => {
    const thread = await api_.createThread({
      title: `${b.workingTitle || 'Book ' + b.number} chat`,
      tag: 'Book / Case Research',
      bookCaseId: b.id,
    })
    state.threads.unshift(thread)
    renderSidebar()
    navigate(`/chat/${thread.id}`)
  })

  $main.querySelector('#bookDeleteBtn').addEventListener('click', async () => {
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
            ${state.bookCases.map((b) => `<option value="${b.id}" ${b.id === thread.bookCaseId ? 'selected' : ''}>Book ${b.number ?? '—'} — ${esc(b.workingTitle || '(untitled)')}</option>`).join('')}
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
