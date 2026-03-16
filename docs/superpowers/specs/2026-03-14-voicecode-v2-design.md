# Voicecode V2 — "Tamil JARVIS" Design Spec

## Overview

Evolve Voicecode from a one-shot voice-to-code tool into a streaming, multilingual, conversational AI coding partner. Optimized for hackathon demo impact in 2 days.

**Scope:** 4 features — Streaming, Tamil/Hindi support, Conversational Memory (lite), High-polish UI.

**Out of scope:** Multi-file projects, voice navigation, proactive AI auto-debug, PWA, eye-tracking.

---

## Feature 1: Real-time Streaming from Gemini

### Problem
Current `generateContent()` blocks for 3-5 seconds before showing any result. Feels dead.

### Solution
Switch to `ai.models.generateContentStream()` (from `@google/genai` SDK) with marker-based response format.

### Prompt Format Change
Instead of JSON response, use markers:

```
---ACTION---
generate
---CODE---
function login() { ... }
---EXPLAIN---
I created a login function that...
```

This allows streaming code into Monaco as chunks arrive and speaking explanation sentence-by-sentence.

### New API: `processVoiceCommandStream()`

```typescript
interface StreamCallbacks {
  onAction: (action: string) => void;
  onCodeChunk: (accumulatedCode: string) => void;  // CUMULATIVE: full code so far
  onExplanationChunk: (sentence: string) => void;
  onComplete: (finalCode: string, fullExplanation: string) => void;
  onError: (error: Error) => void;
}

async function processVoiceCommandStream(
  transcript: string,
  currentCode: string,
  apiKey: string,
  model: AIModelId,          // preserved from existing API
  language: LanguageConfig,  // full config object (needs .name for prompt, .code for TTS)
  history: ConversationEntry[],
  callbacks: StreamCallbacks,
  signal?: AbortSignal       // for cancellation
): Promise<void>
```

### Stream Processing Logic
1. Create `AbortController` in App.tsx, pass `signal` to streaming function
2. Call `ai.models.generateContentStream()` with marker-based prompt
3. Accumulate full text buffer from chunks
4. Parse markers as they appear: detect `---ACTION---`, `---CODE---`, `---EXPLAIN---`
5. Once in CODE section: accumulate code lines, emit **cumulative** code string to `onCodeChunk` after each new line — Monaco receives the full code so far and replaces editor value
6. Once in EXPLAIN section: buffer until sentence boundary, then emit to `onExplanationChunk`
7. On `signal.aborted`: stop processing, call `onComplete` with whatever we have so far

### Sentence Boundary Detection
Simple approach suitable for hackathon:
- Split on `. ` (period + space), `! `, `? `, and `\n`
- Known limitation: abbreviations like "e.g. " may cause early splits — acceptable for demo
- Tamil/Hindi: period (`.`) is standard sentence terminator in both scripts — same logic works

### Marker Parsing Error Recovery
- If no `---ACTION---` found within first 500 characters: fall back to non-streaming `processVoiceCommand()`
- If `---CODE---` never appears: treat entire content after ACTION as explanation
- If markers appear inside code strings (e.g., `console.log("---CODE---")`): unlikely given prompt instructions, but handled by only matching markers at start of line

### Monaco Integration
- `onCodeChunk(accumulated)` sets editor value to accumulated code string
- Monaco handles value replacement smoothly without cursor jumping (controlled component)
- Add a blinking cursor `deltaDecoration` at last line during streaming, removed on complete

### Cancellation
- App.tsx stores `AbortController` ref: `const abortRef = useRef<AbortController | null>(null)`
- New voice command while streaming: `abortRef.current?.abort()`, create new controller
- Abort cleans up gracefully — partial code stays in editor

### Fallback
Keep `processVoiceCommand()` (non-streaming) as fallback. On stream error, catch and retry with blocking call. Partial code already in Monaco is reverted to `currentCode` before fallback attempt.

### Error Handling
- Network error mid-stream: call `onError`, revert editor to pre-stream code, speak "Connection lost, please try again"
- Empty response: call `onError`, speak "I didn't get a response, please try again"
- Timeout: 30-second timeout via AbortController — if no chunks received in 30s, abort and fallback

---

## Feature 2: Tamil/Hindi Language Support

### Problem
English-only excludes hundreds of millions of Indian developers. Tamil/Hindi voice coding is a massive differentiator.

