const HOOK_NAMES = [
  'useState',
  'useEffect',
  'useRef',
  'useMemo',
  'useCallback',
  'useReducer',
  'useContext',
  'useTransition',
  'useDeferredValue',
] as const;

function stripCodeFences(code: string): string {
  return code
    .replace(/^```\w*\s*\n?/gm, '')
    .replace(/\n?```\s*$/gm, '')
    .replace(/^```\s*/g, '')
    .replace(/\s*```$/g, '')
    .trim();
}

function inferComponentName(code: string): string | null {
  const exportDefaultName = code.match(/export\s+default\s+([A-Z]\w*)/);
  if (exportDefaultName?.[1]) return exportDefaultName[1];

  const functionName = code.match(/function\s+([A-Z]\w*)\s*\(/);
  if (functionName?.[1]) return functionName[1];

  const constName = code.match(/const\s+([A-Z]\w*)\s*=\s*(?:\(|async\s*\(|async\s+)?/);
  if (constName?.[1]) return constName[1];

  return null;
}

function detectHooks(code: string): string[] {
  return HOOK_NAMES.filter((hook) =>
    new RegExp(`(?:\\b${hook}\\s*\\(|React\\.${hook}\\s*\\()`).test(code),
  );
}

function normalizeHookCalls(code: string, hooks: string[]): string {
  return hooks.reduce(
    (acc, hook) => acc.replace(new RegExp(`React\\.${hook}\\s*\\(`, 'g'), `${hook}(`),
    code,
  );
}

function buildReactImport(hooks: string[]): string {
  if (hooks.length === 0) return "import React from 'react';";
  return `import React, { ${hooks.join(', ')} } from 'react';`;
}

export function normalizeReactCode(code: string): string {
  let normalized = stripCodeFences(code);
  if (!normalized) return normalized;

  const looksLikeReact =
    /<[A-Za-z][\w-]*[\s/>]/.test(normalized) ||
    /\bclassName=/.test(normalized) ||
    /\bReact\./.test(normalized) ||
    /\buse(State|Effect|Ref|Memo|Callback|Reducer|Context|Transition|DeferredValue)\b/.test(normalized);

  if (!looksLikeReact) return normalized;

  const hooks = detectHooks(normalized);
  normalized = normalizeHookCalls(normalized, hooks);

  const hasReactImport = /import\s+.*from\s+['"]react['"]/.test(normalized);
  const componentName = inferComponentName(normalized) ?? 'GeneratedComponent';

  if (!inferComponentName(normalized) && /return\s*\(/.test(normalized)) {
    normalized = `function ${componentName}() {\n${normalized}\n}`;
  }

  if (!hasReactImport) {
    normalized = `${buildReactImport(hooks)}\n\n${normalized}`;
  }

  if (!/export\s+default\s+/.test(normalized)) {
    normalized = `${normalized}\n\nexport default ${componentName};`;
  }

  return normalized.trim();
}
