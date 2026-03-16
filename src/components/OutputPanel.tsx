import { useRef, useEffect } from 'react';
import type { ExecutionResult } from '../lib/jsRunner';

interface OutputPanelProps {
  result: ExecutionResult | null;
  isRunning: boolean;
  language: string; // 'javascript' | 'python'
  onClose: () => void;
  className?: string;
}

export function OutputPanel({ result, isRunning, language, onClose, className = '' }: OutputPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [result]);

  if (!result && !isRunning) return null;

  return (
    <div
      className={`flex flex-col overflow-hidden animate-fade-in ${className}`}
      style={{
        background: 'rgba(13, 13, 20, 0.9)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderTop: '1px solid var(--jarvis-border-glow)',
        maxHeight: 200,
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between gap-3 px-4 py-2 shrink-0"
        style={{
          background: 'rgba(10, 10, 20, 0.5)',
          borderBottom: '1px solid var(--jarvis-border)',
        }}
      >
        <div className="flex items-center gap-2">
          <div
            className="status-dot"
            style={{
              background: isRunning
                ? 'var(--jarvis-amber)'
                : result?.success
                  ? 'var(--jarvis-green)'
                  : 'var(--jarvis-red)',
              boxShadow: isRunning
                ? '0 0 6px rgba(255, 176, 32, 0.4)'
                : result?.success
                  ? '0 0 6px rgba(0, 230, 118, 0.4)'
                  : '0 0 6px rgba(255, 68, 102, 0.4)',
            }}
          />
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--jarvis-text-dim)' }}>
            Output
          </span>
          <span className="text-[10px]" style={{ color: 'var(--jarvis-text-muted)' }}>
            {language === 'python' ? 'Python (Pyodide)' : 'JavaScript (Worker)'}
          </span>
          {result?.duration !== undefined && (
            <span className="text-[10px]" style={{ color: 'var(--jarvis-text-muted)' }}>
              {result.duration}ms
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-xs px-2 py-0.5 rounded transition-colors"
          style={{ color: 'var(--jarvis-text-muted)' }}
          onMouseOver={(e) => { e.currentTarget.style.color = 'var(--jarvis-cyan)'; }}
          onMouseOut={(e) => { e.currentTarget.style.color = 'var(--jarvis-text-muted)'; }}
          aria-label="Close output"
        >
          ✕
        </button>
      </div>

      {/* Output content */}
      <div
        className="flex-1 overflow-auto p-3 font-mono text-xs leading-relaxed"
        style={{ color: '#d4d4d4' }}
      >
        {isRunning && (
          <div className="flex items-center gap-2" style={{ color: 'var(--jarvis-cyan)' }}>
            <span className="streaming-dot" style={{ width: 5, height: 5 }} />
            Running {language}...
          </div>
        )}

        {result && (
          <>
            {/* Logs */}
            {result.logs.map((log, i) => (
              <div
                key={i}
                className="whitespace-pre-wrap break-all py-0.5"
                style={{
                  color: log.type === 'error'
                    ? 'var(--jarvis-red)'
                    : log.type === 'warn'
                      ? 'var(--jarvis-amber)'
                      : '#d4d4d4',
                }}
              >
                {log.args.join(' ')}
              </div>
            ))}

            {/* Return value */}
            {result.result !== undefined && (
              <div className="py-0.5" style={{ color: 'var(--jarvis-green)' }}>
                → {result.result}
              </div>
            )}

            {/* Error */}
            {result.error && (
              <div className="py-0.5" style={{ color: 'var(--jarvis-red)' }}>
                Error: {result.error}
              </div>
            )}

            {/* Empty output */}
            {result.logs.length === 0 && !result.result && !result.error && (
              <div style={{ color: 'var(--jarvis-text-muted)' }}>
                (no output)
              </div>
            )}
          </>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
