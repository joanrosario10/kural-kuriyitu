/**
 * NVIDIA NIM fallback for code generation.
 * Uses OpenAI-compatible API with Gemma-7b when Gemini is unavailable.
 */

import type { StreamCallbacks } from './gemini';
import type { LanguageConfig } from './languages';
import type { ConversationEntry } from './gemini';

// In dev, use Vite proxy. In prod, single route /api/nvidia (no path segments on Vercel).
const NVIDIA_CHAT_URL = import.meta.env.DEV
  ? '/nvidia-api/v1/chat/completions'
  : '/api/nvidia';
const NVIDIA_API_KEY = import.meta.env.VITE_NVIDIA_API_KEY || '';

export const NVIDIA_MODELS = [
  { id: 'google/gemma-3-27b-it', label: 'Gemma 3 27B', description: 'Best quality' },
  { id: 'google/gemma-3-12b-it', label: 'Gemma 3 12B', description: 'Balanced' },
  { id: 'google/gemma-3-4b-it', label: 'Gemma 3 4B', description: 'Fast' },
  { id: 'google/gemma-7b', label: 'Gemma 7B', description: 'Stable' },
  { id: 'meta/llama-3.3-70b-instruct', label: 'Llama 3.3 70B', description: 'Most capable' },
  { id: 'meta/llama-3.1-70b-instruct', label: 'Llama 3.1 70B', description: 'Strong' },
  { id: 'meta/llama-3.1-8b-instruct', label: 'Llama 3.1 8B', description: 'Lightweight' },
  { id: 'meta/llama-4-scout-17b-16e-instruct', label: 'Llama 4 Scout 17B', description: 'Latest' },
  { id: 'meta/llama-4-maverick-17b-128e-instruct', label: 'Llama 4 Maverick 17B', description: 'Creative' },
  { id: 'mistralai/mistral-large-3-675b-instruct-2512', label: 'Mistral Large 3', description: 'Premium' },
  { id: 'mistralai/mistral-small-3.1-24b-instruct-2503', label: 'Mistral Small 3.1', description: 'Efficient' },
  { id: 'qwen/qwen3-coder-480b-a35b-instruct', label: 'Qwen 3 Coder 480B', description: 'Code specialist' },
  { id: 'qwen/qwen2.5-coder-32b-instruct', label: 'Qwen 2.5 Coder 32B', description: 'Code focused' },
  { id: 'deepseek-ai/deepseek-v3.2', label: 'DeepSeek V3.2', description: 'Powerful' },
  { id: 'microsoft/phi-4-mini-instruct', label: 'Phi-4 Mini', description: 'Compact' },
  { id: 'nvidia/llama-3.1-nemotron-ultra-253b-v1', label: 'Nemotron Ultra 253B', description: 'NVIDIA flagship' },
] as const;

export type NvidiaModelId = (typeof NVIDIA_MODELS)[number]['id'];

export const DEFAULT_NVIDIA_MODEL: NvidiaModelId = 'google/gemma-3-27b-it';

export function isNvidiaAvailable(): boolean {
  // Fallback is available whenever we have a key; in dev we hit the
  // Vite proxy (`/nvidia-api`), in production we hit our own API
  // route (`/api/nvidia`), so no direct cross-origin calls.
  return NVIDIA_API_KEY.length > 0;
}

function buildNvidiaPrompt(
  command: string,
  currentCode: string,
  language: LanguageConfig,
  history: ConversationEntry[],
): string {
  const isEnglish = language.code.startsWith('en');
  const langInstruction = isEnglish
    ? 'Write the EXPLANATION in English.'
    : `CRITICAL LANGUAGE RULE: The user speaks ${language.name} (${language.nativeName}).
- ALWAYS write CODE in English (JavaScript/React/JSX variable names, HTML tags, Tailwind classes).
- ALWAYS write the EXPLANATION section in ${language.name} (${language.nativeName} script).
- The user's voice command may be in ${language.nativeName} script — understand it and respond accordingly.
- Do NOT translate code keywords, variable names, or class names to ${language.name}.`;

  const recentHistory = history.slice(-6).map((entry) => {
    if (entry.role === 'user') return `User: ${entry.command}`;
    return `Assistant (${entry.action}): ${entry.explanation}`;
  }).join('\n');

  return `You are a voice-controlled coding assistant that builds UI components.
You support multiple languages including Tamil (தமிழ்), Hindi (हिन्दी), and English.

LANGUAGE: ALWAYS use React JSX + Tailwind CSS. Never Python or vanilla JS unless user explicitly asks.

Respond using this EXACT format. NO markdown, NO \`\`\` fences:

---ACTION---
generate | modify | explain | fix
---CODE---
(raw code only — no \`\`\`)
---EXPLAIN---
(1-3 sentences)

CODE FORMAT — output a FULL, ORGANIZED React JSX file (like a real .tsx/.jsx file):
1. Imports at the top (e.g. import { useState } from 'react'; when using hooks).
2. One main component with clear structure; use 2-space indent and blank lines between sections.
3. Named function: function MyComponent() { ... } with readable JSX inside (not one long line).
4. End with: export default MyComponent;
Do NOT output a single inline function or messy/minified code. The user wants clean, organized React they can read and edit.

Tailwind: rounded-md, shadow-sm, p-4, gap-4, text-sm, font-medium, bg-slate-900, text-white, border-slate-300. Keep layout clear with flex/grid and spacing.

Rules:
- generate: create a full, organized React+Tailwind component file
- modify: update existing code and keep it organized
- explain: describe code (no CODE section)
- fix: correct errors and keep formatting clean
- ${langInstruction}

${recentHistory ? `Recent conversation:\n${recentHistory}\n` : ''}
Current code:
\`\`\`
${currentCode || '(empty file)'}
\`\`\`

Voice command: "${command}"

Respond using the marker format:`;
}

