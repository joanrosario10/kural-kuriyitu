import { useState, useCallback, useEffect, useRef } from 'react';
import './App.css';
import { CodeEditor } from './components/CodeEditor';
import { Preview } from './components/Preview';
import { ModelSettings } from './components/ModelSettings';
import { VoicePanel } from './components/VoicePanel';
import { FileTabs } from './components/FileTabs';
import { ProactivePanel } from './components/ProactivePanel';
import { OutputPanel } from './components/OutputPanel';
import { ScreenRecorder } from './components/ScreenRecorder';
import { GeminiIcon } from './components/Icons';
import { processVoiceCommandStream, type ConversationEntry } from './lib/gemini';
import { speak, stopSpeaking, pauseSpeaking, resumeSpeaking } from './lib/speech';
import {
  queueRivaSpeak,
  stopRiva,
  checkRivaAvailable,
  type RivaVoice,
} from './lib/rivaTts';
import { DEFAULT_LANGUAGE, findLanguage, type LanguageConfig } from './lib/languages';
import { matchVoiceCommand, type AppActions } from './lib/voiceCommands';
import {
  parseNavCommand,
  findSymbolLine,
  deleteLinesFromCode,
  insertLineInCode,
} from './lib/codeNavigation';
import {
  type Project,
  createDefaultProject,
  detectLanguage,
  saveProject,
  listProjects,
  exportProjectAsJSON,
  importProjectFromJSON,
} from './lib/projectStore';
import {
  analyzeCode,
  applyFix,
  type ProactiveIssue,
} from './lib/proactiveAI';
import {
  GeminiLiveClient,
  DEFAULT_LIVE_MODEL,
  DEFAULT_VOICE,
  type LiveModel,
  type GeminiVoice,
  type LiveConnectionState,
} from './lib/liveApi';
import { DEFAULT_NVIDIA_MODEL, type NvidiaModelId } from './lib/nvidiaFallback';
import type { AIModelId } from './lib/gemini';
import { runJS, type ExecutionResult } from './lib/jsRunner';
import { runPython, looksLikePython } from './lib/pyRunner';

type StreamStatus = 'idle' | 'thinking' | 'coding' | 'explaining';

