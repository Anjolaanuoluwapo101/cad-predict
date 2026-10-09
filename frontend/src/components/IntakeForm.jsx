import ConfirmButton from './ConfirmButton';
import { useEffect, useRef, useState } from 'react';
import { SegmentedField, SliderField, YES_NO, catOptions, ordOptions } from './Fields';
import { SUB, bmiOf, isSet } from '../lib/fields';
import './IntakeForm.css';

function Control({ f, intake, attempted }) {
  const v = intake.values[f.name];
  const on = (x) => intake.set(f.name, x);
  const missing = attempted && f.primary && !isSet(v);
  if (f.kind === 'bin') return <SegmentedField f={f} value={v} onChange={on} options={YES_NO} compact missing={missing} />;
  if (f.kind === 'cat') return <SegmentedField f={f} value={v} onChange={on} options={catOptions(f)} missing={missing} />;
  if (f.kind === 'ord') return <SegmentedField f={f} value={v} onChange={on} options={ordOptions(f)} missing={missing} />;
  return <SliderField f={f} value={v} onChange={on} onClear={() => intake.clear(f.name)} problem={intake.problems[f.name]} missing={missing} unitMode={intake.units[f.name]} onUnitMode={(m) => intake.setUnit(f.name, m)} />;
}

function More({ fields, intake, attempted }) {
  const [open, setOpen] = useState(false);
  const filled = fields.filter((f) => isSet(intake.values[f.name])).length;
  return (
    <div className={`more ${open ? 'open' : ''}`}>
      <button type="button" className="more-btn" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span>More detail <em>{fields.length} optional{filled ? `, ${filled} set` : ''}</em></span>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      <div className="more-body"><div>{fields.map((f) => <Control key={f.name} f={f} intake={intake} attempted={attempted} />)}</div></div>
    </div>
  );
}

const Chev = ({ dir }) => (<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={dir === 'l' ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'} /></svg>);

export default function IntakeForm({ features, intake, onRun, running, errors }) {
  const [i, setI] = useState(0);
  const [attempted, setAttempted] = useState(false);
  const nav = useRef(null);
  const groups = features.groups;
  const info = groups.map((g, idx) => {
    const req = features.fields.filter((f) => f.group === g && f.primary);
    return { g, idx, req, opt: features.fields.filter((f) => f.group === g && !f.primary), left: req.filter((f) => !isSet(intake.values[f.name])).length };
  });
  const cur = info[i];
  const last = i === groups.length - 1;
  const done = intake.required.length - intake.missing.length;
  const bmi = cur.g === 'Demographics' ? bmiOf(intake.values.Weight, intake.values.Length) : null;
  const bins = cur.req.filter((f) => f.kind === 'bin' && !isSet(intake.values[f.name]));
  const gaps = info.filter((x) => x.left > 0);
  const sub = SUB[cur.g];
  const mainReq = sub ? cur.req.filter((f) => !sub.names.includes(f.name)) : cur.req;
  const subReq = sub ? cur.req.filter((f) => sub.names.includes(f.name)) : [];

  useEffect(() => { nav.current?.querySelector('.cur')?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' }); }, [i]);

  const run = () => {
    if (!intake.ready) {
      setAttempted(true);
      const n = info.findIndex((x) => x.left > 0 || x.req.some((f) => intake.problems[f.name]));
      if (n >= 0) setI(n);
      return;
    }
    onRun();
  };

  return (
    <div className="intake">
      <div className="stepper">
        <button type="button" className="arrow" aria-label="Previous section" disabled={i === 0} onClick={() => setI(i - 1)}><Chev dir="l" /></button>
        <nav ref={nav} className="steps" aria-label="Form sections">
          {info.map((x, n) => (
            <button key={x.g} type="button" className={`${n === i ? 'cur' : ''} ${x.left === 0 ? 'ok' : ''} ${attempted && x.left > 0 ? 'bad' : ''}`} aria-current={n === i ? 'step' : undefined} onClick={() => setI(n)}>
              <span className="mark">{x.left === 0 ? '✓' : x.req.length - x.left}</span>{x.g}
            </button>
          ))}
        </nav>
        <button type="button" className="arrow" aria-label="Next section" disabled={last} onClick={() => setI(i + 1)}><Chev dir="r" /></button>
      </div>

      <div className="sect">
        <h2>{cur.g}</h2>
        {bmi && <p className="derived">BMI <strong className="num">{bmi.toFixed(1)}</strong>{bmi > 25 ? ', above 25' : ''}</p>}
        {bins.length > 1 && <button type="button" className="bulk" onClick={() => intake.setMany(Object.fromEntries(bins.map((f) => [f.name, 0])))}>Mark {bins.length} unanswered as No</button>}
        {mainReq.map((f) => <Control key={f.name} f={f} intake={intake} attempted={attempted} />)}
        {cur.opt.length > 0 && <More key={cur.g} fields={cur.opt} intake={intake} attempted={attempted} />}
        {subReq.length > 0 && (
          <div className="sub-block">
            <h3>{sub.title}</h3>
            <p>{sub.caption}</p>
            {subReq.map((f) => <Control key={f.name} f={f} intake={intake} attempted={attempted} />)}
          </div>
        )}
      </div>

      {attempted && gaps.length > 0 && (
        <div className="errs" role="alert">
          <strong>{intake.missing.length} required {intake.missing.length === 1 ? 'field needs' : 'fields need'} a value</strong>
          <div className="gaps">{gaps.map((x) => <button key={x.g} type="button" onClick={() => setI(x.idx)}>{x.g} ({x.left})</button>)}</div>
        </div>
      )}
      {errors.length > 0 && (
        <div className="errs" role="alert"><strong>The API could not run this assessment</strong><ul>{errors.slice(0, 8).map((e) => <li key={e}>{e}</li>)}</ul></div>
      )}

      <footer className="bar">
        <div className="prog"><div style={{ width: `${(done / intake.required.length) * 100}%` }} /><span className="num">{done} of {intake.required.length} required</span>
          <ConfirmButton className="reset-all" label="Reset all inputs" confirmLabel="Clear every input?" disabled={Object.keys(intake.values).length === 0}
            onConfirm={() => { intake.reset(); setAttempted(false); setI(0); }} /></div>
        <div className="nav">
          <button type="button" className="ghost" disabled={i === 0} onClick={() => setI(i - 1)}>Back</button>
          {!last && <button type="button" className="solid" onClick={() => setI(i + 1)}>Next</button>}
          {last && <button type="button" className="solid" disabled={running} onClick={run}>{running ? 'Running…' : 'Run assessment'}</button>}
        </div>
      </footer>
    </div>
  );
}
