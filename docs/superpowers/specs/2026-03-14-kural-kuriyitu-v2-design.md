# Kural Kuriyitu v2 — Design Specification

**Date:** 2026-03-14
**Status:** Approved
**Goal:** Evolve the Tamil/English voice-controlled coding IDE into a JARVIS-level hands-free coding companion with native Gemini audio, proactive intelligence, and a timeless futuristic UI.

---

## 1. Architecture Overview

### Dual-Channel Gemini Architecture

The system uses two parallel Gemini channels:

1. **Live API Channel (Voice)** — WebSocket connection to Gemini Live API for bidirectional audio streaming. Handles natural conversation, voice commands, spoken explanations, and proactive spoken alerts. Uses native Gemini voices for expressive, low-latency audio.

2. **Text Streaming Channel (Code)** — Existing `@google/genai` SDK for structured code generation. Uses the marker-based format (`---ACTION---`, `---CODE---`, `---EXPLAIN---`) for reliable code extraction. Triggered when voice channel detects coding intent.

**Why two channels:** Code generation requires structured, parseable text output. Audio responses are natural but unreliable for extracting code. Separating concerns gives the best of both worlds — natural voice conversation AND reliable code generation.

### Fallback Chain

```
Gemini Live API (WebSocket audio)
  ↓ (if WebSocket fails)
Web Speech API (STT) + Gemini Text Streaming + Browser TTS
  ↓ (if no mic)
Text input + Gemini Text Streaming + Browser TTS
  ↓ (if no API key)
Mock mode (simulated responses)
```

### API Key Strategy (Hybrid)

- Default: Client-side API key via `VITE_GEMINI_API_KEY` (hackathon/demo mode)
- Optional: `VITE_LIVE_API_PROXY_URL` env var to route WebSocket through a proxy server
- WebSocket URL is configurable: `wss://generativelanguage.googleapis.com/...?key=KEY` or `wss://your-proxy.com/...`
- One-line swap to production proxy when needed

---

## 2. Gemini Live API Integration

### 2.1 WebSocket Connection

**New file: `src/lib/liveApi.ts`**

Manages the WebSocket lifecycle for Gemini Live API:

- **Connection:** Opens `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent` with API key
- **Setup message:** Sends model config, system instruction, voice config, and generation config on connect
- **Audio input:** Captures mic via `MediaStreamSource` → `AudioWorkletNode` (or `ScriptProcessorNode` fallback) → PCM 16-bit 16kHz → base64 encode → send as `realtimeInput.media` chunks every 100ms
- **Audio output:** Receives `serverContent.modelTurn.parts[].inlineData` with PCM 24kHz audio → decode → play via `AudioContext`
- **Text integration:** Can also send text messages via `clientContent.turns` for code context injection
- **Interruption:** Detects user speech during playback → sends interrupt signal → stops current audio → processes new input
- **Session management:** Handles reconnection with exponential backoff (1s, 2s, 4s, max 30s)

### 2.2 Audio Pipeline

**Input pipeline:**
```
Microphone → getUserMedia() → AudioContext (16kHz) → AudioWorkletNode
  → Float32 PCM → Int16 PCM → Base64 encode → WebSocket send
```

**Output pipeline:**
```
WebSocket receive → Base64 decode → Int16 PCM → Float32
  → AudioContext (24kHz) → GainNode → destination (speakers)
```

**Key considerations:**
- Sample rate conversion: Input at 16kHz (Gemini requirement), output at 24kHz
- Buffer size: 4096 samples per chunk (~256ms at 16kHz)
- Audio worklet for glitch-free processing (no main thread blocking)
- Waveform data extracted from input for visualization

### 2.3 Voice-to-Code Flow

When the Live API detects coding intent (user says "make a login form", "fix this bug", etc.):

1. Live API transcribes and understands the voice command
2. Live API responds with spoken acknowledgment ("Sure, creating a login form...")
3. Simultaneously, the app sends the command text + current code to the **text streaming channel**
4. Text channel returns structured code via markers
5. Code streams into Monaco editor
6. Live API continues with spoken explanation of what was built

**Intent detection:** The Live API system instruction includes rules to identify coding commands vs. conversation. When it detects code intent, it includes a special marker in its text response: `[CODE_REQUEST: <command>]` which the client intercepts to trigger the text channel.

### 2.4 Model Configuration