function App() {
  // --- Project state (Feature 5) ---
  const [project, setProject] = useState<Project>(createDefaultProject);
  const [savedProjects, setSavedProjects] = useState<Project[]>([]);

  const activeFile = project.files.find((f) => f.name === project.activeFile) ?? project.files[0];
  const code = activeFile?.content ?? '';

  const setCode = useCallback((newCode: string) => {
    setProject((prev) => ({
      ...prev,
      files: prev.files.map((f) =>
        f.name === prev.activeFile ? { ...f, content: newCode } : f
      ),
    }));
  }, []);

  // --- Core state ---
  const [loading, setLoading] = useState(false);
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
  const useMock = import.meta.env.VITE_USE_MOCK === 'true';
  const [voiceAccent, setVoiceAccent] = useState<'' | 'indian' | 'british' | 'us' | 'male'>('');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [language, setLanguageState] = useState<LanguageConfig>(DEFAULT_LANGUAGE);
  const [history, setHistory] = useState<ConversationEntry[]>([]);
  const [streamStatus, setStreamStatus] = useState<StreamStatus>('idle');
  const [highlightedLines, setHighlightedLines] = useState<number[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [speechRate, setSpeechRate] = useState(0.95);

  // --- Proactive AI state (Feature 6) ---
  const [issues, setIssues] = useState<ProactiveIssue[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const analyzeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- Live API state ---
  const [liveApiEnabled, setLiveApiEnabled] = useState(false);
  const [liveConnectionState, setLiveConnectionState] = useState<LiveConnectionState>('disconnected');
  const [liveModel, setLiveModel] = useState<LiveModel>(DEFAULT_LIVE_MODEL);
  const [geminiVoice, setGeminiVoice] = useState<GeminiVoice>(DEFAULT_VOICE);
  const liveClientRef = useRef<GeminiLiveClient | null>(null);

  // --- Riva TTS state (primary voice, Web Speech as fallback) ---
  const [rivaEnabled, setRivaEnabled] = useState(true);
  const [rivaVoice, setRivaVoice] = useState<RivaVoice>('Magpie-Multilingual.EN-US.Aria');
  const rivaCheckedRef = useRef(false);

  // --- Code gen model state ---
  const [codeModel, setCodeModel] = useState<AIModelId>('gemini-2.5-flash');
  const [nvidiaModel, setNvidiaModel] = useState<NvidiaModelId>(DEFAULT_NVIDIA_MODEL);

  // --- Code execution state ---
  const [executionResult, setExecutionResult] = useState<ExecutionResult | null>(null);
  const [isRunningCode, setIsRunningCode] = useState(false);
  const [executionLanguage, setExecutionLanguage] = useState<string>('javascript');

  // --- Refs ---
  const abortRef = useRef<AbortController | null>(null);
  const codeBeforeStreamRef = useRef<string>('');
  const isStreamingRef = useRef(false);
  const isSpeakingRef = useRef(false);

  // --- Lock dark mode ---
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
  }, []);

  // --- Live API lifecycle ---
  useEffect(() => {
    if (!liveApiEnabled || !apiKey) {
      liveClientRef.current?.disconnect();
      liveClientRef.current = null;
      setLiveConnectionState('disconnected');
      return;
    }

    const client = new GeminiLiveClient({
      apiKey,
      model: liveModel,
      voice: geminiVoice,
      systemPrompt: '',
      proxyUrl: import.meta.env.VITE_LIVE_API_PROXY_URL as string | undefined,
      onStateChange: setLiveConnectionState,
      onAudioOutput: () => {
        // Audio plays automatically via the client's internal AudioContext
        setIsSpeaking(true);
      },
      onTextResponse: (text) => {
        // Accumulate text for conversation history
        const assistantEntry: ConversationEntry = {
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          role: 'assistant',
          action: 'explain',
          explanation: text,
        };
        setHistory((prev) => [...prev, assistantEntry]);
      },
      onCodeRequest: (command) => {
        // Hand off to text streaming channel for reliable code generation
        handleVoiceCommand(command);
      },
      onTranscript: (text, isFinal) => {
        if (isFinal) {
          const userEntry: ConversationEntry = {
            id: crypto.randomUUID(),
            timestamp: Date.now(),
            role: 'user',
            command: text,
          };
          setHistory((prev) => [...prev, userEntry]);
        }
      },
      onError: (error) => {
        console.error('Live API error:', error);
        speakWithOptions(`Live API error: ${error.message}`, {
          onSpeakingStart: () => setIsSpeaking(true),
          onSpeakingEnd: () => setIsSpeaking(false),
        });
      },
      onInterrupted: () => {
        setIsSpeaking(false);
      },
    });

    liveClientRef.current = client;
    client.connect().then(() => {
      client.startAudioInput();
    });

    return () => {
      client.disconnect();
    };
  }, [liveApiEnabled, apiKey, liveModel, geminiVoice]);

  // --- Voice availability ---
  useEffect(() => {
    speechSynthesis.addEventListener('voiceschanged', () => {});
    return () => {};
  }, [language]);

  // --- Load saved projects on mount ---
  useEffect(() => {
    listProjects().then(setSavedProjects).catch(() => {});
  }, []);

  // --- Check Riva TTS availability on mount (primary voice) ---
  useEffect(() => {
    if (rivaCheckedRef.current) return;
    rivaCheckedRef.current = true;
    checkRivaAvailable().then((available) => {
      if (available) {
        console.log('[Riva TTS] NVIDIA voice active (primary)');
      } else {
        setRivaEnabled(false);
        console.log('[Riva TTS] Proxy unavailable — falling back to Web Speech');
      }
    });
  }, []);

  // --- Keep refs in sync with state (avoids stale closures in timers) ---
  useEffect(() => { isStreamingRef.current = isStreaming; }, [isStreaming]);
  useEffect(() => { isSpeakingRef.current = isSpeaking; }, [isSpeaking]);

  // --- Proactive AI: analyze code after changes (Feature 6) ---
  // Debounce at 15s to avoid 429 rate limits on free-tier Gemini
  const lastAnalyzeTimeRef = useRef<number>(0);
  useEffect(() => {
    if (analyzeTimerRef.current) clearTimeout(analyzeTimerRef.current);

    if (!apiKey || isStreaming || loading || !code.trim()) return;

    const minInterval = 15000; // 15s minimum between analyses
    const timeSinceLast = Date.now() - lastAnalyzeTimeRef.current;
    const delay = Math.max(minInterval, minInterval - timeSinceLast);

    analyzeTimerRef.current = setTimeout(async () => {
      // Re-check via refs (not stale closure values) right before speaking
      if (isStreamingRef.current || isSpeakingRef.current) return;

      lastAnalyzeTimeRef.current = Date.now();
      setIsAnalyzing(true);
      try {
        const results = await analyzeCode(code, apiKey, codeModel, language);
        setIssues(results);

        // Only speak issues if nothing else is speaking or streaming (ref-based check)
        if (results.length > 0 && !isSpeakingRef.current && !isStreamingRef.current) {
          const first = results[0];
          const msg = `Potential issue on line ${first.line}: ${first.message}. ${first.fix ? 'Say yes to fix it.' : ''}`;
          speakWithOptions(msg, {
            onSpeakingStart: () => setIsSpeaking(true),
            onSpeakingEnd: () => setIsSpeaking(false),
          });
        }
      } catch {
        // Silently handle 429 or network errors
      }
      setIsAnalyzing(false);
    }, delay);

    return () => {
      if (analyzeTimerRef.current) clearTimeout(analyzeTimerRef.current);
    };
  }, [code, apiKey]);

  const speakWithOptions = useCallback(
    (text: string, callbacks?: { onSpeakingStart?: () => void; onSpeakingEnd?: () => void }) => {
      // Tamil not supported by Riva — always use Web Speech for Tamil
      const tamilLang = language.code.startsWith('ta');
      if (rivaEnabled && !tamilLang) {
        // Kill Web Speech completely — only Riva speaks (queued, no overlap)
        stopSpeaking();
        queueRivaSpeak(text, {
          voice: rivaVoice,
          lang: language.ttsLang,
          onStart: callbacks?.onSpeakingStart,
          onEnd: callbacks?.onSpeakingEnd,
        });
      } else {
        // Kill Riva completely — only Web Speech speaks (also used for Tamil)
        stopRiva();
        speak(text, {
          rate: speechRate,
          voice: language.code.startsWith('en') ? voiceAccent || undefined : undefined,
          lang: language.ttsLang,
          onSpeakingStart: callbacks?.onSpeakingStart,
          onSpeakingEnd: callbacks?.onSpeakingEnd,
        });
      }
    },
    [speechRate, voiceAccent, language, rivaEnabled, rivaVoice],
  );

  // --- Code execution ---
  const handleRunCode = useCallback(async () => {
    if (isRunningCode) return;
    setIsRunningCode(true);
    setExecutionResult(null);

    const isPython = looksLikePython(code) || activeFile?.name.endsWith('.py');
    setExecutionLanguage(isPython ? 'python' : 'javascript');

    try {
      const result = isPython ? await runPython(code) : await runJS(code);
      setExecutionResult(result);

      if (!result.success && result.error) {
        speakWithOptions(`Error: ${result.error}`, {
          onSpeakingStart: () => setIsSpeaking(true),
          onSpeakingEnd: () => setIsSpeaking(false),
        });
      } else {
        speakWithOptions('Code executed successfully', {
          onSpeakingStart: () => setIsSpeaking(true),
          onSpeakingEnd: () => setIsSpeaking(false),
        });
      }
    } catch (err) {
      setExecutionResult({
        success: false,
        error: err instanceof Error ? err.message : String(err),
        logs: [],
        duration: 0,
      });
    } finally {
      setIsRunningCode(false);
    }
  }, [code, activeFile, isRunningCode, speakWithOptions]);

  // --- Fix all issues ---
  const handleFixAll = useCallback(() => {
    let updatedCode = code;
    const fixableIssues = issues.filter((i) => i.fix);
    const sorted = [...fixableIssues].sort((a, b) => b.line - a.line);
    for (const issue of sorted) {
      if (issue.fix) {
        updatedCode = applyFix(updatedCode, issue.line, issue.fix);
      }
    }
    setCode(updatedCode);
    setIssues((prev) => prev.filter((i) => !i.fix));
    speakWithOptions(`Fixed ${fixableIssues.length} issues`, {
      onSpeakingStart: () => setIsSpeaking(true),
      onSpeakingEnd: () => setIsSpeaking(false),
    });
  }, [code, issues, setCode, speakWithOptions]);

  // --- App actions ---
  const appActions: AppActions = {
    setSpeechRate,
    setLanguage: (langCode: string) => setLanguageState(findLanguage(langCode)),
    fixAll: handleFixAll,
    fixFirst: () => {
      if (issues.length > 0 && issues[0].fix) {
        const issue = issues[0];
        setCode(applyFix(code, issue.line, issue.fix!));
        setIssues((prev) => prev.filter((i) => i.id !== issue.id));
      }
    },
    skipFix: () => setIssues([]),
    explainIssue: () => {
      if (issues.length > 0) {
        speakWithOptions(`Line ${issues[0].line}: ${issues[0].message}`, {
          onSpeakingStart: () => setIsSpeaking(true),
          onSpeakingEnd: () => setIsSpeaking(false),
        });
      }
    },
    runCode: handleRunCode,
    closeOutput: () => setExecutionResult(null),
  };

  const parseLineRefs = useCallback((text: string): number[] => {
    const lines: number[] = [];
    const singleLine = /line\s+(\d+)/gi;
    const lineRange = /lines?\s+(\d+)\s*(?:-|to|through)\s*(\d+)/gi;
    let match;
    while ((match = lineRange.exec(text)) !== null) {
      const start = parseInt(match[1], 10);
      const end = parseInt(match[2], 10);
      for (let i = start; i <= end; i++) lines.push(i);
    }
    while ((match = singleLine.exec(text)) !== null) {
      lines.push(parseInt(match[1], 10));
    }
    return [...new Set(lines)];
  }, []);

  // --- Multi-file commands (Feature 5) ---
  const handleFileCommand = useCallback((transcript: string): boolean => {
    const t = transcript.toLowerCase().trim();

    // "new file auth.tsx"
    const newFileMatch = t.match(/new\s*file\s+(\S+)/i);
    if (newFileMatch) {
      const name = newFileMatch[1];
      const lang = detectLanguage(name);
      setProject((prev) => ({
        ...prev,
        files: [...prev.files, { name, content: `// ${name}\n`, language: lang }],
        activeFile: name,
      }));
      speakWithOptions(`Created ${name}`, {
        onSpeakingStart: () => setIsSpeaking(true),
        onSpeakingEnd: () => setIsSpeaking(false),
      });
      return true;
    }

    // "switch to dashboard" / "open auth"
    const switchMatch = t.match(/(?:switch\s*to|open)\s+(\S+)/i);
    if (switchMatch) {
      const target = switchMatch[1];
      const file = project.files.find((f) =>
        f.name.toLowerCase().includes(target.toLowerCase())
      );
      if (file) {
        setProject((prev) => ({ ...prev, activeFile: file.name }));
        speakWithOptions(`Switched to ${file.name}`, {
          onSpeakingStart: () => setIsSpeaking(true),
          onSpeakingEnd: () => setIsSpeaking(false),
        });
        return true;
      }
    }

    // "save project as todo-v2"
    const saveMatch = t.match(/save\s*project\s*(?:as\s+)?(\S+)?/i);
    if (saveMatch) {
      const name = saveMatch[1] ?? project.name;
      const updated = { ...project, name };
      setProject(updated);
      saveProject(updated).then(() => {
        listProjects().then(setSavedProjects).catch(() => {});
        speakWithOptions(`Project saved as ${name}`, {
          onSpeakingStart: () => setIsSpeaking(true),
          onSpeakingEnd: () => setIsSpeaking(false),
        });
      });
      return true;
    }

    // "export project"
    if (t.includes('export project') || t.includes('download project')) {
      const json = exportProjectAsJSON(project);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${project.name}.json`;
      a.click();
      URL.revokeObjectURL(url);
      speakWithOptions('Project exported', {
        onSpeakingStart: () => setIsSpeaking(true),
        onSpeakingEnd: () => setIsSpeaking(false),
      });
      return true;
    }

    return false;
  }, [project, speakWithOptions]);

  // --- Navigation commands (Feature 4) ---
  const handleNavCommand = useCallback((transcript: string): boolean => {
    const nav = parseNavCommand(transcript);
    if (!nav) return false;

    switch (nav.type) {
      case 'goto-line':
        setHighlightedLines([nav.line]);
        speakWithOptions(`Going to line ${nav.line}`, {
          onSpeakingStart: () => setIsSpeaking(true),
          onSpeakingEnd: () => {
            setIsSpeaking(false);
            setTimeout(() => setHighlightedLines([]), 2000);
          },
        });
        return true;

      case 'goto-function': {
        const line = findSymbolLine(code, nav.name);
        if (line) {
          setHighlightedLines([line]);
          speakWithOptions(`Found ${nav.name} at line ${line}`, {
            onSpeakingStart: () => setIsSpeaking(true),
            onSpeakingEnd: () => {
              setIsSpeaking(false);
              setTimeout(() => setHighlightedLines([]), 2000);
            },
          });
        } else {
          speakWithOptions(`Could not find ${nav.name}`, {
            onSpeakingStart: () => setIsSpeaking(true),
            onSpeakingEnd: () => setIsSpeaking(false),
          });
        }
        return true;
      }

      case 'select-lines': {
        const lines: number[] = [];
        for (let i = nav.start; i <= nav.end; i++) lines.push(i);
        setHighlightedLines(lines);
        speakWithOptions(`Selected lines ${nav.start} to ${nav.end}`, {
          onSpeakingStart: () => setIsSpeaking(true),
          onSpeakingEnd: () => setIsSpeaking(false),
        });
        return true;
      }

      case 'delete-lines': {
        const newCode = deleteLinesFromCode(code, nav.start, nav.end);
        setCode(newCode);
        speakWithOptions(
          nav.start === nav.end
            ? `Deleted line ${nav.start}`
            : `Deleted lines ${nav.start} to ${nav.end}`,
          {
            onSpeakingStart: () => setIsSpeaking(true),
            onSpeakingEnd: () => setIsSpeaking(false),
          },
        );
        return true;
      }

      case 'insert-at-line': {
        const newCode = insertLineInCode(code, nav.line, nav.text);
        setCode(newCode);
        speakWithOptions(`Inserted at line ${nav.line}`, {
          onSpeakingStart: () => setIsSpeaking(true),
          onSpeakingEnd: () => setIsSpeaking(false),
        });
        return true;
      }
      default:
        return false;
    }
  }, [code, setCode, speakWithOptions]);

  // --- Main voice command handler ---
  const handleVoiceCommand = useCallback(
    async (transcript: string) => {
      // 1. Local voice commands (settings)
      const localMatch = matchVoiceCommand(transcript);
      if (localMatch) {
        localMatch.action(appActions);
        speakWithOptions(localMatch.confirmation, {
          onSpeakingStart: () => setIsSpeaking(true),
          onSpeakingEnd: () => setIsSpeaking(false),
        });
        return;
      }

      // 2. Proactive AI "yes" to fix
      if (issues.length > 0 && /^(yes|yeah|yep|fix\s*it|haan|aam|ஆம்)$/i.test(transcript.trim())) {
        const issue = issues[0];
        if (issue.fix) {
          const newCode = applyFix(code, issue.line, issue.fix);
          setCode(newCode);
          setIssues((prev) => prev.filter((i) => i.id !== issue.id));
          speakWithOptions(`Fixed the issue on line ${issue.line}`, {
            onSpeakingStart: () => setIsSpeaking(true),
            onSpeakingEnd: () => setIsSpeaking(false),
          });
          return;
        }
      }

      // 3. Navigation commands (Feature 4)
      if (handleNavCommand(transcript)) return;

      // 4. File commands (Feature 5)
      if (handleFileCommand(transcript)) return;

      // 5. Gemini AI
      if (!useMock && !apiKey) {
        speakWithOptions('Please add your Gemini API key in the environment file.', {
          onSpeakingStart: () => setIsSpeaking(true),
          onSpeakingEnd: () => setIsSpeaking(false),
        });
        return;
      }

      if (abortRef.current) abortRef.current.abort();
      const abortController = new AbortController();
      abortRef.current = abortController;

      const userEntry: ConversationEntry = {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        role: 'user',
        command: transcript,
      };
      setHistory((prev) => [...prev, userEntry]);

      setLoading(true);
      setIsStreaming(true);
      setIsSpeaking(false);
      setIsPaused(false);
      setHighlightedLines([]);
      stopSpeaking(); stopRiva();
      setStreamStatus('thinking');
      codeBeforeStreamRef.current = code;

      try {
        let finalExplanation = '';

        await processVoiceCommandStream(
          transcript,
          code,
          apiKey ?? '',
          codeModel,
          language,
          history,
          {
            onAction: (action) => {
              setStreamStatus(action === 'explain' ? 'explaining' : 'coding');
            },
            onCodeChunk: (accumulatedCode) => {
              setCode(accumulatedCode);
            },
            onExplanationChunk: (sentence) => {
              setStreamStatus('explaining');
              finalExplanation += (finalExplanation ? ' ' : '') + sentence;
              const refs = parseLineRefs(sentence);
              if (refs.length > 0) setHighlightedLines(refs);
              speakWithOptions(sentence, {
                onSpeakingStart: () => setIsSpeaking(true),
                onSpeakingEnd: () => {
                  setIsSpeaking(false);
                  setHighlightedLines([]);
                },
              });
            },
            onComplete: (completedCode, fullExplanation) => {
              finalExplanation = fullExplanation;
              const assistantEntry: ConversationEntry = {
                id: crypto.randomUUID(),
                timestamp: Date.now(),
                role: 'assistant',
                action: 'generate',
                code: completedCode,
                explanation: fullExplanation,
              };
              setHistory((prev) => [...prev, assistantEntry]);
            },
            onError: (error) => {
              setCode(codeBeforeStreamRef.current);
              speakWithOptions(`Error: ${error.message || 'Something went wrong'}`, {
                onSpeakingStart: () => setIsSpeaking(true),
                onSpeakingEnd: () => setIsSpeaking(false),
              });
            },
          },
          abortController.signal,
          nvidiaModel,
        );
      } catch (err) {
        if (!abortController.signal.aborted) {
          setCode(codeBeforeStreamRef.current);
          speakWithOptions(`Error: ${err instanceof Error ? err.message : 'Something went wrong'}`, {
            onSpeakingStart: () => setIsSpeaking(true),
            onSpeakingEnd: () => setIsSpeaking(false),
          });
        }
      } finally {
        setLoading(false);
        setIsStreaming(false);
        setStreamStatus('idle');
        if (abortRef.current === abortController) abortRef.current = null;
      }
    },
    [code, apiKey, useMock, voiceAccent, language, history, speechRate, issues,
     speakWithOptions, parseLineRefs, appActions, handleNavCommand, handleFileCommand, setCode],
  );

  // --- File operations ---
  const handleFileSelect = useCallback((name: string) => {
    setProject((prev) => ({ ...prev, activeFile: name }));
  }, []);

  const handleFileClose = useCallback((name: string) => {
    setProject((prev) => {
      const files = prev.files.filter((f) => f.name !== name);
      if (files.length === 0) return prev;
      const newActive = prev.activeFile === name ? files[0].name : prev.activeFile;
      return { ...prev, files, activeFile: newActive };
    });
  }, []);

  const handleNewFile = useCallback(() => {
    const name = prompt('File name:', 'untitled.tsx');
    if (!name) return;
    const lang = detectLanguage(name);
    setProject((prev) => ({
      ...prev,
      files: [...prev.files, { name, content: `// ${name}\n`, language: lang }],
      activeFile: name,
    }));
  }, []);

  const handleImportProject = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const text = await file.text();
      const imported = importProjectFromJSON(text);
      setProject(imported);
    };
    input.click();
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
    setCode('');
    setIssues([]);
    setExecutionResult(null);
    setHighlightedLines([]);
    stopSpeaking(); stopRiva();
    setIsSpeaking(false);
  }, [setCode]);

  return (
    <div className="flex flex-col h-screen" style={{ background: 'var(--jarvis-bg)' }}>
      {/* Header */}
      <header className="app-header shrink-0">
        <div className="flex items-center gap-4">
          <div
            className="flex items-center justify-center w-9 h-9 rounded-lg shrink-0"
            style={{
              background: 'linear-gradient(135deg, rgba(0, 212, 255, 0.2) 0%, rgba(168, 85, 247, 0.15) 100%)',
              border: '1px solid rgba(0, 212, 255, 0.25)',
              boxShadow: '0 0 12px rgba(0, 212, 255, 0.15)',
            }}
          >
            <GeminiIcon
              size={22}
              variant="white"
              className={`text-[var(--jarvis-cyan)] ${streamStatus !== 'idle' ? 'animate-pulse-gemini' : ''}`}
            />
          </div>
          <h1 className="app-title">
            Kural Kuriyitu
          </h1>
          {useMock && (
            <span
              className="px-2.5 py-1 text-xs font-medium rounded-md"
              style={{
                background: 'rgba(0, 212, 255, 0.08)',
                color: 'var(--jarvis-cyan)',
                border: '1px solid rgba(0, 212, 255, 0.15)',
              }}
            >
              Mock
            </span>
          )}
          <span
            className="text-xs px-2 py-1 rounded"
            style={{ color: 'var(--jarvis-text-muted)' }}
          >
            {project.name}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <ScreenRecorder />
          <ModelSettings
            voiceAccent={voiceAccent}
            onVoiceAccentChange={setVoiceAccent}
            language={language}
            onLanguageChange={setLanguageState}
            speechRate={speechRate}
            onSpeechRateChange={setSpeechRate}
            liveModel={liveModel}
            onLiveModelChange={setLiveModel}
            geminiVoice={geminiVoice}
            onGeminiVoiceChange={setGeminiVoice}
            liveConnectionState={liveConnectionState}
            onToggleLiveApi={() => setLiveApiEnabled((prev) => !prev)}
            liveApiEnabled={liveApiEnabled}
            codeModel={codeModel}
            onCodeModelChange={setCodeModel}
            nvidiaModel={nvidiaModel}
            onNvidiaModelChange={setNvidiaModel}
            rivaEnabled={rivaEnabled}
            onRivaToggle={() => setRivaEnabled((prev) => !prev)}
            rivaVoice={rivaVoice}
            onRivaVoiceChange={setRivaVoice}
          />
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <VoicePanel
          onVoiceCommand={handleVoiceCommand}
          loading={loading}
          isSpeaking={isSpeaking}
          isPaused={isPaused}
          onPauseResume={() => {
            if (isPaused) { resumeSpeaking(); setIsPaused(false); }
            else { pauseSpeaking(); setIsPaused(true); }
          }}
          language={language}
          history={history}
          streamStatus={streamStatus}
          liveConnectionState={liveConnectionState}
          liveApiEnabled={liveApiEnabled}
        />

        <main
          className="flex flex-col gap-3 p-3 md:p-4 overflow-auto flex-1 min-w-0"
          style={{ minHeight: 0 }}
        >
          {/* Editor + Preview row */}
          <div className="flex gap-3 flex-1 min-h-0">
            {/* Editor */}
            <div className="editor-container flex flex-col min-w-0 min-h-0" style={{ minWidth: 280, flex: '1.2 1 0' }}>
              <FileTabs
                files={project.files}
                activeFile={project.activeFile}
                onSelect={handleFileSelect}
                onClose={handleFileClose}
                onNewFile={handleNewFile}
              />
              <div className="editor-toolbar">
                <div className="w-1 h-4 rounded-full shrink-0" style={{ background: 'var(--jarvis-cyan)' }} />
                <span className="text-sm font-medium" style={{ color: 'var(--jarvis-text)' }}>
                  {activeFile?.name ?? 'Code'}
                </span>
                <span className="text-xs" style={{ color: 'var(--jarvis-text-muted)' }}>
                  {code.split('\n').length} lines
                </span>
                {isStreaming && (
                  <span className="ml-auto flex items-center gap-2 text-xs" style={{ color: 'var(--jarvis-cyan)' }}>
                    <span className="streaming-dot" />
                    Streaming...
                  </span>
                )}
                <div className="ml-auto flex items-center gap-2">
                  {savedProjects.length > 0 && (
                    <select
                      className="text-xs px-2 py-1 rounded"
                      style={{
                        background: 'rgba(20, 20, 40, 0.6)',
                        color: 'var(--jarvis-text-dim)',
                        border: '1px solid var(--jarvis-border)',
                      }}
                      value=""
                      onChange={(e) => {
                        const p = savedProjects.find((sp) => sp.id === e.target.value);
                        if (p) setProject(p);
                      }}
                    >
                      <option value="" disabled>Load project...</option>
                      {savedProjects.map((sp) => (
                        <option key={sp.id} value={sp.id}>{sp.name}</option>
                      ))}
                    </select>
                  )}
                  <button
                    type="button"
                    onClick={handleRunCode}
                    disabled={isRunningCode}
                    className="text-xs px-2.5 py-1 rounded-md font-medium transition-all"
                    style={{
                      background: 'rgba(0, 212, 255, 0.1)',
                      color: 'var(--jarvis-cyan)',
                      border: '1px solid rgba(0, 212, 255, 0.2)',
                    }}
                    onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(0, 212, 255, 0.2)'; }}
                    onMouseOut={(e) => { e.currentTarget.style.background = 'rgba(0, 212, 255, 0.1)'; }}
                  >
                    {isRunningCode ? 'Running...' : 'Run'}
                  </button>
                  <button
                    type="button"
                    onClick={handleImportProject}
                    className="text-xs px-2 py-1 rounded transition-colors"
                    style={{ color: 'var(--jarvis-text-muted)' }}
                    onMouseOver={(e) => { e.currentTarget.style.color = 'var(--jarvis-cyan)'; }}
                    onMouseOut={(e) => { e.currentTarget.style.color = 'var(--jarvis-text-muted)'; }}
                  >
                    Import
                  </button>
                  {history.length > 0 && (
                    <button
                      type="button"
                      onClick={clearHistory}
                      className="text-xs px-2 py-1 rounded transition-colors"
                      style={{ color: 'var(--jarvis-text-muted)' }}
                      onMouseOver={(e) => { e.currentTarget.style.color = 'var(--jarvis-cyan)'; }}
                      onMouseOut={(e) => { e.currentTarget.style.color = 'var(--jarvis-text-muted)'; }}
                    >
                      Clear history
                    </button>
                  )}
                </div>
              </div>
              <div style={{ flex: '1 1 0', minHeight: 0, overflow: 'hidden' }}>
                <CodeEditor
                  value={code}
                  onChange={setCode}
                  language={activeFile?.language}
                  highlightedLines={highlightedLines}
                  isStreaming={isStreaming}
                />
              </div>
              <ProactivePanel
                issues={issues}
                isAnalyzing={isAnalyzing}
                onFixIssue={(issue) => {
                  if (issue.fix) {
                    setCode(applyFix(code, issue.line, issue.fix));
                    setIssues((prev) => prev.filter((i) => i.id !== issue.id));
                    speakWithOptions(`Fixed line ${issue.line}`, {
                      onSpeakingStart: () => setIsSpeaking(true),
                      onSpeakingEnd: () => setIsSpeaking(false),
                    });
                  }
                }}
                onFixAll={handleFixAll}
                onDismiss={(id) => setIssues((prev) => prev.filter((i) => i.id !== id))}
              />
              <OutputPanel
                result={executionResult}
                isRunning={isRunningCode}
                language={executionLanguage}
                onClose={() => setExecutionResult(null)}
              />
            </div>

            {/* Preview — only renders when code has renderable HTML */}
            <Preview code={code} className="h-full" style={{ minWidth: 280, minHeight: 320, flex: '0.8 1 0' }} />
          </div>
        </main>
      </div>

      {/* API key notice — floating glass */}
      {!useMock && !apiKey && (
        <div
          className="absolute bottom-6 left-1/2 -translate-x-1/2 px-5 py-3 text-sm rounded-xl flex items-center gap-2 glass-panel animate-fade-up"
          style={{
            background: 'rgba(0, 212, 255, 0.08)',
            color: 'var(--jarvis-cyan)',
            border: '1px solid rgba(0, 212, 255, 0.2)',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5), 0 0 8px rgba(0, 212, 255, 0.1)',
            backdropFilter: 'blur(16px)',
          }}
        >
          Add <code className="px-1.5 py-0.5 rounded font-mono text-xs" style={{ background: 'rgba(0, 212, 255, 0.1)' }}>VITE_GEMINI_API_KEY</code> to <code className="px-1.5 py-0.5 rounded font-mono text-xs" style={{ background: 'rgba(0, 212, 255, 0.1)' }}>.env</code> to enable AI
        </div>
      )}
    </div>
  );
}

export default App;
