/**
 * memoryd Dashboard — main application
 */

import { themes, applyTheme, shuffleTheme, getCurrentTheme } from './themes.js';
import { renderMarkdown } from './markdown.js';

const API = '/api/memoryd';
let currentPanel = 'overview';
let cardPage = 1;
let cardSearch = '';
let loadedCards = [];
let cardTotal = 0;

// ═══════════════════════════════════════
// Navigation
// ═══════════════════════════════════════

const nav = document.getElementById('memoryd-nav');
const contentEl = document.getElementById('memoryd-content');
const panelTitle = document.getElementById('panel-title');

nav.addEventListener('click', (e) => {
  const item = e.target.closest('.nav-item');
  if (!item) return;
  const panel = item.dataset.panel;
  switchPanel(panel);
});

function switchPanel(panel) {
  currentPanel = panel;
  nav.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  nav.querySelector(`[data-panel="${panel}"]`)?.classList.add('active');

  const titles = {
    overview: 'Overview',
    seeds: 'Seeds',
    semantic: 'Semantic Memory',
    episodic: 'Episodic Memory',
    working: 'Working Memory',
    cards: 'Session Cards',
    processes: 'Processes',
    logs: 'Daemon Logs',
  };
  panelTitle.textContent = titles[panel] || 'memoryd';

  renderPanel(panel);
}

async function renderPanel(panel) {
  switch (panel) {
    case 'overview': return renderOverview();
    case 'seeds': return renderSeeds();
    case 'semantic': return renderEditor('semantic.md');
    case 'episodic': return renderEditor('episodic.md');
    case 'working': return renderWorking();
    case 'cards': return renderCards();
    case 'processes': return renderProcesses();
    case 'logs': return renderLogs();
  }
}

// ═══════════════════════════════════════
// Overview
// ═══════════════════════════════════════

async function renderOverview() {
  contentEl.innerHTML = '<div class="stats-grid" id="stats-grid"></div>';
  const grid = document.getElementById('stats-grid');

  try {
    const res = await fetch(`${API}/stats`);
    const stats = await res.json();

    const cards = [
      { label: 'Session Cards', value: stats.sessionCards || 0 },
      { label: 'Working Files', value: stats.workingFiles || 0 },
      { label: 'Seeds', value: stats.seeds?.length || 0, meta: stats.seeds?.join(', ') },
      {
        label: 'Semantic',
        value: formatBytes(stats.semantic?.size || 0),
        meta: stats.semantic?.modified ? `Updated ${formatRelative(stats.semantic.modified)}` : '',
      },
      {
        label: 'Episodic',
        value: formatBytes(stats.episodic?.size || 0),
        meta: stats.episodic?.modified ? `Updated ${formatRelative(stats.episodic.modified)}` : '',
      },
      {
        label: 'Database',
        value: formatBytes(stats.dbSize || 0),
      },
    ];

    if (stats.logLastModified) {
      cards.push({
        label: 'Last Daemon Activity',
        value: formatRelative(stats.logLastModified),
      });
    }

    grid.innerHTML = cards.map(c => `
      <div class="stat-card">
        <div class="stat-label">${c.label}</div>
        <div class="stat-value">${c.value}</div>
        ${c.meta ? `<div class="stat-meta">${c.meta}</div>` : ''}
      </div>
    `).join('');
  } catch (e) {
    grid.innerHTML = `<div class="stat-card"><div class="stat-value" style="color: var(--error-color)">Failed to load stats</div></div>`;
  }
}

// ═══════════════════════════════════════
// Editor (semantic / episodic)
// ═══════════════════════════════════════