```typescript
type LiveModel =
  | 'gemini-2.0-flash-live-001'           // Stable
  | 'gemini-2.5-flash-preview-native-audio-dialog'  // Expressive (default)

// Setup message
{
  setup: {
    model: `models/${selectedModel}`,
    generationConfig: {
      responseModalities: ['AUDIO', 'TEXT'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: 'Aoede'  // or user-selected
          }
        }
      }
    },
    systemInstruction: {
      parts: [{ text: LIVE_SYSTEM_PROMPT }]
    }
  }
}
```

### 2.5 System Prompt for Live API

```
You are JARVIS, the voice assistant for Kural Kuriyitu — a Tamil/English voice-controlled coding IDE.

PERSONALITY: Helpful, concise, proactive. Speak like a brilliant coding partner.
LANGUAGE: Respond in the same language the user speaks (Tamil, Hindi, or English). Code is always English.

WHEN USER ASKS TO CODE:
- Acknowledge briefly ("Creating a login form with validation...")
- Include [CODE_REQUEST: <exact user command>] in your text response
- After code appears in editor, explain what you built (1-2 sentences)

WHEN ASKED TO EXPLAIN:
- Explain the current code clearly and concisely
- Reference specific line numbers when relevant

WHEN PROACTIVE ANALYSIS ARRIVES (via text injection):
- You'll receive code analysis results as text
- Speak the top issue naturally ("I noticed a potential null reference on line 12...")
- Wait for user confirmation before suggesting fixes

VOICE STYLE: Natural, warm, slightly technical. Like a senior developer pair programming.
```

---

## 3. Proactive AI Enhancement

### 3.1 Structured Analysis

**Modified: `src/lib/proactiveAI.ts`**

Change the analysis prompt to request structured JSON:

```typescript
interface ProactiveAnalysis {
  issues: Array<{
    id: string
    line: number
    severity: 'error' | 'warning' | 'info'
    message: string
    fix: string        // Complete fixed line
    explanation: string // Why this is an issue
  }>
  summary: string      // "3 issues found: 1 error, 2 warnings"
  autoFixable: boolean // Can all be fixed automatically?
}
```

### 3.2 Voice-Driven Fix Flow

1. After idle analysis completes, inject results into Live API as text context
2. Live API speaks: "I found 3 issues. There's a null reference on line 12, a missing key prop on line 24, and an unused import. Want me to fix all of them?"
3. User responds naturally: "fix all" / "only the error" / "explain the first one" / "skip"
4. Tamil equivalents: "எல்லாம் சரி செய்" / "முதல் பிழை மட்டும்" / "விளக்கு" / "தவிர்"
5. Hindi: "सब ठीक करो" / "पहला ठीक करो" / "समझाओ" / "छोड़ो"
6. Fixes applied via text channel (structured code replacement)

### 3.3 Cross-File Analysis

For multi-file projects, the proactive analyzer sends all files as context:

```typescript
const allCode = project.files.map(f =>
  `--- FILE: ${f.name} ---\n${f.content}`
).join('\n\n')
```

Fixes can reference which file to modify. The response includes `file: string` in each issue.

---

## 4. Monaco Editor Fixes

### 4.1 Suppress TS7027 (Unreachable Code)

In `CodeEditor.tsx` `handleEditorDidMount`:

```typescript
monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
  noSemanticValidation: false,  // Keep semantic validation
  noSyntaxValidation: false,    // Keep syntax validation
  diagnosticCodesToIgnore: [7027, 7028]  // Unreachable code detected, Unused label
})
```

This keeps useful diagnostics while suppressing the noisy TS7027 squiggles from AI-generated code.

### 4.2 Code Highlighting During TTS

When the Live API speaks about specific lines, highlight them in Monaco:

```typescript
// Add decorations for lines being discussed
const decorations = editor.deltaDecorations([], [{
  range: new monaco.Range(lineNumber, 1, lineNumber, 1),
  options: {
    isWholeLine: true,
    className: 'line-highlight-tts',  // cyan glow background
    glyphMarginClassName: 'line-glyph-tts'
  }
}])
```

CSS class `line-highlight-tts`: `background: rgba(0, 212, 255, 0.08); border-left: 2px solid #00d4ff;`

---

## 5. UI Overhaul

### 5.1 Remove Terminal

- Delete `src/components/Terminal.tsx`
- Remove Terminal import and rendering from `App.tsx`
- Remove terminal-related CSS from `App.css`

### 5.2 Remove Day/Night Toggle

- Remove any theme toggle button/logic from `App.tsx`
- Lock theme to dark mode: hardcode `data-theme="dark"` on document root
- Remove light-mode CSS variables/rules if any exist

### 5.3 Full-Screen Preview

