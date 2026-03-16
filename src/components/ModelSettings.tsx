import { useState, useRef, useEffect } from 'react';
import { SettingsIcon, ExpandMoreIcon } from './Icons';
import { VOICE_ACCENTS, type VoiceAccent } from '../lib/speech';
import { LANGUAGES, type LanguageConfig } from '../lib/languages';
import type { LiveModel, GeminiVoice, LiveConnectionState } from '../lib/liveApi';
import { NVIDIA_MODELS, type NvidiaModelId } from '../lib/nvidiaFallback';
import { AI_MODELS, type AIModelId } from '../lib/gemini';
import { RIVA_VOICES, type RivaVoice } from '../lib/rivaTts';

interface ModelSettingsProps {
  voiceAccent: VoiceAccent;
  onVoiceAccentChange: (accent: VoiceAccent) => void;
  language: LanguageConfig;
  onLanguageChange: (lang: LanguageConfig) => void;
  speechRate: number;
  onSpeechRateChange: (rate: number) => void;
  // Live API settings
  liveModel: LiveModel;
  onLiveModelChange: (model: LiveModel) => void;
  geminiVoice: GeminiVoice;
  onGeminiVoiceChange: (voice: GeminiVoice) => void;
  liveConnectionState: LiveConnectionState;
  onToggleLiveApi: () => void;
  liveApiEnabled: boolean;
  // Code gen model settings
  codeModel: AIModelId;
  onCodeModelChange: (model: AIModelId) => void;
  nvidiaModel: NvidiaModelId;
  onNvidiaModelChange: (model: NvidiaModelId) => void;
  // Riva TTS settings
  rivaEnabled: boolean;
  onRivaToggle: () => void;
  rivaVoice: RivaVoice;
  onRivaVoiceChange: (voice: RivaVoice) => void;
}

const LIVE_MODELS: { id: LiveModel; label: string; description: string }[] = [
  { id: 'gemini-2.0-flash-live-001', label: 'Gemini 2.0 Flash Live', description: 'Stable' },
  { id: 'gemini-2.5-flash-preview-native-audio-dialog', label: 'Gemini 2.5 Native Audio', description: 'Expressive voice' },
];

const GEMINI_VOICES: { id: GeminiVoice; label: string }[] = [
  { id: 'Kore', label: 'Kore (Female, warm)' },
  { id: 'Aoede', label: 'Aoede (Female, bright)' },
  { id: 'Charon', label: 'Charon (Male, deep)' },
  { id: 'Fenrir', label: 'Fenrir (Male, bold)' },
  { id: 'Puck', label: 'Puck (Male, playful)' },
];

