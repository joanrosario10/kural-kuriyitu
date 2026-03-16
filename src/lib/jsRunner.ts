/**
 * JavaScript code execution in a Web Worker sandbox.
 * Isolates user code from the main thread with a 5-second timeout.
 */

export interface LogEntry {
  type: 'log' | 'error' | 'warn';
  args: string[];
}

export interface ExecutionResult {
  success: boolean;
  result?: string;
  error?: string;
  logs: LogEntry[];
  duration: number;
}

const WORKER_CODE = `
self.onmessage = function(e) {
  var logs = [];
  var startTime = Date.now();

  // Override console methods
  self.console = {
    log: function() {
      var args = Array.prototype.slice.call(arguments).map(function(a) {
        return typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a);
      });
      logs.push({ type: 'log', args: args });
    },
    error: function() {
      var args = Array.prototype.slice.call(arguments).map(function(a) {
        return typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a);
      });
      logs.push({ type: 'error', args: args });
    },
    warn: function() {
      var args = Array.prototype.slice.call(arguments).map(function(a) {
        return typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a);
      });
      logs.push({ type: 'warn', args: args });
    },
    info: function() { self.console.log.apply(null, arguments); },
    debug: function() { self.console.log.apply(null, arguments); },
    table: function(data) { self.console.log(JSON.stringify(data, null, 2)); },
    clear: function() { logs = []; }
  };

  try {
    // Strip import/export for standalone execution
    var code = e.data.code
      .replace(/import\\s+[\\s\\S]*?from\\s+['\"][^'\"]*['\"]\\s*;?\\s*/g, '')
      .replace(/export\\s+default\\s+/g, '')
      .replace(/export\\s+\\{[^}]*\\}\\s*;?\\s*/g, '')
      .replace(/export\\s+/g, '');

    var result = (0, eval)(code);
    var duration = Date.now() - startTime;
    self.postMessage({
      success: true,
      result: result !== undefined ? String(result) : undefined,
      logs: logs,
      duration: duration
    });
  } catch (err) {
    var duration = Date.now() - startTime;
    self.postMessage({
      success: false,
      error: err.message || String(err),
      logs: logs,
      duration: duration
    });
  }
};
`;

let workerBlobUrl: string | null = null;

function getWorkerUrl(): string {
  if (!workerBlobUrl) {
    const blob = new Blob([WORKER_CODE], { type: 'application/javascript' });
    workerBlobUrl = URL.createObjectURL(blob);
  }
  return workerBlobUrl;
}

export function runJS(code: string, timeoutMs = 5000): Promise<ExecutionResult> {
  return new Promise((resolve) => {
    const worker = new Worker(getWorkerUrl());
    const startTime = Date.now();

    const timeout = setTimeout(() => {
      worker.terminate();
      resolve({
        success: false,
        error: `Execution timed out after ${timeoutMs / 1000}s`,
        logs: [],
        duration: Date.now() - startTime,
      });
    }, timeoutMs);

    worker.onmessage = (e: MessageEvent<ExecutionResult>) => {
      clearTimeout(timeout);
      worker.terminate();
      resolve(e.data);
    };

    worker.onerror = (e) => {
      clearTimeout(timeout);
      worker.terminate();
      resolve({
        success: false,
        error: e.message || 'Worker error',
        logs: [],
        duration: Date.now() - startTime,
      });
    };

    worker.postMessage({ code });
  });
}
