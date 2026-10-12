import { useEffect, useRef, useState } from 'react';
import ConfirmButton from './ConfirmButton';
import { HISTORY_MAX } from '../lib/history';
import { formatProb, riskColour, statusLabel } from '../lib/risk';
import './HistoryMenu.css';

const fmtWhen = (t) => {
  try {
    return new Date(t).toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
};

// Header dropdown: last 10 saved runs. Click a row to reload it, X to delete it.
export default function HistoryMenu({ runs, activeId, error, onLoad, onDelete, onClear }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open ]);

  const pick = (entry) => { setOpen(false); onLoad(entry); };

  return (
    <div className="hist-wrap" ref={box}>
      <button type="button" className="hist-btn" aria-expanded={open} aria-haspopup="listbox" aria-label={`Saved runs, ${runs.length} of ${HISTORY_MAX}`}
        onClick={() => setOpen((o) => !o)}>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /><path d="M12 7v5l3.5 2" /></svg>
        <span className="btn-label">History</span> <span className="num">({runs.length}/{HISTORY_MAX})</span>
        <svg className={`chev ${open ? 'up' : ''}`} viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {open && (
        <div className="hist-panel" role="listbox" aria-label="Saved runs">
          {error && <p className="hist-err" role="alert">{error}</p>}
          {runs.length === 0 && (
            <p className="hist-empty">No saved runs yet. Run an assessment, then press Save run.</p>
          )}
          {runs.map((r) => {
            const cad = r.result?.targets?.CAD;
            const active = r.id === activeId;
            return (
              <div key={r.id} className={`hist-row ${active ? 'is-active' : ''}`} role="option" aria-selected={active}>
                <button type="button" className="hist-main" onClick={() => pick(r)} title={active ? 'Currently loaded' : 'Load this run'}>
                  <span className="hist-when num">{fmtWhen(r.savedAt)}</span>
                  {cad ? (
                    <span className="hist-score">
                      <i style={{ background: riskColour(cad.colour_score) }} />
                      <strong className="num">{formatProb(cad.probability)}</strong>
                      <span>{statusLabel(cad.status)}</span>
                    </span>
                  ) : (
                    <span className="hist-score"><span>Saved run</span></span>
                  )}
                  {active && <span className="hist-cur">current</span>}
                </button>
                <button type="button" className="hist-del" aria-label={`Delete run from ${fmtWhen(r.savedAt)}`}
                  onClick={() => onDelete(r.id)}>
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
                </button>
              </div>
            );
          })}
          {runs.length > 0 && (
            <div className="hist-foot">
              <span className="num">{runs.length} saved, oldest drops off past {HISTORY_MAX}</span>
              <ConfirmButton className="link danger" label="Clear all" confirmLabel="Delete all saved runs?" onConfirm={() => { onClear(); setOpen(false); }} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
