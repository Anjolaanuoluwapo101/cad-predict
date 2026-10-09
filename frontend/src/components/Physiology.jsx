import { useState } from 'react';
import { TARGETS } from '../lib/risk';
import { formatValue, nameOf, pct, refStatus, refText } from '../lib/present';

const SHOW = 12;
const NOTE = { below: 'below typical', above: 'above typical', within: 'within typical' };

// Step 8: the patient's measurements next to how much each one mattered to this score.
export default function Physiology({ target, t, labels, fmap, used }) {
  const [all, setAll] = useState(false);
  const rows = all ? t.contributions : t.contributions.slice(0, SHOW);
  const max = Math.max(0.0001, ...t.contributions.map((c) => c.share));
  return (
    <section className="phys" aria-label={`Measurements behind the ${TARGETS[target].name} score`}>
      <h3>Measurements behind this score</h3>
      <p className="why-sum">The factors that mattered most to the {TARGETS[target].name} score, with the value used for each. Reference ranges are typical adult ranges and vary between laboratories.</p>
      <ul className="pr-list">
        {rows.map((c) => {
          const est = used.has(c.feature); const st = refStatus(c.feature, c.value); const up = c.shap > 0;
          const range = refText(c.feature, fmap[c.feature]?.unit);
          return (
            <li key={c.feature} className="pr">
              <div className="pr-main">
                <span className="pr-name">{nameOf(c, labels)}{est && <em className="est" title="Not entered, so a typical value was used">estimated</em>}</span>
                <span className="pr-val num">{formatValue(c.feature, c.value, fmap[c.feature])}</span>
                {range && <span className={`pr-ref ${st}`}>{NOTE[st]}<small>typical {range}</small></span>}
              </div>
              <div className="pr-effect" title={`${up ? '+' : ''}${c.shap} ${t.explanation_units}`}>
                <span className="sh-bar"><i className="axis" /><b className={up ? 'up' : 'down'} style={{ width: `${Math.max(2, (c.share / max) * 50)}%` }} /></span>
                <span className="pr-pct num">{up ? 'raises' : 'lowers'} {pct(c.share)}</span>
              </div>
            </li>
          );
        })}
      </ul>
      {t.contributions.length > SHOW && (
        <button type="button" className="link" onClick={() => setAll(!all)}>{all ? `Show the top ${SHOW} only` : `Show all ${t.contributions.length} measurements`}</button>
      )}
    </section>
  );
}
