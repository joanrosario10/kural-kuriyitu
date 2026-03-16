import { GoogleGenAI } from '@google/genai';
import type { LanguageConfig } from './languages';
import { isNvidiaAvailable, processWithNvidia, type NvidiaModelId } from './nvidiaFallback';

export type VoiceCommandAction = 'generate' | 'modify' | 'explain' | 'fix';

export interface VoiceCommandResult {
  action: VoiceCommandAction;
  code?: string;
  explanation: string;
  line?: number;
}

export interface ConversationEntry {
  id: string;
  timestamp: number;
  role: 'user' | 'assistant';
  command?: string;
  action?: string;
  code?: string;
  explanation?: string;
}

export interface StreamCallbacks {
  onAction: (action: string) => void;
  onCodeChunk: (accumulatedCode: string) => void;
  onExplanationChunk: (sentence: string) => void;
  onComplete: (finalCode: string, fullExplanation: string) => void;
  onError: (error: Error) => void;
}

export const AI_MODELS = [
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', description: 'Best free tier quota' },
  { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash Preview', description: 'Fast, balanced' },
  { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash', description: 'Quick responses' },
  { id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro', description: 'More capable' },
] as const;

export type AIModelId = (typeof AI_MODELS)[number]['id'];

const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true';

function buildSystemPrompt(language: LanguageConfig): string {
  const langInstruction = language.code.startsWith('en')
    ? 'Write the EXPLANATION in English.'
    : `CRITICAL LANGUAGE RULE: The user speaks ${language.name} (${language.nativeName}).
- Their voice command may be in ${language.nativeName} script — understand it and respond accordingly.
- ALWAYS write CODE in English (JavaScript/React/JSX variable names, HTML tags, Tailwind classes).
- ALWAYS write the ---EXPLAIN--- section in fluent, natural ${language.name} (${language.nativeName} script).
- Do NOT translate code keywords, variable names, or CSS class names to ${language.name}.
- Make the explanation sound conversational and fluent in ${language.name}, not robotic.`;

  return `You are a voice-controlled coding assistant. You build UI components.
You support Tamil (தமிழ்), Hindi (हिन्दी), and English.

LANGUAGE RULE: ALWAYS generate React JSX code with Tailwind CSS. NEVER use Python, vanilla JS, or plain HTML unless the user EXPLICITLY says "python", "vanilla js", or "html only".

You MUST respond using this EXACT marker format. NO markdown, NO \`\`\` code fences, NO language labels:

---ACTION---
generate | modify | explain | fix
---CODE---
(raw code here — no \`\`\`, no markdown — omit this section for explain action)
---EXPLAIN---
(1-3 sentence spoken explanation)

CODE FORMAT RULES — output a FULL, ORGANIZED React JSX file:
- Output ONLY raw code after ---CODE---. Never \`\`\`javascript, never \`\`\`jsx, never any fence.
- Structure the file like a real .tsx/.jsx file:
  1. Imports at the top (e.g. import { useState } from 'react'; if the component uses hooks).
  2. One main component; split into smaller subcomponents only when it keeps the code clear.
  3. Clean formatting: 2-space indent, blank line between logical sections, no long one-liners.
  4. End with: export default ComponentName;
- Prefer named function components: function LoginForm() { ... } with clear structure inside.
- Keep JSX readable: one prop per line when there are many; close tags on their own line for nested content.
- Do NOT output a single inline function or minified-looking code. The user wants organized, maintainable React.

STYLE GUIDE (Tailwind + clean UI):
- Tailwind CSS is loaded. Use utility classes in className.
- Buttons: className="inline-flex items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 transition-colors"
- Inputs: className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2"
- Cards: className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
- Layout: flex, grid, gap-4, p-4, space-y-4. Keep sections visually separated.

Rules:
- "generate": create a full, organized React+Tailwind component file from scratch
- "modify": update existing code while keeping it organized
- "explain": describe what the code does — NO ---CODE--- section
- "fix": correct errors and keep formatting clean
- ${langInstruction}`;
}

function buildHistoryPrompt(history: ConversationEntry[]): string {
  const recent = history.slice(-10);
  if (recent.length === 0) return '';

  const lines = recent.map((entry) => {
    if (entry.role === 'user') {
      return `[User]: ${entry.command}`;
    }
    const codeSummary = entry.code
      ? `\n[Code snapshot]: ${entry.code.split('\n').slice(-200).join('\n')}`
      : '';
    return `[Assistant] (${entry.action}): ${entry.explanation}${codeSummary}`;
  });

  return `\nConversation history:\n${lines.join('\n\n')}\n`;
}

function buildPrompt(
  command: string,
  currentCode: string,
  language: LanguageConfig,
  history: ConversationEntry[],
): string {
  const systemPrompt = buildSystemPrompt(language);
  const historyPrompt = buildHistoryPrompt(history);

  return `${systemPrompt}
${historyPrompt}
Current code:
\`\`\`
${currentCode || '(empty file)'}
\`\`\`

Voice command: "${command}"

Respond using the marker format above:`;
}

// --- Marker parser ---

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

// --- Streaming ---

export async function processVoiceCommandStream(
  command: string,
  currentCode: string,
  apiKey: string,
  model: AIModelId,
  language: LanguageConfig,
  history: ConversationEntry[],
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
  nvidiaModel?: NvidiaModelId,
): Promise<void> {
  if (USE_MOCK) {
    await mockStream(command, currentCode, callbacks, signal);
    return;
  }

  const ai = new GoogleGenAI({ apiKey });
  const prompt = buildPrompt(command, currentCode, language, history);

  let fullText = '';
  let lastCodeEmitted = '';
  let lastExplainEmitted = '';
  let actionEmitted = false;

  try {
    const response = await ai.models.generateContentStream({
      model,
      contents: prompt,
      config: { maxOutputTokens: 4096 },
    });

    for await (const chunk of response) {
      if (signal?.aborted) break;

      const chunkText = chunk.text ?? '';
      fullText += chunkText;

      // Try to parse markers from accumulated text
      const parsed = parseMarkers(fullText);

      // Emit action once
      if (!actionEmitted && parsed.action) {
        actionEmitted = true;
        callbacks.onAction(parsed.action);
      }

      // Emit code chunks (cumulative)
      if (parsed.code && parsed.code !== lastCodeEmitted) {
        lastCodeEmitted = parsed.code;
        callbacks.onCodeChunk(parsed.code);
      }

      // Emit explanation sentences
      if (parsed.explanation && parsed.explanation !== lastExplainEmitted) {
        const newText = parsed.explanation.slice(lastExplainEmitted.length);
        const sentences = splitSentences(newText);
        if (sentences.complete.length > 0) {
          const completedText = sentences.complete.join('');
          lastExplainEmitted += completedText;
          for (const sentence of sentences.complete) {
            callbacks.onExplanationChunk(sentence.trim());
          }
        }
      }
    }

    // Final parse — emit any remaining explanation
    const finalParsed = parseMarkers(fullText);
    if (finalParsed.explanation.length > lastExplainEmitted.length) {
      const remaining = finalParsed.explanation.slice(lastExplainEmitted.length).trim();
      if (remaining) {
        callbacks.onExplanationChunk(remaining);
      }
    }

    // Emit final code if not yet emitted
    if (finalParsed.code && finalParsed.code !== lastCodeEmitted) {
      callbacks.onCodeChunk(finalParsed.code);
    }

    callbacks.onComplete(finalParsed.code || currentCode, finalParsed.explanation);
  } catch (err) {
    if (signal?.aborted) return;

    // Fallback to NVIDIA when Gemini fails (429, network error, etc.)
    if (isNvidiaAvailable()) {
      console.warn('[Gemini] Failed, falling back to NVIDIA:', err instanceof Error ? err.message : err);
      try {
        await processWithNvidia(command, currentCode, language, history, callbacks, signal, nvidiaModel);
        return;
      } catch (nvidiaErr) {
        console.error('[NVIDIA fallback] Also failed:', nvidiaErr);
      }
    }

    callbacks.onError(err instanceof Error ? err : new Error(String(err)));
  }
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

// --- Non-streaming fallback ---

export async function processVoiceCommand(
  command: string,
  currentCode: string,
  apiKey: string,
  model: AIModelId = 'gemini-3-flash-preview',
  language?: LanguageConfig,
  history?: ConversationEntry[],
): Promise<VoiceCommandResult> {
  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 600));
    return getMockResult(command, currentCode || '(empty file)');
  }

  const ai = new GoogleGenAI({ apiKey });
  const defaultLang = { code: 'en-US', name: 'English (US)', nativeName: 'English', speechLang: 'en-US', ttsLang: 'en-US' };
  const prompt = buildPrompt(command, currentCode, language ?? defaultLang, history ?? []);

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
  });

  const text = response.text?.trim() ?? '';
  const parsed = parseMarkers(text);

  return {
    action: parsed.action as VoiceCommandAction,
    code: parsed.code || undefined,
    explanation: parsed.explanation || 'Done.',
  };
}

