import { useState, useRef, useEffect } from 'react';
import { LANGUAGES, type LanguageConfig } from '../lib/languages';
import { ExpandMoreIcon } from './Icons';

interface LanguageSelectorProps {
  language: LanguageConfig;
  onChange: (lang: LanguageConfig) => void;
  hasVoice: boolean;
}

export function LanguageSelector({ language, onChange, hasVoice }: LanguageSelectorProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-3 py-2 rounded-full transition-colors hover:bg-black/5 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[var(--md-primary)]"
        style={{ color: 'var(--md-on-surface-variant)' }}
        aria-expanded={open}
        aria-label="Select language"
      >
        <span className="text-sm font-medium">{language.nativeName}</span>
        {!hasVoice && (
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ background: 'var(--md-error)' }}
            title={`No ${language.name} TTS voice available`}
          />
        )}
        <ExpandMoreIcon
          size={18}
          className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-2 py-1 min-w-[200px] z-50"
          style={{
            background: 'var(--md-surface-container)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--elevation-3)',
            border: '1px solid var(--md-outline-variant)',
          }}
        >
          {LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              type="button"
              onClick={() => {
                onChange(lang);
                setOpen(false);
              }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-black/5"
              style={{
                color: lang.code === language.code ? 'var(--md-primary)' : 'var(--md-on-surface)',
                fontWeight: lang.code === language.code ? 600 : 400,
              }}
            >
              <span className="text-sm">{lang.nativeName}</span>
              <span className="text-xs ml-auto" style={{ color: 'var(--md-on-surface-variant)' }}>
                {lang.name}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
