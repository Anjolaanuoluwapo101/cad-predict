import { useState } from 'react';
import Overview from './Overview';
import ShapChart from './ShapChart';
import Physiology from './Physiology';
import TargetChips from './TargetChips';
import ConfirmButton from './ConfirmButton';
import { fieldMap } from '../lib/present';
import './Results.css';

const TABS = [['overview', 'Overview'], ['why', 'Why this score'], ['measures', 'Measurements']];
// The assessment dashboard: overview cards, SHAP explanation, measurements.
export default function Results({ data, labels, fields, selected, onSelect, visible, onVisible, onSolo, onShowAll, dim, onDim, onEdit, onNew, onSave, saved }) {
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
          <button type="button" className={`save-btn ${saved ? 'is-saved' : ''}`} onClick={onSave} disabled={saved}
            title={saved ? 'This run is saved in History' : 'Save these inputs and results to History'}>
            {saved ? 'Saved ✓' : 'Save run'}
          </button>
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
    </div>
  );
}
