'use client';
// The operator's switchboard: call someone as Remi, send a text from the line, manage the
// numbers Remi may text, and put the demo back to its starting story. Polls /api/control/status.
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';

type JobLine = { step?: string; type?: string; to?: string; status?: string; reason?: string | null; error?: string; text?: string };
type Job = { id: string; label: string; startedAt: string; endedAt: string | null; exitCode: number | null; lines: JobLine[] };
type Status = {
  system: { agent: boolean; chertDev: boolean; line: { code: string; at: string } | null; latency: string | null };
  jobs: Job[];
  contacts: { label: string; last4: string }[];
  elderId: string;
};
type Result = { tone: 'ok' | 'bad'; text: string } | null;

const NUMBER_KEY = 'remi-control-call-to';
const noSubscribe = () => () => {};
const remember = (k: string, v?: string) => {
  try { if (v === undefined) return localStorage.getItem(k) ?? ''; localStorage.setItem(k, v); } catch { /* private window */ }
  return '';
};

async function post(url: string, body?: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: res.ok && data.ok !== false, data };
  } catch {
    return { ok: false, data: { error: 'the panel lost its connection to this computer' } };
  }
}

/** "17 turns, medians: … caller hears ~1724 ms" → "~1.7 s per reply, 17 turns". */
function latencySummary(line: string | null): string {
  if (!line) return 'No timing yet';
  const heard = line.match(/caller hears ~(\d+) ms/);
  const turns = line.match(/^(\d+) turns/);
  if (!heard) return line;
  return `~${(Number(heard[1]) / 1000).toFixed(1)} s per reply${turns ? `, ${turns[1]} turns` : ''}`;
}

const reason = (d: Record<string, unknown>) => String(d.error ?? d.detail ?? d.output ?? 'something went wrong');

function describe(l: JobLine): { text: string; bad?: boolean } {
  switch (l.step) {
    case 'room_ready': return { text: 'Room ready, Remi is waiting in it' };
    case 'dialing': return { text: `Dialing ${l.to ?? ''}`.trim() };
    case 'event': return { text: (l.type ?? 'update').replace(/[._]/g, ' ') };
    case 'bridge_ready': return { text: 'FaceTime connected, Remi is saying hello' };
    case 'done': return { text: `Call ended${l.reason ? ` (${l.reason.replace(/_/g, ' ')})` : ''}`, bad: l.status === 'failed' };
    case 'poll_error': return { text: `Lost track of the call for a moment: ${l.error}`, bad: true };
    case 'error': return { text: l.error ?? 'Could not place the call', bad: true };
    case 'stderr': case 'log': return { text: l.text ?? '', bad: l.step === 'stderr' };
    default: return { text: JSON.stringify(l).slice(0, 120) };
  }
}

const LINE_WORDS: Record<string, string> = {
  agent_warm: 'Ready for calls', agent_not_warm: 'Agent not ready', call_accepted: 'On a call',
  call_ended: 'Ready for calls', call_declined: 'Last call declined', dev_stopped: 'Line released',
  line_in_use: 'Held by another team', reconnecting: 'Reconnecting', dev_reconnected: 'Ready for calls',
};

