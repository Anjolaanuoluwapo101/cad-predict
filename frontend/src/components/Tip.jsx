import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// Floats above the scrolling form so it is never clipped. Hover or focus on desktop, tap on touch screens.
export default function Tip({ text }) {
  const id = useId();
  const btn = useRef(null);
  const kind = useRef('mouse');
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);

  const show = () => {
    const r = btn.current.getBoundingClientRect();
    const w = Math.min(280, window.innerWidth - 24);
    const left = Math.max(12, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - 12));
    const above = r.top > 150;
    setPos({ left, width: w, top: above ? r.top - 10 : r.bottom + 10, above });
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return undefined;
    const close = () => setOpen(false);
    const key = (e) => { if (e.key === 'Escape') close(); };
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close); window.removeEventListener('keydown', key); };
  }, [open]);

  return (
    <>
      <button ref={btn} type="button" className="f-hint" aria-label="More information" aria-expanded={open} aria-describedby={open ? id : undefined}
        onPointerDown={(e) => { kind.current = e.pointerType; }}
        onPointerEnter={(e) => { if (e.pointerType === 'mouse') show(); }}
        onPointerLeave={(e) => { if (e.pointerType === 'mouse') setOpen(false); }}
        onFocus={show} onBlur={() => setOpen(false)}
        onClick={() => (kind.current === 'mouse' ? show() : open ? setOpen(false) : show())}>i</button>
      {open && pos && createPortal(
        <div id={id} role="tooltip" className={`tip-pop ${pos.above ? 'above' : ''}`} style={{ left: pos.left, top: pos.top, width: pos.width }}>{text}</div>,
        document.body)}
    </>
  );
}
