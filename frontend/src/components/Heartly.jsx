import { useEffect, useRef, useState } from 'react';
import HeartlyMark from './HeartlyMark';
import Reply from './Reply';
import { askGroq, getKey, GroqError, keyFromEnv, LIMITS, saveKey } from '../lib/groq';
import { buildBrief } from '../lib/brief';
import { TARGETS } from '../lib/risk';
import './Heartly.css';

const GREETING = "Hi, I'm Heartly. I can explain this assessment: why a score is elevated or borderline, what the cut-offs mean, or which inputs would firm it up. I can't diagnose or advise treatment.";

const problemText = (e) => {
  if (!(e instanceof GroqError)) return 'Something went wrong. Please try again.';
  if (e.kind === 'rate') return `Heartly is busy (free-tier limit). Try again in ${e.retryAfter ? `${e.retryAfter} seconds` : 'a minute'}.`;
  return e.message;
};

// Floating assistant over the 3D view. Collapsed to a pill; chat state survives collapsing.
export default function Heartly({ result, labels, fields, selected, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [key, setKey] = useState(() => getKey());
  const [draftKey, setDraftKey] = useState('');
  const [usage, setUsage] = useState(null);
  const logRef = useRef(null);
  const inputRef = useRef(null);
  const fabRef = useRef(null);
  const abortRef = useRef(null);

  const brief = buildBrief(result, labels, fields);
  const focus = selected ? TARGETS[selected].name : 'the overall result';
  const focusT = result.targets[selected ?? 'CAD'];

  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => { const el = logRef.current; if (el) el.scrollTop = el.scrollHeight; }, [messages, busy, err, open]);
  useEffect(() => { if (open && key) inputRef.current?.focus(); }, [open, key]);

  const run = async (turns) => {
    setBusy(true); setErr(null);
    const ac = new AbortController(); abortRef.current = ac;
    try {
      const out = await askGroq({ key, messages: turns, brief, focus, signal: ac.signal });
      setMessages([...turns, { role: 'assistant', content: out.reply || 'I could not come up with an answer. Try rephrasing.' }]);
      setUsage(out.usage);
    } catch (e) {
      if (e?.name === 'AbortError') return;
      setErr(e);
    } finally { setBusy(false); }
  };

  const send = (text) => {
    const q = text.trim().slice(0, LIMITS.userChars);
    if (!q || busy) return;
    const turns = [...messages, { role: 'user', content: q }];
    setMessages(turns); setInput('');
    run(turns);
  };
  const collapse = () => { setOpen(false); fabRef.current?.focus(); };
  const onKeyDown = (e) => {
    if (e.key === 'Escape') collapse();
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); }
  };
  const submitKey = () => { if (draftKey.trim().length < 20) return; saveKey(draftKey); setKey(draftKey.trim()); setDraftKey(''); setErr(null); };
  const forgetKey = () => { saveKey(''); setKey(''); setErr(null); };
  const clearChat = () => { abortRef.current?.abort(); setMessages([]); setErr(null); setBusy(false); setUsage(null); };

  const word = { positive: 'elevated', borderline: 'borderline', negative: 'lower' }[focusT.status] ?? 'scored this way';
  const chips = [
    `Why is ${selected ? selected : 'the overall result'} ${word}?`,
    'What does borderline mean?',
    'Which inputs would firm this up?',
    'How reliable are these models?',
  ];
  const authProblem = err instanceof GroqError && err.kind === 'auth';

  return (
    <div className={`heartly ${open ? 'open' : ''}`}>
      {!open && (
        <button ref={fabRef} type="button" className="h-fab" onClick={() => setOpen(true)} aria-expanded="false" aria-controls="heartly-panel">
          <HeartlyMark size={34} /><span>Ask Heartly</span>
        </button>
      )}
      {open && (
        <section id="heartly-panel" className="h-panel" aria-label="Heartly assistant" onKeyDown={(e) => e.key === 'Escape' && collapse()}>
          <header className="h-head">
            <HeartlyMark size={34} title="Heartly" />
            <div className="h-title"><strong>Heartly</strong><span>Explains this assessment</span></div>
            <button type="button" className="h-icon" onClick={clearChat} disabled={!messages.length && !err} aria-label="Start a new chat" title="New chat">
              <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12h10l1-12M9 7V4h6v3" /></svg>
            </button>
            <button type="button" className="h-icon" onClick={collapse} aria-label="Collapse Heartly" title="Collapse">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
            </button>
          </header>

          {!key || authProblem ? (
            <div className="h-setup">
              <p><strong>{authProblem ? 'Groq rejected that key.' : 'One-time setup.'}</strong> Paste a free Groq API key to switch Heartly on. It stays in this browser tab only and is sent to Groq, nowhere else.</p>
              <input type="password" value={draftKey} onChange={(e) => setDraftKey(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submitKey()}
                placeholder="gsk_…" aria-label="Groq API key" autoComplete="off" spellCheck="false" />
              <div className="h-setup-row">
                <a href="https://console.groq.com/keys" target="_blank" rel="noreferrer">Get a free key</a>
                <button type="button" className="h-send" onClick={submitKey} disabled={draftKey.trim().length < 20}>Save key</button>
              </div>
            </div>
          ) : (
            <>
              <div className="h-log" ref={logRef} role="log" aria-live="polite">
                <div className="h-msg bot"><HeartlyMark size={22} /><div className="h-bubble"><p>{GREETING}</p></div></div>
                {messages.map((m, i) => (
                  <div key={i} className={`h-msg ${m.role === 'user' ? 'me' : 'bot'}`}>
                    {m.role !== 'user' && <HeartlyMark size={22} />}
                    <div className="h-bubble">{m.role === 'user' ? <p>{m.content}</p> : <Reply text={m.content} />}</div>
                  </div>
                ))}
                {busy && <div className="h-msg bot"><HeartlyMark size={22} /><div className="h-bubble h-typing" aria-label="Heartly is typing"><i /><i /><i /></div></div>}
                {err && (
                  <div className="h-err" role="alert">
                    <span>{problemText(err)}</span>
                    {err.kind !== 'auth' && messages.at(-1)?.role === 'user' && <button type="button" onClick={() => run(messages)}>Try again</button>}
                  </div>
                )}
                {!messages.length && (
                  <div className="h-chips">{chips.map((c) => <button key={c} type="button" onClick={() => send(c)} disabled={busy}>{c}</button>)}</div>
                )}
              </div>
              <div className="h-compose">
                <textarea ref={inputRef} rows={1} value={input} maxLength={LIMITS.userChars} placeholder="Ask about this assessment…" aria-label="Ask Heartly"
                  onChange={(e) => setInput(e.target.value)} onKeyDown={onKeyDown} />
                <button type="button" className="h-send" onClick={() => send(input)} disabled={busy || !input.trim()} aria-label="Send">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                </button>
              </div>
            </>
          )}
          <footer className="h-foot">
            <span>AI can be wrong. Decision support only. A short summary of this assessment (no name or ID) is sent to Groq.</span>
            {usage && <span className="num">Last reply: {usage.total_tokens} tokens</span>}
            {key && !keyFromEnv() && <button type="button" className="link" onClick={forgetKey}>Remove key</button>}
          </footer>
        </section>
      )}
    </div>
  );
}
