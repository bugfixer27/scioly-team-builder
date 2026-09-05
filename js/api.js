// Transport layer — follows API_CONTRACT.md exactly.
// GET for reads; POST bodies are JSON *strings* sent as text/plain (never application/json,
// which would trigger a CORS preflight that Apps Script cannot answer).

const TIMEOUT_MS = 30000;

function cfg() {
  const c = (typeof window !== 'undefined' && window.TEAMBUILDER_CONFIG) || {};
  return { url: String(c.apiUrl || ''), token: String(c.token || '') };
}

export class ApiError extends Error {
  constructor(message, payload) { super(message); this.name = 'ApiError'; this.payload = payload || null; }
}

async function run(fetchPromise, action) {
  let res;
  try {
    res = await fetchPromise;
  } catch (err) {
    throw new ApiError(`Could not reach the Team Builder API (${action}): ${err && err.name === 'AbortError' ? 'timed out' : (err && err.message) || err}`);
  }
  let json;
  try {
    json = await res.json();
  } catch (err) {
    throw new ApiError(`API returned a non-JSON response for ${action} (HTTP ${res.status}).`);
  }
  if (!json || typeof json !== 'object') throw new ApiError(`API returned an empty response for ${action}.`);
  // Conflicts are returned to the caller (they carry state); every other failure throws.
  if (json.ok === false && !json.conflict) throw new ApiError(json.error || `API error during ${action}.`, json);
  return json;
}

function withTimeout(init) {
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  if (ctl) { setTimeout(() => ctl.abort(), TIMEOUT_MS); init.signal = ctl.signal; }
  return init;
}

export function apiGet(action, params = {}) {
  const { url, token } = cfg();
  const qs = new URLSearchParams({ token, action, ...params });
  return run(fetch(`${url}?${qs}`, withTimeout({ method: 'GET' })), action);
}

export function apiPost(action, body = {}) {
  const { url, token } = cfg();
  return run(fetch(url, withTimeout({
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ token, action, ...body })
  })), action);
}

export function maskedApiUrl() {
  const { url, token } = cfg();
  return { url, token: token ? token.slice(0, 2) + '•'.repeat(Math.max(3, token.length - 2)) : '(none)' };
}