### Solution
End-to-end multilingual pipeline: voice input → AI processing → voice output, all in user's language. Code always stays in English.

### Language Configuration (src/lib/languages.ts)

```typescript
interface LanguageConfig {
  code: string;       // e.g., 'ta-IN'
  name: string;       // e.g., 'Tamil'
  nativeName: string; // e.g., 'தமிழ்'
  speechLang: string; // Web Speech API lang code
  ttsLang: string;    // SpeechSynthesis lang code
}

const LANGUAGES: LanguageConfig[] = [
  { code: 'en-US', name: 'English (US)', nativeName: 'English', speechLang: 'en-US', ttsLang: 'en-US' },
  { code: 'en-IN', name: 'English (India)', nativeName: 'English (India)', speechLang: 'en-IN', ttsLang: 'en-IN' },
  { code: 'ta-IN', name: 'Tamil', nativeName: 'தமிழ்', speechLang: 'ta-IN', ttsLang: 'ta' },
  { code: 'hi-IN', name: 'Hindi', nativeName: 'हिन्दी', speechLang: 'hi-IN', ttsLang: 'hi' },
];
```

### New Component: `LanguageSelector.tsx`
- Dropdown in header area, shows native script names
- Stores selected `LanguageConfig` in App.tsx state (default: `en-US`)
- Full config object passed to VoiceInput, gemini.ts, speech.ts

### VoiceInput.tsx Changes
- Accept `lang: string` prop (the `speechLang` value)
- Set `recognition.lang = lang` before starting
- Chrome supports ta-IN, hi-IN natively
- Transcript returns in Tamil/Hindi script automatically

### gemini.ts Prompt Addition
Append to system prompt:
```
The user is speaking in {language.name}. Their command may be in {language.name} script.
IMPORTANT: Always write CODE in English (JavaScript/TypeScript/HTML).
Write the EXPLANATION in {language.name} so the user hears it in their language.
```

### speech.ts Changes — Updated Full Signature

```typescript
interface SpeakOptions {
  rate?: number;       // default 0.95
  voice?: string;      // voice accent key (kept for backward compat)
  lang?: string;       // NEW: language code for TTS (e.g., 'ta', 'hi', 'en-US')
  onSpeakingStart?: () => void;
  onSpeakingEnd?: () => void;
}

function speak(text: string, options?: SpeakOptions): void
```

- When `lang` is provided, set `utterance.lang = lang`
- Voice selection priority: filter by `lang` first, then by `voice` accent within that language
- Fallback chain: exact lang+accent match → any voice matching lang → system default

### VoiceAccent vs LanguageConfig Interaction
- When language is `ta-IN` or `hi-IN`: voice accent selector is hidden (no accent variants for these)
- When language is `en-US`, `en-IN`: voice accent selector remains visible (Indian, British, US, Male)
- ModelSettings component receives `language` prop and conditionally renders accent dropdown

### TTS Voice Unavailability
- On language change, check `speechSynthesis.getVoices()` for matching voices
- If no voice found for selected language: show a visible warning badge next to LanguageSelector: "No {language} voice — text shown instead"
- Explanation still displayed in VoicePanel text, just not spoken
- Most Chrome installations on Android/desktop have Tamil and Hindi voices

### Quick Command Chips (Localized)
```typescript
const CHIPS: Record<string, { label: string; command: string }[]> = {
  'en-US': [
    { label: 'Login Form', command: 'Create a login form' },
    { label: 'Counter', command: 'Create a counter app' },
    { label: 'Explain', command: 'Explain this code' },
    { label: 'Fix Error', command: 'Fix any errors in this code' },
  ],
  'en-IN': null,  // falls back to en-US chips
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
```

---

## Feature 3: Conversational Memory (Lite)

### Problem
Each command is stateless. User can't say "now add auth to that" — Gemini doesn't know what "that" refers to.

### Solution
Maintain session conversation history in React state. Send history with each Gemini call. Enables multi-step project building via voice.

### Data Model

```typescript
interface ConversationEntry {
  id: string;            // crypto.randomUUID()
  timestamp: number;     // Date.now()
  role: 'user' | 'assistant';
  command?: string;      // user's voice transcript
  action?: string;       // generate/modify/explain/fix
  code?: string;         // code snapshot (truncated to last 200 lines in history prompt)
  explanation?: string;  // AI's explanation
}

// App.tsx state
const [history, setHistory] = useState<ConversationEntry[]>([]);
```

