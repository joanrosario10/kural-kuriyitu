/**
 * Python code execution via Pyodide (WebAssembly CPython).
 * Lazy-loads Pyodide from CDN on first use (~11MB).
 */

import type { ExecutionResult, LogEntry } from './jsRunner';

interface PyodideInterface {
  runPython: (code: string) => unknown;
  runPythonAsync: (code: string) => Promise<unknown>;
  loadPackage: (pkg: string | string[]) => Promise<void>;
  globals: Map<string, unknown>;
}

let pyodide: PyodideInterface | null = null;
let loadingPromise: Promise<void> | null = null;

export function isPyodideLoaded(): boolean {
  return pyodide !== null;
}

export function isPyodideLoading(): boolean {
  return loadingPromise !== null && pyodide === null;
}

export async function initPyodide(onProgress?: (msg: string) => void): Promise<void> {
  if (pyodide) return;
  if (loadingPromise) {
    await loadingPromise;
    return;
  }

  loadingPromise = (async () => {
    onProgress?.('Loading Python runtime...');

    // Dynamic import from CDN (no type declarations available)
    const pyodideUrl = 'https://cdn.jsdelivr.net/pyodide/v0.27.0/full/pyodide.mjs';
    const mod = await import(/* @vite-ignore */ pyodideUrl);
    const loadPyodideFn = mod.loadPyodide;

    pyodide = await loadPyodideFn({
      indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.27.0/full/',
    }) as PyodideInterface;

    onProgress?.('Python runtime ready');
  })();

  try {
    await loadingPromise;
  } catch (err) {
    loadingPromise = null;
    throw err;
  }
}

export async function runPython(code: string, timeoutMs = 10000): Promise<ExecutionResult> {
  const startTime = Date.now();
  const logs: LogEntry[] = [];

  try {
    await initPyodide();
    if (!pyodide) throw new Error('Pyodide failed to initialize');

    // Reset stdout/stderr capture
    pyodide.runPython(`
import sys, io
sys.stdout = io.StringIO()
sys.stderr = io.StringIO()
    `);

    // Run with timeout using AbortController pattern
    const resultPromise = pyodide.runPythonAsync(code);
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`Execution timed out after ${timeoutMs / 1000}s`)), timeoutMs);
    });

    let result: unknown;
    try {
      result = await Promise.race([resultPromise, timeoutPromise]);
    } catch (err) {
      const stdout = String(pyodide.runPython('sys.stdout.getvalue()') ?? '');
      const stderr = String(pyodide.runPython('sys.stderr.getvalue()') ?? '');
      if (stdout) logs.push({ type: 'log', args: [stdout] });
      if (stderr) logs.push({ type: 'error', args: [stderr] });
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        logs,
        duration: Date.now() - startTime,
      };
    }

    // Capture output
    const stdout = String(pyodide.runPython('sys.stdout.getvalue()') ?? '');
    const stderr = String(pyodide.runPython('sys.stderr.getvalue()') ?? '');
    if (stdout) logs.push({ type: 'log', args: [stdout] });
    if (stderr) logs.push({ type: 'error', args: [stderr] });

    return {
      success: true,
      result: result !== undefined && result !== null ? String(result) : undefined,
      logs,
      duration: Date.now() - startTime,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      logs,
      duration: Date.now() - startTime,
    };
  }
}

/**
 * Detect if code is Python based on content heuristics.
 */
export function looksLikePython(code: string): boolean {
  const pythonPatterns = [
    /^def\s+\w+\s*\(/m,
    /^class\s+\w+/m,
    /^import\s+\w+/m,
    /^from\s+\w+\s+import/m,
    /print\s*\(/,
    /:\s*$/m,
    /^\s+(?:if|for|while|try|except|with)\s+/m,
  ];
  const matches = pythonPatterns.filter((p) => p.test(code));
  return matches.length >= 2;
}
