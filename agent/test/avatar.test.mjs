import { test } from 'node:test';
import assert from 'node:assert/strict';
import { avatarEnabled, startAvatar } from '../lib/avatar.mjs';

test('avatar is on only with a LemonSlice key and agent id, and AVATAR=off wins', () => {
  assert.equal(avatarEnabled({}), false);
  assert.equal(avatarEnabled({ LEMONSLICE_API_KEY: 'k' }), false);
  assert.equal(avatarEnabled({ LEMONSLICE_API_KEY: 'k', LEMONSLICE_AGENT_ID: 'YOUR_AGENT' }), false);
  assert.equal(avatarEnabled({ LEMONSLICE_API_KEY: 'k', LEMONSLICE_AGENT_ID: 'a1' }), true);
  assert.equal(avatarEnabled({ LEMONSLICE_API_KEY: 'k', LEMONSLICE_AGENT_ID: 'a1', AVATAR: 'off' }), false);
});

test('startAvatar never throws: a failed start reports ok:false so Remi keeps its own face', async () => {
  const lines = [];
  const r = await startAvatar({ session: {}, room: {}, env: { LEMONSLICE_API_KEY: 'k', LEMONSLICE_AGENT_ID: 'a1' }, log: (l) => lines.push(l) });
  assert.equal(r.ok, false);
  assert.match(lines[0], /\[avatar\] lemonslice unavailable/);
});