Add a fullscreen toggle button in the preview header:

```typescript
// In Preview.tsx
const [isFullscreen, setIsFullscreen] = useState(false)

// Fullscreen overlay
{isFullscreen && (
  <div className="fixed inset-0 z-50 bg-black/90 flex flex-col">
    <div className="flex justify-between items-center p-3 bg-[rgba(20,20,40,0.8)]">
      <span className="text-cyan-400 text-sm">Preview — Fullscreen</span>
      <button onClick={() => setIsFullscreen(false)}
              className="text-white/60 hover:text-white text-xl">✕</button>
    </div>
    <iframe className="flex-1 w-full bg-white" srcDoc={html} sandbox="allow-scripts" />
  </div>
)}
```

### 5.4 Chat Bubbles

Replace flat conversation entries with styled bubbles:

- **User messages:** Right-aligned, cyan background (`rgba(0,212,255,0.12)`), rounded `12px 12px 4px 12px`
- **AI messages:** Left-aligned, subtle gray (`rgba(255,255,255,0.06)`), rounded `12px 12px 12px 4px`
- Auto-scroll to bottom on new messages
- Timestamp on hover

### 5.5 Glassmorphism Enhancement

Upgrade existing glass effects:

```css
/* Enhanced glass panels */
.glass-panel {
  background: rgba(20, 20, 40, 0.45);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(0, 212, 255, 0.15);
  box-shadow: 0 0 20px rgba(0, 212, 255, 0.05),
              inset 0 0 20px rgba(0, 212, 255, 0.02);
}

/* Cyan glow accent */
.glow-border {
  box-shadow: 0 0 15px rgba(0, 212, 255, 0.2),
              0 0 30px rgba(0, 212, 255, 0.1);
}
```

### 5.6 Mic Button Redesign

Large glass circle with live waveform visualization:

- Outer ring: `border: 2px solid #00d4ff` with `box-shadow: 0 0 20px rgba(0,212,255,0.3)`
- Ripple rings on listen: 2-3 concentric circles animating outward with `scale` + `opacity` transition
- Inner waveform: Use existing `WaveformVisualizer.tsx` but render circular bars inside the mic button
- States:
  - **Idle:** Subtle pulse animation
  - **Listening (Live API connected):** Active waveform + ripple rings
  - **Speaking:** Waveform shows output audio amplitude
  - **Processing:** Spinning cyan ring

### 5.7 Animations

Subtle, purposeful animations (CSS-only, no Framer Motion needed):

```css
/* Fade-up for new elements */
@keyframes fade-up {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

/* Ripple on voice success */
@keyframes ripple-success {
  0% { box-shadow: 0 0 0 0 rgba(0, 212, 255, 0.4); }
  100% { box-shadow: 0 0 0 20px rgba(0, 212, 255, 0); }
}

/* Chat bubble entrance */
.chat-bubble-enter {
  animation: fade-up 0.3s ease-out;
}
```

---

## 6. Preview & Execution Enhancement

### 6.1 JavaScript Execution in Web Worker

**New file: `src/lib/jsRunner.ts`**

```typescript
// Create a Web Worker from a blob URL
const workerCode = `
  self.onmessage = (e) => {
    const logs = []
    const originalLog = console.log
    console.log = (...args) => logs.push({ type: 'log', args: args.map(String) })
    console.error = (...args) => logs.push({ type: 'error', args: args.map(String) })
    try {
      const result = eval(e.data.code)
      self.postMessage({ success: true, result: String(result), logs })
    } catch (err) {
      self.postMessage({ success: false, error: err.message, logs })
    }
  }
`

export function runJS(code: string): Promise<ExecutionResult> {
  return new Promise((resolve) => {
    const blob = new Blob([workerCode], { type: 'application/javascript' })
    const worker = new Worker(URL.createObjectURL(blob))
    const timeout = setTimeout(() => {
      worker.terminate()
      resolve({ success: false, error: 'Execution timed out (5s)', logs: [] })
    }, 5000)
    worker.onmessage = (e) => {
      clearTimeout(timeout)
      worker.terminate()
      resolve(e.data)
    }
    worker.postMessage({ code })
  })
}
```

### 6.2 Python Execution via Pyodide

**New file: `src/lib/pyRunner.ts`**

