import { useMemo, useState, useCallback, useEffect } from 'react';
import { FullscreenIcon, FullscreenExitIcon, CloseIcon } from './Icons';

interface PreviewProps {
  code: string;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Detect what kind of code we have and build the appropriate iframe srcDoc.
 * Supports: plain HTML, vanilla JS, and React/JSX (compiled via Babel standalone).
 */
function buildSrcDoc(code: string): string {
  const trimmed = code.trim();
  if (!trimmed) return '';

  // ── Plain HTML ──
  if (trimmed.startsWith('<!') || (trimmed.startsWith('<') && !looksLikeJsx(trimmed))) {
    return buildHtmlDoc(trimmed);
  }

  // ── React / JSX / TypeScript with JSX ──
  if (looksLikeReact(trimmed)) {
    return buildReactDoc(trimmed);
  }

  // ── Vanilla JS that touches the DOM ──
  if (trimmed.includes('document.') || trimmed.includes('innerHTML')) {
    return wrapHtml('<div id="app"></div>', trimmed);
  }

  // ── Plain JS (console-only or unknown) — show as syntax-highlighted pre ──
  return wrapHtml(
    `<pre style="margin:0;white-space:pre-wrap;color:#e0e6ed;font-family:monospace;font-size:13px;">${escapeHtml(trimmed)}</pre>`,
  );
}

function looksLikeJsx(code: string): boolean {
  // JSX-specific patterns: component tags, React hooks, arrow returns with JSX
  return /(?:function\s+\w+|const\s+\w+\s*=)[\s\S]*?return\s*\(/.test(code) ||
    /(?:useState|useEffect|useRef|useCallback|useMemo)\s*\(/.test(code) ||
    /<[A-Z]\w*[\s/>]/.test(code);
}

function looksLikeReact(code: string): boolean {
  return (
    code.includes('useState') ||
    code.includes('useEffect') ||
    code.includes('useRef') ||
    code.includes('React') ||
    code.includes('jsx') ||
    code.includes('JSX') ||
    /import\s+.*from\s+['"]react['"]/.test(code) ||
    /<[A-Z]\w*[\s/>]/.test(code) ||
    /export\s+default\s+/.test(code) ||
    /function\s+[A-Z]\w*\s*\(/.test(code)
  );
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Build a full HTML document from raw HTML content (may contain <script>, <style>, etc.) */
function buildHtmlDoc(html: string): string {
  // If it already has <html> or <!DOCTYPE>, use it as-is
  if (html.includes('<html') || html.includes('<!DOCTYPE')) return html;

  const scriptMatch = html.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
  const script = scriptMatch ? scriptMatch[1].trim() : undefined;
  const withoutScript = scriptMatch
    ? html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '').trim()
    : html;
  const bodyMatch = withoutScript.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const body = bodyMatch ? bodyMatch[1] : withoutScript;
  return wrapHtml(body, script);
}

function wrapHtml(body: string, script?: string): string {
  return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font-family:system-ui,sans-serif;margin:16px;background:#fff;color:#111}*{box-sizing:border-box}</style>
</head><body>
${body}
${script ? `<script>${script}<\/script>` : ''}
</body></html>`;
}

/**
 * Build an HTML document that loads React + ReactDOM + Babel standalone,
 * transpiles the user's JSX code in-browser, and renders it.
 */
function buildReactDoc(code: string): string {
  // Strip import/export statements — the CDN provides React globally
  const cleaned = code
    .replace(/import\s+[\s\S]*?from\s+['"][^'"]*['"]\s*;?\s*/g, '')
    .replace(/export\s+default\s+/g, '')
    .replace(/export\s+\{[^}]*\}\s*;?\s*/g, '')
    .replace(/export\s+/g, '')
    .trim();

  // Find the default component name (function ComponentName or const ComponentName)
  const fnMatch = cleaned.match(/function\s+([A-Z]\w*)\s*\(/);
  const constMatch = cleaned.match(/const\s+([A-Z]\w*)\s*=/);
  const componentName = fnMatch?.[1] ?? constMatch?.[1] ?? null;

  // Build the render call
  const renderCall = componentName
    ? `ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(${componentName}));`
    : '';

  return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body { font-family: system-ui, -apple-system, sans-serif; margin: 0; padding: 16px; background: #fff; color: #111; }
  * { box-sizing: border-box; }
  #root { min-height: 100vh; }
  #error-overlay {
    display: none; position: fixed; inset: 0; z-index: 9999;
    background: rgba(10,10,15,0.95); color: #ff4466;
    padding: 24px; font-family: monospace; font-size: 13px;
    white-space: pre-wrap; overflow: auto;
  }
  #error-overlay.visible { display: block; }
</style>
<script src="https://unpkg.com/react@18/umd/react.production.min.js"><\/script>
<script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"><\/script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js"><\/script>
</head><body>
<div id="root"></div>
<div id="error-overlay"></div>
<script type="text/babel" data-type="module">
try {
  const { useState, useEffect, useRef, useCallback, useMemo, useReducer, useContext, createContext, Fragment } = React;

${cleaned}

${renderCall}
} catch (err) {
  const el = document.getElementById('error-overlay');
  if (el) { el.textContent = err.message || String(err); el.classList.add('visible'); }
}
<\/script>
<script>
  // Catch Babel compilation errors
  window.onerror = function(msg) {
    const el = document.getElementById('error-overlay');
    if (el) { el.textContent = String(msg); el.classList.add('visible'); }
  };
<\/script>
</body></html>`;
}

export function Preview({ code, className = '', style }: PreviewProps) {
  const [isFullScreen, setIsFullScreen] = useState(false);

  const srcDoc = useMemo(() => buildSrcDoc(code), [code]);

  const toggleFullScreen = useCallback(() => {
    setIsFullScreen((prev) => !prev);
  }, []);

  // Escape key exits full-screen
  useEffect(() => {
    if (!isFullScreen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsFullScreen(false);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isFullScreen]);

  // Nothing to preview
  if (!srcDoc) return null;

  const previewHeader = (
    <div
      className="flex items-center gap-3 px-4 py-3 shrink-0"
      style={{
        background: 'rgba(10, 10, 20, 0.6)',
        borderBottom: '1px solid var(--jarvis-border)',
      }}
    >
      <div className="status-dot" />
      <span className="text-sm font-medium" style={{ color: 'var(--jarvis-text)' }}>
        Preview
      </span>
      <div className="ml-auto flex items-center gap-1">
        {isFullScreen && (
          <span className="text-xs mr-2" style={{ color: 'var(--jarvis-text-muted)' }}>
            ESC to exit
          </span>
        )}
        <button
          type="button"
          onClick={toggleFullScreen}
          className="icon-btn"
          aria-label={isFullScreen ? 'Exit full screen' : 'Full screen preview'}
          title={isFullScreen ? 'Exit full screen' : 'Full screen preview'}
        >
          {isFullScreen ? <FullscreenExitIcon size={20} /> : <FullscreenIcon size={20} />}
        </button>
      </div>
    </div>
  );

  // Full-screen overlay
  if (isFullScreen) {
    return (
      <>
        <div className={`preview-panel flex flex-col overflow-hidden ${className}`} style={style}>
          {previewHeader}
          <div
            className="flex-1 flex items-center justify-center"
            style={{ background: 'var(--jarvis-bg-elevated)' }}
          >
            <span className="text-sm" style={{ color: 'var(--jarvis-text-muted)' }}>
              Preview is in full screen
            </span>
          </div>
        </div>

        <div
          className="fixed inset-0 flex flex-col"
          style={{ zIndex: 100, background: 'var(--jarvis-bg)' }}
        >
          <div
            className="flex items-center justify-between px-5 py-3 shrink-0"
            style={{
              background: 'rgba(10, 10, 15, 0.9)',
              backdropFilter: 'blur(16px)',
              borderBottom: '1px solid var(--jarvis-border-glow)',
            }}
          >
            <div className="flex items-center gap-3">
              <div className="status-dot active" />
              <span className="text-sm font-medium" style={{ color: 'var(--jarvis-text)' }}>
                Full Screen Preview
              </span>
            </div>
            <button
              type="button"
              onClick={toggleFullScreen}
              className="flex items-center gap-2 px-4 py-2 rounded-lg transition-all"
              style={{
                background: 'rgba(0, 212, 255, 0.1)',
                border: '1px solid rgba(0, 212, 255, 0.2)',
                color: 'var(--jarvis-cyan)',
              }}
              onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(0, 212, 255, 0.18)'; }}
              onMouseOut={(e) => { e.currentTarget.style.background = 'rgba(0, 212, 255, 0.1)'; }}
              aria-label="Exit full screen"
            >
              <CloseIcon size={18} />
              <span className="text-sm font-medium">Exit</span>
            </button>
          </div>
          <div className="flex-1 min-h-0" style={{ background: '#ffffff' }}>
            <iframe
              title="Preview – Full Screen"
              srcDoc={srcDoc}
              className="w-full h-full border-0"
              style={{ background: '#ffffff' }}
              sandbox="allow-scripts"
            />
          </div>
        </div>
      </>
    );
  }

  return (
    <div className={`preview-panel flex flex-col overflow-hidden ${className}`} style={style}>
      {previewHeader}
      <div
        className="flex-1 overflow-auto"
        style={{ minHeight: 260, background: '#ffffff' }}
      >
        <iframe
          title="Preview"
          srcDoc={srcDoc}
          className="w-full border-0"
          style={{ minHeight: 260, height: '100%', background: '#ffffff' }}
          sandbox="allow-scripts"
        />
      </div>
    </div>
  );
}
