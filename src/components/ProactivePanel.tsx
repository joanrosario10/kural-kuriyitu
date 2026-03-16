import type { ProactiveIssue } from '../lib/proactiveAI';

interface ProactivePanelProps {
  issues: ProactiveIssue[];
  onFixIssue: (issue: ProactiveIssue) => void;
  onFixAll: () => void;
  onDismiss: (id: string) => void;
  isAnalyzing: boolean;
}

export function ProactivePanel({ issues, onFixIssue, onFixAll, onDismiss, isAnalyzing }: ProactivePanelProps) {
  if (issues.length === 0 && !isAnalyzing) return null;

  const fixableCount = issues.filter((i) => i.fix).length;

  return (
    <div
      className="flex flex-col gap-1 px-3 py-2 animate-fade-in"
      style={{
        background: 'rgba(13, 13, 24, 0.8)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        borderTop: '1px solid var(--jarvis-border-glow)',
        maxHeight: 140,
        overflowY: 'auto',
      }}
    >
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--jarvis-text-muted)' }}>
          AI Review
        </span>
        {isAnalyzing && (
          <span className="streaming-dot" style={{ width: 4, height: 4 }} />
        )}
        {fixableCount > 1 && (
          <button
            type="button"
            onClick={onFixAll}
            className="ml-auto px-2 py-0.5 rounded text-[10px] font-medium transition-all"
            style={{
              background: 'rgba(0, 212, 255, 0.1)',
              color: 'var(--jarvis-cyan)',
              border: '1px solid rgba(0, 212, 255, 0.2)',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = 'rgba(0, 212, 255, 0.2)';
              e.currentTarget.style.boxShadow = '0 0 8px rgba(0, 212, 255, 0.2)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = 'rgba(0, 212, 255, 0.1)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            Fix All ({fixableCount})
          </button>
        )}
      </div>
      {issues.map((issue) => (
        <div
          key={issue.id}
          className="flex items-start gap-2 text-xs py-1"
        >
          <span
            className="shrink-0 mt-0.5 font-bold"
            style={{
              color: issue.severity === 'error' ? 'var(--jarvis-red)' :
                     issue.severity === 'warning' ? 'var(--jarvis-amber)' : 'var(--jarvis-cyan)',
            }}
          >
            {issue.severity === 'error' ? '!!' : issue.severity === 'warning' ? '!' : 'i'}
          </span>
          <span className="flex-1" style={{ color: 'var(--jarvis-text)' }}>
            Ln {issue.line}: {issue.message}
          </span>
          <div className="flex gap-1 shrink-0">
            {issue.fix && (
              <button
                type="button"
                onClick={() => onFixIssue(issue)}
                className="px-2 py-0.5 rounded text-[10px] font-medium transition-colors"
                style={{ background: 'rgba(0, 212, 255, 0.08)', color: 'var(--jarvis-cyan)' }}
                onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(0, 212, 255, 0.18)'; }}
                onMouseOut={(e) => { e.currentTarget.style.background = 'rgba(0, 212, 255, 0.08)'; }}
              >
                Fix
              </button>
            )}
            <button
              type="button"
              onClick={() => onDismiss(issue.id)}
              className="px-1.5 py-0.5 rounded text-[10px] transition-colors"
              style={{ color: 'var(--jarvis-text-muted)' }}
              onMouseOver={(e) => { e.currentTarget.style.color = 'var(--jarvis-text-dim)'; }}
              onMouseOut={(e) => { e.currentTarget.style.color = 'var(--jarvis-text-muted)'; }}
            >
              ✕
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