async function renderEditor(filename) {
  contentEl.innerHTML = `
    <div class="editor-panel">
      <div class="editor-toolbar">
        <button class="save-btn" id="save-btn" disabled>Save</button>
        <span class="meta" id="editor-meta"></span>
      </div>
      <textarea class="editor-textarea" id="editor-textarea" spellcheck="false"></textarea>
    </div>
  `;

  const textarea = document.getElementById('editor-textarea');
  const saveBtn = document.getElementById('save-btn');
  const meta = document.getElementById('editor-meta');
  let originalContent = '';

  try {
    const res = await fetch(`${API}/memory/${filename}`);
    const data = await res.json();
    textarea.value = data.content || '';
    originalContent = data.content || '';
    if (data.modified) {
      meta.textContent = `${formatBytes(data.size)} · Updated ${formatRelative(data.modified)}`;
    }
  } catch (e) {
    textarea.value = '(failed to load)';
  }

  textarea.addEventListener('input', () => {
    saveBtn.disabled = textarea.value === originalContent;
    saveBtn.classList.remove('saved');
    saveBtn.textContent = 'Save';
  });

  saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';
    try {
      await fetch(`${API}/memory/${filename}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: textarea.value }),
      });
      originalContent = textarea.value;
      saveBtn.classList.add('saved');
      saveBtn.textContent = 'Saved ✓';
      toast('Saved', 'success');
    } catch (e) {
      saveBtn.textContent = 'Error';
      toast('Failed to save', 'error');
    }
  });
}

// ═══════════════════════════════════════
// Seeds
// ═══════════════════════════════════════

async function renderSeeds() {
  contentEl.innerHTML = `
    <div class="split-view">
      <div class="split-list" id="seed-list"></div>
      <div class="split-content" id="seed-editor"></div>
    </div>
  `;

  const listEl = document.getElementById('seed-list');
  const editorEl = document.getElementById('seed-editor');

  try {
    const res = await fetch(`${API}/seeds`);
    const data = await res.json();

    if (data.files.length === 0) {
      listEl.innerHTML = '<div style="padding: 12px; color: var(--text-dim); font-size: 12px;">No seed files</div>';
      return;
    }

    listEl.innerHTML = data.files.map(f => `
      <div class="file-item" data-file="${f.name}">
        <span class="file-item-name">${f.name}</span>
        <span class="file-item-meta">${formatBytes(f.size)}</span>
      </div>
    `).join('');

    listEl.addEventListener('click', (e) => {
      const item = e.target.closest('.file-item');
      if (!item) return;
      listEl.querySelectorAll('.file-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      loadSeed(item.dataset.file, editorEl);
    });

    // Auto-select first
    listEl.querySelector('.file-item')?.click();
  } catch (e) {
    listEl.innerHTML = '<div style="padding: 12px; color: var(--error-color);">Failed to load</div>';
  }
}

async function loadSeed(filename, editorEl) {
  try {
    const res = await fetch(`${API}/seeds/${filename}`);
    const data = await res.json();

    editorEl.innerHTML = `
      <div class="editor-panel">
        <div class="editor-toolbar">
          <strong style="font-size: 13px; color: var(--text-primary);">${filename}</strong>
          <button class="save-btn" id="seed-save-btn" disabled>Save</button>
          <span class="meta" id="seed-meta">${formatBytes(data.size)} · ${formatRelative(data.modified)}</span>
        </div>
        <textarea class="editor-textarea" id="seed-textarea" spellcheck="false">${escapeHtml(data.content)}</textarea>
      </div>
    `;

    const textarea = document.getElementById('seed-textarea');
    const saveBtn = document.getElementById('seed-save-btn');
    let original = data.content;

    textarea.addEventListener('input', () => {
      saveBtn.disabled = textarea.value === original;
      saveBtn.classList.remove('saved');
      saveBtn.textContent = 'Save';
    });

    saveBtn.addEventListener('click', async () => {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';
      try {
        await fetch(`${API}/seeds/${filename}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: textarea.value }),
        });
        original = textarea.value;
        saveBtn.classList.add('saved');
        saveBtn.textContent = 'Saved ✓';
        toast('Saved', 'success');
      } catch (e) {
        saveBtn.textContent = 'Error';
        toast('Failed to save', 'error');
      }
    });
  } catch (e) {
    editorEl.innerHTML = '<div style="padding: 12px; color: var(--error-color);">Failed to load</div>';
  }
}

// ═══════════════════════════════════════
// Working Memory
// ═══════════════════════════════════════

