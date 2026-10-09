import { formatProb, riskColour, statusLabel } from '../lib/risk';

// A flat bar instead of an arc. Faint background = this target's own Lower / Borderline / Elevated zones.
// Solid bar = the score. Dark tick = the cut-off, labelled underneath.
const pc = (v) => Math.min(100, Math.max(0, v * 100));

export default function RiskBar({ t }) {
  const lo = pc(t.borderline_from); const cut = pc(t.threshold); const p = Math.max(1.5, pc(t.probability));
  const hasBand = cut - lo > 0.4;
  const label = `Score ${formatProb(t.probability)}, ${statusLabel(t.status)}. Elevated from ${Math.round(cut)}%.`;
  return (
    <div className="rbar" role="img" aria-label={label}>
      <div className="rbar-track">
        <div className="rbar-zones">
          <i style={{ width: `${hasBand ? lo : cut}%`, background: riskColour(0) }} />
          {hasBand && <i style={{ width: `${cut - lo}%`, background: riskColour(0.5) }} />}
          <i style={{ flex: 1, background: riskColour(1) }} />
          <b style={{ width: `${p}%`, background: riskColour(t.colour_score) }} />
        </div>
        <u className="rbar-cut" style={{ left: `${cut}%` }} />
      </div>
      <div className="rbar-scale"><span style={{ left: `${Math.min(80, Math.max(20, cut))}%` }}>cut-off {Math.round(cut)}%</span></div>
    </div>
  );
}