export function ControlPanel() {
  const [status, setStatus] = useState<Status | null>(null);
  const [offline, setOffline] = useState(false);
  const router = useRouter();
  const savedTo = useSyncExternalStore(noSubscribe, () => remember(NUMBER_KEY), () => '');
  const [typedTo, setTo] = useState<string | null>(null);
  const to = typedTo ?? savedTo;
  const [video, setVideo] = useState(true);
  const [callResult, setCallResult] = useState<Result>(null);
  const [pickedTextTo, setTextTo] = useState('');
  const [textNumber, setTextNumber] = useState('');
  const [body, setBody] = useState('');
  const [asRemi, setAsRemi] = useState(true);
  const [textResult, setTextResult] = useState<Result>(null);
  const [label, setLabel] = useState('');
  const [phone, setPhone] = useState('');
  const [contactResult, setContactResult] = useState<Result>(null);
  const [armed, setArmed] = useState(false);
  const [resetResult, setResetResult] = useState<Result>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/control/status', { cache: 'no-store' });
      if (res.status === 401) { router.replace('/control/login'); return; }
      setStatus((await res.json()) as Status);
      setOffline(false);
    } catch { setOffline(true); }
  }, [router]);

  useEffect(() => {
    const first = setTimeout(refresh, 0);
    const t = setInterval(refresh, 2000);
    return () => { clearTimeout(first); clearInterval(t); };
  }, [refresh]);

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);

  const textTo = pickedTextTo || status?.contacts[0]?.label || '__number';
  const live = status?.jobs.find((j) => !j.endedAt) ?? null;
  const latest = live ?? status?.jobs[0] ?? null;
  const sys = status?.system;
  const onCall = live !== null || sys?.line?.code === 'call_accepted';

  async function call() {
    if (!to.trim()) { setCallResult({ tone: 'bad', text: 'Type the number or Apple ID Remi should call.' }); return; }
    remember(NUMBER_KEY, to.trim());
    setBusy('call'); setCallResult(null);
    const r = await post('/api/control/call', { to: to.trim(), video });
    setBusy(null);
    if (!r.ok) setCallResult({ tone: 'bad', text: reason(r.data) });
    void refresh();
  }

  async function hangUp() {
    if (!live) return;
    setBusy('call');
    const r = await post(`/api/control/call/${live.id}/end`);
    setBusy(null);
    setCallResult(r.ok ? { tone: 'ok', text: 'Hanging up.' } : { tone: 'bad', text: reason(r.data) });
    void refresh();
  }

  async function sendText() {
    const recipient = textTo === '__number' ? textNumber.trim() : textTo;
    if (!recipient || !body.trim()) { setTextResult({ tone: 'bad', text: 'Pick who gets it and write the message.' }); return; }
    setBusy('text'); setTextResult(null);
    const r = await post('/api/control/text', { to: recipient, body: body.trim(), asRemi });
    setBusy(null);
    if (r.ok) { setBody(''); setTextResult({ tone: 'ok', text: `Sent to ${r.data.to ?? 'the number'} ending ${r.data.last4}.` }); }
    else setTextResult({ tone: 'bad', text: `Not sent: ${reason(r.data)}` });
  }

  async function saveContact() {
    if (!label.trim() || !phone.trim()) { setContactResult({ tone: 'bad', text: 'A contact needs a name and a number.' }); return; }
    setBusy('contact'); setContactResult(null);
    const r = await post('/api/control/contacts', { label: label.trim(), phone: phone.trim() });
    setBusy(null);
    if (r.ok) { setLabel(''); setPhone(''); setContactResult({ tone: 'ok', text: String(r.data.output ?? 'Saved.') }); void refresh(); }
    else setContactResult({ tone: 'bad', text: `Not saved: ${reason(r.data)}` });
  }

  async function reset() {
    if (!armed) { setArmed(true); return; }
    setArmed(false); setBusy('reset'); setResetResult(null);
    const r = await post('/api/control/reset');
    setBusy(null);
    setResetResult(r.ok ? { tone: 'ok', text: 'Demo reset: the simulated weeks are back and real calls are gone.' } : { tone: 'bad', text: reason(r.data) });
  }

  async function signOut() {
    await fetch('/api/control/login', { method: 'DELETE' }).catch(() => {});
    router.replace('/control/login');
  }

  const agentState = !status ? 'off' : sys?.agent ? 'on' : 'bad';
  const lineState = !status ? 'off' : !sys?.chertDev ? 'bad' : onCall ? 'live' : sys?.line?.code === 'agent_warm' || sys?.line?.code === 'call_ended' || sys?.line?.code === 'dev_reconnected' ? 'on' : 'off';

  return (
    <main className="sb-wrap">
      <h1 className="sb-title">Remi switchboard</h1>
      <p className="sb-sub">{offline ? 'Lost touch with the computer running Remi. Retrying…' : 'Everything Remi can do, one tap each.'}</p>

      <div className="sb-lamps" role="status" aria-live="polite">
        <div className="sb-lamp">
          <i className="sb-bulb" data-state={agentState} aria-hidden />
          <div><b>Agent</b><span>{!status ? 'Checking' : sys?.agent ? 'Running' : 'Not running'}</span></div>
        </div>
        <div className="sb-lamp">
          <i className="sb-bulb" data-state={lineState} aria-hidden />
          <div><b>FaceTime line</b><span>{!status ? 'Checking' : !sys?.chertDev ? 'Not connected' : onCall ? 'On a call' : LINE_WORDS[sys?.line?.code ?? ''] ?? 'Connected'}</span></div>
        </div>
        <div className="sb-lamp">
          <i className="sb-bulb" data-state={sys?.latency ? 'on' : 'off'} aria-hidden />
          <div><b>Last call</b><span title={sys?.latency ?? undefined}>{latencySummary(sys?.latency ?? null)}</span></div>
        </div>
      </div>

      <section className="sb-section" aria-labelledby="call-h">
        <h2 className="sb-h" id="call-h">Have Remi call</h2>
        <div className="sb-face">
          <div className="sb-callrow">
            <div className="sb-field" style={{ marginBottom: 0 }}>
              <label htmlFor="call-to">Phone number or Apple ID</label>
              <input id="call-to" className="sb-input" inputMode="tel" autoComplete="off" value={to} onChange={(e) => setTo(e.target.value)} placeholder="(215) 555-0142" disabled={!!live} />
            </div>
            {live
              ? <button className="sb-jack" data-tone="stop" onClick={hangUp} disabled={busy === 'call'}>Hang up</button>
              : <button className="sb-jack" onClick={call} disabled={busy === 'call' || onCall}>{busy === 'call' ? '…' : 'Call'}</button>}
          </div>
          <label className="sb-check" style={{ marginTop: 8 }}>
            <input type="checkbox" checked={video} onChange={(e) => setVideo(e.target.checked)} disabled={!!live} /> Video (Remi&apos;s face)
          </label>
          {onCall && !live && <p className="sb-note">Someone is on a call with Remi right now. Calling waits until it ends.</p>}
          {callResult && <p className="sb-result" data-tone={callResult.tone}>{callResult.text}</p>}
          {latest && (
            <>
              <p className="sb-note">{latest.label}, started {new Date(latest.startedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</p>
              <ol className="sb-trail">
                {latest.lines.length === 0 && <li>Starting…</li>}
                {latest.lines.slice(-8).map((l, i) => { const d = describe(l); return <li key={i} data-tone={d.bad ? 'bad' : undefined}>{d.text}</li>; })}
              </ol>
            </>
          )}
        </div>
      </section>

      <section className="sb-section" aria-labelledby="text-h">
        <h2 className="sb-h" id="text-h">Send a text from Remi&apos;s line</h2>
        <div className="sb-face">
          <div className="sb-field">
            <label htmlFor="text-to">To</label>
            <select id="text-to" className="sb-select" value={textTo} onChange={(e) => setTextTo(e.target.value)}>
              {status?.contacts.map((c) => <option key={c.label} value={c.label}>{c.label} (ending {c.last4})</option>)}
              <option value="__number">Another number…</option>
            </select>
          </div>
          {textTo === '__number' && (
            <div className="sb-field">
              <label htmlFor="text-number">Number</label>
              <input id="text-number" className="sb-input" inputMode="tel" autoComplete="off" value={textNumber} onChange={(e) => { setTextNumber(e.target.value); setTextTo('__number'); }} placeholder="(215) 555-0142" />
            </div>
          )}
          <div className="sb-field">
            <label htmlFor="text-body">Message</label>
            <textarea id="text-body" className="sb-textarea" value={body} onChange={(e) => setBody(e.target.value)} maxLength={1000} placeholder="Grandpa says the Phillies are going all the way this year." />
          </div>
          <div className="sb-row" style={{ justifyContent: 'space-between' }}>
            <label className="sb-check"><input type="checkbox" checked={asRemi} onChange={(e) => setAsRemi(e.target.checked)} /> Send as a message from Hal</label>
            <button className="sb-btn" data-tone="go" onClick={sendText} disabled={busy === 'text'}>{busy === 'text' ? 'Sending…' : 'Send text'}</button>
          </div>
          {textResult && <p className="sb-result" data-tone={textResult.tone}>{textResult.text}</p>}
        </div>
      </section>

      <section className="sb-section" aria-labelledby="contacts-h">
        <h2 className="sb-h" id="contacts-h">Who Remi can text</h2>
        <div className="sb-face">
          {status && status.contacts.length > 0
            ? <ul className="sb-contacts">{status.contacts.map((c) => <li key={c.label}>{c.label}, ending {c.last4}</li>)}</ul>
            : <p className="sb-note" style={{ marginTop: 0, marginBottom: 12 }}>No one yet. Save a family member and Remi can pass messages to them during a call.</p>}
          <div className="sb-row">
            <input aria-label="Name, like grandson" className="sb-input" style={{ flex: '1 1 140px' }} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="grandson" />
            <input aria-label="Their number" className="sb-input" style={{ flex: '1 1 160px' }} inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(215) 555-0142" />
            <button className="sb-btn" onClick={saveContact} disabled={busy === 'contact'}>Save contact</button>
          </div>
          {contactResult && <p className="sb-result" data-tone={contactResult.tone}>{contactResult.text}</p>}
        </div>
      </section>

      <section className="sb-section" aria-labelledby="reset-h">
        <h2 className="sb-h" id="reset-h">Start the demo over</h2>
        <div className="sb-face">
          <p className="sb-note" style={{ marginTop: 0, marginBottom: 12 }}>Wipes every call, including real ones, and brings back the twelve simulated calls the family page opens with. Contacts stay.</p>
          <button className="sb-btn" data-tone={armed ? 'armed' : undefined} onClick={reset} disabled={busy === 'reset' || onCall}>
            {busy === 'reset' ? 'Resetting…' : armed ? 'Tap again to wipe calls' : 'Reset demo'}
          </button>
          {resetResult && <p className="sb-result" data-tone={resetResult.tone}>{resetResult.text}</p>}
        </div>
      </section>

      <nav className="sb-links">
        <a href={`/elders/${status?.elderId ?? 'elder-hal-demo'}`} target="_blank" rel="noreferrer">Open the family page</a>
        <button className="sb-link" onClick={signOut}>Sign out</button>
      </nav>
    </main>
  );
}
