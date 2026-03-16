/**
 * Feature 5: Multi-file projects + persistence via IndexedDB
 */

export interface ProjectFile {
  name: string;
  content: string;
  language: string;
}

export interface Project {
  id: string;
  name: string;
  files: ProjectFile[];
  activeFile: string;
  createdAt: number;
  updatedAt: number;
}

const DB_NAME = 'voicecode-db';
const DB_VERSION = 1;
const STORE_NAME = 'projects';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveProject(project: Project): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put({ ...project, updatedAt: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadProject(id: string): Promise<Project | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).get(id);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });
}

export async function listProjects(): Promise<Project[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function deleteProject(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function createDefaultProject(name = 'Untitled'): Project {
  return {
    id: crypto.randomUUID(),
    name,
    files: [
      {
        name: 'main.tsx',
        content: `// Start by saying a voice command, e.g.:\n// "Create a React login component"\n`,
        language: 'typescript',
      },
    ],
    activeFile: 'main.tsx',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function detectLanguage(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    html: 'html', css: 'css', json: 'json', py: 'python', md: 'markdown',
  };
  return map[ext] ?? 'plaintext';
}

export function exportProjectAsJSON(project: Project): string {
  return JSON.stringify(project, null, 2);
}

export function importProjectFromJSON(json: string): Project {
  const parsed = JSON.parse(json) as Project;
  return { ...parsed, id: crypto.randomUUID(), updatedAt: Date.now() };
}
