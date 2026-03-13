/**
 * Simple IndexedDB wrapper for storing PDF File objects between
 * the Create Project wizard and the workspace page.
 *
 * sessionStorage can't hold binary data, so we use IndexedDB.
 */

const DB_NAME = 'takeoff-pdf-store';
const STORE_NAME = 'files';
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Store one or more PDF files keyed by project ID */
export async function storePdfFiles(projectId: string, files: File[]): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  tx.objectStore(STORE_NAME).put(files, projectId);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Retrieve stored PDF files for a project (returns empty array if none) */
export async function getPdfFiles(projectId: string): Promise<File[]> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const req = tx.objectStore(STORE_NAME).get(projectId);
  return new Promise((resolve) => {
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => resolve([]);
  });
}

/** Clean up stored files after they've been loaded */
export async function clearPdfFiles(projectId: string): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(projectId);
  } catch {
    // Ignore cleanup errors
  }
}
