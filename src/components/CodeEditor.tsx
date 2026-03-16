import { useRef, useEffect, useCallback } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import type * as Monaco from 'monaco-editor';

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  language?: string;
  highlightedLines?: number[];
  isStreaming?: boolean;
}

export function CodeEditor({
  value,
  onChange,
  language = 'typescript',
  highlightedLines = [],
  isStreaming = false,
}: CodeEditorProps) {
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof Monaco | null>(null);
  const decorationsRef = useRef<Monaco.editor.IEditorDecorationsCollection | null>(null);

  const onEditorMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Configure TypeScript compiler to understand JSX — this is a voice-AI code
    // generator so we need JSX support and zero diagnostic noise
    const compilerOptions = {
      target: monaco.languages.typescript.ScriptTarget.Latest,
      module: monaco.languages.typescript.ModuleKind.ESNext,
      jsx: monaco.languages.typescript.JsxEmit.ReactJSX,
      allowJs: true,
      allowNonTsExtensions: true,
      esModuleInterop: true,
      strict: false,
      noEmit: true,
      skipLibCheck: true,
    };
    monaco.languages.typescript.typescriptDefaults.setCompilerOptions(compilerOptions);
    monaco.languages.typescript.javascriptDefaults.setCompilerOptions(compilerOptions);

    // Suppress common diagnostic codes that appear with AI-generated code
    // (missing modules, missing names, namespace issues, esModuleInterop, unreachable code)
    monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: false,
      noSyntaxValidation: false,
      diagnosticCodesToIgnore: [7027, 7028, 2307, 2304, 2503, 1259, 1192],
    });
    monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: false,
      noSyntaxValidation: false,
      diagnosticCodesToIgnore: [7027, 7028, 2307, 2304, 2503, 1259, 1192],
    });

    // JARVIS holographic cyan theme
    monaco.editor.defineTheme('jarvis', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '4a5568', fontStyle: 'italic' },
        { token: 'keyword', foreground: '00d4ff', fontStyle: 'bold' },
        { token: 'keyword.control', foreground: '00d4ff', fontStyle: 'bold' },
        { token: 'string', foreground: '00e676' },
        { token: 'string.escape', foreground: '00bfa5' },
        { token: 'number', foreground: 'ffb020' },
        { token: 'number.float', foreground: 'ffb020' },
        { token: 'type', foreground: 'a855f7' },
        { token: 'type.identifier', foreground: 'a855f7' },
        { token: 'identifier', foreground: 'e0e6ed' },
        { token: 'delimiter', foreground: '5a6a7a' },
        { token: 'delimiter.bracket', foreground: '6a7a8a' },
        { token: 'operator', foreground: '00d4ff' },
        { token: 'variable', foreground: 'e0e6ed' },
        { token: 'variable.predefined', foreground: '33ddff' },
        { token: 'function', foreground: '33ddff' },
        { token: 'tag', foreground: '00d4ff' },
        { token: 'attribute.name', foreground: 'a855f7' },
        { token: 'attribute.value', foreground: '00e676' },
        { token: 'regexp', foreground: 'ff6b6b' },
        { token: 'annotation', foreground: 'ffb020' },
        { token: 'constant', foreground: 'ffb020' },
      ],
      colors: {
        'editor.background': '#0a0a12',
        'editor.foreground': '#e0e6ed',
        'editor.lineHighlightBackground': '#00d4ff06',
        'editor.lineHighlightBorder': '#00d4ff08',
        'editor.selectionBackground': '#00d4ff20',
        'editor.inactiveSelectionBackground': '#00d4ff10',
        'editorCursor.foreground': '#00d4ff',
        'editorCursor.background': '#0a0a12',
        'editorLineNumber.foreground': '#252540',
        'editorLineNumber.activeForeground': '#00d4ff80',
        'editorIndentGuide.background': '#ffffff06',
        'editorIndentGuide.activeBackground': '#00d4ff18',
        'editorBracketMatch.background': '#00d4ff12',
        'editorBracketMatch.border': '#00d4ff35',
        'editorGutter.background': '#0a0a12',
        'editor.findMatchBackground': '#00d4ff30',
        'editor.findMatchHighlightBackground': '#00d4ff12',
        'editorWidget.background': '#0d0d18',
        'editorWidget.border': '#00d4ff20',
        'editorSuggestWidget.background': '#0d0d18',
        'editorSuggestWidget.border': '#00d4ff20',
        'editorSuggestWidget.selectedBackground': '#00d4ff12',
        'editorSuggestWidget.highlightForeground': '#00d4ff',
        'scrollbar.shadow': '#00000050',
        'scrollbarSlider.background': '#00d4ff12',
        'scrollbarSlider.hoverBackground': '#00d4ff25',
        'scrollbarSlider.activeBackground': '#00d4ff35',
        'editorOverviewRuler.border': '#00d4ff10',
      },
    });

    monaco.editor.setTheme('jarvis');

    monaco.editor.setTheme('jarvis');
  }, []);

  // Line highlighting decorations
  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;

    const newDecorations: Monaco.editor.IModelDeltaDecoration[] = highlightedLines.map((line) => ({
      range: new monaco.Range(line, 1, line, 1),
      options: {
        isWholeLine: true,
        className: 'highlighted-line',
        glyphMarginClassName: 'highlighted-line-glyph',
      },
    }));

    if (!decorationsRef.current && editor.createDecorationsCollection) {
      decorationsRef.current = editor.createDecorationsCollection(newDecorations);
    } else if (decorationsRef.current?.set) {
      decorationsRef.current.set(newDecorations);
    }
  }, [highlightedLines]);

  // Streaming cursor — scroll to bottom during streaming
  useEffect(() => {
    if (isStreaming && editorRef.current) {
      const model = editorRef.current.getModel();
      if (model) {
        const lastLine = model.getLineCount();
        editorRef.current.revealLine(lastLine);
      }
    }
  }, [isStreaming, value]);

  return (
    <div
      className="overflow-hidden"
      style={{
        height: '100%',
        minHeight: 200,
        borderTop: '1px solid rgba(0, 212, 255, 0.08)',
      }}
    >
      <Editor
        height="100%"
        language={language}
        value={value}
        onChange={(v) => onChange(v ?? '')}
        theme="jarvis"
        onMount={onEditorMount}
        loading={
          <div
            className="p-4 font-mono text-sm overflow-auto"
            style={{
              height: '100%',
              minHeight: 200,
              background: '#0a0a12',
              color: '#e0e6ed',
              fontFamily: "'Roboto Mono', Consolas, monospace",
              lineHeight: 1.6,
            }}
          >
            <pre className="m-0 whitespace-pre-wrap">{value}</pre>
          </div>
        }
        options={{
          fontSize: 14,
          fontFamily: "'Roboto Mono', 'Google Sans Mono', 'Consolas', monospace",
          minimap: { enabled: false },
          wordWrap: 'on',
          padding: { top: 16, bottom: 16 },
          scrollBeyondLastLine: false,
          lineNumbers: 'on',
          renderLineHighlight: 'line',
          occurrencesHighlight: 'singleFile',
          selectionHighlight: true,
          bracketPairColorization: { enabled: true },
          guides: {
            bracketPairs: true,
            indentation: true,
          },
          readOnly: isStreaming,
        }}
      />
    </div>
  );
}
