import { useState } from 'react';
import { TARGETS, statusLabel } from '../lib/risk';
import { drivers, formatValue, nameOf, pct } from '../lib/present';

const SHOW = 10;

// Step 7: why the model gave this score. SHAP only. Bars show each factor's share of the explanation.
export default function ShapChart({ target, t, labels, fmap }) {
  const [all, setAll] = useState(false);
  const rows = all ? t.contributions : t.contributions.slice(0, SHOW);
  const max = Math.max(0.0001, ...t.contributions.map((c) => c.share));
  const ups = drivers(t.contributions, 'up', 3).map((c) => nameOf(c, labels));
  const downs = drivers(t.contributions, 'down', 2).map((c) => nameOf(c, labels));
  const list = (a) => a.join(', ');
  return (
    <section className="why" aria-label={`Why the model scored ${TARGETS[target].name}`}>
      <h3>Why this score for {TARGETS[target].name}</h3>
      <p className="why-sum lines">
        <span>Result: <strong>{statusLabel(t.status)}</strong>.</span>
        {ups.length > 0 && <span>Pushing the score up most: <strong>{list(ups)}</strong>.</span>}
        {downs.length > 0 && <span>Pushing it down: <strong>{list(downs)}</strong>.</span>}
      </p>

      <div className="sh-head" aria-hidden="true">
        <span />
        <span className="sh-axis"><em>lowers the score</em><em>raises the score</em></span>
        <span />
      </div>
      <ol className="sh">
        {rows.map((c) => {
          const w = `${Math.max(2, (c.share / max) * 50)}%`; const up = c.shap > 0;
          return (
            <li key={c.feature}>
              <span className="sh-label">{nameOf(c, labels)}<em>{formatValue(c.feature, c.value, fmap[c.feature])}</em></span>
              <span className="sh-bar" title={`${up ? '+' : ''}${c.shap} ${t.explanation_units}`}>
                <i className="axis" />
                <b className={up ? 'up' : 'down'} style={{ width: w }} />
              </span>
              <span className="sh-pct num">{pct(c.share)}</span>
            </li>
          );
        })}
      </ol>
      {t.contributions.length > SHOW && (
        <button type="button" className="link" onClick={() => setAll(!all)}>{all ? `Show the top ${SHOW} only` : `Show all ${t.contributions.length} factors`}</button>
      )}
      <p className="fine">
        Each percentage is that factor's share of the model's whole explanation for this patient. It describes how the model reached the score; it does not show that a factor causes disease. The same factor can push one vessel up and another down, and the absence of a finding can raise or lower a score as well.
      </p>
    </section>
  );
}
