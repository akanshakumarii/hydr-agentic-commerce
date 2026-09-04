const BASE = import.meta.env.VITE_API_BASE || '/api';

class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request(path, { method = 'GET', body, headers = {} } = {}) {
  let res;
  const url = `${BASE}${path}`;
  try {
    res = await fetch(url, {
      method,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    // Network failure (backend down, offline, CORS): never let this crash the UI,
    // but DO say what URL we tried — "could not reach X" is undebuggable otherwise.
    console.error(`[HYDR] Request to ${url} failed:`, err.message);
    throw new ApiError(
      0,
      'network_error',
      `Could not reach HYDR at ${BASE} right now. Check that the backend is running and reachable, and try again.`
    );
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    // No JSON body (e.g. 204) — fine.
  }

  if (!res.ok) {
    throw new ApiError(res.status, data?.error || 'error', data?.message || 'Something went wrong. Please try again.');
  }
  return data;
}

export const api = {
  get: (path) => request(path),
  post: (path, body, headers) => request(path, { method: 'POST', body, headers }),
  patch: (path, body) => request(path, { method: 'PATCH', body }),
  delete: (path) => request(path, { method: 'DELETE' }),
};

export { ApiError };