### How It Works
1. After each voice command, push a `user` entry with the transcript
2. After Gemini responds, push an `assistant` entry with action + code + explanation
3. Send last 10 `ConversationEntry` objects (= 5 turns of user+assistant) to Gemini as context
4. Code in history entries is truncated to last 200 lines to keep prompt size manageable
5. Gemini prompt includes: "Here is the conversation history. The user may refer to previous code or commands. Build upon the existing code when they say things like 'add', 'continue', 'now do'."

### Prompt Structure with History
```
System: You are a voice-controlled coding assistant...

Conversation history:
[User]: Create a login form
[Assistant] (generate): I created a React login form with email/password fields.
[Code snapshot]: function LoginForm() { ... } (truncated)

[User]: Now add validation
[Assistant] (modify): I added email format validation and required field checks.
[Code snapshot]: ...

Current command: "Add a forgot password link"
Current code:
{full current code}
```

### Conversation Panel UI (VoicePanel.tsx Enhancement)
- Replace single "last command" display with scrollable conversation thread
- Layout: vertical stack of message bubbles, newest at bottom, auto-scroll
- User messages: right-aligned, primary color background, show transcript
- Assistant messages: left-aligned, surface color background, show action badge + truncated explanation (max 2 lines, expandable)
- Max height: fill available sidebar space with overflow-y scroll
- Empty state: "Start speaking to begin coding..."

### Session Persistence
- History lives in React state only (no IndexedDB for V2)
- Cleared on page refresh — acceptable for hackathon demo
- "Clear conversation" button at top of history panel

---

## Feature 4: High-Polish UI

### 4a: Audio Waveform Visualizer (`WaveformVisualizer.tsx`)
- Use Web Audio API `AnalyserNode` on microphone stream
- Render 20-30 frequency bars in a circular arrangement around mic FAB
- Canvas element (120x120px) positioned behind the FAB button
- Animates via `requestAnimationFrame` while listening, stops when not
- Colors: primary color bars with opacity based on frequency amplitude
- Component receives `stream: MediaStream | null` and `isListening: boolean` props

### 4b: Auto-highlight Code Lines During TTS (Simplified)
**Scoped for hackathon:** highlight all referenced lines when TTS starts a sentence, clear when sentence ends. No real-time sync.
- Parse explanation sentences for patterns: `/line\s+(\d+)/i`, `/lines?\s+(\d+)\s*(-|to|through)\s*(\d+)/i`
- Use Monaco `editor.deltaDecorations()` to add `className: 'highlighted-line'` with yellow/amber background
- Apply decorations when `onExplanationChunk` fires (per sentence), clear previous decorations
- Clear all decorations when TTS finishes (`onSpeakingEnd`)
- No function-name matching (too complex for hackathon) — line numbers only

### 4c: Dark Mode Polish
- Current: basic dark theme toggle exists with `[data-theme="dark"]` CSS vars
- Add Monaco dark theme: define `google-dark` theme alongside existing `google-light`
- Smooth CSS transition: `transition: background-color 0.3s, color 0.3s` on root
- Persist to `localStorage.getItem('voicecode-theme')`
- All new components use CSS variables, automatically respect theme

### 4d: Streaming Visual Feedback
- While streaming: pulsing Gemini icon in header (CSS animation `@keyframes pulse`)
- Code editor: subtle typing cursor decoration (blinking bar via CSS) at last line
- Status text in VoicePanel: "Thinking..." → "Writing code..." → "Explaining..." → idle

### 4e: Voice Settings via Voice (`src/lib/voiceCommands.ts`)
Local command map — checked BEFORE sending to Gemini:

