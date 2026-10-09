const BASE = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000';

export class ApiError extends Error {
  constructor(status, messages) {
    super(messages[0] ?? 'Request failed');
    this.status = status;
    this.messages = messages;
  }
}

// Turns whatever the API sends back into a flat list of readable lines.
function readProblems(body) {
  if (!body) return [];
  const d = body.detail ?? body;
  if (typeof d === 'string') return [d];
  if (Array.isArray(d)) {
    return d.map((x) => (typeof x === 'string'
      ? x
      : `${x.loc ? (x.loc.slice(1).join(' › ') + ': ') : ''}${x.msg ?? JSON.stringify(x)}`));
  }
  for (const k of ['problems', 'errors', 'messages']) if (Array.isArray(d[k])) return d[k].map(String);
  return [JSON.stringify(d)];
}

async function request(path, options) {
  let res;
  try {
    res = await fetch(`${BASE}${path}`, { headers: { 'Content-Type': 'application/json' }, ...options });
  } catch {
    throw new ApiError(0, [`Cannot reach the API at ${BASE}. Check that uvicorn is running.`]);
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const problems = readProblems(body);
    throw new ApiError(res.status, problems.length ? problems : [`Request failed (${res.status})`]);
  }
  return body;
}

export const getFeatures = () => request('/features');
export const predict = (payload) => request('/predict', { method: 'POST', body: JSON.stringify(payload) });
