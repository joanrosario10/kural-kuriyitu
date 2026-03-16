export interface SpeechVoice {
  name: string;
  lang: string;
  localService: boolean;
}

export type VoiceAccent = '' | 'indian' | 'british' | 'us' | 'male';

export const VOICE_ACCENTS: { id: VoiceAccent; label: string }[] = [
  { id: '', label: 'Default (system)' },
  { id: 'indian', label: 'Indian accent' },
  { id: 'british', label: 'British accent' },
  { id: 'us', label: 'US accent' },
  { id: 'male', label: 'Male voice' },
];

function pickVoiceForAccent(voices: SpeechSynthesisVoice[], accent: VoiceAccent): string {
  if (!accent) return '';
  const enVoices = voices.filter((v) => v.lang.startsWith('en'));
  if (accent === 'indian') {
    const v = enVoices.find((x) => x.lang === 'en-IN') ?? enVoices.find((x) => x.lang.includes('IN'));
    return v?.name ?? '';
  }
  if (accent === 'british') {
    const v = enVoices.find((x) => x.lang === 'en-GB') ?? enVoices.find((x) => x.lang.includes('GB'));
    return v?.name ?? '';
  }
  if (accent === 'us') {
    const v = enVoices.find((x) => x.lang === 'en-US') ?? enVoices.find((x) => x.lang.includes('US'));
    return v?.name ?? '';
  }
  if (accent === 'male') {
    const maleNames = ['male', 'daniel', 'alex', 'fred', 'oliver'];
    const v = enVoices.find((x) =>
      maleNames.some((m) => x.name.toLowerCase().includes(m))
    );
    return v?.name ?? enVoices[0]?.name ?? '';
  }
  return '';
}

function pickVoiceForLang(voices: SpeechSynthesisVoice[], lang: string): SpeechSynthesisVoice | undefined {
  return voices.find((v) => v.lang.startsWith(lang)) ?? voices.find((v) => v.lang.includes(lang));
}

export function resolveVoiceName(voices: SpeechSynthesisVoice[], accent: VoiceAccent): string {
  return pickVoiceForAccent(voices, accent);
}

export function hasVoiceForLang(lang: string): boolean {
  const voices = speechSynthesis.getVoices();
  return voices.some((v) => v.lang.startsWith(lang));
}

export function getVoices(): Promise<SpeechVoice[]> {
  return new Promise((resolve) => {
    const voices = speechSynthesis.getVoices();
    if (voices.length > 0) {
      resolve(voices.map((v) => ({ name: v.name, lang: v.lang, localService: v.localService })));
      return;
    }
    speechSynthesis.onvoiceschanged = () => {
      resolve(speechSynthesis.getVoices().map((v) => ({ name: v.name, lang: v.lang, localService: v.localService })));
    };
  });
}

export interface SpeakOptions {
  rate?: number;
  voice?: string;
  lang?: string;
  onSpeakingStart?: () => void;
  onSpeakingEnd?: () => void;
}

export function speak(text: string, options: SpeakOptions = {}): void {
  if (!('speechSynthesis' in window)) return;
  const { rate = 0.95, voice: voiceName, lang = 'en-US', onSpeakingStart, onSpeakingEnd } = options;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = rate;
  utterance.lang = lang;

  const voices = speechSynthesis.getVoices();

  // Priority: 1) accent-based voice within language, 2) language-matched voice, 3) system default
  if (voiceName && voiceName in { indian: 1, british: 1, us: 1, male: 1 }) {
    const resolved = pickVoiceForAccent(voices, voiceName as VoiceAccent);
    const voice = voices.find((v) => v.name === resolved);
    if (voice) utterance.voice = voice;
  } else if (lang && lang !== 'en-US') {
    const voice = pickVoiceForLang(voices, lang);
    if (voice) utterance.voice = voice;
  } else if (voiceName) {
    const voice = voices.find((v) => v.name === voiceName);
    if (voice) utterance.voice = voice;
  }

  utterance.onstart = () => onSpeakingStart?.();
  utterance.onend = () => onSpeakingEnd?.();
  utterance.onerror = () => onSpeakingEnd?.();
  speechSynthesis.speak(utterance);
}

export function speakQueue(sentences: string[], options: SpeakOptions = {}): void {
  for (const sentence of sentences) {
    if (sentence.trim()) {
      speak(sentence, options);
    }
  }
}

export function getVoicesSync(): SpeechSynthesisVoice[] {
  return speechSynthesis.getVoices();
}

export function stopSpeaking(): void {
  speechSynthesis.cancel();
}

export function pauseSpeaking(): void {
  speechSynthesis.pause();
}

export function resumeSpeaking(): void {
  speechSynthesis.resume();
}

export function isSpeechPaused(): boolean {
  return speechSynthesis.speaking && speechSynthesis.paused;
}
