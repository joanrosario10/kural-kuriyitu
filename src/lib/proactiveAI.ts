/**
 * Feature 6: Proactive AI analysis + auto-debug
 * Runs background analysis on code changes and suggests fixes.
 */

import { GoogleGenAI } from '@google/genai';
import type { LanguageConfig } from './languages';

export interface ProactiveIssue {
  id: string;
  line: number;
  severity: 'warning' | 'error' | 'info';
  message: string;
  fix?: string; // Suggested fix code
}

const ANALYSIS_PROMPT = `You are a code reviewer. Analyze the following code for bugs, potential issues, and improvements.

Respond with a JSON array of issues. Each issue has:
- "line": number (the line number)
- "severity": "warning" | "error" | "info"
- "message": string (brief description, 1 sentence)
- "fix": string | null (fixed version of that line, or null if no auto-fix)

Only report real issues. Maximum 3 issues. If the code looks fine, return an empty array [].
Do NOT report style issues — only bugs, logic errors, and potential runtime errors.

Code:
\`\`\`
{CODE}
\`\`\`

Respond with JSON array only:`;

export async function analyzeCode(
  code: string,
  apiKey: string,
  model: string,
  _language: LanguageConfig,
): Promise<ProactiveIssue[]> {
  if (!code.trim() || code.includes('Start by saying') || !apiKey) {
    return [];
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const prompt = ANALYSIS_PROMPT.replace('{CODE}', code);

    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: { responseMimeType: 'application/json' },
    });

    const text = response.text?.trim() ?? '[]';
    const issues = JSON.parse(text) as Array<{
      line: number;
      severity: 'warning' | 'error' | 'info';
      message: string;
      fix: string | null;
    }>;

    return issues.map((issue) => ({
      id: crypto.randomUUID(),
      line: issue.line,
      severity: issue.severity,
      message: issue.message,
      fix: issue.fix ?? undefined,
    }));
  } catch {
    return [];
  }
}

/**
 * Applies a fix to a specific line in the code.
 */
export function applyFix(code: string, line: number, fix: string): string {
  const lines = code.split('\n');
  const idx = line - 1;
  if (idx >= 0 && idx < lines.length) {
    return [...lines.slice(0, idx), fix, ...lines.slice(idx + 1)].join('\n');
  }
  return code;
}

/**
 * Generates simple in-browser tests for the current code.
 */
export function generateTestCode(code: string): string {
  // Extract function names for basic test generation
  const funcMatches = code.matchAll(/(?:function|const|let)\s+(\w+)/g);
  const funcs = [...funcMatches].map((m) => m[1]).filter((n) => n.length > 2);

  if (funcs.length === 0) {
    return '// No testable functions found\nconsole.log("No tests to run");';
  }

  const tests = funcs.map((fn) => `
// Test: ${fn} exists and is callable
try {
  if (typeof ${fn} === 'function') {
    console.log('PASS: ${fn} is defined');
  } else if (typeof ${fn} !== 'undefined') {
    console.log('PASS: ${fn} is defined (value)');
  } else {
    console.error('FAIL: ${fn} is not defined');
  }
} catch(e) {
  console.error('FAIL: ${fn} threw: ' + e.message);
}`).join('\n');

  return `// Auto-generated tests\nconsole.log('Running tests...\\n');\n${tests}\n\nconsole.log('\\nTests complete.');`;
}
