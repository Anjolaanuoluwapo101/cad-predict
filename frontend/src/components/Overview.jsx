import RiskBar from './RiskBar';
import { TARGETS, TARGET_ORDER, formatProb, riskColour, statusLabel } from '../lib/risk';

const Eye = ({ off }) => (<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" />{off && <path d="M4 4l16 16" />}</svg>);
const Warn = () => (<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10.3 3.9L2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" /></svg>);

const pc = (v) => `${Math.round(v * 100)}%`;
const bandText = (t) => (t.borderline_from < t.threshold - 0.004
  ? `Borderline ${pc(t.borderline_from)} to ${pc(t.threshold)}, elevated from ${pc(t.threshold)}`
  : `Elevated from ${pc(t.threshold)}`);

export default function Overview({ data, labels, selected, onSelect, visible, onVisible, onSolo, onShowAll, dim, onDim }) {
  const used = data.defaults_used ?? [];
  const allShown = Object.values(visible).every(Boolean) && !selected;
  const cad = data.targets.CAD;
  return (
    <div className="ov">
      {data.warnings.map((w) => (
        <div key={w} className="notice" role="note">
          <Warn />
          <div>
            <strong>Some inputs were estimated</strong>
            <p>{w}</p>
            {used.length > 0 && (
              <details><summary>Show the {used.length} estimated fields</summary><p className="used">{used.map((n) => labels[n] ?? n).join(', ')}</p></details>
            )}
          </div>
        </div>
      ))}

      <button type="button" className={`overall ${!selected ? 'sel' : ''}`} onClick={() => onSelect('CAD')} aria-pressed={!selected}>
        <span className="eyebrow">Overall</span>
        <span className="overall-name">{TARGETS.CAD.name}</span>
        <span className="big-row">
          <span className="big num">{formatProb(cad.probability)}</span>
          <span className="status"><i style={{ background: riskColour(cad.colour_score) }} />{statusLabel(cad.status)}</span>
        </span>
        <RiskBar t={cad} />
        <span className="cut">{bandText(cad)}</span>
      </button>

      <div className="vgrid">
        {TARGET_ORDER.filter((k) => k !== 'CAD').map((k) => {
          const t = data.targets[k]; const shown = visible[k];
          return (
            <div key={k} className={`vc ${selected === k ? 'sel' : ''} ${shown ? '' : 'off'}`}>
              <button type="button" className="vc-main" onClick={() => onSelect(selected === k ? null : k)} disabled={!shown} aria-pressed={selected === k}>
                <span className="vc-name">{TARGETS[k].short}<small>{TARGETS[k].name}</small></span>
                <span className="big num">{formatProb(t.probability)}</span>
                <span className="status"><i style={{ background: shown ? riskColour(t.colour_score) : 'var(--line-strong)' }} />{statusLabel(t.status)}</span>
                <RiskBar t={t} />
                <span className="cut">{bandText(t)}</span>
              </button>
              <div className="vc-tools">
                <button type="button" aria-label={`${shown ? 'Hide' : 'Show'} ${TARGETS[k].short} on the heart`} aria-pressed={shown} onClick={() => onVisible(k, !shown)}><Eye off={!shown} /></button>
                <button type="button" onClick={() => onSolo(k)}>Solo</button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="res-tools">
        <label className="chk"><input type="checkbox" checked={dim} onChange={(e) => onDim(e.target.checked)} /> Grey out other vessels when one is selected</label>
        <button type="button" className="link" disabled={allShown} onClick={onShowAll}>Show all vessels</button>
      </div>

      <details className="how">
        <summary>How to read these numbers</summary>
        <dl>
          <dt>Score</dt>
          <dd>The model's estimate that this vessel is affected, as a percentage. It is a model output, not a diagnosis.</dd>
          <dt>Cut-off</dt>
          <dd>The score at or above which the model flags a vessel as Elevated. Every vessel has its own cut-off, so compare each score with its own cut-off, not with the other vessels.</dd>
          <dt>Borderline</dt>
          <dd>A band just below the cut-off. Optional fields left blank are filled with typical values, which can hide risk, so scores in this band are flagged for a closer look instead of being called lower. Entering more detail gives a firmer estimate.</dd>
          <dt>The bar</dt>
          <dd>The faint colours are the Lower, Borderline and Elevated zones for that vessel. The solid bar is the score. The dark tick is the cut-off.</dd>
        </dl>
      </details>
    </div>
  );
}