```typescript
interface VoiceCommand {
  patterns: RegExp[];     // match against transcript
  action: (app: AppActions) => void;
  confirmation: string;   // spoken back to user
}

const VOICE_COMMANDS: VoiceCommand[] = [
  {
    patterns: [/speak\s*slower/i, /धीरे बोलो/i, /மெதுவாக பேசு/i],
    action: (app) => app.setSpeechRate(0.7),
    confirmation: 'Speaking slower now',
  },
  {
    patterns: [/speak\s*faster/i, /तेज़ बोलो/i, /வேகமாக பேசு/i],
    action: (app) => app.setSpeechRate(1.2),
    confirmation: 'Speaking faster now',
  },
  {
    patterns: [/use\s*tamil/i, /தமிழ் பயன்படுத்து/i],
    action: (app) => app.setLanguage('ta-IN'),
    confirmation: 'தமிழுக்கு மாறியது',
  },
  {
    patterns: [/use\s*hindi/i, /हिंदी में बोलो/i],
    action: (app) => app.setLanguage('hi-IN'),
    confirmation: 'हिंदी में बदल गया',
  },
  {
    patterns: [/use\s*english/i],
    action: (app) => app.setLanguage('en-US'),
    confirmation: 'Switched to English',
  },
  {
    patterns: [/dark\s*(mode|theme)/i, /डार्क मोड/i, /இருண்ட பயன்முறை/i],
    action: (app) => app.setDarkTheme(true),
    confirmation: 'Dark mode enabled',
  },
  {
    patterns: [/light\s*(mode|theme)/i, /लाइट मोड/i, /ஒளி பயன்முறை/i],
    action: (app) => app.setDarkTheme(false),
    confirmation: 'Light mode enabled',
  },
];
```

Flow: `handleVoiceCommand(transcript)` → check `matchVoiceCommand(transcript)` → if matched, execute action + speak confirmation, skip Gemini. If no match, proceed to Gemini as normal.

---

## Architecture Summary

```
                    ┌─────────────────┐
                    │ LanguageSelector │
                    └────────┬────────┘
                             │ LanguageConfig
    ┌──────────┐    ┌────────▼────────┐    ┌──────────────┐
    │VoiceInput│───►│    App.tsx       │───►│  gemini.ts   │
    │(Web Speech)   │  (orchestrator)  │    │ (streaming)  │
    └──────────┘    │  + history[]     │    └──────┬───────┘
         │          │  + abortCtrl     │           │ chunks
    ┌────▼─────┐    └────────┬────────┘           │
    │Waveform  │             │                     │
    │Visualizer│  ┌──────────┼──────────────┐     │
    └──────────┘  ▼          ▼              ▼     ▼
           ┌──────────┐ ┌──────────┐ ┌──────────────┐
           │CodeEditor│ │ Preview  │ │  speech.ts   │
           │(Monaco)  │ │ (iframe) │ │(multilingual)│
           │+highlight│ └──────────┘ └──────────────┘
           └──────────┘
                 │
           ┌─────▼─────┐
           │  Terminal  │
           └────────────┘
```

### New Files
- `src/lib/languages.ts` — LanguageConfig type, LANGUAGES array, CHIPS map
- `src/lib/voiceCommands.ts` — local voice command detection
- `src/components/LanguageSelector.tsx` — language dropdown
- `src/components/WaveformVisualizer.tsx` — audio waveform canvas

### Modified Files
- `src/lib/gemini.ts` — streaming API, marker-based format, history in prompt, AbortSignal
- `src/lib/speech.ts` — multilingual TTS, lang parameter, updated SpeakOptions
- `src/App.tsx` — language state, history state, streaming callbacks, AbortController, voice commands
- `src/components/VoiceInput.tsx` — dynamic lang prop, expose MediaStream for waveform
- `src/components/VoicePanel.tsx` — conversation history thread, localized chips
- `src/components/CodeEditor.tsx` — line highlighting decorations, streaming cursor, dark theme
- `src/components/ModelSettings.tsx` — conditional accent dropdown based on language
- `src/index.css` / `src/App.css` — waveform styles, dark mode transitions, highlighted-line class, streaming animations

---

## Success Criteria

1. **Streaming works:** Code appears line-by-line in < 500ms from first chunk
2. **Tamil demo:** User speaks Tamil → code generates → explanation spoken in Tamil
3. **Hindi demo:** Same flow in Hindi
4. **Memory works:** "Add auth to that" references previous code correctly
5. **Waveform:** Visible audio visualization while listening
6. **Code highlighting:** Referenced lines highlight during TTS
7. **Voice settings:** "Speak slower" / "Use Tamil" / "Dark mode" work without Gemini roundtrip
8. **Dark mode:** Polished, Monaco + all components respect theme
9. **Cancellation:** New command mid-stream aborts cleanly
10. **No regressions:** English-only flow still works perfectly
