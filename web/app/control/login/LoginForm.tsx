'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function LoginForm() {
  const router = useRouter();
  const [passcode, setPasscode] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setProblem(null);
    try {
      const res = await fetch('/api/control/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ passcode }) });
      if (res.ok) { router.replace('/control'); return; }
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setProblem(data.error ?? 'Could not sign in.');
    } catch { setProblem('Could not reach the computer running Remi.'); }
    setBusy(false);
  }

  return (
    <main className="sb-login">
      <h1 className="sb-title">Remi switchboard</h1>
      <p className="sb-sub">For the people running the demo.</p>
      <form className="sb-face" style={{ marginTop: 20 }} onSubmit={submit}>
        <div className="sb-field">
          <label htmlFor="passcode">Passcode</label>
          <input id="passcode" className="sb-input" type="password" autoComplete="current-password" value={passcode} onChange={(e) => setPasscode(e.target.value)} autoFocus />
        </div>
        <button className="sb-btn" data-tone="go" type="submit" disabled={busy || !passcode}>{busy ? 'Checking…' : 'Open the switchboard'}</button>
        {problem && <p className="sb-result" data-tone="bad">{problem}</p>}
      </form>
    </main>
  );
}
