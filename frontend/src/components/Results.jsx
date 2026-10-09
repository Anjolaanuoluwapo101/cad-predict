import { useState } from 'react';
import Overview from './Overview';
import ShapChart from './ShapChart';
import Physiology from './Physiology';
import TargetChips from './TargetChips';
import ConfirmButton from './ConfirmButton';
import { fieldMap } from '../lib/present';
import './Results.css';

const TABS = [['overview', 'Overview'], ['why', 'Why this score'], ['measures', 'Measurements']];
const Warn = () => (<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10.3 3.9L2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" /></svg>);

// The assessment dashboard: overview cards, SHAP explanation, measurements. The disclaimer never scrolls away.
export default function Results({ data, labels, fields, selected, onSelect, visible, onVisible, onSolo, onShowAll, dim, onDim, onEdit, onNew }) {
  const [tab, setTab] = useState('overview');
  const target = selected ?? 'CAD';
  const t = data.targets[target];
  const fmap = fieldMap(fields ?? []);
  const used = new Set(data.defaults_used ?? []);
  const onKey = (e) => {
    const i = TABS.findIndex(([id]) => id === tab);
    if (e.key === 'ArrowRight') setTab(TABS[(i + 1) % TABS.length][0]);
    if (e.key === 'ArrowLeft') setTab(TABS[(i + TABS.length - 1) % TABS.length][0]);
  };
  return (
    <div className="res">
      <div className="res-top">
        <h2>Assessment</h2>
        <span className="res-actions">
          <button type="button" className="link" onClick={onEdit}>Edit inputs</button>
          <ConfirmButton className="link" label="New patient" confirmLabel="Clear everything?" onConfirm={onNew} />
        </span>
      </div>

      <div className="tabs" role="tablist" aria-label="Assessment sections" onKeyDown={onKey}>
        {TABS.map(([id, name]) => (
          <button key={id} type="button" role="tab" id={`tab-${id}`} aria-selected={tab === id} aria-controls="res-panel" tabIndex={tab === id ? 0 : -1}
            className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{name}</button>
        ))}
      </div>
      {tab !== 'overview' && <TargetChips data={data} target={target} visible={visible} onSelect={onSelect} />}

      <div className="res-body" role="tabpanel" id="res-panel" aria-labelledby={`tab-${tab}`}>
        {tab === 'overview' && <Overview data={data} labels={labels} selected={selected} onSelect={onSelect} visible={visible} onVisible={onVisible}
          onSolo={onSolo} onShowAll={onShowAll} dim={dim} onDim={onDim} />}
        {tab === 'why' && <ShapChart target={target} t={t} labels={labels} fmap={fmap} />}
        {tab === 'measures' && <Physiology target={target} t={t} labels={labels} fmap={fmap} used={used} />}
      </div>

      <div className="notice disclaimer" role="note">
        <Warn />
        <div><strong>Decision support only</strong><p>{data.disclaimer}</p></div>
      </div>
    </div>
  );
}
