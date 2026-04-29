import { showToast } from './utils/toast.js';

let TOKEN = localStorage.getItem('dash_token') || '';
let USERNAME = localStorage.getItem('dash_user') || '';
let apiQueue = Promise.resolve();
let apiConsecutiveErrors = 0;
let doLogoutCallback = null;

/** Register the logout callback (called by main.js) */
export function setLogoutCallback(fn) {
  doLogoutCallback = fn;
}

/** Get the current auth token */
export function getToken() { return TOKEN; }

/** Get the current username */
export function getUsername() { return USERNAME; }

/** Set auth credentials after login */
export function setAuth(token, username) {
  TOKEN = token;
  USERNAME = username;
  localStorage.setItem('dash_token', token);
  localStorage.setItem('dash_user', username);
}

/** Clear auth credentials */
export function clearAuth() {
  TOKEN = '';
  USERNAME = '';
  localStorage.removeItem('dash_token');
  localStorage.removeItem('dash_user');
}

/**
 * API helper — serialized queue with retry + exponential backoff.
 * All requests go to /api/* which nginx reverse-proxies to the etheos server.
 */
export function api(path, opts = {}) {
  return new Promise((resolve, reject) => {
    apiQueue = apiQueue.then(async () => {
      const MAX_RETRIES = 3;
      const BASE_DELAY = 300;
      const bodySnapshot = opts.body && typeof opts.body === 'object'
        ? JSON.stringify(opts.body)
        : opts.body;

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        if (attempt > 0) await new Promise(r => setTimeout(r, BASE_DELAY * Math.pow(2, attempt - 1)));

        const reqOpts = {
          method: opts.method || 'GET',
          headers: { ...opts.headers, 'Authorization': 'Bearer ' + TOKEN },
        };
        if (bodySnapshot) {
          reqOpts.headers['Content-Type'] = 'application/json';
          reqOpts.body = bodySnapshot;
        }

        const ctrl = new AbortController();
        const timeoutMs = typeof opts.timeout === 'number' ? opts.timeout : 8000;
        const timer = setTimeout(() => ctrl.abort(), timeoutMs);
        reqOpts.signal = ctrl.signal;

        try {
          const r = await fetch(path, reqOpts);
          clearTimeout(timer);
          if (r.status === 401) {
            if (doLogoutCallback) doLogoutCallback();
            throw new Error('Session expired');
          }
          const data = await r.json();
          if (!r.ok) {
            // Surface status + parsed body so callers (e.g. pub-editor save)
            // can branch on 409 / 413 etc. without re-fetching.
            const err = new Error(data.error || ('HTTP ' + r.status));
            err.status = r.status;
            err.body = data;
            throw err;
          }
          if (apiConsecutiveErrors >= 3) { showToast('Connection restored', 'success'); }
          apiConsecutiveErrors = 0;
          resolve(data);
          return;
        } catch (e) {
          clearTimeout(timer);
          if (e.message === 'Session expired') { reject(e); return; }
          // 4xx errors are deterministic — no value in retrying. (5xx and
          // network errors are retryable.)
          if (e.status >= 400 && e.status < 500) { reject(e); return; }
          if (attempt === MAX_RETRIES) {
            apiConsecutiveErrors++;
            if (apiConsecutiveErrors === 3) showToast('Server connection unstable — retrying automatically', 'error');
            reject(e);
            return;
          }
        }
      }
    }).catch(() => {});
  });
}