```typescript
let pyodide: any = null

export async function initPyodide(): Promise<void> {
  if (pyodide) return
  // Load from CDN
  const { loadPyodide } = await import('https://cdn.jsdelivr.net/pyodide/v0.27.0/full/pyodide.mjs')
  pyodide = await loadPyodide({
    indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.27.0/full/'
  })
}

export async function runPython(code: string): Promise<ExecutionResult> {
  await initPyodide()
  const logs: LogEntry[] = []

  // Redirect stdout/stderr
  pyodide.runPython(`
    import sys, io
    sys.stdout = io.StringIO()
    sys.stderr = io.StringIO()
  `)

  try {
    const result = pyodide.runPython(code)
    const stdout = pyodide.runPython('sys.stdout.getvalue()')
    const stderr = pyodide.runPython('sys.stderr.getvalue()')
    if (stdout) logs.push({ type: 'log', args: [stdout] })
    if (stderr) logs.push({ type: 'error', args: [stderr] })
    return { success: true, result: result?.toString() ?? '', logs }
  } catch (err: any) {
    return { success: false, error: err.message, logs }
  }
}
```

### 6.3 Voice-Triggered Execution

Voice commands: "run code", "execute", "ரன் செய்" (Tamil), "चलाओ" (Hindi)

Flow:
1. Detect language from file extension (.py → Python, .js/.ts → JavaScript)
2. Run in appropriate sandbox (Pyodide or Web Worker)
3. Show output in a results panel (replaces old terminal area)
4. If error, speak it via Live API and offer proactive fix
5. "fix and run again" → apply fix → re-execute automatically

### 6.4 Output Panel

Replace the removed terminal with a compact output panel:

- Appears below editor when code is executed
- Shows console output with colored log levels
- Collapsible (default collapsed, expands on execution)
- Voice-dismissible: "close output" / "clear"

---

## 7. Localization & Multilingual

### 7.1 Live API Native Multilingual

The Gemini Live API natively handles Tamil and Hindi speech recognition — no separate STT configuration needed. The system prompt instructs Gemini to respond in the user's language.

Voice config options for different accents:
- `Aoede`, `Charon`, `Fenrir`, `Kore`, `Puck` — built-in Gemini voices
- User can select preferred voice in settings

### 7.2 Language-Aware Commands

Expand `voiceCommands.ts` with multilingual command patterns:

| English | Tamil | Hindi | Action |
|---------|-------|-------|--------|
| "fix all" | "எல்லாம் சரி செய்" | "सब ठीक करो" | Apply all proactive fixes |
| "run code" | "ரன் செய்" | "चलाओ" | Execute current file |
| "new file X" | "புதிய கோப்பு X" | "नई फाइल X" | Create new file |
| "yes" / "confirm" | "ஆம்" / "ஆமா" | "हाँ" / "हां" | Confirm action |
| "no" / "skip" | "வேண்டாம்" | "नहीं" / "छोड़ो" | Reject/skip |

### 7.3 Fallback TTS

When Live API is unavailable, fall back to browser TTS with the existing accent selection system. The `speech.ts` module remains as the fallback path.

---

## 8. PWA & Offline

### 8.1 Service Worker

Enhance existing `sw.js` to cache:
- App shell (HTML, CSS, JS bundles)
- Monaco editor assets
- Pyodide core (lazy, after first use)

### 8.2 Offline Mode

When offline:
- Editor works fully (Monaco is local)
- File management works (IndexedDB)
- Voice input works (Web Speech API is partially offline in Chrome)
- AI features show "Offline — AI features unavailable" message
- Mock mode activates automatically with enhanced mock responses

### 8.3 Install Prompt

Add PWA install banner:
- Detect `beforeinstallprompt` event
- Show subtle "Install app" button in header
- Dismiss after install or after 3 dismissals

---

## 9. Demo Polish

### 9.1 Screen Recorder Enhancement

Keep existing `ScreenRecorder.tsx`, add:
- Session export: JSON file with timestamped commands + code snapshots
- Share button: copies session summary to clipboard

### 9.2 Responsive/Mobile

- Voice panel collapses to bottom sheet on mobile (<768px)
- Larger touch targets (44px minimum)
- Swipe right to show voice panel, swipe left to hide
- Editor takes full width on mobile
- Preview accessible via tab/swipe

---

## 10. File Changes Overview

### New Files
| File | Purpose |
|------|---------|
| `src/lib/liveApi.ts` | Gemini Live API WebSocket manager |
| `src/lib/audioProcessor.ts` | Audio worklet for PCM encoding/decoding |
| `src/lib/jsRunner.ts` | Web Worker JavaScript sandbox |
| `src/lib/pyRunner.ts` | Pyodide Python runner |
| `src/components/OutputPanel.tsx` | Execution results display |
| `public/audio-worklet.js` | AudioWorklet processor (runs in audio thread) |

