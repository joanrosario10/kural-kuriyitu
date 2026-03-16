import { useRef, useEffect } from 'react';
import { VoiceInput } from './VoiceInput';
import { PauseIcon, PlayIcon } from './Icons';
import type { ConversationEntry } from '../lib/gemini';
import { getChipsForLanguage, type LanguageConfig } from '../lib/languages';

interface VoicePanelProps {
  onVoiceCommand: (transcript: string) => void;
  loading: boolean;
  isSpeaking: boolean;
  isPaused: boolean;
  onPauseResume: () => void;
  language: LanguageConfig;
  history: ConversationEntry[];
  streamStatus: 'idle' | 'thinking' | 'coding' | 'explaining';
  liveConnectionState?: 'disconnected' | 'connecting' | 'connected' | 'reconnecting';
  liveApiEnabled?: boolean;
}

export function VoicePanel({
  onVoiceCommand,
  loading,
  isSpeaking,
  isPaused,
  onPauseResume,
  language,
  history,
  streamStatus,
  liveConnectionState = 'disconnected',
  liveApiEnabled = false,
}: VoicePanelProps) {
  const historyEndRef = useRef<HTMLDivElement>(null);
  const chips = getChipsForLanguage(language.code);

  useEffect(() => {
    historyEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history.length]);

  const statusText = streamStatus === 'thinking'
    ? 'Thinking...'
    : streamStatus === 'coding'
    ? 'Writing code...'
    : streamStatus === 'explaining'
    ? 'Explaining...'
    : loading
    ? 'Processing...'
    : 'Tap to speak';

  const isActive = streamStatus !== 'idle' || loading;

  return (
    <aside className="voice-panel">
      {/* Mic + Status */}
      <div className="flex flex-col items-center gap-4">
        <VoiceInput
          onTranscript={onVoiceCommand}
          disabled={loading}
          variant="fab"
          lang={language.speechLang}
        />
        <span
          className={`text-xs font-medium tracking-wide ${isActive ? 'text-glow-subtle' : ''}`}
          style={{ color: isActive ? 'var(--jarvis-cyan)' : 'var(--jarvis-text-muted)' }}
        >
          {statusText}
        </span>
        {liveApiEnabled && (
          <div className="flex items-center gap-1.5">
            <div
              className="w-1.5 h-1.5 rounded-full"
              style={{
                background: liveConnectionState === 'connected'
                  ? 'var(--jarvis-green)'
                  : liveConnectionState === 'connecting' || liveConnectionState === 'reconnecting'
                    ? 'var(--jarvis-amber)'
                    : 'var(--jarvis-text-muted)',
                boxShadow: liveConnectionState === 'connected'
                  ? '0 0 6px rgba(0, 230, 118, 0.5)'
                  : 'none',
              }}
            />
            <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--jarvis-text-muted)' }}>
              {liveConnectionState === 'connected' ? 'LIVE' : liveConnectionState}
            </span>
          </div>
        )}
      </div>

      {/* Quick Commands */}
      <div>
        <p className="section-label mb-3">Quick commands</p>
        <div className="flex flex-wrap gap-2">
          {chips.map((chip) => (
            <button
              key={chip.label}
              type="button"
              className="chip-command"
              onClick={() => onVoiceCommand(chip.command)}
              disabled={loading}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>

      {/* Conversation history */}
      <div className="flex-1 min-h-0 flex flex-col gap-1.5 overflow-hidden">
        <p className="section-label shrink-0">Conversation</p>
        <div className="flex-1 overflow-y-auto flex flex-col gap-2.5 pr-1 pt-1">
          {history.length === 0 && (
            <p className="text-xs italic px-1" style={{ color: 'var(--jarvis-text-muted)' }}>
              Start speaking to begin coding...
            </p>
          )}
          {history.map((entry) => (
            <div
              key={entry.id}
              className={`chat-bubble text-sm ${
                entry.role === 'user' ? 'chat-bubble-user' : 'chat-bubble-ai'
              }`}
            >
              {entry.role === 'user' ? (
                <span className="font-medium">&ldquo;{entry.command}&rdquo;</span>
              ) : (
                <div className="flex flex-col gap-1">
                  {entry.action && (
                    <span
                      className="text-[10px] font-semibold uppercase tracking-wider"
                      style={{ color: 'var(--jarvis-cyan)' }}
                    >
                      {entry.action}
                    </span>
                  )}
                  <span className="line-clamp-3 leading-relaxed">{entry.explanation}</span>
                </div>
              )}
            </div>
          ))}
          <div ref={historyEndRef} />
        </div>
      </div>

      {/* Speaking controls */}
      {isSpeaking && (
        <div
          className="flex items-center gap-3 shrink-0 pt-3"
          style={{ borderTop: '1px solid var(--jarvis-border-glow)' }}
        >
          <span className="speaking-bars">
            {!isPaused &&
              [0, 1, 2, 3, 4].map((i) => (
                <span
                  key={i}
                  className="speaking-bar"
                  style={{
                    height: 12,
                    animationDelay: `${i * 0.1}s`,
                  }}
                />
              ))}
          </span>
          <span className="text-xs font-medium" style={{ color: isPaused ? 'var(--jarvis-text-muted)' : 'var(--jarvis-cyan)' }}>
            {isPaused ? 'Paused' : 'Speaking...'}
          </span>
          <button
            type="button"
            onClick={onPauseResume}
            className="icon-btn ml-auto"
            aria-label={isPaused ? 'Resume' : 'Pause'}
          >
            {isPaused ? <PlayIcon size={18} /> : <PauseIcon size={18} />}
          </button>
        </div>
      )}
    </aside>
  );
}
