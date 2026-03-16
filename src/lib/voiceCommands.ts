export interface AppActions {
  setSpeechRate: (rate: number) => void;
  setLanguage: (code: string) => void;
  fixAll?: () => void;
  fixFirst?: () => void;
  skipFix?: () => void;
  explainIssue?: () => void;
  runCode?: () => void;
  closeOutput?: () => void;
}

interface VoiceCommand {
  patterns: RegExp[];
  action: (app: AppActions) => void;
  confirmation: string;
}

const VOICE_COMMANDS: VoiceCommand[] = [
  {
    patterns: [/speak\s*slower/i, /धीरे बोलो/i, /மெதுவாக பேசு/i],
    action: (app) => app.setSpeechRate(0.7),
    confirmation: 'Speaking slower now',
  },
  {
    patterns: [/speak\s*faster/i, /तेज़\s*बोलो/i, /வேகமாக பேசு/i],
    action: (app) => app.setSpeechRate(1.2),
    confirmation: 'Speaking faster now',
  },
  {
    patterns: [/normal\s*speed/i, /सामान्य गति/i, /சாதாரண வேகம்/i],
    action: (app) => app.setSpeechRate(0.95),
    confirmation: 'Normal speed',
  },
  {
    patterns: [/use\s*tamil/i, /switch\s*(to\s*)?tamil/i, /தமிழ்\s*பயன்படுத்து/i],
    action: (app) => app.setLanguage('ta-IN'),
    confirmation: 'தமிழுக்கு மாறியது',
  },
  {
    patterns: [/use\s*hindi/i, /switch\s*(to\s*)?hindi/i, /हिंदी\s*(में\s*)?बोलो/i],
    action: (app) => app.setLanguage('hi-IN'),
    confirmation: 'हिंदी में बदल गया',
  },
  {
    patterns: [/use\s*english/i, /switch\s*(to\s*)?english/i],
    action: (app) => app.setLanguage('en-US'),
    confirmation: 'Switched to English',
  },
  // Fix commands — English
  {
    patterns: [/fix\s*all/i, /fix\s*everything/i],
    action: (app) => app.fixAll?.(),
    confirmation: 'Fixing all issues',
  },
  {
    patterns: [/only\s*(the\s*)?first/i],
    action: (app) => app.fixFirst?.(),
    confirmation: 'Fixing first issue only',
  },
  {
    patterns: [/^skip$/i],
    action: (app) => app.skipFix?.(),
    confirmation: 'Skipping this issue',
  },
  {
    patterns: [/^explain$/i],
    action: (app) => app.explainIssue?.(),
    confirmation: 'Explaining the issue',
  },
  // Fix commands — Tamil
  {
    patterns: [/எல்லாம்\s*சரி\s*செய்/],
    action: (app) => app.fixAll?.(),
    confirmation: 'எல்லா பிழைகளையும் சரி செய்கிறது',
  },
  {
    patterns: [/முதல்\s*பிழை\s*மட்டும்/],
    action: (app) => app.fixFirst?.(),
    confirmation: 'முதல் பிழையை மட்டும் சரி செய்கிறது',
  },
  {
    patterns: [/^தவிர்$/],
    action: (app) => app.skipFix?.(),
    confirmation: 'இந்தப் பிழையைத் தவிர்க்கிறது',
  },
  {
    patterns: [/^விளக்கு$/],
    action: (app) => app.explainIssue?.(),
    confirmation: 'பிழையை விளக்குகிறது',
  },
  // Fix commands — Hindi
  {
    patterns: [/सब\s*ठीक\s*करो/],
    action: (app) => app.fixAll?.(),
    confirmation: 'सभी समस्याएँ ठीक कर रहा हूँ',
  },
  {
    patterns: [/पहला\s*ठीक\s*करो/],
    action: (app) => app.fixFirst?.(),
    confirmation: 'पहली समस्या ठीक कर रहा हूँ',
  },
  {
    patterns: [/^छोड़ो$/],
    action: (app) => app.skipFix?.(),
    confirmation: 'इस समस्या को छोड़ रहा हूँ',
  },
  {
    patterns: [/^समझाओ$/],
    action: (app) => app.explainIssue?.(),
    confirmation: 'समस्या समझा रहा हूँ',
  },
  // Execution commands
  {
    patterns: [/run\s*code/i, /^execute$/i, /run\s*this/i],
    action: (app) => app.runCode?.(),
    confirmation: 'Running code',
  },
  {
    patterns: [/ரன்\s*செய்/],
    action: (app) => app.runCode?.(),
    confirmation: 'கோடை இயக்குகிறது',
  },
  {
    patterns: [/चलाओ/, /कोड\s*चलाओ/],
    action: (app) => app.runCode?.(),
    confirmation: 'कोड चला रहा हूँ',
  },
  // Output commands
  {
    patterns: [/close\s*output/i, /clear\s*output/i],
    action: (app) => app.closeOutput?.(),
    confirmation: 'Output closed',
  },
  {
    patterns: [/அவுட்புட்\s*மூடு/],
    action: (app) => app.closeOutput?.(),
    confirmation: 'அவுட்புட் மூடப்பட்டது',
  },
  {
    patterns: [/आउटपुट\s*बंद\s*करो/],
    action: (app) => app.closeOutput?.(),
    confirmation: 'आउटपुट बंद हो गया',
  },
];

export interface VoiceCommandMatch {
  action: (app: AppActions) => void;
  confirmation: string;
}

export function matchVoiceCommand(transcript: string): VoiceCommandMatch | null {
  for (const cmd of VOICE_COMMANDS) {
    for (const pattern of cmd.patterns) {
      if (pattern.test(transcript)) {
        return { action: cmd.action, confirmation: cmd.confirmation };
      }
    }
  }
  return null;
}
