/**
 * NVIDIA Riva TTS — high-quality text-to-speech via local proxy.
 * Falls back to Web Speech API if Riva proxy is unavailable.
 *
 * Requires: python scripts/riva-tts-proxy.py running on port 5174
 */

export type RivaVoice =
  | 'Magpie-Multilingual.EN-US.Aria'
  | 'Magpie-Multilingual.EN-US.Mia'
  | 'Magpie-Multilingual.EN-US.Jason'
  | 'Magpie-Multilingual.EN-US.Leo'
  | 'Magpie-Multilingual.EN-US.Sofia'
  | 'Magpie-Multilingual.EN-US.Ray'
  | 'Magpie-Multilingual.HI-IN.Aria'
  | 'Magpie-Multilingual.HI-IN.Mia'
  | 'Magpie-Multilingual.HI-IN.Jason'
  | 'Magpie-Multilingual.HI-IN.Leo';

export const RIVA_VOICES: { id: RivaVoice; label: string; lang: string }[] = [
  { id: 'Magpie-Multilingual.EN-US.Aria', label: 'Aria (Female, warm)', lang: 'en-US' },
  { id: 'Magpie-Multilingual.EN-US.Mia', label: 'Mia (Female, bright)', lang: 'en-US' },
  { id: 'Magpie-Multilingual.EN-US.Sofia', label: 'Sofia (Female, soft)', lang: 'en-US' },
  { id: 'Magpie-Multilingual.EN-US.Jason', label: 'Jason (Male, clear)', lang: 'en-US' },
  { id: 'Magpie-Multilingual.EN-US.Leo', label: 'Leo (Male, deep)', lang: 'en-US' },
  { id: 'Magpie-Multilingual.EN-US.Ray', label: 'Ray (Male, calm)', lang: 'en-US' },
  { id: 'Magpie-Multilingual.HI-IN.Aria', label: 'Aria (Hindi Female)', lang: 'hi-IN' },
  { id: 'Magpie-Multilingual.HI-IN.Mia', label: 'Mia (Hindi Female)', lang: 'hi-IN' },
  { id: 'Magpie-Multilingual.HI-IN.Jason', label: 'Jason (Hindi Male)', lang: 'hi-IN' },
  { id: 'Magpie-Multilingual.HI-IN.Leo', label: 'Leo (Hindi Male)', lang: 'hi-IN' },
];

const TTS_ENDPOINT = import.meta.env.DEV ? '/riva-tts/' : '/api/riva-tts/';

let audioContext: AudioContext | null = null;
let currentSource: AudioBufferSourceNode | null = null;
let rivaAvailable: boolean | null = null; // null = not checked yet
let speechQueue: Array<{ text: string; voice: RivaVoice; lang: string; onStart?: () => void; onEnd?: () => void; onFailed?: (text: string) => void }> = [];
let isPlaying = false;

/**
 * Check if the Riva TTS proxy is available (dev: local proxy, prod: /api/riva-tts).
 */
export async function checkRivaAvailable(): Promise<boolean> {
  if (rivaAvailable !== null) return rivaAvailable;
  try {
    const resp = await fetch(TTS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'test', voice: 'Magpie-Multilingual.EN-US.Aria', language_code: 'en-US' }),
      signal: AbortSignal.timeout(8000),
    });
    rivaAvailable = resp.ok;
  } catch {
    rivaAvailable = false;
  }
  return rivaAvailable;
}

/**
 * Reset availability check (e.g., after proxy restart).
 */
export function resetRivaCheck(): void {
  rivaAvailable = null;
}

/**
 * Speak text using NVIDIA Riva TTS.
 */
export async function speakWithRiva(
  text: string,
  options: {
    voice?: RivaVoice;
    lang?: string;
    onStart?: () => void;
    onEnd?: () => void;
  } = {},
): Promise<boolean> {
  const voice = options.voice ?? 'Magpie-Multilingual.EN-US.Aria';
  const lang = options.lang ?? 'en-US';

  // Map language to appropriate voice if not explicitly set
  const effectiveVoice = options.voice ?? pickVoiceForLang(voice, lang);

  try {
    const response = await fetch(TTS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        voice: effectiveVoice,
        language_code: lang,
        sample_rate: 24000,
      }),
    });

    if (!response.ok) {
      rivaAvailable = false;
      console.warn('[Riva TTS] Request failed:', response.status);
      return false;
    }

    const arrayBuffer = await response.arrayBuffer();

    if (!audioContext) {
      audioContext = new AudioContext({ sampleRate: 24000 });
    }

    // Resume if suspended (browser autoplay policy)
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }

    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    options.onStart?.();

    currentSource = audioContext.createBufferSource();
    currentSource.buffer = audioBuffer;
    currentSource.connect(audioContext.destination);
    currentSource.onended = () => {
      currentSource = null;
      options.onEnd?.();
      playNext();
    };
    currentSource.start();

    return true;
  } catch (err) {
    rivaAvailable = false;
    console.warn('[Riva TTS] Error:', err);
    return false;
  }
}

function pickVoiceForLang(defaultVoice: RivaVoice, lang: string): RivaVoice {
  // Tamil not supported by Riva — caller should fall back to Web Speech
  if (lang.startsWith('ta')) return defaultVoice;
  if (lang.startsWith('hi')) return 'Magpie-Multilingual.HI-IN.Aria';
  return defaultVoice;
}

/**
 * Queue text for Riva TTS playback.
 */
export function queueRivaSpeak(
  text: string,
  options: {
    voice?: RivaVoice;
    lang?: string;
    onStart?: () => void;
    onEnd?: () => void;
    onFailed?: (text: string) => void;
  } = {},
): void {
  speechQueue.push({
    text,
    voice: options.voice ?? 'Magpie-Multilingual.EN-US.Aria',
    lang: options.lang ?? 'en-US',
    onStart: options.onStart,
    onEnd: options.onEnd,
    onFailed: options.onFailed,
  });
  if (!isPlaying) {
    playNext();
  }
}

async function playNext(): Promise<void> {
  if (speechQueue.length === 0) {
    isPlaying = false;
    return;
  }
  isPlaying = true;
  const item = speechQueue.shift()!;
  const success = await speakWithRiva(item.text, {
    voice: item.voice,
    lang: item.lang,
    onStart: item.onStart,
    onEnd: item.onEnd,
  });
  if (!success) {
    // If Riva fails, notify caller so it can fall back to Web Speech
    item.onFailed?.(item.text);
    item.onEnd?.();
    void playNext();
  }
}

/**
 * Stop all Riva TTS playback and clear queue.
 */
export function stopRiva(): void {
  speechQueue = [];
  isPlaying = false;
  if (currentSource) {
    try {
      currentSource.stop();
    } catch {
      // Already stopped
    }
    currentSource = null;
  }
}

/**
 * Check if Riva is currently speaking.
 */
export function isRivaSpeaking(): boolean {
  return currentSource !== null || isPlaying;
}
