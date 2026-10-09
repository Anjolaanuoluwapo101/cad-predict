// Saved runs: last 10 assessments in localStorage. Pure helpers + guarded storage.
// Entry: { id, savedAt, values, units, payload, result }

export const HISTORY_KEY = 'cad-risk-runs-v1';
export const HISTORY_MAX = 10;

const uid = () =>
  (typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `run-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);

const isValid = (e) =>
  e && typeof e === 'object' && typeof e.id === 'string' &&
  typeof e.savedAt === 'number' && e.values && typeof e.values === 'object' &&
  e.result && typeof e.result === 'object' && e.result.targets;

export function loadRuns() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list.filter(isValid).sort((a, b) => b.savedAt - a.savedAt).slice(0, HISTORY_MAX);
  } catch {
    return [];
  }
}

function persist(list) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
}

export function makeEntry({ values, units, payload, result }) {
  return {
    id: uid(),
    savedAt: Date.now(),
    values: { ...(values ?? {}) },
    units: { ...(units ?? {}) },
    payload: { ...(payload ?? {}) },
    result: structuredCloneSafe(result),
  };
}

function structuredCloneSafe(v) {
  try {
    return typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v));
  } catch {
    return JSON.parse(JSON.stringify(v));
  }
}

// Prepend + cap at 10. Retries once (dropping oldest) on quota errors.
export function saveRun(list, entry) {
  const next = [entry, ...list].slice(0, HISTORY_MAX);
  try {
    persist(next);
  } catch (e) {
    if (isQuota(e) && next.length > 1) {
      const trimmed = next.slice(0, next.length - 1);
      persist(trimmed);
      return trimmed;
    }
    throw e;
  }
  return next;
}

export function deleteRun(list, id) {
  const next = list.filter((e) => e.id !== id);
  persist(next);
  return next;
}

export function clearRuns() {
  persist([]);
  return [];
}

const isQuota = (e) =>
  e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22);
