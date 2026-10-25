import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCropper, fillEnabled } from '../lib/avatar-fill.mjs';

test('fill is opt-in', () => {
  assert.equal(fillEnabled({}), false);
  assert.equal(fillEnabled({ AVATAR_FILL: '1' }), true);
});

test('cropper fills 16:9 from a portrait source, full width', () => {
  const w = 4, h = 6;
  const src = new Uint8Array(w * h * 4);
  const s32 = new Uint32Array(src.buffer);
  for (let i = 0; i < w * h; i++) s32[i] = i;
  const out = new Uint32Array(createCropper({ outW: 4, outH: 2, cropY: 0 })(src, w, h).buffer);
  // 16:9-ish window of a 4-wide source is 4x2 at the top: rows 0 and 1.
  assert.deepEqual([...out], [0, 1, 2, 3, 4, 5, 6, 7]);
});
