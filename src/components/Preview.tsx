import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { FullscreenIcon, FullscreenExitIcon, CloseIcon, DownloadIcon } from './Icons';

interface PreviewProps {
  code: string;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Strip markdown code fences and language labels.
 */
function stripCodeFences(code: string): string {
  let cleaned = code.trim();
  // Remove opening fences: ```javascript, ```jsx, ```tsx, etc.
  cleaned = cleaned.replace(/^```\w*\s*\n?/gm, '');
  // Remove closing fences
  cleaned = cleaned.replace(/\n?```\s*$/gm, '');
  cleaned = cleaned.replace(/^```\s*/g, '').replace(/\s*```$/g, '');
  return cleaned.trim();
}

function looksLikeReact(code: string): boolean {
  return (
    code.includes('useState') ||
    code.includes('useEffect') ||
    code.includes('useRef') ||
    /import\s+.*from\s+['"]react['"]/.test(code) ||
    /<[A-Z]\w*[\s/>]/.test(code) ||
    /export\s+default\s+/.test(code) ||
    /function\s+[A-Z]\w*\s*\(/.test(code)
  );
}

function looksLikeJsx(code: string): boolean {
  return /(?:function\s+\w+|const\s+\w+\s*=)[\s\S]*?return\s*\(/.test(code) ||
    /(?:useState|useEffect|useRef|useCallback|useMemo)\s*\(/.test(code) ||
    /<[A-Z]\w*[\s/>]/.test(code);
}

/** Detect likely incomplete code (unbalanced braces) so we show a hint instead of "Script error." */
function isLikelyIncomplete(code: string): boolean {
  const trimmed = code.trim();
  if (!trimmed) return false;
  let depth = 0;
  const inString = (s: string, i: number) => {
    const before = s.slice(0, i);
    const single = (before.match(/'/g) ?? []).length - (before.match(/\\'/g) ?? []).length;
    const double = (before.match(/"/g) ?? []).length - (before.match(/\\"/g) ?? []).length;
    return (single % 2 !== 0) || (double % 2 !== 0);
  };
  for (let i = 0; i < trimmed.length; i++) {
    if (inString(trimmed, i)) continue;
    if (trimmed[i] === '{') depth++;
    else if (trimmed[i] === '}') depth--;
  }
  return depth > 0;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// In dev we use the Tailwind CDN for the preview iframe; in production we avoid it (CDN warns and is not recommended).
const TAILWIND_SCRIPT =
  import.meta.env.DEV
    ? '<script src="https://cdn.tailwindcss.com"></script>'
    : '';

const REACT_CDN = 'https://unpkg.com/react@18/umd/react.development.js';
const REACT_DOM_CDN = 'https://unpkg.com/react-dom@18/umd/react-dom.development.js';
const BABEL_CDN = 'https://unpkg.com/@babel/standalone@7/babel.min.js';

const BASE_STYLES = `
* { box-sizing: border-box; margin: 0; }
body {
  font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
  margin: 0; padding: 16px;
  background: #fff; color: #0f172a;
  -webkit-font-smoothing: antialiased;
  line-height: 1.5;
}
input, button, textarea, select { font-family: inherit; font-size: inherit; }
`;

/**
 * Build srcDoc based on code type.
 */
function buildSrcDoc(rawCode: string): string {
  const code = stripCodeFences(rawCode);
  if (!code) return '';

  // Plain HTML
  if (code.startsWith('<!') || (code.startsWith('<') && !looksLikeJsx(code))) {
    return buildHtmlDoc(code);
  }

  // React / JSX
  if (looksLikeReact(code)) {
    if (isLikelyIncomplete(code)) {
      return buildIncompleteCodeDoc();
    }
    return buildReactDoc(code);
  }

  // Vanilla JS with DOM
  if (code.includes('document.') || code.includes('innerHTML')) {
    return wrapHtml(`<div id="app"></div>`, code);
  }

  // Plain code — show as pre
  return wrapHtml(
    `<pre style="margin:0;white-space:pre-wrap;color:#334155;font-family:ui-monospace,monospace;font-size:13px;padding:16px;">${escapeHtml(code)}</pre>`,
  );
}

function buildHtmlDoc(html: string): string {
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
${TAILWIND_SCRIPT}
<style>${BASE_STYLES}</style>
</head><body>
${body}
${script ? `<script>${script}</script>` : ''}
</body></html>`;
}

function buildIncompleteCodeDoc(): string {
  const msg = 'Code appears incomplete (e.g. missing return or closing braces). Ask the assistant to continue or finish the component.';
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:20px;font-family:system-ui,sans-serif;background:#0f172a;color:#e2e8f0;display:flex;align-items:center;justify-content:center;min-height:100vh;box-sizing:border-box;">
  <p style="max-width:420px;text-align:center;line-height:1.6;">${msg}</p>
</body></html>`;
}

function buildReactDoc(code: string): string {
  // Strip imports and exports line by line
  const cleaned = code
    .split('\n')
    .filter((line) => !/^\s*import\s+/.test(line))
    .join('\n')
    .replace(/export\s+default\s+/g, '')
    .replace(/export\s+\{[^}]*\}\s*;?\s*/g, '')
    .replace(/export\s+/g, '')
    .trim();

  // Find component name
  const fnMatch = cleaned.match(/function\s+([A-Z]\w*)\s*\(/);
  const constMatch = cleaned.match(/const\s+([A-Z]\w*)\s*=/);
  const componentName = fnMatch?.[1] ?? constMatch?.[1] ?? null;

  const renderCall = componentName
    ? `ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(${componentName}));`
    : '';

  return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
${TAILWIND_SCRIPT}
<style>
${BASE_STYLES}
#root { min-height: 100vh; }
#error-overlay {
  display: none; position: fixed; inset: 0; z-index: 9999;
  background: rgba(10,10,15,0.95); color: #ff4466;
  padding: 24px; font-family: monospace; font-size: 13px;
  white-space: pre-wrap; overflow: auto;
}
#error-overlay.visible { display: block; }
</style>
<script src="${REACT_CDN}"></script>
<script src="${REACT_DOM_CDN}"></script>
<script src="${BABEL_CDN}"></script>
</head><body>
<div id="root"></div>
<div id="error-overlay"></div>
<script>
window.onerror = function(msg, src, line, col, err) {
  var el = document.getElementById('error-overlay');
  if (el) {
    var text = (err && err.message) ? err.message : String(msg);
    if (text === 'Script error.' || !text) text = 'Something went wrong. The code may be incomplete or have a syntax error. Try asking the assistant to continue or fix it.';
    el.textContent = text;
    el.classList.add('visible');
  }
};
</script>
<script type="text/babel" data-presets="react">
try {
  const { useState, useEffect, useRef, useCallback, useMemo, useReducer, useContext, createContext, Fragment } = React;

${cleaned}

${renderCall}
} catch (err) {
  const el = document.getElementById('error-overlay');
  if (el) {
    const text = (err && err.message) ? err.message : String(err);
    el.textContent = text || 'Code has an error. Check the component and try again.';
    el.classList.add('visible');
  }
}
</script>
</body></html>`;
}

function downloadPreview(srcDoc: string, code: string): void {
  const nameMatch = code.match(/function\s+([A-Z]\w*)/);
  const fileName = nameMatch ? `${nameMatch[1]}.html` : 'preview.html';
  const blob = new Blob([srcDoc], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function Preview({ code, className = '', style }: PreviewProps) {
  const [isFullScreen, setIsFullScreen] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const fullIframeRef = useRef<HTMLIFrameElement>(null);

  const srcDoc = useMemo(() => buildSrcDoc(code), [code]);

  const toggleFullScreen = useCallback(() => {
    setIsFullScreen((prev) => !prev);
  }, []);

  const handleDownload = useCallback(() => {
    if (srcDoc) downloadPreview(srcDoc, code);
  }, [srcDoc, code]);

  useEffect(() => {
    if (!isFullScreen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsFullScreen(false);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isFullScreen]);

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
          onClick={handleDownload}
          className="icon-btn"
          aria-label="Download as HTML"
          title="Download as HTML"
        >
          <DownloadIcon size={18} />
        </button>
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
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleDownload}
                className="flex items-center gap-2 px-4 py-2 rounded-lg transition-all"
                style={{
                  background: 'rgba(118, 185, 0, 0.1)',
                  border: '1px solid rgba(118, 185, 0, 0.2)',
                  color: '#76b900',
                }}
                onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(118, 185, 0, 0.18)'; }}
                onMouseOut={(e) => { e.currentTarget.style.background = 'rgba(118, 185, 0, 0.1)'; }}
                aria-label="Download"
              >
                <DownloadIcon size={18} />
                <span className="text-sm font-medium">Download</span>
              </button>
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
          </div>
          <div className="flex-1 min-h-0" style={{ background: '#ffffff' }}>
            <iframe
              ref={fullIframeRef}
              title="Preview – Full Screen"
              srcDoc={srcDoc}
              className="w-full h-full border-0"
              style={{ background: '#ffffff' }}
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
          ref={iframeRef}
          title="Preview"
          srcDoc={srcDoc}
          className="w-full border-0"
          style={{ minHeight: 260, height: '100%', background: '#ffffff' }}
        />
      </div>
    </div>
  );
}