// --- Mock streaming ---

async function mockStream(
  command: string,
  currentCode: string,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  const result = getMockResult(command, currentCode);
  callbacks.onAction(result.action);

  if (result.code) {
    const lines = result.code.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (signal?.aborted) return;
      await new Promise((r) => setTimeout(r, 50));
      callbacks.onCodeChunk(lines.slice(0, i + 1).join('\n'));
    }
  }

  await new Promise((r) => setTimeout(r, 200));
  if (!signal?.aborted) {
    callbacks.onExplanationChunk(result.explanation);
    callbacks.onComplete(result.code ?? currentCode, result.explanation);
  }
}

function getMockResult(command: string, currentCode: string): VoiceCommandResult {
  const cmd = command.toLowerCase();
  const hasCode = currentCode.trim().length > 0 && !currentCode.includes('(empty file)');

  if (cmd.includes('explain') || cmd.includes('what does') || cmd.includes('விளக்கு') || cmd.includes('समझाओ')) {
    return {
      action: 'explain',
      explanation: hasCode
        ? 'This code handles form input and validation with state for form fields and basic login structure.'
        : 'There is no code in the editor yet. Say create or generate to add some.',
    };
  }

  if (cmd.includes('fix') || cmd.includes('bug') || cmd.includes('error') || cmd.includes('பிழை') || cmd.includes('ठीक')) {
    return {
      action: 'fix',
      code: currentCode.replace(/console\.log\(/g, 'console.error(') || 'function fixed() { return true; }',
      explanation: 'I applied a fix to address the issue. Check the updated code.',
    };
  }

  if (cmd.includes('login') || cmd.includes('form') || cmd.includes('email') || cmd.includes('லாகின்') || cmd.includes('लॉगिन')) {
    return {
      action: 'generate',
      code: `function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    console.log({ email, password });
  }

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email"
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
      />
      <button type="submit">Log in</button>
    </form>
  );
}`,
      explanation: 'I created a React login form component with email and password fields.',
    };
  }

  return {
    action: 'modify',
    code: currentCode || '// Your code will appear here',
    explanation: `I understood "${command}". In mock mode, I returned the current code.`,
  };
}