async function renderWorking() {
  contentEl.innerHTML = `
    <div class="split-view">
      <div class="split-list" id="working-list"></div>
      <div class="split-content" id="working-viewer"></div>
    </div>
  `;

  const listEl = document.getElementById('working-list');
  const viewerEl = document.getElementById('working-viewer');

  try {
    const res = await fetch(`${API}/working`);
    const data = await res.json();

    if (data.files.length === 0) {
      listEl.innerHTML = '<div style="padding: 12px; color: var(--text-dim); font-size: 12px;">No working files</div>';
      return;
    }

    listEl.innerHTML = data.files.map(f => `
      <div class="file-item" data-file="${f.name}">
        <span class="file-item-name">${f.name}</span>
        <span class="file-item-meta">${formatRelative(f.modified)}</span>
      </div>
    `).join('');

    listEl.addEventListener('click', (e) => {
      const item = e.target.closest('.file-item');
      if (!item) return;
      listEl.querySelectorAll('.file-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      loadWorking(item.dataset.file, viewerEl);
    });

    listEl.querySelector('.file-item')?.click();
  } catch (e) {
    listEl.innerHTML = '<div style="padding: 12px; color: var(--error-color);">Failed to load</div>';
  }
}

async function loadWorking(filename, viewerEl) {
  try {
    const res = await fetch(`${API}/working/${filename}`);
    const data = await res.json();

    viewerEl.innerHTML = `
      <div style="margin-bottom: 8px;">
        <strong style="font-size: 13px; color: var(--text-primary);">${filename}</strong>
        <span style="font-size: 11px; color: var(--text-dim); margin-left: 8px;">${formatBytes(data.size)} · ${formatRelative(data.modified)}</span>
      </div>
      <div class="card-content">${renderMarkdown(data.content)}</div>
    `;
  } catch (e) {
    viewerEl.innerHTML = '<div style="padding: 12px; color: var(--error-color);">Failed to load</div>';
  }
}

// ═══════════════════════════════════════
// Session Cards
// ═══════════════════════════════════════

let cardsFetching = false;
let cardsObserver = null;
let cardSort = 'date-desc';

async function renderCards() {
  loadedCards = [];
  cardPage = 1;
  cardsFetching = false;

  contentEl.innerHTML = `
    <div class="cards-header">
      <input type="text" class="cards-search" id="cards-search" placeholder="Search cards..." value="${escapeHtml(cardSearch)}" />
      <select class="cards-sort" id="cards-sort">
        <option value="date-desc" ${cardSort === 'date-desc' ? 'selected' : ''}>Newest first</option>
        <option value="date-asc" ${cardSort === 'date-asc' ? 'selected' : ''}>Oldest first</option>
        <option value="title-asc" ${cardSort === 'title-asc' ? 'selected' : ''}>Title A→Z</option>
        <option value="title-desc" ${cardSort === 'title-desc' ? 'selected' : ''}>Title Z→A</option>
      </select>
      <span class="cards-count" id="cards-count"></span>
    </div>
    <div class="card-grid" id="card-grid"></div>
    <div class="scroll-sentinel" id="scroll-sentinel"></div>
  `;

  const searchInput = document.getElementById('cards-search');
  const sortSelect = document.getElementById('cards-sort');

  let searchTimeout;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      cardSearch = searchInput.value;
      cardPage = 1;
      loadedCards = [];
      document.getElementById('card-grid').innerHTML = '';
      fetchCards();
    }, 300);
  });

  sortSelect.addEventListener('change', () => {
    cardSort = sortSelect.value;
    cardPage = 1;
    loadedCards = [];
    document.getElementById('card-grid').innerHTML = '';
    fetchCards();
  });

  // Set up infinite scroll with IntersectionObserver
  if (cardsObserver) cardsObserver.disconnect();
  cardsObserver = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && !cardsFetching && loadedCards.length < cardTotal) {
      cardPage++;
      fetchCards(true);
    }
  }, { rootMargin: '200px' });

  const sentinel = document.getElementById('scroll-sentinel');
  if (sentinel) cardsObserver.observe(sentinel);

  fetchCards();
}

