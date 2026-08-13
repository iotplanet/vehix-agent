/**
 * Web Worker for incremental Markdown streaming parse.
 *
 * Maintains internal state (buffer, stable blocks, code-fence flag)
 * so that each new chunk only triggers parsing of newly-completed
 * blocks.  Completed blocks are rendered with marked and cached;
 * the trailing incomplete block is re-rendered on every chunk so
 * the user sees the text grow smoothly.
 */

import { marked } from "marked";

// ── Internal state ──────────────────────────────────────────────
let buffer = "";
let stableBlocks: string[] = []; // HTML strings of completed blocks
let inCodeBlock = false;
let codeBlockLang = "";

// ── Tiny HTML escape (for code-block content) ──────────────────
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ── Post the current view to the main thread ───────────────────
function emit(streamingHtml: string) {
  self.postMessage({
    stableBlocks,
    streamingHtml,
    isCodeBlock: inCodeBlock,
  });
}

// ── Core incremental processor ─────────────────────────────────
function processBuffer() {
  // --- Inside a code fence: look for the closing ``` ----------
  if (inCodeBlock) {
    const closeIdx = buffer.indexOf("\n```");
    if (closeIdx !== -1) {
      // closing fence found → flush the code block
      const codeContent = buffer.substring(0, closeIdx);
      const html = `<pre><code class="language-${codeBlockLang}">${escapeHtml(codeContent)}</code></pre>`;
      stableBlocks.push(html);
      buffer = buffer.substring(closeIdx + 4); // skip the "\n```" we consumed
      inCodeBlock = false;
      codeBlockLang = "";
      processBuffer(); // continue with whatever follows
    } else {
      // still inside — emit whole buffer as a live code block
      emit(`<pre><code>${escapeHtml(buffer)}</code></pre>`);
    }
    return;
  }

  // --- Outside code fences: split on double-newline (paragraph boundary) -
  // A blank line (two consecutive newlines) is the markdown
  // signal that the preceding block is "closed".
  const parts = buffer.split(/\n\n+/);

  if (parts.length <= 1) {
    // Only one paragraph — may contain a code-fence *start*
    const codeStart = buffer.indexOf("\n```");
    if (codeStart !== -1) {
      const beforeCode = buffer.substring(0, codeStart);
      if (beforeCode.trim()) {
        stableBlocks.push(marked.parse(beforeCode) as string);
      }
      // Enter code-block mode
      buffer = buffer.substring(codeStart + 1); // keep from ``` onward
      inCodeBlock = true;
      codeBlockLang = "";
      const langMatch = buffer.match(/^```(\w*)/);
      if (langMatch) {
        codeBlockLang = langMatch[1];
        buffer = buffer.substring(langMatch[0].length); // strip ```lang
      }
      processBuffer();
    } else {
      // Single incomplete paragraph — emit as-is
      emit(marked.parse(buffer) as string);
    }
    return;
  }

  // --- Multiple paragraphs: all but the last are "stable" -----
  const completeParts = parts.slice(0, -1);
  const lastPart = parts[parts.length - 1];

  for (const part of completeParts) {
    if (part.trim()) {
      stableBlocks.push(marked.parse(part) as string);
    }
  }
  buffer = lastPart;

  // The trailing paragraph may itself contain a code-fence start
  const codeStart = lastPart.indexOf("\n```");
  if (codeStart !== -1) {
    const beforeCode = lastPart.substring(0, codeStart);
    if (beforeCode.trim()) {
      stableBlocks.push(marked.parse(beforeCode) as string);
    }
    buffer = lastPart.substring(codeStart + 1);
    inCodeBlock = true;
    codeBlockLang = "";
    const langMatch = buffer.match(/^```(\w*)/);
    if (langMatch) {
      codeBlockLang = langMatch[1];
      buffer = buffer.substring(langMatch[0].length);
    }
    processBuffer();
  } else {
    // Trailing incomplete paragraph
    emit(marked.parse(buffer) as string);
  }
}

// ── Message handlers ───────────────────────────────────────────
self.onmessage = (e: MessageEvent) => {
  const { type, data } = e.data;

  switch (type) {
    case "append":
      buffer += data;
      processBuffer();
      break;

    case "finish":
      // Flush any remaining buffer into stable blocks
      if (buffer.length > 0) {
        if (inCodeBlock) {
          const html = `<pre><code class="language-${codeBlockLang}">${escapeHtml(buffer)}</code></pre>`;
          stableBlocks.push(html);
        } else {
          stableBlocks.push(marked.parse(buffer) as string);
        }
        buffer = "";
      }
      inCodeBlock = false;
      codeBlockLang = "";
      emit("");
      break;

    case "reset":
      buffer = "";
      stableBlocks = [];
      inCodeBlock = false;
      codeBlockLang = "";
      emit("");
      break;
  }
};
