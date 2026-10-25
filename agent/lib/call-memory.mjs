// Memory within one call. The realtime model keeps the conversation, but long calls get
// truncated and a reconnect can drop items, so Remi also carries a compact running
// record in its instructions: what the caller has said, and what Remi already asked.
// agent.mjs refreshes the instructions with section() every few caller turns.

const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function createCallMemory({ maxChars = 2400, lineChars = 180, now = () => Date.now(), t0 = Date.now() } = {}) {
  const said = [];    // { atMs, text } from the caller
  const asked = [];   // questions Remi asked
  let callerTurns = 0;

  function add(role, text) {
    const t = String(text ?? '').replace(/\s+/g, ' ').trim();
    if (!t) return;
    if (role === 'user') {
      callerTurns += 1;
      said.push({ atMs: now() - t0, text: clip(t, lineChars) });
    } else if (role === 'assistant') {
      for (const q of t.match(/[^.!?]*\?/g) ?? []) {
        const qq = clip(q.trim(), 120);
        if (qq.length > 8 && !asked.includes(qq)) asked.push(qq);
      }
    }
  }

  // Keep the first few lines (who they are, how they feel) and as many recent ones as fit.
  function saidLines(budget) {
    const fmt = ({ atMs, text }) => `- [${Math.floor(atMs / 60000)}:${String(Math.floor(atMs / 1000) % 60).padStart(2, '0')}] ${text}`;
    const lines = said.map(fmt);
    const head = lines.slice(0, 3);
    const tail = [];
    let used = head.join('\n').length;
    for (let i = lines.length - 1; i >= head.length; i -= 1) {
      if (used + lines[i].length + 1 > budget) {
        tail.unshift(`- (${i - head.length + 1} earlier lines left out)`);
        break;
      }
      tail.unshift(lines[i]);
      used += lines[i].length + 1;
    }
    return [...head, ...tail].join('\n');
  }

  return {
    add,
    get callerTurns() { return callerTurns; },
    /** Prompt section, or '' before the caller has said anything. */
    section(name = 'the caller') {
      if (!said.length) return '';
      const q = asked.slice(-8).map((s) => `- ${s}`).join('\n');
      return `SO FAR IN THIS CALL (your memory of this conversation; use it, don't read it out)
What ${name} has said, in order:
${saidLines(Math.floor(maxChars * 0.75))}
${q ? `Questions you already asked (don't ask these again; build on the answers):\n${q}` : ''}`.trim();
    },
  };
}