async function fetchCards(append = false) {
  if (cardsFetching) return;
  cardsFetching = true;

  const grid = document.getElementById('card-grid');
  const countEl = document.getElementById('cards-count');

  try {
    const params = new URLSearchParams({ page: String(cardPage), limit: '50', sort: cardSort });
    if (cardSearch) params.set('search', cardSearch);

    const res = await fetch(`${API}/cards?${params}`);
    const data = await res.json();
    cardTotal = data.total;

    if (!append) loadedCards = [];
    loadedCards.push(...data.cards);

    countEl.textContent = `${loadedCards.length} of ${cardTotal} cards`;

    if (!append) grid.innerHTML = '';

    for (const card of data.cards) {
      const el = document.createElement('div');
      el.className = 'card-item';
      const dateText = card.sessionDate ? formatDate(card.sessionDate) : '—';
      el.innerHTML = `
        <span class="card-title">${escapeHtml(card.title)}</span>
        <span class="card-date">${dateText}</span>
      `;
      el.addEventListener('click', () => viewCard(card));
      grid.appendChild(el);
    }
  } catch (e) {
    if (!append) {
      grid.innerHTML = '<div style="padding: 12px; color: var(--error-color);">Failed to load</div>';
    }
  } finally {
    cardsFetching = false;
  }
}

async function viewCard(card) {
  try {
    const res = await fetch(`${API}/cards/${encodeURIComponent(card.name)}`);
    const data = await res.json();

    contentEl.innerHTML = `
      <div class="card-viewer">
        <div class="card-viewer-header">
          <button class="back-btn" id="card-back-btn">← Back</button>
          <span style="font-size: 11px; color: var(--text-dim);">${formatRelative(data.modified)} · ${formatBytes(data.size)}</span>
        </div>
        <div class="card-content">${renderMarkdown(data.content)}</div>
      </div>
    `;

    document.getElementById('card-back-btn').addEventListener('click', () => renderCards());
  } catch (e) {
    toast('Failed to load card', 'error');
  }
}

// ═══════════════════════════════════════
// Processes
// ═══════════════════════════════════════

function renderProcesses() {
  const processes = [
    { id: 'index', name: 'Full Index', desc: 'Re-index all memory sources (Claude.ai, Claude Code, Pi, journals, iMessage, drafts, session cards). Rebuilds embeddings.' },
    { id: 'index-incremental', name: 'Incremental Index', desc: 'Index only new or changed files. Much faster than full index.' },
    { id: 'stats', name: 'Index Stats', desc: 'Show database statistics: chunk counts, source breakdown, last indexed times.' },
    { id: 'vacuum', name: 'Vacuum', desc: 'Remove orphaned vector embeddings and compact the database.' },
    { id: 'generate-gists', name: 'Generate Gists', desc: 'Generate one-line gist summaries for all chunks using Haiku.' },
  ];

  contentEl.innerHTML = `
    <div class="process-grid">
      ${processes.map(p => `
        <div class="process-card">
          <div class="process-name">${p.name}</div>
          <div class="process-desc">${p.desc}</div>
          <button class="process-run-btn" data-process="${p.id}">Run</button>
        </div>
      `).join('')}
    </div>
  `;

  contentEl.querySelectorAll('.process-run-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const proc = btn.dataset.process;
      btn.disabled = true;
      btn.classList.add('running');
      btn.textContent = 'Running...';

      try {
        const res = await fetch(`${API}/run/${proc}`, { method: 'POST' });
        const data = await res.json();
        if (data.started) {
          toast(`Started: ${data.description}`, 'success');
          setTimeout(() => {
            btn.disabled = false;
            btn.classList.remove('running');
            btn.textContent = 'Run';
          }, 3000);
        }
      } catch (e) {
        toast('Failed to start process', 'error');
        btn.disabled = false;
        btn.classList.remove('running');
        btn.textContent = 'Run';
      }
    });
  });
}

// ═══════════════════════════════════════
// Logs
// ═══════════════════════════════════════

let logsAutoRefresh = null;

