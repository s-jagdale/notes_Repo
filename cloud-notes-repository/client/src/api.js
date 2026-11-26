// The ONLY place where the frontend talks to the backend (REST API over HTTP + JSON).
const BASE = import.meta.env.VITE_API_URL || '';
const TOKEN_KEY = 'notes_token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));

export class ApiError extends Error {
  constructor(message, status = 0, code = '') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function handleResponse(status, data, hadToken) {
  if (status >= 200 && status < 300) return data;
  if (status === 401 && hadToken) window.dispatchEvent(new Event('auth-expired'));
  throw new ApiError(data?.error || `Request failed (${status})`, status, data?.code);
}

async function request(path, { method = 'GET', body } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw new ApiError('Cannot reach the server. Is the backend running? (run "npm run dev" inside the server folder)');
  }
  const data = await res.json().catch(() => ({}));
  return handleResponse(res.status, data, Boolean(token));
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body }),
  del: (path) => request(path, { method: 'DELETE' }),

  // XMLHttpRequest (instead of fetch) because it can report upload progress.
  upload(path, formData, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', BASE + path);
      const token = getToken();
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(Math.round((e.loaded / e.total) * 100));
      xhr.onerror = () => reject(new ApiError('Cannot reach the server. Is the backend running?'));
      xhr.onload = () => {
        let data = {};
        try {
          data = JSON.parse(xhr.responseText);
        } catch {
          /* empty */
        }
        try {
          resolve(handleResponse(xhr.status, data, Boolean(token)));
        } catch (err) {
          reject(err);
        }
      };
      xhr.send(formData);
    });
  }
};
