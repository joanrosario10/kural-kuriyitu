import type { ProjectFile } from '../lib/projectStore';

interface FileTabsProps {
  files: ProjectFile[];
  activeFile: string;
  onSelect: (name: string) => void;
  onClose: (name: string) => void;
  onNewFile: () => void;
}

export function FileTabs({ files, activeFile, onSelect, onClose, onNewFile }: FileTabsProps) {
  return (
    <div
      className="flex items-center gap-0.5 overflow-x-auto shrink-0"
      style={{
        background: 'var(--md-surface-container-high)',
        borderBottom: '1px solid var(--md-outline-variant)',
      }}
    >
      {files.map((file) => (
        <button
          key={file.name}
          type="button"
          onClick={() => onSelect(file.name)}
          className="group flex items-center gap-2 px-3 py-2 text-sm whitespace-nowrap transition-colors shrink-0"
          style={{
            background: file.name === activeFile ? 'var(--md-surface-container)' : 'transparent',
            color: file.name === activeFile ? 'var(--md-on-surface)' : 'var(--md-on-surface-variant)',
            borderBottom: file.name === activeFile ? '2px solid var(--md-primary)' : '2px solid transparent',
            fontWeight: file.name === activeFile ? 500 : 400,
          }}
        >
          <span className="text-xs opacity-50">{getFileIcon(file.name)}</span>
          <span>{file.name}</span>
          {files.length > 1 && (
            <span
              onClick={(e) => {
                e.stopPropagation();
                onClose(file.name);
              }}
              className="opacity-0 group-hover:opacity-60 hover:!opacity-100 text-xs cursor-pointer px-0.5 rounded"
              style={{ color: 'var(--md-on-surface-variant)' }}
            >
              x
            </span>
          )}
        </button>
      ))}
      <button
        type="button"
        onClick={onNewFile}
        className="px-3 py-2 text-sm transition-colors hover:bg-black/5"
        style={{ color: 'var(--md-on-surface-variant)' }}
        title="New file"
      >
        +
      </button>
    </div>
  );
}

function getFileIcon(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  const icons: Record<string, string> = {
    tsx: 'TS', ts: 'TS', jsx: 'JS', js: 'JS',
    html: '<>', css: '#', json: '{}', py: 'Py', md: 'Md',
  };
  return icons[ext] ?? '..';
}
