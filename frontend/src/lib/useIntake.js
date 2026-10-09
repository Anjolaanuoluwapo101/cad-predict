import { useCallback, useMemo, useState } from 'react';
import { hardProblem, isSet, toPayload } from './fields';

export function useIntake(features) {
  const [values, setValues] = useState({});
  const [units, setUnits] = useState({});
  const fields = features?.fields ?? [];

  const set = useCallback((name, v) => setValues((s) => ({ ...s, [name]: v })), []);
  const clear = useCallback((name) => setValues((s) => { const n = { ...s }; delete n[name]; return n; }), []);
  const setUnit = useCallback((name, mode) => setUnits((u) => ({ ...u, [name]: mode })), []);
  const setMany = useCallback((obj) => setValues((s) => ({ ...s, ...obj })), []);
  const reset = useCallback(() => { setValues({}); setUnits({}); }, []);

  return useMemo(() => {
    const required = fields.filter((f) => f.primary);
    const missing = required.filter((f) => !isSet(values[f.name]));
    const problems = {};
    fields.forEach((f) => { const p = hardProblem(f, values[f.name]); if (p) problems[f.name] = p; });
    return {
      values, set, clear, setMany, reset, units, setUnit, required, missing, problems,
      ready: missing.length === 0 && Object.keys(problems).length === 0,
      payload: toPayload(fields, values),
    };
  }, [fields, values, units, set, clear, setMany, reset, setUnit]);
}
