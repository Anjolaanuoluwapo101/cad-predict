import { useId } from 'react';
import { ALT, CAT_LABEL, LABELS, ORD, UI, isSet } from '../lib/fields';
import Tip from './Tip';
import { HINTS, REF } from '../lib/hints';
import './Fields.css';

const clamp = (n) => Math.min(100, Math.max(0, n));
const fmt = (v, dec = 0) => Number(v).toFixed(dec);

function Head({ f, htmlFor, right }) {
  return (
    <div className="f-head">
      <label htmlFor={htmlFor}>{LABELS[f.name] ?? f.label}{HINTS[f.name] && <Tip text={HINTS[f.name]} />}</label>
      {right}
    </div>
  );
}

export function SliderField({ f, value, onChange, onClear, problem, missing, unitMode, onUnitMode }) {
  const id = useId();
  const base = UI[f.name];
  const alt = ALT[f.name];
  const useAlt = Boolean(alt) && unitMode === 'alt';
  const m = useAlt ? alt.m : 1;
  const dec = useAlt ? alt.dec : (base.dec ?? 0);
  const step = useAlt ? alt.step : (base.step ?? 1);
  const unit = useAlt ? alt.unit : f.unit;
  const { min, max } = base;
  const set = isSet(value);
  const pos = (v) => clamp(((v - min) / (max - min)) * 100);
  const show = (v) => fmt(v * m, dec);
  const toStored = (d) => Math.round((d / m) * 1000) / 1000;
  const outside = set && f.observed && (value < f.observed[0] || value > f.observed[1]);
  const ref = REF[f.name];
  const rLo = ref ? Math.max(ref.lo ?? min, min) : null;
  const rHi = ref ? Math.min(ref.hi ?? max, max) : null;
  const refText = ref && (ref.lo == null ? `below ${show(ref.hi)}` : ref.hi == null ? `${show(ref.lo)} or above` : `${show(ref.lo)} to ${show(ref.hi)}`);
  const clamped = Math.min(max, Math.max(min, set ? value : f.default));
  const shown = !set ? '' : useAlt ? Number((value * m).toFixed(dec)) : value;
  return (
    <div className={`field ${set ? 'is-set' : ''} ${problem ? 'is-bad' : ''} ${missing ? 'is-missing' : ''}`}>
      <Head f={f} htmlFor={id} right={
        <span className="f-num">
          <input id={id} type="number" inputMode="decimal" step={step} placeholder="—" value={shown}
            onChange={(e) => (e.target.value === '' ? onClear() : onChange(toStored(Number(e.target.value))))} />
          <span className="unit">{unit}</span>
        </span>} />
      <div className="f-slider" style={{ '--pct': `${pos(clamped)}%`, '--tick': `${pos(f.default)}%` }}>
        {ref && <i className="f-ref" title="Typical adult reference range" style={{ left: `${pos(rLo)}%`, width: `${pos(rHi) - pos(rLo)}%` }} />}
        {f.observed && f.observed[0] > min && <i className="f-out" style={{ left: 0, width: `${pos(f.observed[0])}%` }} />}
        {f.observed && f.observed[1] < max && <i className="f-out" style={{ right: 0, width: `${100 - pos(f.observed[1])}%` }} />}
        <input type="range" min={useAlt ? Number((min * m).toFixed(dec)) : min} max={useAlt ? Number((max * m).toFixed(dec)) : max} step={step}
          value={useAlt ? Number((clamped * m).toFixed(dec)) : clamped} aria-label={LABELS[f.name] ?? f.label}
          onPointerDown={() => { if (!set) onChange(f.default); }} onChange={(e) => onChange(toStored(Number(e.target.value)))} />
        <i className="f-tick" aria-hidden="true" />
      </div>
      <div className="f-foot">
        <span className="f-msg">
          {problem ? <span className="bad">{problem}</span>
            : outside ? <span className="warn">Outside the range the model was trained on ({show(f.observed[0])} to {show(f.observed[1])} {unit})</span>
            : set ? <span>{ref ? `Typical adult range: ${refText} ${unit}` : `Typical ${show(f.default)}`}</span>
            : <>{missing && <span className="bad">Required. </span>}<button type="button" onClick={() => onChange(f.default)}>Use typical value, {show(f.default)}</button></>}
        </span>
        {alt && (
          <span className="unit-sw" role="group" aria-label="Unit">
            <button type="button" aria-pressed={!useAlt} onClick={() => onUnitMode('std')}>{f.unit}</button>
            <button type="button" aria-pressed={useAlt} onClick={() => onUnitMode('alt')}>{alt.unit}</button>
          </span>
        )}
      </div>
    </div>
  );
}

export function SegmentedField({ f, value, onChange, options, compact, missing }) {
  const ord = ORD[f.name];
  const note = ord ? (isSet(value) ? ord.notes[value] : ord.help) : null;
  const label = LABELS[f.name] ?? f.label;
  return (
    <div className={`field ${compact ? 'is-row' : ''} ${isSet(value) ? 'is-set' : ''} ${missing ? 'is-missing' : ''}`} role="radiogroup" aria-label={label}>
      <Head f={f} right={null} />
      <div className="f-seg" style={{ '--n': options.length }}>
        {options.map((o) => (
          <button key={String(o.value)} type="button" role="radio" aria-checked={value === o.value}
            className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>{o.label}</button>
        ))}
      </div>
      {note && <p className="f-note">{note}</p>}
    </div>
  );
}

export const YES_NO = [{ value: 0, label: 'No' }, { value: 1, label: 'Yes' }];

export function catOptions(f) {
  return f.choices.map((c) => ({ value: c, label: CAT_LABEL[c] ?? c }));
}
export function ordOptions(f) {
  const [lo, hi] = f.hard ?? f.observed;
  const names = ORD[f.name]?.names;
  return Array.from({ length: hi - lo + 1 }, (_, i) => ({ value: lo + i, label: names?.[i] ?? String(lo + i) }));
}
