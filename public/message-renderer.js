/**
 * Message Renderer - Renders chat messages with markdown support
 */

import { renderMarkdown } from './markdown.js';

export class MessageRenderer {
  constructor(container) {
    this.container = container;
    this.isNearBottom = true;

    // Track scroll position for smart auto-scroll
    this.container.addEventListener('scroll', () => {
      const threshold = 100;
      this.isNearBottom =
        this.container.scrollHeight - this.container.scrollTop - this.container.clientHeight < threshold;
    });
  }

  clear() {
    this.container.innerHTML = '';
  }

  renderWelcome() {
    this.container.innerHTML = `
      <div class="welcome">
        <div class="welcome-icon">τ</div>
        <p>Welcome to Tau</p>
        <p class="hint">Type a message below to start chatting with Pi, or select a session from the sidebar.</p>
        <div class="shortcuts-hint">
          <span>/ Focus input</span>
          <span>Esc Abort</span>
        </div>
      </div>
    `;
  }

  renderUserMessage(message, isHistory = false) {
    // Remove welcome message if present
    const welcome = this.container.querySelector('.welcome');
    if (welcome) welcome.remove();

    const div = document.createElement('div');
    div.className = `message user${isHistory ? ' history' : ''}`;
    div.innerHTML = `
      <div class="message-content">${this.escapeHtml(message.content)}</div>
      <button class="message-copy-btn">Copy</button>
    `;
    this._setupCopyBtn(div);
    this.container.appendChild(div);
    if (!isHistory) this.scrollToBottom();
  }

  renderAssistantMessage(message, isStreaming = false, isHistory = false) {
    // Remove welcome message if present
    const welcome = this.container.querySelector('.welcome');
    if (welcome) welcome.remove();

    const div = document.createElement('div');
    div.className = `message assistant${isHistory ? ' history' : ''}`;
    div.dataset.messageId = message.id || 'streaming';

    let contentHtml = '';
    let usageHtml = '';

    if (typeof message.content === 'string') {
      contentHtml = isStreaming ? this.escapeHtml(message.content) : renderMarkdown(message.content);
    } else if (Array.isArray(message.content)) {
      for (const block of message.content) {
        if (block.type === 'text') {
          contentHtml += isStreaming ? this.escapeHtml(block.text) : renderMarkdown(block.text);
        } else if (block.type === 'thinking') {
          contentHtml += this.renderThinkingBlock(block.thinking);
        }
      }
    }

    // Usage/cost info
    if (message.usage && message.usage.cost) {
      const cost = message.usage.cost.total;
      if (cost > 0) {
        usageHtml = `<span class="message-usage">$${cost.toFixed(4)}</span>`;
      }
    }

    const streamingClass = isStreaming ? ' streaming' : '';

    div.innerHTML = `
      <div class="message-content${streamingClass}">${contentHtml || '<em style="color: var(--text-dim)">Thinking...</em>'}</div>
      ${usageHtml}
      ${!isStreaming ? '<button class="message-copy-btn">Copy</button>' : ''}
    `;

    if (!isStreaming) this._setupCopyBtn(div);
    this.container.appendChild(div);
    if (!isHistory) this.scrollToBottom();

    return div;
  }

  renderThinkingBlock(thinking) {
    const id = 'thinking-' + Math.random().toString(36).slice(2, 8);
    return `<div class="thinking-block">
<div class="thinking-toggle" onclick="var c=document.getElementById('${id}');c.classList.toggle('expanded');this.classList.toggle('expanded')">
<span class="chevron">▶</span>
<span>💭 Thinking...</span>
</div>
<div class="thinking-content" id="${id}">${this.escapeHtml(thinking)}</div>
</div>`;
  }

  updateStreamingMessage(messageElement, content) {
    const contentDiv = messageElement.querySelector('.message-content');
    if (contentDiv) {
      // During streaming, use escaped text (markdown applied on finalize)
      contentDiv.innerHTML = this.escapeHtml(content);
      this.scrollToBottom();
    }
  }

  finalizeStreamingMessage(messageElement, usage = null) {
    const contentDiv = messageElement.querySelector('.message-content');
    if (contentDiv) {
      contentDiv.classList.remove('streaming');
      // Now render as markdown
      const rawText = contentDiv.textContent;
      contentDiv.innerHTML = renderMarkdown(rawText);
    }

    // Add copy button after streaming finishes
    if (!messageElement.querySelector('.message-copy-btn')) {
      const btn = document.createElement('button');
      btn.className = 'message-copy-btn';
      btn.textContent = 'Copy';
      messageElement.appendChild(btn);
      this._setupCopyBtn(messageElement);
    }

    // Add usage info if available
    if (usage && usage.cost && usage.cost.total > 0) {
      if (!messageElement.querySelector('.message-usage')) {
        const span = document.createElement('span');
        span.className = 'message-usage';
        span.textContent = `$${usage.cost.total.toFixed(4)}`;
        messageElement.appendChild(span);
      }
    }
  }

  renderSystemMessage(text) {
    const div = document.createElement('div');
    div.className = 'system-message';
    div.textContent = text;
    this.container.appendChild(div);
    this.scrollToBottom();
  }

  renderError(errorMessage) {
    const div = document.createElement('div');
    div.className = 'error-message';
    div.textContent = `⚠️ ${errorMessage}`;
    this.container.appendChild(div);
    this.scrollToBottom();
  }

  _setupCopyBtn(messageEl) {
    const btn = messageEl.querySelector('.message-copy-btn');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const content = messageEl.querySelector('.message-content');
      if (!content) return;
      navigator.clipboard.writeText(content.textContent).then(() => {
        btn.textContent = '✓';
        btn.classList.add('copied');
        setTimeout(() => {
          btn.textContent = 'Copy';
          btn.classList.remove('copied');
        }, 1500);
      });
    });
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  scrollToBottom() {
    if (this.isNearBottom) {
      requestAnimationFrame(() => {
        this.container.scrollTop = this.container.scrollHeight;
      });
    }
  }
}
