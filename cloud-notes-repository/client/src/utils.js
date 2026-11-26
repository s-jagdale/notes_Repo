import { api } from './api.js';

export function formatSize(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const formatDate = (iso) =>
  new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

// Every subject gets its own binder-spine colour. The same subject name always gives the same colour
// (a simple hash of the name), so colours need no storage and never change.
const SPINE_COLORS = ['#3340C8', '#0B7F61', '#C2453D', '#7A4FE0', '#A85F00', '#0F7FA8', '#B83272'];
export function subjectColor(subject = '') {
  let h = 0;
  for (const ch of subject.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return SPINE_COLORS[h % SPINE_COLORS.length];
}

// localStorage can throw (private mode, blocked storage), so always wrap it.
export const store = {
  get(key, fallback = null) {
    try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, value); } catch { /* storage not available: ignore */ }
  }
};

/**
 * Ask the backend for a temporary signed S3 link, then open it.
 * "view" opens the PDF in a new tab, "download" saves it.
 */
export async function openNote(note, mode) {
  // Open the tab immediately (inside the click) so the browser's pop-up blocker allows it.
  const tab = mode === 'view' ? window.open('', '_blank') : null;
  try {
    const { url } = await api.get(`/api/notes/${note.id}/url?mode=${mode}`);
    if (tab) {
      tab.location.href = url;
    } else {
      const a = document.createElement('a');
      a.href = url;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
  } catch (err) {
    tab?.close();
    throw err;
  }
}
