import { useState } from 'react';

// First click asks "are you sure?", second click does it. Clicking away cancels. No dialogs, no timers.
export default function ConfirmButton({ label, confirmLabel = 'Click again to confirm', onConfirm, className = '', disabled = false }) {
  const [armed, setArmed] = useState(false);
  return (
    <button type="button" className={`${className} ${armed ? 'armed' : ''}`} disabled={disabled}
      onBlur={() => setArmed(false)}
      onClick={() => { if (armed) { setArmed(false); onConfirm(); } else setArmed(true); }}>
      {armed ? confirmLabel : label}
    </button>
  );
}
