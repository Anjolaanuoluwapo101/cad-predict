import { TARGETS, TARGET_ORDER, riskColour } from '../lib/risk';

// Picks which target the Why / Measurements tabs describe. Stays in step with the 3D heart selection.
export default function TargetChips({ data, target, visible, onSelect }) {
  return (
    <div className="chips" role="group" aria-label="Choose what to explain">
      {TARGET_ORDER.map((k) => {
        const hidden = k !== 'CAD' && visible[k] === false;
        return (
          <button key={k} type="button" className={`chip ${target === k ? 'on' : ''}`} aria-pressed={target === k} disabled={hidden}
            onClick={() => onSelect(k)}>
            <i style={{ background: hidden ? 'var(--line-strong)' : riskColour(data.targets[k].colour_score) }} />{TARGETS[k].short}
          </button>
        );
      })}
    </div>
  );
}