interface ParsedMarkers {
  action: string;
  code: string;
  explanation: string;
}

function stripCodeFences(code: string): string {
  return code
    .replace(/^```\w*\s*\n?/gm, '')
    .replace(/\n?```\s*$/gm, '')
    .replace(/^```\s*/g, '')
    .replace(/\s*```$/g, '')
    .trim();
}

function parseMarkers(text: string): ParsedMarkers {
  const actionMatch = text.match(/---ACTION---\s*([\s\S]*?)(?=---CODE---|---EXPLAIN---|$)/);
  const codeMatch = text.match(/---CODE---\s*([\s\S]*?)(?=---EXPLAIN---|$)/);
  const explainMatch = text.match(/---EXPLAIN---\s*([\s\S]*?)$/);

  let code = codeMatch?.[1]?.trim() ?? '';
  code = stripCodeFences(code);
  // Keep imports and export default so the editor shows a full, organized React file

  return {
    action: (actionMatch?.[1]?.trim() ?? 'generate').toLowerCase(),
    code,
    explanation: explainMatch?.[1]?.trim() ?? '',
  };
}

function splitSentences(text: string): { complete: string[]; remainder: string } {
  const sentenceEnders = /([.!?]\s+)/;
  const parts = text.split(sentenceEnders);
  const complete: string[] = [];
  let buffer = '';

  for (let i = 0; i < parts.length; i++) {
    buffer += parts[i];
    if (sentenceEnders.test(parts[i])) {
      complete.push(buffer);
      buffer = '';
    }
  }

  return { complete, remainder: buffer };
}

export async function processWithNvidia(
  command: string,
  currentCode: string,
  language: LanguageConfig,
  history: ConversationEntry[],
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
  nvidiaModel: NvidiaModelId = DEFAULT_NVIDIA_MODEL,
): Promise<void> {
  const prompt = buildNvidiaPrompt(command, currentCode, language, history);

  let fullText = '';
  let lastCodeEmitted = '';
  let lastExplainEmitted = '';
  let actionEmitted = false;

  try {
    const response = await fetch(NVIDIA_CHAT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${NVIDIA_API_KEY}`,
      },
      body: JSON.stringify({
        model: nvidiaModel,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        top_p: 0.7,
        max_tokens: 4096,
        stream: true,
      }),
      signal,
    });

    if (!response.ok) {
      throw new Error(`NVIDIA API error: ${response.status} ${response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body from NVIDIA API');

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      if (signal?.aborted) break;

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Parse SSE lines
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (!content) continue;

          fullText += content;

          const markers = parseMarkers(fullText);

          if (!actionEmitted && markers.action) {
            actionEmitted = true;
            callbacks.onAction(markers.action);
          }

          if (markers.code && markers.code !== lastCodeEmitted) {
            lastCodeEmitted = markers.code;
            callbacks.onCodeChunk(markers.code);
          }

          if (markers.explanation && markers.explanation !== lastExplainEmitted) {
            const newText = markers.explanation.slice(lastExplainEmitted.length);
            const sentences = splitSentences(newText);
            if (sentences.complete.length > 0) {
              const completedText = sentences.complete.join('');
              lastExplainEmitted += completedText;
              for (const sentence of sentences.complete) {
                callbacks.onExplanationChunk(sentence.trim());
              }
            }
          }
        } catch {
          // Skip malformed SSE chunks
        }
      }
    }

    // Final parse
    const finalParsed = parseMarkers(fullText);
    if (finalParsed.explanation.length > lastExplainEmitted.length) {
      const remaining = finalParsed.explanation.slice(lastExplainEmitted.length).trim();
      if (remaining) {
        callbacks.onExplanationChunk(remaining);
      }
    }
    if (finalParsed.code && finalParsed.code !== lastCodeEmitted) {
      callbacks.onCodeChunk(finalParsed.code);
    }

    callbacks.onComplete(finalParsed.code || currentCode, finalParsed.explanation);
  } catch (err) {
    if (signal?.aborted) return;
    callbacks.onError(err instanceof Error ? err : new Error(String(err)));
  }
}
