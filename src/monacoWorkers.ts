/**
 * Configure Monaco to use bundled workers so we don't rely on main-thread fallback
 * and avoid "define MonacoEnvironment.getWorkerUrl or MonacoEnvironment.getWorker".
 * Must be imported before any Monaco usage (e.g. in main.tsx before App).
 */

// Vite bundles these as separate worker chunks
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import TsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import CssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import HtmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';

(self as Window & { MonacoEnvironment?: { getWorker(_: string, label: string): Worker } }).MonacoEnvironment = {
  getWorker(_, label: string): Worker {
    if (label === 'json') return new JsonWorker();
    if (label === 'css' || label === 'scss' || label === 'less') return new CssWorker();
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new HtmlWorker();
    if (label === 'typescript' || label === 'javascript') return new TsWorker();
    return new EditorWorker();
  },
};
