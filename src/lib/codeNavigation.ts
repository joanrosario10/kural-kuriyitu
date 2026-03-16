/**
 * Feature 4: Voice code navigation & editing
 * Parses voice commands for navigation/editing actions and maps them to Monaco operations.
 */

export type NavAction =
  | { type: 'goto-line'; line: number }
  | { type: 'goto-function'; name: string }
  | { type: 'select-lines'; start: number; end: number }
  | { type: 'delete-lines'; start: number; end: number }
  | { type: 'insert-at-line'; line: number; text: string }
  | null;

/**
 * Parses a voice transcript for navigation commands.
 * Returns a NavAction if matched, null if no navigation command found.
 */
export function parseNavCommand(transcript: string): NavAction {
  const t = transcript.toLowerCase().trim();

  // "go to line 15" / "jump to line 15"
  const gotoLine = t.match(/(?:go\s*to|jump\s*to|move\s*to)\s*line\s*(\d+)/i);
  if (gotoLine) {
    return { type: 'goto-line', line: parseInt(gotoLine[1], 10) };
  }

  // "go to function login" / "find function handleSubmit"
  const gotoFunc = t.match(/(?:go\s*to|jump\s*to|find)\s*(?:function|method|class)\s+(\w+)/i);
  if (gotoFunc) {
    return { type: 'goto-function', name: gotoFunc[1] };
  }

  // "select lines 12 to 18" / "select line 5 through 10"
  const selectLines = t.match(/select\s*lines?\s*(\d+)\s*(?:to|through|-)\s*(\d+)/i);
  if (selectLines) {
    return {
      type: 'select-lines',
      start: parseInt(selectLines[1], 10),
      end: parseInt(selectLines[2], 10),
    };
  }

  // "delete lines 12 to 18" / "remove lines 5 to 10"
  const deleteLines = t.match(/(?:delete|remove)\s*lines?\s*(\d+)\s*(?:to|through|-)\s*(\d+)/i);
  if (deleteLines) {
    return {
      type: 'delete-lines',
      start: parseInt(deleteLines[1], 10),
      end: parseInt(deleteLines[2], 10),
    };
  }

  // "delete line 5" / "remove line 12"
  const deleteSingle = t.match(/(?:delete|remove)\s*line\s*(\d+)/i);
  if (deleteSingle) {
    const line = parseInt(deleteSingle[1], 10);
    return { type: 'delete-lines', start: line, end: line };
  }

  // "insert console.log here" → inserts at cursor (line 1 default)
  const insertHere = t.match(/insert\s+(.+?)(?:\s+here|\s+at\s+line\s+(\d+))?$/i);
  if (insertHere) {
    const text = insertHere[1].trim();
    const line = insertHere[2] ? parseInt(insertHere[2], 10) : 1;
    return { type: 'insert-at-line', line, text };
  }

  return null;
}

/**
 * Finds the line number of a function/class/method definition in code.
 */
export function findSymbolLine(code: string, symbolName: string): number | null {
  const lines = code.split('\n');
  const patterns = [
    new RegExp(`(?:function|const|let|var|class)\\s+${symbolName}\\b`, 'i'),
    new RegExp(`${symbolName}\\s*[=(]`, 'i'),
    new RegExp(`\\b${symbolName}\\b.*(?:=>|\\{)`, 'i'),
  ];

  for (let i = 0; i < lines.length; i++) {
    for (const pattern of patterns) {
      if (pattern.test(lines[i])) {
        return i + 1; // Monaco is 1-indexed
      }
    }
  }
  return null;
}

/**
 * Applies a delete-lines action to code string.
 * Returns new code with the specified lines removed.
 */
export function deleteLinesFromCode(code: string, start: number, end: number): string {
  const lines = code.split('\n');
  const s = Math.max(0, start - 1); // Convert to 0-indexed
  const e = Math.min(lines.length, end);
  return [...lines.slice(0, s), ...lines.slice(e)].join('\n');
}

/**
 * Inserts text at a specific line in code.
 * Returns new code with the text inserted.
 */
export function insertLineInCode(code: string, line: number, text: string): string {
  const lines = code.split('\n');
  const idx = Math.max(0, Math.min(lines.length, line - 1));
  return [...lines.slice(0, idx), text, ...lines.slice(idx)].join('\n');
}
