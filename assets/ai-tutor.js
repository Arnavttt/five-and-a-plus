/**
 * AI Tutor Widget — AP Study Guide
 * Self-contained vanilla JS chat widget that integrates with /api/chat (SSE)
 * Drop this file at the root of the site and add <script src="/ai-tutor.js" defer></script>
 */
(function () {
  'use strict';

  // ─── Config ────────────────────────────────────────────────────────────────
  const API_ENDPOINT = '/api/chat'; // Update to your deployed Cloudflare Worker URL
  const STORAGE_KEY  = 'ai-tutor-history';
  const MAX_HISTORY  = 20; // max messages kept in sessionStorage

  // ─── Detect course ─────────────────────────────────────────────────────────
  function detectCourse() {
    // 1. <meta name="course" content="AP Calculus BC">
    const meta = document.querySelector('meta[name="course"]');
    if (meta && meta.getAttribute('content')) {
      return meta.getAttribute('content').trim();
    }
    // 2. <title> — grab "AP …" portion
    const title = document.title || '';
    const match = title.match(/AP\s+[\w\s&]+/i);
    if (match) return match[0].trim();
    // 3. Fallback
    return 'AP';
  }

  // ─── Session history ───────────────────────────────────────────────────────
  function loadHistory() {
    try {
      return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '[]');
    } catch { return []; }
  }
  function saveHistory(messages) {
    try {
      // Keep last MAX_HISTORY messages
      const trimmed = messages.slice(-MAX_HISTORY);
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    } catch { /* storage unavailable */ }
  }

  // ─── DOM helpers ───────────────────────────────────────────────────────────
  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === 'class') node.className = v;
      else if (k === 'html')  node.innerHTML = v;
      else if (k.startsWith('data-')) node.setAttribute(k, v);
      else node[k] = v;
    });
    children.forEach(c => c && node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
    return node;
  }

  // ─── Build widget DOM ──────────────────────────────────────────────────────
  function buildWidget(course) {
    // Wrapper
    const wrapper = el('div', { id: 'ai-tutor-widget', 'aria-live': 'polite' });

    // Toggle button
    const toggleBtn = el('button', {
      id: 'ai-tutor-toggle',
      class: 'ai-tutor-toggle',
      'aria-label': `Open ${course} AI Tutor`,
      title: `Ask your ${course} tutor`,
      html: `
        <svg class="ai-tutor-icon-open" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        <svg class="ai-tutor-icon-close" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      `
    });

    // Chat window
    const window_ = el('div', { id: 'ai-tutor-window', class: 'ai-tutor-window', role: 'dialog', 'aria-label': `${course} AI Tutor` });

    // Header
    const header = el('div', { class: 'ai-tutor-header' });
    header.appendChild(el('span', { class: 'ai-tutor-header-title', html: `<strong>${course}</strong> Tutor` }));
    const clearBtn = el('button', { class: 'ai-tutor-clear-btn', title: 'Clear chat', 'aria-label': 'Clear conversation', html: '&#x1F5D1;' });
    header.appendChild(clearBtn);
    window_.appendChild(header);

    // Messages area
    const messages = el('div', { id: 'ai-tutor-messages', class: 'ai-tutor-messages', role: 'log', 'aria-label': 'Conversation' });
    window_.appendChild(messages);

    // Typing indicator
    const typingEl = el('div', { class: 'ai-tutor-bubble ai-tutor-bubble--assistant ai-tutor-typing', id: 'ai-tutor-typing', 'aria-hidden': 'true', html: '<span></span><span></span><span></span>' });

    // Input row
    const inputRow = el('form', { class: 'ai-tutor-input-row', id: 'ai-tutor-form' });
    const textarea = el('textarea', {
      id: 'ai-tutor-input',
      class: 'ai-tutor-input',
      placeholder: `Ask me anything about ${course}…`,
      rows: 1,
      'aria-label': 'Your question',
    });
    const sendBtn = el('button', {
      type: 'submit',
      class: 'ai-tutor-send-btn',
      'aria-label': 'Send',
      html: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`
    });
    inputRow.appendChild(textarea);
    inputRow.appendChild(sendBtn);
    window_.appendChild(inputRow);

    wrapper.appendChild(toggleBtn);
    wrapper.appendChild(window_);
    document.body.appendChild(wrapper);

    return { wrapper, toggleBtn, window_, messages, typingEl, inputRow, textarea, sendBtn, clearBtn };
  }

  // ─── Message rendering ─────────────────────────────────────────────────────
  function renderMessage(container, role, text) {
    const bubble = el('div', { class: `ai-tutor-bubble ai-tutor-bubble--${role}` });
    bubble.textContent = text;
    container.appendChild(bubble);
    container.scrollTop = container.scrollHeight;
    return bubble;
  }

  // Simple Markdown-ish renderer (bold, code, line breaks)
  function renderMarkdown(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');
  }

  // ─── SSE streaming fetch ───────────────────────────────────────────────────
  async function streamChat(messages, course, onChunk, onDone, onError) {
    let response;
    try {
      response = await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages, course }),
      });
    } catch (e) {
      onError('Could not reach the tutor backend. Make sure /api/chat is deployed.');
      return;
    }

    if (!response.ok) {
      const errText = await response.text().catch(() => response.statusText);
      onError(`Server error ${response.status}: ${errText}`);
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Parse SSE lines
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep incomplete line

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') { onDone(fullText); return; }
        try {
          const parsed = JSON.parse(data);
          const chunk = parsed.delta ?? parsed.text ?? parsed.content ?? '';
          if (chunk) { fullText += chunk; onChunk(chunk, fullText); }
        } catch { /* skip malformed line */ }
      }
    }
    onDone(fullText);
  }

  // ─── Main init ─────────────────────────────────────────────────────────────
  function init() {
    const course = detectCourse();
    const { toggleBtn, window_, messages, typingEl, inputRow, textarea, sendBtn, clearBtn } = buildWidget(course);
    let isOpen = false;
    let isLoading = false;
    let history = loadHistory();

    // Restore history
    history.forEach(m => renderMessage(messages, m.role, m.content));

    // Toggle open/close
    function toggleWindow() {
      isOpen = !isOpen;
      window_.classList.toggle('ai-tutor-window--open', isOpen);
      toggleBtn.classList.toggle('ai-tutor-toggle--open', isOpen);
      toggleBtn.setAttribute('aria-label', isOpen ? 'Close tutor' : `Open ${course} AI Tutor`);
      if (isOpen) {
        textarea.focus();
        messages.scrollTop = messages.scrollHeight;
      }
    }
    toggleBtn.addEventListener('click', toggleWindow);

    // Clear
    clearBtn.addEventListener('click', () => {
      history = [];
      saveHistory([]);
      messages.innerHTML = '';
    });

    // Auto-resize textarea
    textarea.addEventListener('input', () => {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
    });

    // Send on Enter (Shift+Enter = newline)
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });
    inputRow.addEventListener('submit', (e) => { e.preventDefault(); sendMessage(); });

    function sendMessage() {
      if (isLoading) return;
      const text = textarea.value.trim();
      if (!text) return;

      // Render user bubble
      renderMessage(messages, 'user', text);
      textarea.value = '';
      textarea.style.height = 'auto';

      // Add to history
      history.push({ role: 'user', content: text });
      saveHistory(history);

      // Show typing indicator
      isLoading = true;
      sendBtn.disabled = true;
      textarea.disabled = true;
      messages.appendChild(typingEl);
      typingEl.removeAttribute('aria-hidden');
      messages.scrollTop = messages.scrollHeight;

      // Create assistant bubble (streaming into it)
      const assistantBubble = el('div', { class: 'ai-tutor-bubble ai-tutor-bubble--assistant' });
      assistantBubble.innerHTML = '&ZeroWidthSpace;'; // placeholder

      streamChat(
        // Send only the last 10 messages (5 turns) to keep tokens low
        history.slice(-10),
        course,
        (chunk, fullText) => {
          // First chunk: swap typing indicator for real bubble
          if (!assistantBubble.parentNode) {
            typingEl.replaceWith(assistantBubble);
          }
          assistantBubble.innerHTML = renderMarkdown(fullText);
          messages.scrollTop = messages.scrollHeight;
        },
        (fullText) => {
          // Done
          if (!assistantBubble.parentNode) typingEl.replaceWith(assistantBubble);
          if (typingEl.parentNode) typingEl.remove();
          assistantBubble.innerHTML = renderMarkdown(fullText || '(no response)');
          history.push({ role: 'assistant', content: fullText });
          saveHistory(history);
          isLoading = false;
          sendBtn.disabled = false;
          textarea.disabled = false;
          textarea.focus();
        },
        (errMsg) => {
          if (typingEl.parentNode) typingEl.remove();
          renderMessage(messages, 'error', '⚠ ' + errMsg);
          isLoading = false;
          sendBtn.disabled = false;
          textarea.disabled = false;
        }
      );
    }
  }

  // Run after DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
