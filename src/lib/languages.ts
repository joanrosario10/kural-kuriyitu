export interface LanguageConfig {
  code: string;
  name: string;
  nativeName: string;
  speechLang: string;
  ttsLang: string;
}

export const LANGUAGES: LanguageConfig[] = [
  { code: 'en-US', name: 'English (US)', nativeName: 'English', speechLang: 'en-US', ttsLang: 'en-US' },
  { code: 'en-IN', name: 'English (India)', nativeName: 'English (India)', speechLang: 'en-IN', ttsLang: 'en-IN' },
  { code: 'ta-IN', name: 'Tamil', nativeName: 'தமிழ்', speechLang: 'ta-IN', ttsLang: 'ta-IN' },
  { code: 'hi-IN', name: 'Hindi', nativeName: 'हिन्दी', speechLang: 'hi-IN', ttsLang: 'hi-IN' },
];

export const DEFAULT_LANGUAGE = LANGUAGES[0];

export interface ChipCommand {
  label: string;
  command: string;
}

const CHIPS_MAP: Record<string, ChipCommand[]> = {
  'en-US': [
    { label: 'Login Form', command: 'Create a login form' },
    { label: 'Counter', command: 'Create a counter app' },
    { label: 'Explain', command: 'Explain this code' },
    { label: 'Fix Error', command: 'Fix any errors in this code' },
  ],
  'ta-IN': [
    { label: 'லாகின் படிவம்', command: 'லாகின் படிவம் உருவாக்கு' },
    { label: 'கவுண்டர்', command: 'கவுண்டர் ஆப் உருவாக்கு' },
    { label: 'விளக்கு', command: 'இந்த கோடை விளக்கு' },
    { label: 'பிழை சரி', command: 'இந்த கோடில் உள்ள பிழைகளை சரி செய்' },
  ],
  'hi-IN': [
    { label: 'लॉगिन फॉर्म', command: 'लॉगिन फॉर्म बनाओ' },
    { label: 'काउंटर', command: 'काउंटर ऐप बनाओ' },
    { label: 'समझाओ', command: 'इस कोड को समझाओ' },
    { label: 'बग ठीक करो', command: 'इस कोड में बग ठीक करो' },
  ],
};

export function getChipsForLanguage(langCode: string): ChipCommand[] {
  return CHIPS_MAP[langCode] ?? CHIPS_MAP['en-US'];
}

export function findLanguage(code: string): LanguageConfig {
  return LANGUAGES.find((l) => l.code === code) ?? DEFAULT_LANGUAGE;
}
