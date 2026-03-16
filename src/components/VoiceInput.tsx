import { useState, useRef, useCallback, useEffect } from 'react';
import { MicIcon, StopIcon } from './Icons';
import { WaveformVisualizer } from './WaveformVisualizer';

interface VoiceInputProps {
  onTranscript: (text: string) => void;
  disabled?: boolean;
  className?: string;
  variant?: 'default' | 'fab';
  lang?: string;
}

export function VoiceInput({ onTranscript, disabled, className = '', variant = 'default', lang = 'en-US' }: VoiceInputProps) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const startListening = useCallback(() => {
    setError(null);
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError('Speech recognition not supported in this browser');
      return;
    }

    navigator.mediaDevices.getUserMedia({ audio: true }).then((mediaStream) => {
      setStream(mediaStream);
    }).catch(() => {
      // Waveform won't work but recognition still can
    });

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = lang;

    recognition.onstart = () => setListening(true);
    recognition.onend = () => {
      setListening(false);
      setStream((prev) => {
        if (prev) prev.getTracks().forEach((t) => t.stop());
        return null;
      });
    };
    recognition.onerror = (e: SpeechRecognitionErrorEvent) => {
      setListening(false);
      setStream((prev) => {
        if (prev) prev.getTracks().forEach((t) => t.stop());
        return null;
      });
      if (e.error !== 'aborted') {
        setError(e.error === 'not-allowed' ? 'Microphone access denied' : `Error: ${e.error}`);
      }
    };
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[0][0].transcript;
      if (transcript.trim()) {
        onTranscript(transcript.trim());
      }
    };

    recognition.start();
    recognitionRef.current = recognition;
  }, [onTranscript, lang]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setListening(false);
    setStream((prev) => {
      if (prev) prev.getTracks().forEach((t) => t.stop());
      return null;
    });
  }, []);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  const isFab = variant === 'fab';
  const iconSize = isFab ? 32 : 26;

  return (
    <div className={`flex flex-col items-center gap-2 ${className}`}>
      <div className="relative flex items-center justify-center">
        {isFab && <WaveformVisualizer stream={stream} isListening={listening} size={150} />}
        {listening && !isFab && (
          <span
            className="absolute rounded-full animate-[mic-ripple_1.2s_ease-out_infinite]"
            style={{ width: 48, height: 48, background: 'rgba(0, 212, 255, 0.3)' }}
          />
        )}
        <button
          type="button"
          onClick={listening ? stopListening : startListening}
          disabled={disabled}
          className={`relative rounded-full flex items-center justify-center transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--jarvis-cyan)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--jarvis-bg)] disabled:opacity-40 disabled:cursor-not-allowed ${isFab ? 'fab-voice' : ''} ${listening ? 'listening' : ''} ${disabled && !listening ? 'processing' : ''}`}
          style={isFab ? {} : {
            width: 48,
            height: 48,
            background: listening
              ? 'rgba(0, 212, 255, 0.15)'
              : 'rgba(0, 212, 255, 0.1)',
            color: 'var(--jarvis-cyan)',
            border: `1.5px solid ${listening ? 'var(--jarvis-cyan)' : 'var(--jarvis-cyan-border)'}`,
            boxShadow: listening
              ? '0 0 20px rgba(0, 212, 255, 0.3), inset 0 0 15px rgba(0, 212, 255, 0.1)'
              : 'var(--elevation-1)',
            ...(listening && { animation: 'glow-pulse 1.5s ease-in-out infinite' }),
          }}
          title={listening ? 'Stop listening' : 'Start voice command'}
          aria-label={listening ? 'Stop listening' : 'Start voice command'}
        >
          {listening ? (
            <StopIcon size={iconSize} className="text-[var(--jarvis-cyan)]" />
          ) : (
            <MicIcon size={iconSize} className={isFab ? 'text-[var(--jarvis-cyan)]' : 'text-[var(--jarvis-cyan)]'} />
          )}
        </button>
      </div>
      {!isFab && (
        <span className="text-xs" style={{ color: 'var(--jarvis-text-dim)' }}>
          {listening ? 'Listening...' : 'Click to speak'}
        </span>
      )}
      {error && (
        <p className="text-xs mt-1" style={{ color: 'var(--jarvis-red)' }}>
          {error}
        </p>
      )}
    </div>
  );
}

declare global {
  interface Window {
    SpeechRecognition?: typeof SpeechRecognition;
    webkitSpeechRecognition?: typeof SpeechRecognition;
  }
}
