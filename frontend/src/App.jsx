import { useEffect, useState } from 'react';
import HeartStage from './components/HeartStage';
import IntakeForm from './components/IntakeForm';
import Results from './components/Results';
import Heartly from './components/Heartly';
import HeartlyMark from './components/HeartlyMark';
import { ApiError, getFeatures, predict } from './lib/api';
import { LABELS } from './lib/fields';
import { useIntake } from './lib/useIntake';
import { useTheme } from './lib/theme';

const Sun = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>);
const Moon = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z" /></svg>);
const ALL = { LAD: true, LCX: true, RCA: true };

export default function App() {
  const { theme, toggle } = useTheme();
  const [features, setFeatures] = useState(null);
  const [loadErr, setLoadErr] = useState(null);
  const intake = useIntake(features);
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);
  const [errors, setErrors] = useState([]);
  const [selected, setSelected] = useState(null);
  const [visible, setVisible] = useState(ALL);
  const [dim, setDim] = useState(true);
  const [runId, setRunId] = useState(0);

  useEffect(() => { getFeatures().then(setFeatures).catch((e) => setLoadErr(e.message)); }, []);

  const run = async () => {
    setRunning(true); setErrors([]);
    try { setResult(await predict(intake.payload)); setRunId((n) => n + 1); setSelected(null); setVisible(ALL); }
    catch (e) { setErrors(e instanceof ApiError ? e.messages : [String(e)]); }
    finally { setRunning(false); }
  };
  const setVessel = (k, on) => { setVisible((v) => ({ ...v, [k]: on })); if (!on && selected === k) setSelected(null); };
  const solo = (k) => { setVisible({ LAD: k === 'LAD', LCX: k === 'LCX', RCA: k === 'RCA' }); setSelected(k); };
  const showAll = () => { setVisible(ALL); setSelected(null); };
  const startOver = () => { intake.reset(); setResult(null); setSelected(null); setVisible(ALL); setErrors([]); };
  const pick = (k) => { if (k && k !== 'CAD' && visible[k] === false) return; setSelected(k === 'CAD' ? null : k); };

  return (
    <div className="shell wide">
      <header className="top">
        <span className="brand"><HeartlyMark size={30} />Coronary Risk Assessment</span>
        <button className="themebtn" onClick={toggle} aria-label="Switch colour theme">
          {theme === 'dark' ? <Sun /> : <Moon />}{theme === 'dark' ? 'Light mode' : 'Dark mode'}
        </button>
      </header>
      <div className={`split ${result ? 'assess' : ''}`}>
        <section className="panel side">
          {loadErr && <div className="errs" role="alert"><strong>Cannot load the form</strong><p>{loadErr}</p></div>}
          {!features && !loadErr && <p className="hint">Loading the form…</p>}
          {features && !result && <IntakeForm features={features} intake={intake} onRun={run} running={running} errors={errors} />}
          {features && result && (
            <Results data={result} fields={features.fields} labels={Object.fromEntries(features.fields.map((f) => [f.name, LABELS[f.name] ?? f.label]))} selected={selected} onSelect={pick} visible={visible} onVisible={setVessel}
              onSolo={solo} onShowAll={showAll} dim={dim} onDim={setDim} onEdit={() => setResult(null)} onNew={startOver} />
          )}
        </section>
        <div className="split-stage">
          <HeartStage results={result?.targets ?? null} selected={selected} onSelect={pick} visible={visible} dim={dim} />
          {result && features && (
            <Heartly key={runId} result={result} fields={features.fields} selected={selected}
              labels={Object.fromEntries(features.fields.map((f) => [f.name, LABELS[f.name] ?? f.label]))} />
          )}
        </div>
      </div>
    </div>
  );
}