export function ModelSettings({
  voiceAccent,
  onVoiceAccentChange,
  language,
  onLanguageChange,
  speechRate,
  onSpeechRateChange,
  liveModel,
  onLiveModelChange,
  geminiVoice,
  onGeminiVoiceChange,
  liveConnectionState,
  onToggleLiveApi,
  liveApiEnabled,
  codeModel,
  onCodeModelChange,
  nvidiaModel,
  onNvidiaModelChange,
  rivaEnabled,
  onRivaToggle,
  rivaVoice,
  onRivaVoiceChange,
}: ModelSettingsProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const showAccentSelector = language.code.startsWith('en');

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  const connectionColor = liveConnectionState === 'connected'
    ? 'var(--jarvis-green)'
    : liveConnectionState === 'connecting' || liveConnectionState === 'reconnecting'
      ? 'var(--jarvis-amber)'
      : 'var(--jarvis-text-muted)';

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-2 rounded-full transition-colors"
        style={{ color: 'var(--jarvis-text-dim)' }}
        onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(0, 212, 255, 0.08)'; }}
        onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; }}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Voice settings"
      >
        <SettingsIcon size={20} />
        <span className="text-sm font-medium hidden sm:inline">Settings</span>
        <ExpandMoreIcon
          size={20}
          className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-2 py-2 min-w-[300px] z-50"
          style={{
            background: 'rgba(13, 13, 24, 0.95)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--elevation-float)',
            border: '1px solid var(--jarvis-border-glow)',
          }}
        >
          {/* Header */}
          <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--jarvis-border)' }}>
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--jarvis-text-muted)' }}>
              Voice & AI Settings
            </span>
          </div>

          {/* Language Selector */}
          <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--jarvis-border)' }}>
            <label className="block text-[10px] font-medium mb-1.5 uppercase tracking-wider" style={{ color: 'var(--jarvis-text-muted)' }}>
              Language / மொழி
            </label>
            <div className="flex flex-wrap gap-1.5">
              {LANGUAGES.map((lang) => (
                <button
                  key={lang.code}
                  type="button"
                  onClick={() => onLanguageChange(lang)}
                  className="px-2.5 py-1 rounded-full text-[10px] font-medium transition-all"
                  style={{
                    background: language.code === lang.code ? 'rgba(0, 212, 255, 0.15)' : 'rgba(20, 20, 40, 0.5)',
                    color: language.code === lang.code ? 'var(--jarvis-cyan)' : 'var(--jarvis-text-dim)',
                    border: `1px solid ${language.code === lang.code ? 'rgba(0, 212, 255, 0.3)' : 'var(--jarvis-border)'}`,
                  }}
                >
                  {lang.nativeName}
                </button>
              ))}
            </div>
          </div>

          {/* Live API Toggle */}
          <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--jarvis-border)' }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{
                    background: connectionColor,
                    boxShadow: `0 0 6px ${connectionColor}`,
                  }}
                />
                <label className="text-xs font-medium" style={{ color: 'var(--jarvis-text)' }}>
                  Gemini Live API
                </label>
              </div>
              <button
                type="button"
                onClick={onToggleLiveApi}
                className="px-3 py-1 rounded-full text-[10px] font-medium transition-all"
                style={{
                  background: liveApiEnabled ? 'rgba(0, 212, 255, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                  color: liveApiEnabled ? 'var(--jarvis-cyan)' : 'var(--jarvis-text-muted)',
                  border: `1px solid ${liveApiEnabled ? 'rgba(0, 212, 255, 0.3)' : 'var(--jarvis-border)'}`,
                }}
              >
                {liveApiEnabled ? 'ON' : 'OFF'}
              </button>
            </div>
            <span className="text-[10px] mt-1 block" style={{ color: 'var(--jarvis-text-muted)' }}>
              {liveConnectionState === 'connected' ? 'Connected — streaming audio' :
               liveConnectionState === 'connecting' ? 'Connecting...' :
               liveConnectionState === 'reconnecting' ? 'Reconnecting...' :
               'Disabled — using Web Speech API fallback'}
            </span>
          </div>

          {/* Live Model Selector */}
          {liveApiEnabled && (
            <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--jarvis-border)' }}>
              <label className="block text-[10px] font-medium mb-1.5 uppercase tracking-wider" style={{ color: 'var(--jarvis-text-muted)' }}>
                Live Model
              </label>
              <select
                value={liveModel}
                onChange={(e) => onLiveModelChange(e.target.value as LiveModel)}
                className="w-full px-3 py-2 rounded-lg text-xs border-0 focus:ring-2 focus:ring-[var(--jarvis-cyan)] focus:ring-inset"
                style={{
                  background: 'rgba(20, 20, 40, 0.6)',
                  color: 'var(--jarvis-text)',
                  border: '1px solid var(--jarvis-border)',
                }}
              >
                {LIVE_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label} — {m.description}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Gemini Voice Picker */}
          {liveApiEnabled && (
            <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--jarvis-border)' }}>
              <label className="block text-[10px] font-medium mb-1.5 uppercase tracking-wider" style={{ color: 'var(--jarvis-text-muted)' }}>
                Gemini Voice
              </label>
              <div className="flex flex-wrap gap-1.5">
                {GEMINI_VOICES.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => onGeminiVoiceChange(v.id)}
                    className="px-2.5 py-1 rounded-full text-[10px] font-medium transition-all"
                    style={{
                      background: geminiVoice === v.id ? 'rgba(0, 212, 255, 0.15)' : 'rgba(20, 20, 40, 0.5)',
                      color: geminiVoice === v.id ? 'var(--jarvis-cyan)' : 'var(--jarvis-text-dim)',
                      border: `1px solid ${geminiVoice === v.id ? 'rgba(0, 212, 255, 0.3)' : 'var(--jarvis-border)'}`,
                    }}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Code Generation Model (Gemini primary) */}
          <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--jarvis-border)' }}>
            <label className="block text-[10px] font-medium mb-1.5 uppercase tracking-wider" style={{ color: 'var(--jarvis-text-muted)' }}>
              Code Gen Model (Primary)
            </label>
            <select
              value={codeModel}
              onChange={(e) => onCodeModelChange(e.target.value as AIModelId)}
              className="w-full px-3 py-2 rounded-lg text-xs border-0 focus:ring-2 focus:ring-[var(--jarvis-cyan)] focus:ring-inset"
              style={{
                background: 'rgba(20, 20, 40, 0.6)',
                color: 'var(--jarvis-text)',
                border: '1px solid var(--jarvis-border)',
              }}
            >
              {AI_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} — {m.description}
                </option>
              ))}
            </select>
          </div>

          {/* NVIDIA Fallback Model */}
          <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--jarvis-border)' }}>
            <label className="block text-[10px] font-medium mb-1.5 uppercase tracking-wider" style={{ color: 'var(--jarvis-text-muted)' }}>
              Fallback Model (NVIDIA)
            </label>
            <select
              value={nvidiaModel}
              onChange={(e) => onNvidiaModelChange(e.target.value as NvidiaModelId)}
              className="w-full px-3 py-2 rounded-lg text-xs border-0 focus:ring-2 focus:ring-[var(--jarvis-cyan)] focus:ring-inset"
              style={{
                background: 'rgba(20, 20, 40, 0.6)',
                color: 'var(--jarvis-text)',
                border: '1px solid var(--jarvis-border)',
              }}
            >
              {NVIDIA_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} — {m.description}
                </option>
              ))}
            </select>
            <span className="text-[10px] mt-1 block" style={{ color: 'var(--jarvis-text-muted)' }}>
              Auto-activates when Gemini is down or rate-limited
            </span>
          </div>

          {/* Fallback Voice Accent (when Live API off or for non-English) */}
          {(!liveApiEnabled || !language.code.startsWith('en')) && showAccentSelector && (
            <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--jarvis-border)' }}>
              <label className="block text-[10px] font-medium mb-1.5 uppercase tracking-wider" style={{ color: 'var(--jarvis-text-muted)' }}>
                Fallback Voice (Web Speech)
              </label>
              <select
                value={voiceAccent}
                onChange={(e) => onVoiceAccentChange(e.target.value as VoiceAccent)}
                className="w-full px-3 py-2 rounded-lg text-xs border-0 focus:ring-2 focus:ring-[var(--jarvis-cyan)] focus:ring-inset"
                style={{
                  background: 'rgba(20, 20, 40, 0.6)',
                  color: 'var(--jarvis-text)',
                  border: '1px solid var(--jarvis-border)',
                }}
              >
                {VOICE_ACCENTS.map((a) => (
                  <option key={a.id || 'default'} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* NVIDIA Riva TTS */}
          <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--jarvis-border)' }}>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[10px] font-medium uppercase tracking-wider" style={{ color: 'var(--jarvis-text-muted)' }}>
                Voice (NVIDIA Riva — Primary)
              </label>
              <button
                type="button"
                onClick={onRivaToggle}
                className="px-3 py-1 rounded-full text-[10px] font-medium transition-all"
                style={{
                  background: rivaEnabled ? 'rgba(118, 185, 0, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                  color: rivaEnabled ? '#76b900' : 'var(--jarvis-text-muted)',
                  border: `1px solid ${rivaEnabled ? 'rgba(118, 185, 0, 0.3)' : 'var(--jarvis-border)'}`,
                }}
              >
                {rivaEnabled ? 'ON' : 'OFF'}
              </button>
            </div>
            {rivaEnabled && (
              <select
                value={rivaVoice}
                onChange={(e) => onRivaVoiceChange(e.target.value as RivaVoice)}
                className="w-full px-3 py-2 rounded-lg text-xs border-0 focus:ring-2 focus:ring-[#76b900] focus:ring-inset"
                style={{
                  background: 'rgba(20, 20, 40, 0.6)',
                  color: 'var(--jarvis-text)',
                  border: '1px solid var(--jarvis-border)',
                }}
              >
                {RIVA_VOICES.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </select>
            )}
            <span className="text-[10px] mt-1 block" style={{ color: 'var(--jarvis-text-muted)' }}>
              {rivaEnabled ? 'Primary voice — Gemini/Web Speech as fallback' : 'Off — using Gemini/Web Speech fallback'}
            </span>
          </div>

          {/* Speech Speed */}
          <div className="px-4 py-3">
            <label className="block text-[10px] font-medium mb-1.5 uppercase tracking-wider" style={{ color: 'var(--jarvis-text-muted)' }}>
              Speech Speed: {speechRate.toFixed(2)}x
            </label>
            <input
              type="range"
              min="0.5"
              max="1.5"
              step="0.05"
              value={speechRate}
              onChange={(e) => onSpeechRateChange(parseFloat(e.target.value))}
              className="w-full"
              style={{ accentColor: 'var(--jarvis-cyan)' }}
            />
            <div className="flex justify-between text-[10px] mt-1" style={{ color: 'var(--jarvis-text-muted)' }}>
              <span>Slow</span>
              <span>Fast</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
