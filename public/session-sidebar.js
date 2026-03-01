/**
 * Session Sidebar - Lists sessions grouped by project, handles switching
 */

export class SessionSidebar {
  constructor(container, onSessionSelect) {
    this.container = container;
    this.onSessionSelect = onSessionSelect;
    this.activeSessionFile = null;
    this.projects = [];
    this.collapsedProjects = new Set();
    this.searchQuery = '';
  }

  async loadSessions() {
    try {
      this.container.innerHTML = '<div class="session-loading">Loading sessions...</div>';
      const res = await fetch('/api/sessions');
      const data = await res.json();
      this.projects = data.projects || [];
      this.render();
    } catch (error) {
      console.error('[Sidebar] Failed to load sessions:', error);
      this.container.innerHTML = '<div class="session-loading">Failed to load sessions</div>';
    }
  }

  setSearchQuery(query) {
    this.searchQuery = query.toLowerCase().trim();
    this.applySearch();
  }

  applySearch() {
    if (!this.searchQuery) {
      // Show all
      this.container.querySelectorAll('.session-item').forEach(el => {
        el.classList.remove('hidden');
      });
      this.container.querySelectorAll('.project-group').forEach(el => {
        el.style.display = '';
      });
      return;
    }

    this.container.querySelectorAll('.project-group').forEach(group => {
      let hasVisible = false;

      group.querySelectorAll('.session-item').forEach(item => {
        const title = (item.querySelector('.session-title')?.textContent || '').toLowerCase();
        const matches = title.includes(this.searchQuery);
        item.classList.toggle('hidden', !matches);
        if (matches) hasVisible = true;
      });

      group.style.display = hasVisible ? '' : 'none';
    });
  }

  setActive(filePath) {
    this.activeSessionFile = filePath;
    this.container.querySelectorAll('.session-item').forEach(el => {
      el.classList.toggle('active', el.dataset.filePath === filePath);
    });
  }

  clearActive() {
    this.activeSessionFile = null;
    this.container.querySelectorAll('.session-item').forEach(el => {
      el.classList.remove('active');
    });
  }

  render() {
    if (this.projects.length === 0) {
      this.container.innerHTML = '<div class="session-loading">No sessions found</div>';
      return;
    }

    this.container.innerHTML = '';

    for (const project of this.projects) {
      const group = document.createElement('div');
      group.className = 'project-group';

      const isCollapsed = this.collapsedProjects.has(project.dirName);

      // Project header
      const header = document.createElement('div');
      header.className = `project-header${isCollapsed ? ' collapsed' : ''}`;

      // Show last path component for brevity
      const pathParts = project.path.split('/').filter(Boolean);
      const shortPath = pathParts.length > 0 ? pathParts[pathParts.length - 1] : project.path;

      header.innerHTML = `
        <span class="chevron">▼</span>
        <span title="${this.escapeHtml(project.path)}">${this.escapeHtml(shortPath)}</span>
        <span class="project-count">${project.sessions.length}</span>
      `;

      header.addEventListener('click', () => {
        if (this.collapsedProjects.has(project.dirName)) {
          this.collapsedProjects.delete(project.dirName);
        } else {
          this.collapsedProjects.add(project.dirName);
        }
        header.classList.toggle('collapsed');
        sessionsDiv.classList.toggle('collapsed');
      });

      group.appendChild(header);

      // Sessions list
      const sessionsDiv = document.createElement('div');
      sessionsDiv.className = `project-sessions${isCollapsed ? ' collapsed' : ''}`;

      for (const session of project.sessions) {
        const item = document.createElement('div');
        item.className = 'session-item';
        item.dataset.filePath = session.filePath;

        if (session.filePath === this.activeSessionFile) {
          item.classList.add('active');
        }

        const title = session.name || session.firstMessage || 'Empty session';
        const time = this.formatTime(session.timestamp);

        item.innerHTML = `
          <div class="session-title-row">
            <div class="session-title" title="${this.escapeHtml(title)}">${this.escapeHtml(title)}</div>
            <button class="session-rename-btn" title="Rename">✎</button>
          </div>
          <div class="session-meta">${time}</div>
        `;

        item.addEventListener('click', (e) => {
          if (e.target.closest('.session-rename-btn')) return;
          this.onSessionSelect(session, project);
        });

        item.querySelector('.session-rename-btn').addEventListener('click', (e) => {
          e.stopPropagation();
          const titleEl = item.querySelector('.session-title');
          const renameBtn = item.querySelector('.session-rename-btn');
          const currentName = titleEl.textContent;

          const input = document.createElement('input');
          input.className = 'session-rename-input';
          input.value = currentName;
          titleEl.replaceWith(input);
          renameBtn.style.display = 'none';
          input.focus();
          input.select();

          const commit = async () => {
            const newName = input.value.trim();
            if (newName && newName !== currentName) {
              try {
                await fetch('/api/rpc', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ type: 'set_session_name', name: newName }),
                });
              } catch (err) { /* silent */ }
            }
            const newTitle = document.createElement('div');
            newTitle.className = 'session-title';
            newTitle.title = newName || currentName;
            newTitle.textContent = newName || currentName;
            input.replaceWith(newTitle);
            renameBtn.style.display = '';
          };

          input.addEventListener('blur', commit);
          input.addEventListener('keydown', (ke) => {
            if (ke.key === 'Enter') { ke.preventDefault(); input.blur(); }
            if (ke.key === 'Escape') { input.value = currentName; input.blur(); }
          });
        });

        sessionsDiv.appendChild(item);
      }

      group.appendChild(sessionsDiv);
      this.container.appendChild(group);
    }

    // Re-apply search filter if active
    if (this.searchQuery) {
      this.applySearch();
    }
  }

  formatTime(isoTimestamp) {
    try {
      const date = new Date(isoTimestamp);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const days = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (days === 1) return 'Yesterday';
      if (days < 7) return date.toLocaleDateString([], { weekday: 'long' });
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