### Modified Files
| File | Changes |
|------|---------|
| `src/App.tsx` | Remove Terminal, add Live API state, output panel, fullscreen preview, chat bubbles, connection status |
| `src/components/VoicePanel.tsx` | Live API connection indicator, redesigned mic button, chat bubble styling |
| `src/components/VoiceInput.tsx` | Fallback role only — used when Live API unavailable |
| `src/components/CodeEditor.tsx` | TS7027 suppression, TTS line highlighting decorations |
| `src/components/Preview.tsx` | Fullscreen toggle overlay |
| `src/components/WaveformVisualizer.tsx` | Dual mode: mic input waveform OR output audio waveform |
| `src/components/ModelSettings.tsx` | Add Live API model selector, Gemini voice picker |
| `src/components/ProactivePanel.tsx` | Structured JSON display, bulk fix actions |
| `src/lib/gemini.ts` | Keep as-is (text channel for code gen) |
| `src/lib/speech.ts` | Keep as fallback TTS |
| `src/lib/proactiveAI.ts` | Structured JSON response, cross-file analysis, Live API integration |
| `src/lib/voiceCommands.ts` | Expanded multilingual commands |
| `src/App.css` | Enhanced glassmorphism, chat bubbles, animations, remove terminal styles |
| `src/index.css` | Updated design tokens, new animation keyframes |
| `public/sw.js` | Enhanced caching strategy |
| `public/manifest.json` | Updated PWA metadata |

### Deleted Files
| File | Reason |
|------|--------|
| `src/components/Terminal.tsx` | Replaced by OutputPanel + Pyodide/Worker execution |

---

## 11. Phased Implementation Plan

### Phase 1: Gemini Live API Migration (2 days)
- Create `liveApi.ts` WebSocket manager
- Create `audioProcessor.ts` for PCM encoding/decoding
- Create `audio-worklet.js` for audio thread processing
- Integrate Live API into App.tsx state management
- Implement voice-to-code flow (Live API → text channel handoff)
- Add fallback chain (Live API → Web Speech → text input)
- Update ModelSettings with Live API model/voice selection

### Phase 2: UI Fixes & Cleanup (1 day)
- Suppress TS7027 in CodeEditor
- Remove Terminal component entirely
- Remove day/night toggle, lock dark mode
- Add fullscreen preview toggle
- Implement chat bubble conversation styling

### Phase 3: Enhanced Proactive AI (1 day)
- Structured JSON analysis response
- Live API spoken alerts integration
- Voice-driven fix commands (fix all, explain, skip — multilingual)
- Cross-file analysis support

### Phase 4: UI Polish — JARVIS Energy (1-2 days)
- Enhanced glassmorphism (blur, glow borders, shadows)
- Redesigned mic button with ripple rings + waveform
- TTS line highlighting in Monaco
- Animations (fade-up, ripple-success, chat-bubble-enter)
- Connection status indicators

### Phase 5: Execution & Preview (1 day)
- Web Worker JS runner
- Pyodide Python runner
- OutputPanel component
- Voice-triggered execution
- Proactive error speak + fix on execution failure

### Phase 6: Localization & Polish (1 day)
- Expanded multilingual voice commands
- PWA service worker caching
- Install prompt
- Offline mode detection
- Session export / demo polish
- Responsive/mobile layout

---

## 12. Performance Considerations

- **Live API WebSocket:** Single persistent connection, minimal overhead. Reconnect on drop.
- **Audio processing:** AudioWorklet runs on separate thread — no jank on main thread.
- **Pyodide:** ~11MB initial download. Lazy-load only when user runs Python. Cache in service worker after first use.
- **Monaco:** Already loaded. No additional cost.
- **Animations:** CSS-only (GPU-accelerated transforms/opacity). No JavaScript animation libraries.
- **Mid-range device target:** Test on 4GB RAM Android Chrome. Pyodide is the heaviest addition — gate behind user action, not auto-load.

---

## 13. Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Live API WebSocket instability | Automatic reconnection + Web Speech fallback |
| API key exposure in client | Configurable proxy URL for production |
| Pyodide too heavy for low-end devices | Lazy load, service worker cache, skip if <4GB RAM |
| Native audio model preview instability | User-selectable model, stable fallback default |
| Tamil/Hindi recognition quality | Live API handles natively; fallback to Web Speech API which has decent Indic support |
| Audio echo/feedback | Use `echoCancellation: true` in getUserMedia constraints |