async function renderLogs() {
  contentEl.innerHTML = `
    <div class="logs-toolbar">
      <button class="back-btn" id="logs-refresh">↻ Refresh</button>
      <label style="font-size: 12px; color: var(--text-dim); display: flex; align-items: center; gap: 4px;">
        <input type="checkbox" id="logs-auto" /> Auto-refresh
      </label>
      <span class="meta" id="logs-meta" style="margin-left: auto; font-size: 11px; color: var(--text-dim);"></span>
    </div>
    <pre class="logs-content" id="logs-content"></pre>
  `;

  document.getElementById('logs-refresh').addEventListener('click', fetchLogs);
  document.getElementById('logs-auto').addEventListener('change', (e) => {
    if (e.target.checked) {
      logsAutoRefresh = setInterval(fetchLogs, 5000);
    } else {
      clearInterval(logsAutoRefresh);
      logsAutoRefresh = null;
    }
  });

  fetchLogs();
}

async function fetchLogs() {
  const el = document.getElementById('logs-content');
  const meta = document.getElementById('logs-meta');
  if (!el) return;

  try {
    const res = await fetch(`${API}/logs?lines=200`);
    const data = await res.json();
    el.textContent = data.content || '(empty)';
    if (data.totalLines) {
      meta.textContent = `${data.totalLines} lines total`;
    }
    el.scrollTop = el.scrollHeight;
  } catch (e) {
    el.textContent = '(failed to load logs)';
  }
}

// ═══════════════════════════════════════
// Utilities
// ═══════════════════════════════════════

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

function formatRelative(isoDate) {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}

function formatDate(isoDate) {
  const date = new Date(isoDate);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function toast(message, type = '') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// ═══════════════════════════════════════
// Sidebar toggle
// ═══════════════════════════════════════

const sidebarEl = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebar-toggle');
const sidebarOverlay = document.getElementById('sidebar-overlay');

sidebarToggle.addEventListener('click', () => {
  sidebarEl.classList.toggle('collapsed');
  sidebarOverlay.classList.toggle('visible', !sidebarEl.classList.contains('collapsed') && window.innerWidth <= 768);
});

sidebarOverlay.addEventListener('click', () => {
  sidebarEl.classList.add('collapsed');
  sidebarOverlay.classList.remove('visible');
});

// ═══════════════════════════════════════
// Theme / Settings (reuse from main app)
// ═══════════════════════════════════════

const settingsBtn = document.getElementById('settings-btn');
const settingsPanel = document.getElementById('settings-panel');
const settingsOverlay = document.getElementById('settings-overlay');
const settingsClose = document.getElementById('settings-close');
const themeGrid = document.getElementById('theme-grid');
const shuffleBtn = document.getElementById('shuffle-btn');

function buildThemeGrid() {
  themeGrid.innerHTML = '';
  const current = getCurrentTheme();
  for (const [id, theme] of Object.entries(themes)) {
    const btn = document.createElement('button');
    btn.className = `theme-swatch${current === id ? ' active' : ''}`;
    btn.innerHTML = `
      <div class="swatch-colors">
        <div class="swatch-dot" style="background: ${theme.vars['--bg-primary']}"></div>
        <div class="swatch-dot" style="background: ${theme.vars['--accent']}"></div>
      </div>
      <span>${theme.name}</span>
    `;
    btn.addEventListener('click', () => {
      applyTheme(id);
      themeGrid.querySelectorAll('.theme-swatch').forEach(s => s.classList.remove('active'));
      btn.classList.add('active');
    });
    themeGrid.appendChild(btn);
  }
}

settingsBtn.addEventListener('click', () => {
  buildThemeGrid();
  settingsPanel.classList.remove('hidden');
  settingsOverlay.classList.remove('hidden');
});
settingsClose.addEventListener('click', () => {
  settingsPanel.classList.add('hidden');
  settingsOverlay.classList.add('hidden');
});
settingsOverlay.addEventListener('click', () => {
  settingsPanel.classList.add('hidden');
  settingsOverlay.classList.add('hidden');
});
shuffleBtn.addEventListener('click', () => {
  shuffleTheme();
  themeGrid.querySelectorAll('.theme-swatch').forEach(s => s.classList.remove('active'));
});

// Restore theme
const savedTheme = getCurrentTheme();
if (savedTheme && savedTheme !== 'shuffled' && themes[savedTheme]) {
  applyTheme(savedTheme);
} else if (savedTheme === 'shuffled') {
  shuffleTheme();
}

// ═══════════════════════════════════════
// Init
// ═══════════════════════════════════════

switchPanel('overview');
console.log('🧠 memoryd dashboard initialized');
