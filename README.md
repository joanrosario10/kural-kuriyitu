# Kural kuriyitu 

Voice-controlled coding platform for accessibility. Code by voice using Gemini AI.

## Quick Start

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Add your Gemini API key**
   - Copy `.env.example` to `.env`
   - Add your key: `VITE_GEMINI_API_KEY=your_key`
   - Get a key at [Google AI Studio](https://aistudio.google.com/apikey)

3. **Run the app**
   ```bash
   npm run dev
   ```

4. **Use it**
   - Click the mic button and speak (e.g. "Create a React login form")
   - The AI generates or modifies code; responses are read aloud

## Features

- **Voice input** – Web Speech API
- **AI code generation** – Gemini 3 Flash
- **Monaco editor** – VS Code editing experience
- **Text-to-speech** – Spoken feedback and explanations

## Tech Stack

- React + TypeScript + Vite
- @monaco-editor/react
- @google/genai
- Tailwind CSS
- Web Speech API

## Production / deployment

- **Riva TTS 502**: In production, `/api/riva-tts/` will return 502 unless you run the Riva TTS proxy and wire it to that route. The app is built to retry and fall back (e.g. browser TTS) when the proxy is unavailable.
- **Font 404s**: If you see 404s for `/assets/*.woff2` or `.woff`, ensure the full Vite build output (`dist/`, including all hashed files under `dist/assets/`) is deployed. Missing asset files usually mean the deploy is not serving the complete `dist` folder.
