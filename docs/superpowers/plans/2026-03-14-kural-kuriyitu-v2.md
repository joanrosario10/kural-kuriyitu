# Kural Kuriyitu v2 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan.

**Goal:** Evolve the voice-controlled coding IDE into a JARVIS-level companion with Gemini Live API, proactive AI, and futuristic UI.

**Architecture:** Dual-channel Gemini (Live API WebSocket for voice, text streaming for code gen). Fallback chain: Live API → Web Speech → text input → mock.

**Tech Stack:** React 19, TypeScript, Vite 8, Tailwind v4, Monaco, @google/genai, Gemini Live API (WebSocket), Web Audio API, Pyodide, Web Workers

---

## Chunk 1: Gemini Live API + UI Fixes

### Task 1: Create Live API WebSocket Manager
**Files:** Create `src/lib/liveApi.ts`
- [ ] Create `GeminiLiveClient` class with WebSocket lifecycle
- [ ] Implement `connect()`, `disconnect()`, `sendAudio()`, `sendText()`
- [ ] Audio input: PCM 16-bit 16kHz base64 encoding
- [ ] Audio output: PCM 24kHz decoding + AudioContext playback
- [ ] Session setup message with model, voice, system prompt
- [ ] Reconnection with exponential backoff
- [ ] `[CODE_REQUEST]` marker detection for text channel handoff

### Task 2: Create Audio Processor
**Files:** Create `src/lib/audioProcessor.ts`, Create `public/audio-worklet.js`
- [ ] AudioWorklet for mic capture (16kHz PCM)
- [ ] ScriptProcessorNode fallback for browsers without AudioWorklet
- [ ] PCM Int16 ↔ Float32 conversion utilities
- [ ] Base64 encode/decode helpers
- [ ] Waveform amplitude extraction for visualization

### Task 3: Integrate Live API into App
**Files:** Modify `src/App.tsx`, Modify `src/components/VoicePanel.tsx`, Modify `src/components/ModelSettings.tsx`
- [ ] Add Live API connection state to App.tsx
- [ ] Wire Live API voice → text channel handoff for code generation
- [ ] Update VoicePanel with connection status indicator
- [ ] Add model selector (stable vs native-audio) to ModelSettings
- [ ] Add Gemini voice picker to ModelSettings
- [ ] Fallback to Web Speech when Live API unavailable

### Task 4: Remove Terminal + Fix Monaco + Lock Dark Mode
**Files:** Delete `src/components/Terminal.tsx`, Modify `src/components/CodeEditor.tsx`, Modify `src/App.tsx`, Modify `src/App.css`
- [ ] Delete Terminal.tsx
- [ ] Remove Terminal import/usage from App.tsx
- [ ] Remove terminal CSS from App.css
- [ ] Remove theme toggle CSS (.theme-toggle)
- [ ] Suppress TS7027 in CodeEditor (diagnosticCodesToIgnore: [7027, 7028])

## Chunk 2: Proactive AI + Execution + UI Polish

### Task 5: Enhanced Proactive AI
**Files:** Modify `src/lib/proactiveAI.ts`, Modify `src/components/ProactivePanel.tsx`
- [ ] Add structured JSON response with explanation field
- [ ] Add cross-file analysis support
- [ ] Add "Fix All" button to ProactivePanel
- [ ] Expand voice commands for fix flow (Tamil/Hindi)

### Task 6: JS/Python Execution
**Files:** Create `src/lib/jsRunner.ts`, Create `src/lib/pyRunner.ts`, Create `src/components/OutputPanel.tsx`
- [ ] Web Worker JS sandbox with timeout
- [ ] Pyodide lazy-loader with CDN
- [ ] OutputPanel component (replaces terminal)
- [ ] Voice commands: "run code", "execute"
- [ ] Wire into App.tsx

### Task 7: Expanded Voice Commands
**Files:** Modify `src/lib/voiceCommands.ts`
- [ ] Add "fix all" / "only first" / "explain" / "skip" commands
- [ ] Add Tamil equivalents
- [ ] Add Hindi equivalents
- [ ] Add "run code" / "execute" commands

### Task 8: UI Polish
**Files:** Modify `src/App.css`, Modify `src/index.css`, Modify `src/components/VoicePanel.tsx`
- [ ] Enhanced chat bubble styling (rounded corners, proper alignment)
- [ ] Connection status indicators (LIVE dot)
- [ ] Animations polish (ripple-success, fade-up on bubbles)

## Chunk 3: PWA + Demo Polish

### Task 9: PWA + Offline
**Files:** Modify `public/sw.js`, Modify `public/manifest.json`, Modify `src/App.tsx`
- [ ] Enhanced service worker caching
- [ ] Offline mode detection + fallback UI
- [ ] PWA install prompt

### Task 10: Demo Polish
**Files:** Modify `src/components/ScreenRecorder.tsx`
- [ ] Session export as JSON
- [ ] Mobile responsive improvements
